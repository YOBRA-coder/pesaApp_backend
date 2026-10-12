import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { crashGameService, generateCrashPoint } from '../services/crashGame.service';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';
import { verifyAccessToken } from '../utils/jwt';
import { prisma } from '../config/database';
//import { cacheRoundHistory } from '../services/crashHistory.persistence';

interface AuthedSocket extends WebSocket {
  userId?: string;
  isAlive?: boolean;
  currentBetId?: string;
  username?: string;
  phone?:string;
}
// ── Round state ────────────────────────────────────────────────
let currentRoundId: string | null = null;
let currentCrashPoint = 1.0;
let currentMultiplier = 1.0;
let roundPhase: 'waiting' | 'flying' | 'crashed' = 'waiting';
let autoCashoutMap: Map<string, { betId: string; at: number; slot?: string }> = new Map();

export function initWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  // ── Connection handler ────────────────────────────────────
  wss.on('connection', async (ws: AuthedSocket, req) => {
    ws.isAlive = true;

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());

        // ── AUTH ──────────────────────────────────────────
        if (msg.type === 'auth') {
          const payload = verifyAccessToken(msg.token);
          ws.userId = payload.userId;

          // Get user info for live bets display
          const user = await prisma.user.findUnique({
            where: { id: ws.userId },
            select: { phone: true, username: true },
          });
          ws.phone = user?.phone || '';
          ws.username = user?.username || '';

          // Track as online (expire 5 min)
          const display = ws.username || ws.phone.slice(-4);
          await redis.zadd('online_users', Date.now(), display);
          await redis.expire('online_users', 300);

          ws.send(JSON.stringify({ type: 'auth_ok', userId: ws.userId }));

          // Send current round state
          const round = await crashGameService.getCurrentRound();
          if (round) {
            ws.send(JSON.stringify({
              type: 'round_state',
              phase: round.phase,
              multiplier: round.multiplier,
              roundId: round.roundId,
            }));
          }
          return;
        }

        if (!ws.userId) { ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' })); return; }

        // ── BET ───────────────────────────────────────────
        if (msg.type === 'bet') {
          const slot = msg.slot || 'A';  // 'A' or 'B'
          if (roundPhase !== 'waiting') {
            ws.send(JSON.stringify({ type: 'error', message: 'Round already started. Bet in next round.' }));
            return;
          }
          try {
            const bet = await crashGameService.placeBet(
              ws.userId!, currentRoundId!, Number(msg.amount),
              msg.autoCashout ? Number(msg.autoCashout) : undefined
            );
            // Track auto-cashout per slot
            if (msg.autoCashout) {
              autoCashoutMap.set(`${ws.userId}-${slot}`, { betId: bet.id, at: Number(msg.autoCashout), slot });
            }
            ws.send(JSON.stringify({ type: 'bet_placed', betId: bet.id, amount: msg.amount, slot }));
            // Broadcast to other players (with shortened phone)
            const shortPhone = ws.phone ? ws.phone.slice(0, 2) + '**' + ws.phone.slice(-4) : 'Player';
            broadcast(wss, { type: 'new_bet', amount: msg.amount, phone: ws.phone, username: ws.username || shortPhone });
          } catch (e: any) {
            ws.send(JSON.stringify({ type: 'error', message: e.message }));
          }
        }

        // ── CASHOUT ───────────────────────────────────────
        if (msg.type === 'cashout') {
          const slot = msg.slot || 'A';
          if (roundPhase !== 'flying') {
            ws.send(JSON.stringify({ type: 'error', message: 'Not in flying phase' }));
            return;
          }
          try {
            const result = await crashGameService.cashOut(ws.userId!, currentRoundId!, currentMultiplier);
            autoCashoutMap.delete(`${ws.userId}-${slot}`);
            ws.send(JSON.stringify({ type: 'cashout_success', ...result, slot }));
            broadcast(wss, { type: 'player_cashout', multiplier: currentMultiplier, slot });
          } catch (e: any) {
            ws.send(JSON.stringify({ type: 'error', message: e.message }));
          }
        }

      } catch (err) {
        logger.error('WS message error:', err);
      }
    });

    ws.on('close', () => { 
      autoCashoutMap.delete(ws.userId || ''); 
      // On disconnect, remove from online:
  if (ws.username || ws.phone) {
    redis.zrem('online_users', ws.username || ws.phone!.slice(-4));
  }
  autoCashoutMap.delete(`${ws.userId}-A`);
  autoCashoutMap.delete(`${ws.userId}-B`);

    });
    ws.on('error', (err) => logger.error('WS error:', err));
  });

  // ── Heartbeat (ping clients every 30s) ─────────────────────
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws: AuthedSocket) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30_000);

  wss.on('close', () => {
    clearInterval(heartbeat);

  });

  // ── Game loop ──────────────────────────────────────────────
  startGameLoop(wss);

  logger.info('WebSocket server initialized at /ws');
  return wss;
}

// ── Broadcast to all clients ──────────────────────────────────
function broadcast(wss: WebSocketServer, data: object) {
  const msg = JSON.stringify(data);
  wss.clients.forEach((ws: AuthedSocket) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });
}

// ── Game loop: waiting → flying → crashed → waiting ──────────
async function startGameLoop(wss: WebSocketServer) {
  logger.info('Crash game loop started');
  while (true) {
    try {
      await runRound(wss);
    } catch (err) {
      logger.error('Game loop error:', err);
      await sleep(5000);
    }
  }
}

async function runRound(wss: WebSocketServer) {
  // ── 1. Waiting phase (5 seconds) ─────────────────────────
  roundPhase = 'waiting';
  currentMultiplier = 1.0;
  autoCashoutMap.clear();

  const { roundId, crashPoint, serverSeedHash } = await crashGameService.createRound();
  currentRoundId = roundId;
  currentCrashPoint = crashPoint;

  broadcast(wss, {
    type: 'round_start',
    roundId,
    serverSeedHash,
    countdown: 5,
    currentBets: [], // empty at start
  });

  await redis.set('crash:phase', 'waiting', 'EX', 60);

  // Countdown
  for (let i = 5; i > 0; i--) {
    broadcast(wss, { type: 'countdown', seconds: i });
    await sleep(1000);
  }

  // ── 2. Flying phase ───────────────────────────────────────
  roundPhase = 'flying';
  await redis.set('crash:phase', 'flying', 'EX', 120);
  broadcast(wss, { type: 'round_flying', roundId });

  const startTime = Date.now();
  let crashed = false;

  while (!crashed) {
    const elapsed = (Date.now() - startTime) / 1000;
    // Exponential growth: mult = e^(k*t)
    currentMultiplier = parseFloat(Math.pow(Math.E, 0.19 * elapsed).toFixed(2));
    await redis.set('crash:multiplier', currentMultiplier.toString(), 'EX', 60);

    if (currentMultiplier >= currentCrashPoint) {
      currentMultiplier = currentCrashPoint;
      crashed = true;
    }

    // Process auto-cashouts
    for (const [userId, ac] of autoCashoutMap.entries()) {
      if (currentMultiplier >= ac.at) {
        try {
          const result = await crashGameService.cashOut(userId, roundId, ac.at);
          autoCashoutMap.delete(userId);
          // Notify that specific user
          const userWs = Array.from(wss.clients).find((c: AuthedSocket) => c.userId === userId) as AuthedSocket;
          if (userWs?.readyState === WebSocket.OPEN) {
            userWs.send(JSON.stringify({ type: 'cashout_success', ...result, auto: true }));
          }
          broadcast(wss, { type: 'player_cashout', multiplier: ac.at, auto: true });
        } catch { autoCashoutMap.delete(userId); }
      }
    }

    // Broadcast multiplier every 60ms
    broadcast(wss, { type: 'multiplier', value: currentMultiplier, crashed });

    if (crashed) break;
    await sleep(60);
  }

  // ── 3. Crashed ────────────────────────────────────────────
  roundPhase = 'crashed';
  await redis.set('crash:phase', 'crashed', 'EX', 60);

  const { houseProfit } = await crashGameService.settleRound(roundId, currentCrashPoint);
  const dbRound = await prisma.crashRound.findUnique({
    where: { id: roundId },
    select: { roundNumber: true, serverSeed: true, crashPoint: true },
  });

  broadcast(wss, {
    type: 'round_crashed',
    crashPoint: currentCrashPoint,
    roundNumber: dbRound?.roundNumber,
    serverSeed: dbRound?.serverSeed, // reveal for provably fair verification
  });

  logger.info(`Crash Round ${dbRound?.roundNumber}: crashed @ ${currentCrashPoint}x, house +${houseProfit}`);

  // Show crash for 3 seconds
  await sleep(3000);
}

function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }
