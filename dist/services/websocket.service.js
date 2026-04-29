"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initWebSocket = initWebSocket;
const ws_1 = require("ws");
const crashGame_service_1 = require("../services/crashGame.service");
const redis_1 = require("../config/redis");
const logger_1 = require("../utils/logger");
const jwt_1 = require("../utils/jwt");
const database_1 = require("../config/database");
// ── Round state ────────────────────────────────────────────────
let currentRoundId = null;
let currentCrashPoint = 1.0;
let currentMultiplier = 1.0;
let roundPhase = 'waiting';
let autoCashoutMap = new Map();
function initWebSocket(server) {
    const wss = new ws_1.WebSocketServer({ server, path: '/ws' });
    // ── Connection handler ────────────────────────────────────
    wss.on('connection', async (ws, req) => {
        ws.isAlive = true;
        ws.on('pong', () => { ws.isAlive = true; });
        ws.on('message', async (data) => {
            try {
                const msg = JSON.parse(data.toString());
                // ── AUTH ──────────────────────────────────────────
                if (msg.type === 'auth') {
                    const payload = (0, jwt_1.verifyAccessToken)(msg.token);
                    ws.userId = payload.userId;
                    ws.send(JSON.stringify({ type: 'auth_ok', userId: ws.userId }));
                    const user = await database_1.prisma.user.findUnique({ where: { id: ws.userId } });
                    ws.username = user?.username || user?.phone?.slice(-4) || 'anonymous';
                    await redis_1.redis.zadd('online_users', Date.now(), ws.username);
                    await redis_1.redis.expire('online_users', 300); // 5 min TTL
                    // Send current round state immediately
                    ws.send(JSON.stringify({
                        type: 'round_state',
                        phase: roundPhase,
                        multiplier: currentMultiplier,
                        roundId: currentRoundId,
                    }));
                    return;
                }
                if (!ws.userId) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
                    return;
                }
                // ── BET ───────────────────────────────────────────
                if (msg.type === 'bet') {
                    const slot = msg.slot || 'A';
                    try {
                        const bet = await crashGame_service_1.crashGameService.placeBet(ws.userId, currentRoundId, Number(msg.amount), msg.autoCashout ? Number(msg.autoCashout) : undefined);
                        ws.send(JSON.stringify({ type: 'bet_placed', betId: bet.id, amount: msg.amount, slot }));
                        broadcast(wss, { type: 'new_bet', amount: msg.amount });
                        // Track auto-cashout per slot
                        if (msg.autoCashout) {
                            autoCashoutMap.set(`${ws.userId}-${slot}`, { betId: bet.id, at: Number(msg.autoCashout), slot });
                        }
                    }
                    catch (e) {
                        ws.send(JSON.stringify({ type: 'error', message: e.message }));
                    }
                }
                // ── CASHOUT ───────────────────────────────────────
                if (msg.type === 'cashout') {
                    const slot = msg.slot || 'A';
                    try {
                        const result = await crashGame_service_1.crashGameService.cashOut(ws.userId, currentRoundId, currentMultiplier);
                        autoCashoutMap.delete(`${ws.userId}-${slot}`);
                        ws.send(JSON.stringify({ type: 'cashout_success', ...result, slot }));
                        broadcast(wss, { type: 'player_cashout', multiplier: currentMultiplier });
                    }
                    catch (e) {
                        ws.send(JSON.stringify({ type: 'error', message: e.message }));
                    }
                }
            }
            catch (err) {
                logger_1.logger.error('WS message error:', err);
            }
        });
        ws.on('close', () => { autoCashoutMap.delete(ws.userId || ''); });
        ws.on('error', (err) => logger_1.logger.error('WS error:', err));
    });
    // ── Heartbeat (ping clients every 30s) ─────────────────────
    const heartbeat = setInterval(() => {
        wss.clients.forEach((ws) => {
            if (!ws.isAlive)
                return ws.terminate();
            ws.isAlive = false;
            ws.ping();
        });
    }, 30_000);
    wss.on('close', () => {
        clearInterval(heartbeat);
    });
    // ── Game loop ──────────────────────────────────────────────
    startGameLoop(wss);
    logger_1.logger.info('WebSocket server initialized at /ws');
    return wss;
}
// ── Broadcast to all clients ──────────────────────────────────
function broadcast(wss, data) {
    const msg = JSON.stringify(data);
    wss.clients.forEach((ws) => {
        if (ws.readyState === ws_1.WebSocket.OPEN)
            ws.send(msg);
    });
}
// ── Game loop: waiting → flying → crashed → waiting ──────────
async function startGameLoop(wss) {
    logger_1.logger.info('Crash game loop started');
    while (true) {
        try {
            await runRound(wss);
        }
        catch (err) {
            logger_1.logger.error('Game loop error:', err);
            await sleep(5000);
        }
    }
}
async function runRound(wss) {
    // ── 1. Waiting phase (5 seconds) ─────────────────────────
    roundPhase = 'waiting';
    currentMultiplier = 1.0;
    autoCashoutMap.clear();
    const { roundId, crashPoint, serverSeedHash } = await crashGame_service_1.crashGameService.createRound();
    currentRoundId = roundId;
    currentCrashPoint = crashPoint;
    broadcast(wss, {
        type: 'round_start',
        roundId,
        serverSeedHash,
        countdown: 5,
    });
    await redis_1.redis.set('crash:phase', 'waiting', 'EX', 60);
    // Countdown
    for (let i = 5; i > 0; i--) {
        broadcast(wss, { type: 'countdown', seconds: i });
        await sleep(1000);
    }
    // ── 2. Flying phase ───────────────────────────────────────
    roundPhase = 'flying';
    await redis_1.redis.set('crash:phase', 'flying', 'EX', 120);
    broadcast(wss, { type: 'round_flying', roundId });
    const startTime = Date.now();
    let crashed = false;
    while (!crashed) {
        const elapsed = (Date.now() - startTime) / 1000;
        // Exponential growth: mult = e^(k*t)
        currentMultiplier = parseFloat(Math.pow(Math.E, 0.19 * elapsed).toFixed(2));
        await redis_1.redis.set('crash:multiplier', currentMultiplier.toString(), 'EX', 60);
        if (currentMultiplier >= currentCrashPoint) {
            currentMultiplier = currentCrashPoint;
            crashed = true;
        }
        // Process auto-cashouts
        for (const [userId, ac] of autoCashoutMap.entries()) {
            if (currentMultiplier >= ac.at) {
                try {
                    const result = await crashGame_service_1.crashGameService.cashOut(userId, roundId, ac.at);
                    autoCashoutMap.delete(userId);
                    // Notify that specific user
                    const userWs = Array.from(wss.clients).find((c) => c.userId === userId);
                    if (userWs?.readyState === ws_1.WebSocket.OPEN) {
                        userWs.send(JSON.stringify({ type: 'cashout_success', ...result, auto: true }));
                    }
                    broadcast(wss, { type: 'player_cashout', multiplier: ac.at, auto: true });
                }
                catch {
                    autoCashoutMap.delete(userId);
                }
            }
        }
        // Broadcast multiplier every 60ms
        broadcast(wss, { type: 'multiplier', value: currentMultiplier, crashed });
        if (crashed)
            break;
        await sleep(60);
    }
    // ── 3. Crashed ────────────────────────────────────────────
    roundPhase = 'crashed';
    await redis_1.redis.set('crash:phase', 'crashed', 'EX', 60);
    const { houseProfit } = await crashGame_service_1.crashGameService.settleRound(roundId, currentCrashPoint);
    const dbRound = await database_1.prisma.crashRound.findUnique({
        where: { id: roundId },
        select: { roundNumber: true, serverSeed: true, crashPoint: true },
    });
    broadcast(wss, {
        type: 'round_crashed',
        crashPoint: currentCrashPoint,
        roundNumber: dbRound?.roundNumber,
        serverSeed: dbRound?.serverSeed, // reveal for provably fair verification
    });
    logger_1.logger.info(`Crash Round ${dbRound?.roundNumber}: crashed @ ${currentCrashPoint}x, house +${houseProfit}`);
    // Show crash for 3 seconds
    await sleep(3000);
}
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
//# sourceMappingURL=websocket.service.js.map