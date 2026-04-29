"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.crashGameService = exports.CrashGameService = void 0;
exports.generateCrashPoint = generateCrashPoint;
exports.cacheRoundHistory = cacheRoundHistory;
const crypto_1 = __importDefault(require("crypto"));
const database_1 = require("../config/database");
const redis_1 = require("../config/redis");
const AppError_1 = require("../utils/AppError");
const logger_1 = require("../utils/logger");
const HOUSE_EDGE = parseFloat(process.env.HOUSE_EDGE_PERCENT || '0.05');
const MIN_BET = 10;
const MAX_BET = 50000;
// ── Provably fair crash point ────────────────────────────────
function generateCrashPoint(serverSeed, roundNumber) {
    const hmac = crypto_1.default.createHmac('sha256', serverSeed);
    hmac.update(`${roundNumber}`);
    const hash = hmac.digest('hex');
    const h = parseInt(hash.slice(0, 8), 16);
    const e = Math.pow(2, 32);
    if (h % Math.floor(1 / HOUSE_EDGE) === 0)
        return 1.00;
    const point = (100 * e - h) / (e - h) / 100;
    return Math.max(1.00, parseFloat(point.toFixed(2)));
}
// ── Round state keys ─────────────────────────────────────────
const ROUND_KEY = 'crash:current_round';
const PHASE_KEY = 'crash:phase'; // waiting | flying | crashed
const MULT_KEY = 'crash:multiplier';
const BETS_KEY = (roundId) => `crash:bets:${roundId}`;
class CrashGameService {
    // ── Create new round (called by cron/loop) ───────────────
    async createRound() {
        const serverSeed = crypto_1.default.randomBytes(32).toString('hex');
        const serverSeedHash = crypto_1.default.createHash('sha256').update(serverSeed).digest('hex');
        const lastRound = await database_1.prisma.crashRound.findFirst({ orderBy: { roundNumber: 'desc' } });
        const nextNumber = (lastRound?.roundNumber || 0) + 1;
        const crashPoint = generateCrashPoint(serverSeed, nextNumber);
        const round = await database_1.prisma.crashRound.create({
            data: { serverSeed, serverSeedHash, crashPoint },
        });
        // Cache current round (hide actual crash point)
        await redis_1.redis.set(ROUND_KEY, JSON.stringify({
            id: round.id,
            roundNumber: round.roundNumber,
            serverSeedHash,
            crashPoint, // server only — never expose to client
        }), 'EX', 600);
        await redis_1.redis.set(PHASE_KEY, 'waiting', 'EX', 600);
        logger_1.logger.info(`Crash Round ${nextNumber} created. Hash ${serverSeedHash} Crash at ${crashPoint}x`);
        return { roundId: round.id, crashPoint, serverSeedHash };
    }
    // ── Get current round (safe for client) ──────────────────
    async getCurrentRound() {
        const raw = await redis_1.redis.get(ROUND_KEY);
        if (!raw)
            return null;
        const round = JSON.parse(raw);
        const phase = await redis_1.redis.get(PHASE_KEY) || 'waiting';
        const mult = parseFloat(await redis_1.redis.get(MULT_KEY) || '1.00');
        return {
            roundId: round.id,
            roundNumber: round.roundNumber,
            serverSeedHash: round.serverSeedHash,
            phase,
            multiplier: mult,
        };
    }
    // ── Place bet ─────────────────────────────────────────────
    async placeBet(userId, roundId, betAmount, autoCashout) {
        if (betAmount < MIN_BET)
            throw new AppError_1.AppError(`Minimum bet is KES ${MIN_BET}`, 400);
        if (betAmount > MAX_BET)
            throw new AppError_1.AppError(`Maximum bet is KES ${MAX_BET}`, 400);
        const phase = await redis_1.redis.get(PHASE_KEY);
        if (phase !== 'waiting')
            throw new AppError_1.AppError('Round already in progress. Wait for next round.', 400);
        // Check round exists
        const round = await database_1.prisma.crashRound.findUnique({ where: { id: roundId } });
        if (!round)
            throw new AppError_1.AppError('Round not found', 404);
        // Check no duplicate bet for this round
        const existing = await database_1.prisma.crashBet.findFirst({ where: { roundId, userId } });
        if (existing)
            throw new AppError_1.AppError('You already have a bet in this round', 409);
        // Deduct from wallet atomically
        const wallet = await database_1.prisma.wallet.findUnique({ where: { userId } });
        if (!wallet || Number(wallet.balance) < betAmount) {
            throw new AppError_1.AppError('Insufficient balance', 400);
        }
        const [bet] = await database_1.prisma.$transaction([
            database_1.prisma.crashBet.create({
                data: {
                    roundId,
                    userId,
                    betAmount,
                    autoCashout: autoCashout || null,
                    status: 'PENDING',
                },
            }),
            database_1.prisma.wallet.update({
                where: { userId },
                data: { balance: { decrement: betAmount } },
            }),
            database_1.prisma.transaction.create({
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
            database_1.prisma.crashRound.update({
                where: { id: roundId },
                data: { totalBets: { increment: betAmount } },
            }),
        ]);
        logger_1.logger.info(`Crash bet: user ${userId}, round ${round.roundNumber}, amount ${betAmount}`);
        return bet;
    }
    // ── Cash out ──────────────────────────────────────────────
    async cashOut(userId, roundId, currentMultiplier) {
        const phase = await redis_1.redis.get(PHASE_KEY);
        if (phase !== 'flying')
            throw new AppError_1.AppError('Game not in progress', 400);
        const bet = await database_1.prisma.crashBet.findFirst({
            where: { roundId, userId, status: 'PENDING' },
        });
        if (!bet)
            throw new AppError_1.AppError('No active bet found in this round', 404);
        const winAmount = parseFloat((Number(bet.betAmount) * currentMultiplier).toFixed(2));
        await database_1.prisma.$transaction([
            database_1.prisma.crashBet.update({
                where: { id: bet.id },
                data: {
                    status: 'WON',
                    cashOutAt: currentMultiplier,
                    winAmount,
                    settledAt: new Date(),
                },
            }),
            database_1.prisma.wallet.update({
                where: { userId },
                data: {
                    balance: { increment: winAmount },
                    totalDeposited: { increment: winAmount - Number(bet.betAmount) }, // only net gain
                },
            }),
            database_1.prisma.transaction.create({
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
            database_1.prisma.crashRound.update({
                where: { id: roundId },
                data: { totalPayout: { increment: winAmount } },
            }),
        ]);
        logger_1.logger.info(`Crash cashout: user ${userId}, mult ${currentMultiplier}x, win ${winAmount}`);
        return { winAmount, multiplier: currentMultiplier };
    }
    // ── Settle round (called when plane crashes) ─────────────
    async settleRound(roundId, crashPoint) {
        // Mark all un-cashed bets as LOST
        const pendingBets = await database_1.prisma.crashBet.findMany({
            where: { roundId, status: 'PENDING' },
            include: { user: { include: { wallet: true } } },
        });
        let houseProfitFromLosses = 0;
        const updates = pendingBets.map(bet => {
            houseProfitFromLosses += Number(bet.betAmount);
            return database_1.prisma.crashBet.update({
                where: { id: bet.id },
                data: { status: 'LOST', cashOutAt: null, winAmount: 0, settledAt: new Date() },
            });
        });
        // Calculate total house profit
        const round = await database_1.prisma.crashRound.findUnique({ where: { id: roundId } });
        const totalPayout = Number(round?.totalPayout || 0);
        const totalBets = Number(round?.totalBets || 0);
        const houseProfit = totalBets - totalPayout;
        await database_1.prisma.$transaction([
            ...updates,
            database_1.prisma.crashRound.update({
                where: { id: roundId },
                data: { endedAt: new Date(), houseProfit },
            }),
        ]);
        // Update daily revenue
        await this.updateDailyRevenue('CRASH', totalBets, totalPayout);
        // Reveal server seed (provably fair)
        const dbRound = await database_1.prisma.crashRound.findUnique({ where: { id: roundId } });
        logger_1.logger.info(`Crash round ${dbRound?.roundNumber} settled. Crash: ${crashPoint}x. House profit: ${houseProfit}`);
        return { houseProfit, pendingSettled: pendingBets.length };
    }
    async getRoundHistory(limit = 20) {
        const rounds = await database_1.prisma.crashRound.findMany({
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
    async getUserBetHistory(userId, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        const [bets, total] = await Promise.all([
            database_1.prisma.crashBet.findMany({
                where: { userId },
                include: { round: { select: { roundNumber: true, crashPoint: true, serverSeedHash: true } } },
                orderBy: { placedAt: 'desc' },
                skip, take: limit,
            }),
            database_1.prisma.crashBet.count({ where: { userId } }),
        ]);
        return { bets, total, page, totalPages: Math.ceil(total / limit) };
    }
    async getRoundBets(roundId) {
        return database_1.prisma.crashBet.findMany({
            where: { roundId },
            include: { user: { select: { username: true, phone: true } } },
            orderBy: { placedAt: 'asc' },
        });
    }
    async updateDailyRevenue(gameType, totalBets, totalPayout) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const houseProfit = totalBets - totalPayout;
        await database_1.prisma.gameRevenue.upsert({
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
exports.CrashGameService = CrashGameService;
async function cacheRoundHistory(roundNumber, crashPoint) {
    const existing = await redis_1.redis.get('crash:history:global');
    const history = existing ? JSON.parse(existing) : [];
    history.unshift({ roundNumber, crashPoint });
    if (history.length > 50)
        history.splice(50);
    await redis_1.redis.set('crash:history:global', JSON.stringify(history), 'EX', 86400);
}
exports.crashGameService = new CrashGameService();
//# sourceMappingURL=crashGame.service.js.map