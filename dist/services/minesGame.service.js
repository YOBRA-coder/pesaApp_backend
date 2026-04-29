"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.minesGameService = exports.MinesGameService = void 0;
exports.calcMinesMultiplier = calcMinesMultiplier;
const crypto_1 = __importDefault(require("crypto"));
const database_1 = require("../config/database");
const AppError_1 = require("../utils/AppError");
const logger_1 = require("../utils/logger");
const GRID_SIZE = 25;
const MIN_BET = 10;
const HOUSE_EDGE = 0.03; // 3% house edge
// ── Provably fair mine positions ──────────────────────────────
function generateMinePositions(serverSeed, minesCount) {
    const positions = [];
    let counter = 0;
    while (positions.length < minesCount) {
        const hmac = crypto_1.default.createHmac('sha256', serverSeed);
        hmac.update(`${counter}`);
        const hash = hmac.digest('hex');
        const pos = parseInt(hash.slice(0, 8), 16) % GRID_SIZE;
        if (!positions.includes(pos))
            positions.push(pos);
        counter++;
    }
    return positions;
}
// ── Multiplier calculation ────────────────────────────────────
function calcMinesMultiplier(minesCount, gemsFound) {
    if (gemsFound === 0)
        return 1.00;
    const safeTotal = GRID_SIZE - minesCount;
    let mult = 1;
    for (let i = 0; i < gemsFound; i++) {
        mult *= (GRID_SIZE - minesCount - i) / (GRID_SIZE - i);
    }
    // Invert (probability of surviving), apply house edge
    const pSurvive = mult;
    const fairMult = 1 / pSurvive;
    return parseFloat(Math.max(1, fairMult * (1 - HOUSE_EDGE)).toFixed(4));
}
class MinesGameService {
    // ── Start new game ────────────────────────────────────────
    async startGame(userId, betAmount, minesCount) {
        if (betAmount < MIN_BET)
            throw new AppError_1.AppError(`Minimum bet KES ${MIN_BET}`, 400);
        if (minesCount < 1 || minesCount > 24)
            throw new AppError_1.AppError('Mines must be between 1 and 24', 400);
        // Check for active game
        const activeGame = await database_1.prisma.minesGame.findFirst({
            where: { userId, status: 'ACTIVE' },
        });
        if (activeGame)
            throw new AppError_1.AppError('You have an active mines game. Cash out first.', 409);
        const wallet = await database_1.prisma.wallet.findUnique({ where: { userId } });
        if (!wallet || Number(wallet.balance) < betAmount) {
            throw new AppError_1.AppError('Insufficient balance', 400);
        }
        const serverSeed = crypto_1.default.randomBytes(32).toString('hex');
        const minePositions = generateMinePositions(serverSeed, minesCount);
        const [game] = await database_1.prisma.$transaction([
            database_1.prisma.minesGame.create({
                data: {
                    userId,
                    betAmount,
                    minesCount,
                    gridState: Array(GRID_SIZE).fill('hidden'),
                    minePositions, // stored server-side
                    gemsFound: 0,
                    multiplier: 1,
                    status: 'ACTIVE',
                    serverSeed,
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
                    description: `Mines game (${minesCount} mines)`,
                    provider: 'INTERNAL',
                    completedAt: new Date(),
                },
            }),
        ]);
        logger_1.logger.info(`Mines started: user ${userId}, bet ${betAmount}, mines ${minesCount}`);
        return {
            gameId: game.id,
            betAmount,
            minesCount,
            gridSize: GRID_SIZE,
            // Never expose minePositions to client
            serverSeedHash: crypto_1.default.createHash('sha256').update(serverSeed).digest('hex'),
            nextMultiplier: calcMinesMultiplier(minesCount, 1),
        };
    }
    // ── Reveal cell ───────────────────────────────────────────
    async revealCell(userId, gameId, cellIndex) {
        if (cellIndex < 0 || cellIndex >= GRID_SIZE)
            throw new AppError_1.AppError('Invalid cell', 400);
        const game = await database_1.prisma.minesGame.findFirst({
            where: { id: gameId, userId, status: 'ACTIVE' },
        });
        if (!game)
            throw new AppError_1.AppError('No active game found', 404);
        const gridState = game.gridState;
        const minePositions = game.minePositions;
        if (gridState[cellIndex] !== 'hidden')
            throw new AppError_1.AppError('Cell already revealed', 400);
        const isMine = minePositions.includes(cellIndex);
        if (isMine) {
            // Game over — reveal all mines
            const finalGrid = gridState.map((cell, i) => minePositions.includes(i) ? 'mine' : (cell === 'gem' ? 'gem' : 'hidden'));
            finalGrid[cellIndex] = 'mine';
            await database_1.prisma.$transaction([
                database_1.prisma.minesGame.update({
                    where: { id: gameId },
                    data: {
                        gridState: finalGrid,
                        status: 'LOST',
                        winAmount: 0,
                        updatedAt: new Date(),
                    },
                }),
                // Update daily revenue
                database_1.prisma.gameRevenue.upsert({
                    where: { date_gameType: { date: new Date(new Date().setHours(0, 0, 0, 0)), gameType: 'MINES' } },
                    update: { totalBets: { increment: game.betAmount }, houseProfit: { increment: game.betAmount }, roundCount: { increment: 1 } },
                    create: { date: new Date(new Date().setHours(0, 0, 0, 0)), gameType: 'MINES', totalBets: game.betAmount, houseProfit: game.betAmount, roundCount: 1 },
                }),
            ]);
            return {
                hit: 'mine',
                cellIndex,
                gridState: finalGrid,
                minePositions, // reveal on loss
                serverSeed: game.serverSeed, // reveal on loss (provably fair)
                winAmount: 0,
            };
        }
        // It's a gem
        const newGrid = [...gridState];
        newGrid[cellIndex] = 'gem';
        const newGemsFound = game.gemsFound + 1;
        const newMultiplier = calcMinesMultiplier(game.minesCount, newGemsFound);
        const safeLeft = GRID_SIZE - game.minesCount - newGemsFound;
        // Auto-win if all safe cells found
        if (safeLeft === 0) {
            return this.cashOut(userId, gameId);
        }
        await database_1.prisma.minesGame.update({
            where: { id: gameId },
            data: {
                gridState: newGrid,
                gemsFound: newGemsFound,
                multiplier: newMultiplier,
                updatedAt: new Date(),
            },
        });
        return {
            hit: 'gem',
            cellIndex,
            gridState: newGrid,
            gemsFound: newGemsFound,
            multiplier: newMultiplier,
            nextMultiplier: calcMinesMultiplier(game.minesCount, newGemsFound + 1),
            currentWin: parseFloat((Number(game.betAmount) * newMultiplier).toFixed(2)),
            safeLeft,
        };
    }
    // ── Cash out ──────────────────────────────────────────────
    async cashOut(userId, gameId) {
        const game = await database_1.prisma.minesGame.findFirst({
            where: { id: gameId, userId, status: 'ACTIVE' },
        });
        if (!game)
            throw new AppError_1.AppError('No active game', 404);
        if (game.gemsFound === 0)
            throw new AppError_1.AppError('Reveal at least one gem before cashing out', 400);
        const multiplier = Number(game.multiplier);
        const winAmount = parseFloat((Number(game.betAmount) * multiplier).toFixed(2));
        const profit = winAmount - Number(game.betAmount);
        const wallet = await database_1.prisma.wallet.findUnique({ where: { userId } });
        await database_1.prisma.$transaction([
            database_1.prisma.minesGame.update({
                where: { id: gameId },
                data: { status: 'CASHED_OUT', winAmount, updatedAt: new Date() },
            }),
            database_1.prisma.wallet.update({
                where: { userId },
                data: { balance: { increment: winAmount } },
            }),
            database_1.prisma.transaction.create({
                data: {
                    userId,
                    type: 'GAME_WIN',
                    status: 'COMPLETED',
                    amount: winAmount,
                    fee: 0,
                    balanceBefore: Number(wallet?.balance || 0),
                    balanceAfter: Number(wallet?.balance || 0) + winAmount,
                    description: `Mines win @ ${multiplier.toFixed(4)}x (${game.gemsFound} gems)`,
                    provider: 'INTERNAL',
                    metadata: { gameId, gemsFound: game.gemsFound, multiplier },
                    completedAt: new Date(),
                },
            }),
            database_1.prisma.gameRevenue.upsert({
                where: { date_gameType: { date: new Date(new Date().setHours(0, 0, 0, 0)), gameType: 'MINES' } },
                update: {
                    totalBets: { increment: game.betAmount },
                    totalPayout: { increment: winAmount },
                    houseProfit: { increment: Number(game.betAmount) - winAmount },
                    roundCount: { increment: 1 },
                },
                create: {
                    date: new Date(new Date().setHours(0, 0, 0, 0)), gameType: 'MINES',
                    totalBets: game.betAmount, totalPayout: winAmount,
                    houseProfit: Number(game.betAmount) - winAmount, roundCount: 1,
                },
            }),
        ]);
        logger_1.logger.info(`Mines cashout: user ${userId}, win ${winAmount} @ ${multiplier}x`);
        return {
            cashedOut: true,
            winAmount,
            multiplier,
            profit,
            gemsFound: game.gemsFound,
            minePositions: game.minePositions, // reveal on cashout
            serverSeed: game.serverSeed, // provably fair
        };
    }
    async getActiveGame(userId) {
        const game = await database_1.prisma.minesGame.findFirst({
            where: { userId, status: 'ACTIVE' },
        });
        if (!game)
            return null;
        return {
            gameId: game.id,
            betAmount: Number(game.betAmount),
            minesCount: game.minesCount,
            gridState: game.gridState,
            gemsFound: game.gemsFound,
            multiplier: Number(game.multiplier),
            currentWin: parseFloat((Number(game.betAmount) * Number(game.multiplier)).toFixed(2)),
            serverSeedHash: crypto_1.default.createHash('sha256').update(game.serverSeed).digest('hex'),
        };
    }
    async getGameHistory(userId, page = 1) {
        const [games, total] = await Promise.all([
            database_1.prisma.minesGame.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * 20,
                take: 20,
                select: {
                    id: true, betAmount: true, minesCount: true, gemsFound: true,
                    multiplier: true, winAmount: true, status: true, createdAt: true,
                },
            }),
            database_1.prisma.minesGame.count({ where: { userId } }),
        ]);
        return { games, total };
    }
}
exports.MinesGameService = MinesGameService;
exports.minesGameService = new MinesGameService();
//# sourceMappingURL=minesGame.service.js.map