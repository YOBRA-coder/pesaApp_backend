import crypto from 'crypto';
import { prisma } from '../config/database';
import { redis } from '../config/redis';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';


const HOUSE_EDGE = parseFloat(process.env.HOUSE_EDGE_PERCENT || '0.05'); // 5%

// ─── Provably Fair Crash Point Generation ────────────────
// Uses HMAC-SHA256: serverSeed + roundNumber to generate crash point
export function generateCrashPoint(serverSeed: string, roundNumber: number): number {
  const hmac = crypto.createHmac('sha256', serverSeed);
  hmac.update(String(roundNumber));
  const hash = hmac.digest('hex');

  // Convert first 8 hex chars to number
  const h = parseInt(hash.slice(0, 8), 16);
  const e = Math.pow(2, 32);

  // Apply house edge and calculate crash point
  if (h % Math.floor(1 / HOUSE_EDGE) === 0) return 1.0; // House wins

  const result = (100 * e - h) / (e - h) / 100;
  return Math.max(1.0, Math.floor(result * 100) / 100);
}

export class GameService {

  // ─── Get or Create Active Crash Round ────────────────
  async getActiveCrashRound() {
    const cached = await redis.get('crash:active_round');
    if (cached) return JSON.parse(cached);

    // Create new round
    const serverSeed = crypto.randomBytes(32).toString('hex');
    const serverSeedHash = crypto.createHash('sha256').update(serverSeed).digest('hex');
    const lastRound = await prisma.crashRound.findFirst({ orderBy: { roundNumber: 'desc' } });
    const nextNumber = (lastRound?.roundNumber || 0) + 1;
    const crashPoint = generateCrashPoint(serverSeed, nextNumber);

    const round = await prisma.crashRound.create({
      data: { serverSeed, serverSeedHash, crashPoint },
    });
    logger.info('Pre-calculated BEFORE you play”', crashPoint);
    const roundData = { ...round, crashPoint: Number(round.crashPoint) };
    await redis.set('crash:active_round', JSON.stringify(roundData), 'EX', 300);
    return roundData;
  }

  // ─── Place Bet ────────────────────────────────────────
  async placeBet(userId: string, gameType: string, betAmount: number, clientSeed?: string) {
    if (betAmount < 10) throw new AppError('Minimum bet is KES 10', 400);
    if (betAmount > 50000) throw new AppError('Maximum bet is KES 50,000', 400);

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new AppError('Wallet not found', 404);
    if (Number(wallet.balance) < betAmount) throw new AppError('Insufficient balance', 400);

    // Deduct bet amount
    await prisma.wallet.update({
      where: { userId },
      data: {
        balance: { decrement: betAmount },
        lockedBalance: { increment: betAmount },
      },
    });

    // Record bet transaction
    await prisma.transaction.create({
      data: {
        userId,
        type: 'GAME_BET',
        status: 'COMPLETED',
        amount: betAmount,
        fee: 0,
        balanceBefore: Number(wallet.balance),
        balanceAfter: Number(wallet.balance) - betAmount,
        description: `${gameType} bet`,
        provider: 'INTERNAL',
        completedAt: new Date(),
      },
    });

    // Create game session
    const session = await prisma.gameSession.create({
      data: {
        userId,
        gameType: gameType as any,
        status: 'IN_PROGRESS',
        betAmount,
        clientSeed: clientSeed || crypto.randomBytes(8).toString('hex'),
      },
    });

    return session;
  }

  // ─── Cash Out (Aviator/Crash) ─────────────────────────
  async cashOut(userId: string, sessionId: string, currentMultiplier: number) {
    const session = await prisma.gameSession.findFirst({
      where: { id: sessionId, userId, status: 'IN_PROGRESS' },
    });
    if (!session) throw new AppError('Active session not found', 404);

    const winAmount = Number(session.betAmount) * currentMultiplier;

    await prisma.$transaction(async (tx) => {
      // Unlock and credit winnings
      await tx.wallet.update({
        where: { userId },
        data: {
          balance: { increment: winAmount },
          lockedBalance: { decrement: session.betAmount },
        },
      });

      await tx.gameSession.update({
        where: { id: sessionId },
        data: {
          status: 'COMPLETED',
          winAmount,
          multiplier: currentMultiplier,
          cashOutAt: currentMultiplier,
        },
      });

      const wallet = await tx.wallet.findUnique({ where: { userId } });
      await tx.transaction.create({
        data: {
          userId,
          type: 'GAME_WIN',
          status: 'COMPLETED',
          amount: winAmount,
          fee: 0,
          balanceBefore: Number(wallet!.balance) - winAmount,
          balanceAfter: Number(wallet!.balance),
          description: `${session.gameType} win (${currentMultiplier}x)`,
          provider: 'INTERNAL',
          completedAt: new Date(),
        },
      });
    });

    return { winAmount, multiplier: currentMultiplier };
  }

  // ─── Crash (auto-settle when round ends) ─────────────
  async settleCrashRound(roundId: string, crashPoint: number) {
    // Find all active bets that didn't cash out
    const activeSessions = await prisma.gameSession.findMany({
      where: { status: 'IN_PROGRESS', gameType: 'CRASH' },
    });

    for (const session of activeSessions) {
      if (!session.cashOutAt || Number(session.cashOutAt) > crashPoint) {
        // Player lost - unlock locked balance (already deducted on bet)
        await prisma.$transaction(async (tx) => {
          await tx.wallet.update({
            where: { userId: session.userId },
            data: { lockedBalance: { decrement: session.betAmount } },
          });
          await tx.gameSession.update({
            where: { id: session.id },
            data: { status: 'COMPLETED', crashPoint, winAmount: 0 },
          });
        });
      }
    }

    await prisma.crashRound.update({
      where: { id: roundId },
      data: { endedAt: new Date() },
    });
    await redis.del('crash:active_round');
  }

  // ─── Game History ─────────────────────────────────────
  async getHistory(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [sessions, total] = await Promise.all([
      prisma.gameSession.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.gameSession.count({ where: { userId } }),
    ]);
    return { sessions, total, page, totalPages: Math.ceil(total / limit) };
  }
}

export const gameService = new GameService();
