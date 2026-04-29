"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../config/database");
const auth_middleware_1 = require("../middleware/auth.middleware");
const express_validator_1 = require("express-validator");
const validate_1 = require("../middleware/validate");
const mpesa_service_1 = require("../services/mpesa.service");
const AppError_1 = require("../utils/AppError");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate, auth_middleware_1.requireAdmin);
// ── House wallet - special user for house funds ───────────────
const HOUSE_USER_ID = process.env.HOUSE_USER_ID || 'house';
// GET /admin/house/balance
router.get('/house/balance', async (req, res, next) => {
    try {
        // House "wallet" is tracked in SystemConfig
        const [totalBetsAgg, totalPayoutAgg] = await Promise.all([
            database_1.prisma.gameRevenue.aggregate({ _sum: { totalBets: true } }),
            database_1.prisma.gameRevenue.aggregate({ _sum: { totalPayout: true, houseProfit: true } }),
        ]);
        const houseDeposits = await database_1.prisma.transaction.aggregate({
            where: { type: 'HOUSE_DEPOSIT' },
            _sum: { amount: true },
        });
        const houseWithdrawals = await database_1.prisma.transaction.aggregate({
            where: { type: 'HOUSE_WITHDRAWAL' },
            _sum: { amount: true },
        });
        const totalBets = Number(totalBetsAgg._sum.totalBets || 0);
        const totalPayout = Number(totalPayoutAgg._sum.totalPayout || 0);
        const houseProfit = totalBets - totalPayout;
        const deposited = Number(houseDeposits._sum.amount || 0);
        const withdrawn = Number(houseWithdrawals._sum.amount || 0);
        const balance = houseProfit + deposited - withdrawn;
        res.json({ success: true, data: { balance, houseProfit, totalDeposited: deposited, totalWithdrawn: withdrawn, totalBets, totalPayout } });
    }
    catch (e) {
        next(e);
    }
});
// POST /admin/house/deposit — admin deposits to house fund
router.post('/house/deposit', (0, express_validator_1.body)('amount').isFloat({ min: 100 }), (0, express_validator_1.body)('description').optional().isString(), validate_1.validate, async (req, res, next) => {
    try {
        const { amount, description } = req.body;
        await database_1.prisma.transaction.create({
            data: {
                userId: req.user.id,
                type: 'HOUSE_DEPOSIT',
                status: 'COMPLETED',
                amount,
                fee: 0,
                balanceBefore: 0,
                balanceAfter: amount,
                description: description || 'Admin house fund deposit',
                provider: 'INTERNAL',
                completedAt: new Date(),
                metadata: { adminId: req.user.id },
            },
        });
        // Log admin action
        // await prisma.adminAuditLog.create({
        // data: { userId: req.user.id, action: 'HOUSE_DEPOSIT', details: { amount }, ip: req.ip || '', userAgent: req.headers['user-agent'] || '' },
        //});
        logger_1.logger.info(`Admin ${req.user.id} deposited ${amount} to house fund`);
        res.json({ success: true, message: `KES ${amount.toLocaleString()} deposited to house fund` });
    }
    catch (e) {
        next(e);
    }
});
// POST /admin/house/withdraw — admin withdraws profit via M-Pesa
router.post('/house/withdraw', (0, express_validator_1.body)('amount').isFloat({ min: 100 }), (0, express_validator_1.body)('phone').optional().isMobilePhone('any'), (0, express_validator_1.body)('description').optional().isString(), validate_1.validate, async (req, res, next) => {
    try {
        const { amount, phone, description } = req.body;
        // Check balance
        const houseData = await getHouseBalance();
        if (houseData.balance < amount) {
            throw new AppError_1.AppError(`Insufficient house balance. Available: ${formatAmount(houseData.balance)}`, 400);
        }
        // Get admin's phone if not provided
        const adminUser = await database_1.prisma.user.findUnique({ where: { id: req.user.id }, select: { phone: true } });
        const targetPhone = phone || adminUser?.phone;
        if (!targetPhone)
            throw new AppError_1.AppError('Phone number required', 400);
        // Initiate B2C withdrawal
        let externalRef;
        try {
            const b2c = await mpesa_service_1.mpesa.b2cPayment({
                phone: targetPhone,
                amount,
                occasion: `House profit withdrawal`,
            });
            externalRef = b2c.ConversationID;
        }
        catch (mpesaErr) {
            logger_1.logger.warn('B2C failed for house withdrawal, recording manually:', mpesaErr);
        }
        await database_1.prisma.transaction.create({
            data: {
                userId: req.user.id,
                type: 'HOUSE_WITHDRAWAL',
                status: externalRef ? 'PROCESSING' : 'COMPLETED',
                amount,
                fee: 0,
                balanceBefore: houseData.balance,
                balanceAfter: houseData.balance - amount,
                description: description || 'Admin profit withdrawal',
                provider: 'MPESA',
                externalRef,
                completedAt: externalRef ? undefined : new Date(),
                metadata: { adminId: req.user.id, phone: targetPhone },
            },
        });
        // await prisma.adminAuditLog.create({
        //  data: { userId: req.user.id, action: 'HOUSE_WITHDRAWAL', details: { amount, phone: targetPhone }, ip: req.ip || '', userAgent: req.headers['user-agent'] || '' },
        //  });
        logger_1.logger.info(`Admin ${req.user.id} withdrew ${amount} from house to ${targetPhone}`);
        res.json({ success: true, message: `KES ${amount.toLocaleString()} withdrawal initiated to ${targetPhone}` });
    }
    catch (e) {
        next(e);
    }
});
// GET /admin/revenue/games — game revenue breakdown
router.get('/revenue/games', async (req, res, next) => {
    try {
        const { period = 'today' } = req.query;
        const now = new Date();
        let startDate;
        if (period === 'today') {
            startDate = new Date(now);
            startDate.setHours(0, 0, 0, 0);
        }
        else if (period === 'week') {
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 7);
        }
        else {
            startDate = new Date(now);
            startDate.setMonth(now.getMonth() - 1);
        }
        const revenue = await database_1.prisma.gameRevenue.groupBy({
            by: ['gameType'],
            where: { date: { gte: startDate } },
            _sum: { totalBets: true, totalPayout: true, houseProfit: true, roundCount: true, playerCount: true },
        });
        res.json({ success: true, data: revenue.map(r => ({
                gameType: r.gameType,
                totalBets: Number(r._sum.totalBets || 0),
                totalPayout: Number(r._sum.totalPayout || 0),
                houseProfit: Number(r._sum.houseProfit || 0),
                roundCount: r._sum.roundCount || 0,
                playerCount: r._sum.playerCount || 0,
            })) });
    }
    catch (e) {
        next(e);
    }
});
// GET /admin/revenue/daily — daily revenue chart data
router.get('/revenue/daily', async (req, res, next) => {
    try {
        const days = parseInt(req.query.days || '30');
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const daily = await database_1.prisma.dailyRevenue.findMany({
            where: { date: { gte: startDate } },
            orderBy: { date: 'asc' },
        });
        res.json({ success: true, data: daily });
    }
    catch (e) {
        next(e);
    }
});
// GET /admin/revenue/summary — total all-time summary
router.get('/revenue/summary', async (req, res, next) => {
    try {
        const [gameRev, txFees, signalRev, houseDeposits, houseWithdrawals] = await Promise.all([
            database_1.prisma.gameRevenue.aggregate({ _sum: { houseProfit: true, totalBets: true } }),
            database_1.prisma.transaction.aggregate({ where: { fee: { gt: 0 }, status: 'COMPLETED' }, _sum: { fee: true } }),
            database_1.prisma.transaction.aggregate({ where: { type: 'SIGNAL_SUBSCRIPTION', status: 'COMPLETED' }, _sum: { amount: true } }),
            database_1.prisma.transaction.aggregate({ where: { type: 'HOUSE_DEPOSIT' }, _sum: { amount: true } }),
            database_1.prisma.transaction.aggregate({ where: { type: 'HOUSE_WITHDRAWAL' }, _sum: { amount: true } }),
        ]);
        const totalGameProfit = Number(gameRev._sum.houseProfit || 0);
        const totalFees = Number(txFees._sum.fee || 0);
        const totalSignalRev = Number(signalRev._sum.amount || 0);
        const totalRevenue = totalGameProfit + totalFees + totalSignalRev;
        const netCash = totalRevenue + Number(houseDeposits._sum.amount || 0) - Number(houseWithdrawals._sum.amount || 0);
        res.json({ success: true, data: {
                totalGameProfit, totalFees, totalSignalRev, totalRevenue, netCash,
                totalGameVolume: Number(gameRev._sum.totalBets || 0),
            } });
    }
    catch (e) {
        next(e);
    }
});
// Helpers
async function getHouseBalance() {
    const [bets, payouts, deposits, withdrawals] = await Promise.all([
        database_1.prisma.gameRevenue.aggregate({ _sum: { totalBets: true } }),
        database_1.prisma.gameRevenue.aggregate({ _sum: { totalPayout: true } }),
        database_1.prisma.transaction.aggregate({ where: { type: 'HOUSE_DEPOSIT' }, _sum: { amount: true } }),
        database_1.prisma.transaction.aggregate({ where: { type: 'HOUSE_WITHDRAWAL' }, _sum: { amount: true } }),
    ]);
    const profit = Number(bets._sum.totalBets || 0) - Number(payouts._sum.totalPayout || 0);
    const balance = profit + Number(deposits._sum.amount || 0) - Number(withdrawals._sum.amount || 0);
    return { balance, houseProfit: profit };
}
function formatAmount(n) {
    return `KES ${n.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
}
exports.default = router;
//# sourceMappingURL=adminRevenue.routes.js.map