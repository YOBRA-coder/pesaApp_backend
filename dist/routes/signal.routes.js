"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../config/database");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
router.get('/', async (req, res, next) => {
    try {
        const sub = await database_1.prisma.signalSubscription.findFirst({
            where: { userId: req.user.id, isActive: true, expiresAt: { gte: new Date() } },
        });
        const userPlan = sub?.planName || 'FREE';
        const planOrder = ['FREE', 'BASIC', 'PRO', 'VIP'];
        const userTier = planOrder.indexOf(userPlan);
        const signals = await database_1.prisma.signal.findMany({
            where: { status: 'ACTIVE' },
            orderBy: { createdAt: 'desc' },
        });
        // Filter by plan tier
        const filtered = signals.filter((s) => {
            const sigPlan = s.metadata?.targetPlan || 'FREE';
            return planOrder.indexOf(sigPlan) <= userTier;
        });
        res.json({ success: true, data: filtered });
    }
    catch (e) {
        next(e);
    }
});
router.get('/history', async (req, res, next) => {
    try {
        const signals = await database_1.prisma.signal.findMany({ where: { status: { not: 'ACTIVE' } }, orderBy: { closedAt: 'desc' }, take: 50 });
        res.json({ success: true, data: signals });
    }
    catch (e) {
        next(e);
    }
});
router.get('/subscription', async (req, res, next) => {
    try {
        const sub = await database_1.prisma.signalSubscription.findFirst({
            where: { userId: req.user.id, isActive: true, expiresAt: { gte: new Date() } },
        });
        res.json({ success: true, data: sub });
    }
    catch (e) {
        next(e);
    }
});
router.post('/subscribe', async (req, res, next) => {
    try {
        const plans = { BASIC: 500, PRO: 1500, VIP: 3000 };
        const { plan } = req.body;
        const price = plans[plan];
        if (!price)
            return res.status(400).json({ success: false, message: 'Invalid plan. Choose BASIC, PRO, or VIP' });
        const wallet = await database_1.prisma.wallet.findUnique({ where: { userId: req.user.id } });
        if (!wallet || Number(wallet.balance) < price) {
            return res.status(400).json({ success: false, message: 'Insufficient balance' });
        }
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 1);
        await database_1.prisma.$transaction([
            database_1.prisma.wallet.update({ where: { userId: req.user.id }, data: { balance: { decrement: price } } }),
            database_1.prisma.signalSubscription.create({ data: { userId: req.user.id, planName: plan, priceKes: price, expiresAt } }),
            database_1.prisma.transaction.create({
                data: {
                    userId: req.user.id, type: 'SIGNAL_SUBSCRIPTION', status: 'COMPLETED',
                    amount: price, fee: 0,
                    balanceBefore: Number(wallet.balance), balanceAfter: Number(wallet.balance) - price,
                    description: `${plan} signals subscription (30 days)`, provider: 'INTERNAL', completedAt: new Date(),
                },
            }),
        ]);
        res.json({ success: true, message: `Subscribed to ${plan} plan. Valid for 30 days.` });
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
//# sourceMappingURL=signal.routes.js.map