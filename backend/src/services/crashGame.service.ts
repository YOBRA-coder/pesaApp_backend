import crypto from 'crypto';
import { prisma } from '../config/database';
import { redis } from '../config/redis';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

const HOUSE_EDGE = parseFloat(process.env.HOUSE_EDGE_PERCENT || '0.05');
const MIN_BET = 10;
const MAX_BET = 50000;

// ── Provably fair crash point ────────────────────────────────
export function generateCrashPoint(serverSeed: string, roundNumber: number): number {
  const hmac = crypto.createHmac('sha256', serverSeed);
  hmac.update(`${roundNumber}`);
  const hash = hmac.digest('hex');
  const h = parseInt(hash.slice(0, 8), 16);
  const e = Math.pow(2, 32);
  if (h % Math.floor(1 / HOUSE_EDGE) === 0) return 1.00;
  const point = (100 * e - h) / (e - h) / 100;
  return Math.max(1.00, parseFloat(point.toFixed(2)));
}

// ── Round state keys ─────────────────────────────────────────
const ROUND_KEY = 'crash:current_round';
const PHASE_KEY = 'crash:phase'; // waiting | flying | crashed
const MULT_KEY  = 'crash:multiplier';
const BETS_KEY  = (roundId: string) => `crash:bets:${roundId}`;

export class CrashGameService {

  // ── Create new round (called by cron/loop) ───────────────
  async createRound(): Promise<{ roundId: string; crashPoint: number; serverSeedHash: string }> {
    const serverSeed = crypto.randomBytes(32).toString('hex');
    const serverSeedHash = crypto.createHash('sha256').update(serverSeed).digest('hex');
    const lastRound = await prisma.crashRound.findFirst({ orderBy: { roundNumber: 'desc' } });
    const nextNumber = (lastRound?.roundNumber || 0) + 1;
    const crashPoint = generateCrashPoint(serverSeed, nextNumber);

    const round = await prisma.crashRound.create({
      data: { serverSeed, serverSeedHash, crashPoint },
    });

    // Cache current round (hide actual crash point)
    await redis.set(ROUND_KEY, JSON.stringify({
      id: round.id,
      roundNumber: round.roundNumber,
      serverSeedHash,
      crashPoint, // server only — never expose to client
    }), 'EX', 600);
    await redis.set(PHASE_KEY, 'waiting', 'EX', 600);

    logger.info(`Crash Round ${nextNumber} created. Hash ${serverSeedHash} Crash at ${crashPoint}x`);
    return { roundId: round.id, crashPoint, serverSeedHash };
  }

  // ── Get current round (safe for client) ──────────────────
  async getCurrentRound() {
    const raw = await redis.get(ROUND_KEY);
    if (!raw) return null;
    const round = JSON.parse(raw);
    const phase = await redis.get(PHASE_KEY) || 'waiting';
    const mult = parseFloat(await redis.get(MULT_KEY) || '1.00');
    return {
      roundId: round.id,
      roundNumber: round.roundNumber,
      serverSeedHash: round.serverSeedHash,
      phase,
      multiplier: mult,
    };
  }

  // ── Place bet ─────────────────────────────────────────────
  async placeBet(userId: string, roundId: string, betAmount: number, autoCashout?: number) {
    if (betAmount < MIN_BET) throw new AppError(`Minimum bet is KES ${MIN_BET}`, 400);
    if (betAmount > MAX_BET) throw new AppError(`Maximum bet is KES ${MAX_BET}`, 400);

    const phase = await redis.get(PHASE_KEY);
    if (phase !== 'waiting') throw new AppError('Round already in progress. Wait for next round.', 400);

    // Check round exists
    const round = await prisma.crashRound.findUnique({ where: { id: roundId } });
    if (!round) throw new AppError('Round not found', 404);

    // Check no duplicate bet for this round
    const existing = await prisma.crashBet.findFirst({ where: { roundId, userId } });
    if (existing) throw new AppError('You already have a bet in this round', 409);

    // Deduct from wallet atomically
    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet || Number(wallet.balance) < betAmount) {
      throw new AppError('Insufficient balance', 400);
    }

    const [bet] = await prisma.$transaction([
      prisma.crashBet.create({
        data: {
          roundId,
          userId,
          betAmount,
          autoCashout: autoCashout || null,
          status: 'PENDING',
        },
      }),
      prisma.wallet.update({
        where: { userId },
        data: { balance: { decrement: betAmount } },
      }),
      prisma.transaction.create({
        data: {
          userId,
          type: 'GAME_BET',
          status: 'COMPLETED',
          amount: betAmount,
          fee: 0,
          balanceBefore: Number(wallet.balance),
          balanceAfter: Number(wallet.balance) - betAmount,
          description: `Crash Round #${round.roundNumber}`,
          provider: 'INTERNAL',
          metadata: { roundId, gameType: 'CRASH' },
          completedAt: new Date(),
        },
      }),
      prisma.crashRound.update({
        where: { id: roundId },
        data: { totalBets: { increment: betAmount } },
      }),
    ]);

    logger.info(`Crash bet: user ${userId}, round ${round.roundNumber}, amount ${betAmount}`);
    return bet;
  }

  // ── Cash out ──────────────────────────────────────────────
  async cashOut(userId: string, roundId: string, currentMultiplier: number) {
    const phase = await redis.get(PHASE_KEY);
    if (phase !== 'flying') throw new AppError('Game not in progress', 400);

    const bet = await prisma.crashBet.findFirst({
      where: { roundId, userId, status: 'PENDING' },
    });
    if (!bet) throw new AppError('No active bet found in this round', 404);

    const winAmount = parseFloat((Number(bet.betAmount) * currentMultiplier).toFixed(2));

    await prisma.$transaction([
      prisma.crashBet.update({
        where: { id: bet.id },
        data: {
          status: 'WON',
          cashOutAt: currentMultiplier,
          winAmount,
          settledAt: new Date(),
        },
      }),
      prisma.wallet.update({
        where: { userId },
        data: {
          balance: { increment: winAmount },
          totalDeposited: { increment: winAmount - Number(bet.betAmount) }, // only net gain
        },
      }),
      prisma.transaction.create({
        data: {
          userId,
          type: 'GAME_WIN',
          status: 'COMPLETED',
          amount: winAmount,
          fee: 0,
          balanceBefore: 0, // filled by wallet update
          balanceAfter: 0,
          description: `Crash win @ ${currentMultiplier}x`,
          provider: 'INTERNAL',
          metadata: { roundId, multiplier: currentMultiplier },
          completedAt: new Date(),
        },
      }),
      prisma.crashRound.update({
        where: { id: roundId },
        data: { totalPayout: { increment: winAmount } },
      }),
    ]);

    logger.info(`Crash cashout: user ${userId}, mult ${currentMultiplier}x, win ${winAmount}`);
    return { winAmount, multiplier: currentMultiplier };
  }

  // ── Settle round (called when plane crashes) ─────────────
  async settleRound(roundId: string, crashPoint: number) {
    // Mark all un-cashed bets as LOST
    const pendingBets = await prisma.crashBet.findMany({
      where: { roundId, status: 'PENDING' },
      include: { user: { include: { wallet: true } } },
    });

    let houseProfitFromLosses = 0;
    const updates = pendingBets.map(bet => {
      houseProfitFromLosses += Number(bet.betAmount);
      return prisma.crashBet.update({
        where: { id: bet.id },
        data: { status: 'LOST', cashOutAt: null, winAmount: 0, settledAt: new Date() },
      });
    });

    // Calculate total house profit
    const round = await prisma.crashRound.findUnique({ where: { id: roundId } });
    const totalPayout = Number(round?.totalPayout || 0);
    const totalBets = Number(round?.totalBets || 0);
    const houseProfit = totalBets - totalPayout;

    await prisma.$transaction([
      ...updates,
      prisma.crashRound.update({
        where: { id: roundId },
        data: { endedAt: new Date(), houseProfit },
      }),
    ]);

    // Update daily revenue
    await this.updateDailyRevenue('CRASH', totalBets, totalPayout);

    // Reveal server seed (provably fair)
    const dbRound = await prisma.crashRound.findUnique({ where: { id: roundId } });
    logger.info(`Crash round ${dbRound?.roundNumber} settled. Crash: ${crashPoint}x. House profit: ${houseProfit}`);

    return { houseProfit, pendingSettled: pendingBets.length };
  }

  async getRoundHistory(limit = 20) {
    const rounds = await prisma.crashRound.findMany({
      where: { endedAt: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { roundNumber: true, crashPoint: true, totalBets: true, serverSeedHash: true, serverSeed: true },
    });
    return rounds.map(r => ({
      ...r,
      crashPoint: Number(r.crashPoint),
    }));
  }

  async getUserBetHistory(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [bets, total] = await Promise.all([
      prisma.crashBet.findMany({
        where: { userId },
        include: { round: { select: { roundNumber: true, crashPoint: true, serverSeedHash: true } } },
        orderBy: { placedAt: 'desc' },
        skip, take: limit,
      }),
      prisma.crashBet.count({ where: { userId } }),
    ]);
    return { bets, total, page, totalPages: Math.ceil(total / limit) };
  }

  async getRoundBets(roundId: string) {
    return prisma.crashBet.findMany({
      where: { roundId },
      include: { user: { select: { username: true, phone: true } } },
      orderBy: { placedAt: 'asc' },
    });
  }

  private async updateDailyRevenue(gameType: string, totalBets: number, totalPayout: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const houseProfit = totalBets - totalPayout;
    await prisma.gameRevenue.upsert({
      where: { date_gameType: { date: today, gameType } },
      update: {
        totalBets: { increment: totalBets },
        totalPayout: { increment: totalPayout },
        houseProfit: { increment: houseProfit },
        roundCount: { increment: 1 },
      },
      create: { date: today, gameType, totalBets, totalPayout, houseProfit, roundCount: 1 },
    });
  }

}
export async function cacheRoundHistory(roundNumber: number, crashPoint: number) {
  const existing = await redis.get('crash:history:global');
  const history = existing ? JSON.parse(existing) : [];
  history.unshift({ roundNumber, crashPoint });
  if (history.length > 50) history.splice(50);
  await redis.set('crash:history:global', JSON.stringify(history), 'EX', 86400);
}
export const crashGameService = new CrashGameService();
