"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../config/database");
const auth_middleware_1 = require("../middleware/auth.middleware");
const kyc_service_1 = require("../services/kyc.service");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate, auth_middleware_1.requireAdmin);
// Dashboard stats
router.get('/stats', async (req, res, next) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const [totalUsers, activeUsers, todayTx, pendingKyc, depositSum, gameSum] = await Promise.all([
            database_1.prisma.user.count(),
            database_1.prisma.user.count({ where: { status: 'ACTIVE' } }),
            database_1.prisma.transaction.count({ where: { createdAt: { gte: today } } }),
            database_1.prisma.kycRecord.count({ where: { status: 'PENDING' } }),
            database_1.prisma.transaction.aggregate({ where: { type: 'DEPOSIT', status: 'COMPLETED' }, _sum: { amount: true } }),
            database_1.prisma.transaction.aggregate({ where: { type: 'GAME_BET', status: 'COMPLETED' }, _sum: { amount: true } }),
        ]);
        res.json({ success: true, data: { totalUsers, activeUsers, todayTx, pendingKyc, totalDeposited: depositSum._sum.amount, totalGameVolume: gameSum._sum.amount } });
    }
    catch (e) {
        next(e);
    }
});
// List users
router.get('/users', async (req, res, next) => {
    try {
        const { page = 1, limit = 20, search, status } = req.query;
        const where = {};
        if (search)
            where.OR = [{ phone: { contains: String(search) } }, { username: { contains: String(search) } }];
        if (status)
            where.status = status;
        const [users, total] = await Promise.all([
            database_1.prisma.user.findMany({ where, include: { wallet: true }, orderBy: { createdAt: 'desc' }, skip: (Number(page) - 1) * Number(limit), take: Number(limit) }),
            database_1.prisma.user.count({ where }),
        ]);
        res.json({ success: true, data: { users, total, page: Number(page) } });
    }
    catch (e) {
        next(e);
    }
});
// Suspend / activate user
router.patch('/users/:id/status', async (req, res, next) => {
    try {
        const { status } = req.body;
        await database_1.prisma.user.update({ where: { id: req.params.id }, data: { status } });
        res.json({ success: true, message: `User ${status.toLowerCase()}` });
    }
    catch (e) {
        next(e);
    }
});
// Pending KYC list
router.get('/kyc/pending', async (req, res, next) => {
    try {
        const records = await database_1.prisma.kycRecord.findMany({
            where: { status: 'PENDING' },
            include: { user: { select: { phone: true, email: true } } },
            orderBy: { createdAt: 'asc' },
        });
        res.json({ success: true, data: records });
    }
    catch (e) {
        next(e);
    }
});
// Approve KYC
router.post('/kyc/:userId/approve', async (req, res, next) => {
    try {
        await kyc_service_1.kycService.approveKyc(req.params.userId);
        res.json({ success: true, message: 'KYC approved' });
    }
    catch (e) {
        next(e);
    }
});
// Reject KYC
router.post('/kyc/:userId/reject', async (req, res, next) => {
    try {
        const reason = req.body.reason || 'Documents unclear. Please resubmit.';
        await kyc_service_1.kycService.rejectKyc(req.params.userId, reason);
        res.json({ success: true, message: 'KYC rejected' });
    }
    catch (e) {
        next(e);
    }
});
// All transactions
router.get('/transactions', async (req, res, next) => {
    try {
        const { page = 1, limit = 20, type, status } = req.query;
        const where = {};
        if (type)
            where.type = type;
        if (status)
            where.status = status;
        const [txs, total] = await Promise.all([
            database_1.prisma.transaction.findMany({ where, include: { user: { select: { phone: true } } }, orderBy: { createdAt: 'desc' }, skip: (Number(page) - 1) * Number(limit), take: Number(limit) }),
            database_1.prisma.transaction.count({ where }),
        ]);
        res.json({ success: true, data: { transactions: txs, total } });
    }
    catch (e) {
        next(e);
    }
});
// Create signal
router.post('/signals', async (req, res, next) => {
    const { assetType, pair, direction, entryPrice, stopLoss, takeProfit1, takeProfit2, takeProfit3, analysis, targetPlan } = req.body;
    try {
        const signal = await database_1.prisma.signal.create({ data: { assetType, pair, direction, entryPrice, stopLoss, takeProfit1, takeProfit2, takeProfit3, analysis, targetPlan } });
        res.json({ success: true, data: signal });
    }
    catch (e) {
        next(e);
    }
});
// Close signal
router.patch('/signals/:id/close', async (req, res, next) => {
    try {
        const signal = await database_1.prisma.signal.update({
            where: { id: req.params.id },
            data: { status: req.body.status, pnlPercent: req.body.pnlPercent, closedAt: new Date() },
        });
        res.json({ success: true, data: signal });
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
//# sourceMappingURL=admin.routes.js.map