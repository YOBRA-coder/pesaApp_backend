"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// ═══════════════════════════════════════════════════════════
// backend/src/routes/sports.routes.ts
// ═══════════════════════════════════════════════════════════
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const database_1 = require("../config/database");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_1 = require("../middleware/validate");
const AppError_1 = require("../utils/AppError");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
// GET /sports/matches — return upcoming/live matches
router.get('/matches', async (req, res, next) => {
    try {
        const { league } = req.query;
        const where = { status: { in: ['upcoming', 'live'] } };
        if (league && league !== 'all')
            where.league = league;
        const matches = await database_1.prisma.sportMatch.findMany({
            where,
            orderBy: [{ status: 'asc' }, { kickoff: 'asc' }],
            take: 50,
        });
        res.json({ success: true, data: matches });
    }
    catch (e) {
        next(e);
    }
});
// POST /sports/bet — place sports bet
router.post('/bet', (0, express_validator_1.body)('stake').isFloat({ min: 10, max: 500000 }), (0, express_validator_1.body)('selections').isArray({ min: 1, max: 8 }), (0, express_validator_1.body)('totalOdds').isFloat({ min: 1.01 }), validate_1.validate, async (req, res, next) => {
    try {
        const { stake, selections, totalOdds } = req.body;
        // Verify wallet balance
        const wallet = await database_1.prisma.wallet.findUnique({ where: { userId: req.user.id } });
        if (!wallet || Number(wallet.balance) < stake)
            throw new AppError_1.AppError('Insufficient balance', 400);
        const potentialWin = parseFloat((stake * totalOdds).toFixed(2));
        await database_1.prisma.$transaction([
            database_1.prisma.sportBet.create({
                data: {
                    userId: req.user.id,
                    stake,
                    totalOdds,
                    potentialWin,
                    status: 'PENDING',
                    selections: {
                        create: selections.map((s) => ({
                            matchId: s.matchId,
                            outcome: s.outcome,
                            odds: s.odds,
                            outcomeLabel: s.outcomeLabel || s.outcome,
                            matchLabel: s.matchLabel || 'Match',
                        })),
                    },
                },
            }),
            database_1.prisma.wallet.update({
                where: { userId: req.user.id },
                data: { balance: { decrement: stake } },
            }),
            database_1.prisma.transaction.create({
                data: {
                    userId: req.user.id,
                    type: 'GAME_BET',
                    status: 'COMPLETED',
                    amount: stake,
                    fee: 0,
                    balanceBefore: Number(wallet.balance),
                    balanceAfter: Number(wallet.balance) - stake,
                    description: `Sports bet (${selections.length} selection${selections.length > 1 ? 's' : ''}) @ ${totalOdds.toFixed(2)}x`,
                    provider: 'INTERNAL',
                    completedAt: new Date(),
                    metadata: { betType: 'SPORTS', selectionsCount: selections.length },
                },
            }),
        ]);
        logger_1.logger.info(`Sports bet placed: user ${req.user.id}, stake ${stake}, odds ${totalOdds}`);
        res.json({ success: true, message: 'Bet placed! Good luck! 🍀' });
    }
    catch (e) {
        next(e);
    }
});
// GET /sports/my-bets
router.get('/my-bets', async (req, res, next) => {
    try {
        const bets = await database_1.prisma.sportBet.findMany({
            where: { userId: req.user.id },
            include: { selections: true },
            orderBy: { createdAt: 'desc' },
            take: 30,
        });
        res.json({ success: true, data: bets });
    }
    catch (e) {
        next(e);
    }
});
// ADMIN: settle a bet (mark won/lost)
// POST /sports/admin/settle/:betId
router.post('/admin/settle/:betId', async (req, res, next) => {
    try {
        if (req.user.role !== 'ADMIN')
            throw new AppError_1.AppError('Admin only', 403);
        const { won } = req.body;
        const bet = await database_1.prisma.sportBet.findUnique({
            where: { id: req.params.betId },
            include: { user: { include: { wallet: true } } },
        });
        if (!bet)
            throw new AppError_1.AppError('Bet not found', 404);
        if (bet.status !== 'PENDING')
            throw new AppError_1.AppError('Already settled', 400);
        if (won) {
            const winAmount = Number(bet.potentialWin);
            await database_1.prisma.$transaction([
                database_1.prisma.sportBet.update({ where: { id: bet.id }, data: { status: 'WON', winAmount, settledAt: new Date() } }),
                database_1.prisma.wallet.update({ where: { userId: bet.userId }, data: { balance: { increment: winAmount } } }),
                database_1.prisma.transaction.create({
                    data: {
                        userId: bet.userId,
                        type: 'GAME_WIN',
                        status: 'COMPLETED',
                        amount: winAmount,
                        fee: 0,
                        balanceBefore: Number(bet.user.wallet.balance),
                        balanceAfter: Number(bet.user.wallet.balance) + winAmount,
                        description: `Sports bet win @ ${Number(bet.totalOdds).toFixed(2)}x`,
                        provider: 'INTERNAL',
                        completedAt: new Date(),
                    },
                }),
            ]);
        }
        else {
            await database_1.prisma.sportBet.update({ where: { id: bet.id }, data: { status: 'LOST', winAmount: 0, settledAt: new Date() } });
        }
        res.json({ success: true, message: `Bet ${won ? 'WON' : 'LOST'} settled` });
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
// ═══════════════════════════════════════════════════════════
// Prisma schema additions — add these models to schema.prisma
// ═══════════════════════════════════════════════════════════
/*

// Also add to User model:
// sportBets  SportBet[]

// Also add to Signal model for plan gating:
// targetPlan  String @default("FREE")  // FREE, BASIC, PRO, VIP
// (store in metadata Json for now, or add this column)
*/
//# sourceMappingURL=sports.routes.js.map