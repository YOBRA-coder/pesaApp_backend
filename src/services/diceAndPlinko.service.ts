import crypto from 'crypto';
import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

const HOUSE_EDGE = 0.03;

// ── Provably fair dice roll ──────────────────────────────────
function rollDice(serverSeed: string, clientSeed: string, nonce: number): number {
  const hmac = crypto.createHmac('sha256', serverSeed);
  hmac.update(`${clientSeed}:${nonce}`);
  const hash = hmac.digest('hex');
  const roll = (parseInt(hash.slice(0, 8), 16) % 100) + 1; // 1–100
  return roll;
}

function calcDiceMultiplier(target: number, mode: 'OVER' | 'UNDER'): number {
  const winChance = mode === 'OVER' ? (100 - target) : target;
  return parseFloat(((100 / winChance) * (1 - HOUSE_EDGE)).toFixed(4));
}

// ── Plinko multipliers by risk ────────────────────────────────
const PLINKO_MULTIPLIERS: Record<string, number[]> = {
  LOW:    [1.5, 1.2, 1.1, 1.0, 0.5, 0.3, 0.5, 1.0, 1.1, 1.2, 1.5],
  MEDIUM: [5.6, 2.1, 1.4, 1.1, 0.6, 0.3, 0.6, 1.1, 1.4, 2.1, 5.6],
  HIGH:   [110, 41, 10, 5, 3, 0.5, 3, 5, 10, 41, 110],
};

function generatePlinkoPath(serverSeed: string, rows = 12): { path: number[]; slot: number } {
  const path: number[] = [];
  let pos = 0;
  for (let i = 0; i < rows; i++) {
    const hmac = crypto.createHmac('sha256', serverSeed);
    hmac.update(`plinko:${i}`);
    const hash = hmac.digest('hex');
    const bit = parseInt(hash[0], 16) % 2;
    pos += bit;
    path.push(bit);
  }
  // pos is 0..rows, normalize to slot index
  const slots = PLINKO_MULTIPLIERS.LOW.length;
  const slot = Math.min(slots - 1, Math.floor((pos / rows) * slots));
  return { path, slot };
}

// ─────────────────────────────────────────────────────────────
// DICE GAME SERVICE
// ─────────────────────────────────────────────────────────────
export class DiceGameService {

  async roll(userId: string, betAmount: number, target: number, mode: 'OVER' | 'UNDER', clientSeed?: string) {
    if (betAmount < 10) throw new AppError('Minimum bet KES 10', 400);
    if (betAmount > 50000) throw new AppError('Maximum bet KES 50,000', 400);
    if (target < 2 || target > 98) throw new AppError('Target must be between 2 and 98', 400);

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet || Number(wallet.balance) < betAmount) throw new AppError('Insufficient balance', 400);

    const serverSeed = crypto.randomBytes(16).toString('hex');
    const seed = clientSeed || crypto.randomBytes(8).toString('hex');
    const nonce = Math.floor(Math.random() * 1000000);
    const roll = rollDice(serverSeed, seed, nonce);
    const multiplier = calcDiceMultiplier(target, mode);
    const won = mode === 'OVER' ? roll > target : roll < target;
    const winAmount = won ? parseFloat((betAmount * multiplier).toFixed(2)) : 0;
    const pnl = won ? winAmount - betAmount : -betAmount;

    await prisma.$transaction([
      prisma.diceGame.create({
        data: {
          userId,
          betAmount,
          target,
          mode,
          roll,
          multiplier,
          won,
          winAmount: winAmount || 0,
          pnl,
          serverSeed,
        },
      }),
      prisma.wallet.update({
        where: { userId },
        data: {
          balance: won
            ? { increment: winAmount - betAmount }  // net (bet already deducted below)
            : { decrement: betAmount },
        },
      }),
      prisma.transaction.create({
        data: {
          userId,
          type: won ? 'GAME_WIN' : 'GAME_BET',
          status: 'COMPLETED',
          amount: won ? winAmount : betAmount,
          fee: 0,
          balanceBefore: Number(wallet.balance),
          balanceAfter: Number(wallet.balance) + (won ? winAmount - betAmount : -betAmount),
          description: `Dice ${mode} ${target} — Roll: ${roll} — ${won ? 'WIN' : 'LOSS'}`,
          provider: 'INTERNAL',
          metadata: { roll, target, mode, multiplier, won },
          completedAt: new Date(),
        },
      }),
      // Revenue tracking
      prisma.gameRevenue.upsert({
        where: { date_gameType: { date: new Date(new Date().setHours(0,0,0,0)), gameType: 'DICE' } },
        update: {
          totalBets: { increment: betAmount },
          totalPayout: { increment: won ? winAmount : 0 },
          houseProfit: { increment: won ? betAmount - winAmount : betAmount },
          roundCount: { increment: 1 },
        },
        create: {
          date: new Date(new Date().setHours(0,0,0,0)), gameType: 'DICE',
          totalBets: betAmount, totalPayout: won ? winAmount : 0,
          houseProfit: won ? betAmount - winAmount : betAmount, roundCount: 1,
        },
      }),
    ]);

    logger.info(`Dice: user ${userId}, roll ${roll}, target ${target} ${mode}, ${won ? 'WON' : 'LOST'} ${won ? winAmount : betAmount}`);

    return {
      roll,
      target,
      mode,
      won,
      multiplier,
      winAmount: won ? winAmount : 0,
      pnl,
      serverSeed, // always reveal for dice (instant)
      clientSeed: seed,
      newBalance: Number(wallet.balance) + (won ? winAmount - betAmount : -betAmount),
    };
  }

  async getHistory(userId: string, page = 1) {
    const [games, total] = await Promise.all([
      prisma.diceGame.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * 20,
        take: 20,
      }),
      prisma.diceGame.count({ where: { userId } }),
    ]);
    return { games, total };
  }

  async getStats(userId: string) {
    const [wins, losses, agg] = await Promise.all([
      prisma.diceGame.count({ where: { userId, won: true } }),
      prisma.diceGame.count({ where: { userId, won: false } }),
      prisma.diceGame.aggregate({ where: { userId }, _sum: { pnl: true, betAmount: true } }),
    ]);
    return {
      wins, losses,
      totalBet: Number(agg._sum.betAmount || 0),
      netPnl: Number(agg._sum.pnl || 0),
      winRate: wins + losses > 0 ? parseFloat(((wins / (wins + losses)) * 100).toFixed(1)) : 0,
    };
  }
}

// ─────────────────────────────────────────────────────────────
// PLINKO GAME SERVICE
// ─────────────────────────────────────────────────────────────
export class PlinkoGameService {

  async drop(userId: string, betAmount: number, risk: 'LOW' | 'MEDIUM' | 'HIGH') {
    if (betAmount < 10) throw new AppError('Minimum bet KES 10', 400);
    if (betAmount > 50000) throw new AppError('Maximum bet KES 50,000', 400);
    if (!['LOW', 'MEDIUM', 'HIGH'].includes(risk)) throw new AppError('Invalid risk level', 400);

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet || Number(wallet.balance) < betAmount) throw new AppError('Insufficient balance', 400);

    const serverSeed = crypto.randomBytes(16).toString('hex');
    const { path, slot } = generatePlinkoPath(serverSeed);
    const multiplier = PLINKO_MULTIPLIERS[risk][slot];
    const winAmount = parseFloat((betAmount * multiplier).toFixed(2));
    const pnl = winAmount - betAmount;

    await prisma.$transaction([
      prisma.plinkoGame.create({
        data: {
          userId,
          betAmount,
          risk,
          slot,
          multiplier,
          winAmount,
          path,
          serverSeed,
        },
      }),
      prisma.wallet.update({
        where: { userId },
        data: { balance: { increment: winAmount - betAmount } }, // net change
      }),
      prisma.transaction.create({
        data: {
          userId,
          type: multiplier >= 1 ? 'GAME_WIN' : 'GAME_BET',
          status: 'COMPLETED',
          amount: winAmount >= betAmount ? winAmount : betAmount,
          fee: 0,
          balanceBefore: Number(wallet.balance),
          balanceAfter: Number(wallet.balance) + (winAmount - betAmount),
          description: `Plinko ${risk} risk — ${multiplier}x`,
          provider: 'INTERNAL',
          metadata: { slot, multiplier, risk },
          completedAt: new Date(),
        },
      }),
      prisma.gameRevenue.upsert({
        where: { date_gameType: { date: new Date(new Date().setHours(0,0,0,0)), gameType: 'PLINKO' } },
        update: {
          totalBets: { increment: betAmount },
          totalPayout: { increment: winAmount },
          houseProfit: { increment: betAmount - winAmount },
          roundCount: { increment: 1 },
        },
        create: {
          date: new Date(new Date().setHours(0,0,0,0)), gameType: 'PLINKO',
          totalBets: betAmount, totalPayout: winAmount,
          houseProfit: betAmount - winAmount, roundCount: 1,
        },
      }),
    ]);

    logger.info(`Plinko: user ${userId}, bet ${betAmount}, slot ${slot}, mult ${multiplier}x, win ${winAmount}`);

    return {
      path,
      slot,
      multiplier,
      winAmount,
      pnl,
      serverSeed,
      multipliers: PLINKO_MULTIPLIERS[risk],
      newBalance: Number(wallet.balance) + (winAmount - betAmount),
    };
  }

  async getHistory(userId: string, page = 1) {
    const [games, total] = await Promise.all([
      prisma.plinkoGame.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * 20, take: 20,
        select: { id: true, betAmount: true, risk: true, slot: true, multiplier: true, winAmount: true, createdAt: true },
      }),
      prisma.plinkoGame.count({ where: { userId } }),
    ]);
    return { games, total };
  }
}

export const diceGameService = new DiceGameService();
export const plinkoGameService = new PlinkoGameService();
