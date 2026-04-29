"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../config/database");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
router.get('/stats', async (req, res, next) => {
    try {
        const [user, referrals, earnings] = await Promise.all([
            database_1.prisma.user.findUnique({ where: { id: req.user.id }, select: { referralCode: true } }),
            database_1.prisma.user.findMany({ where: { referredBy: req.user.id }, select: { id: true, phone: true, createdAt: true, kycStatus: true, status: true } }),
            database_1.prisma.referralEarning.aggregate({ where: { userId: req.user.id }, _sum: { amount: true }, _count: true }),
        ]);
        res.json({
            success: true,
            data: {
                referralCode: user?.referralCode,
                referralLink: `${process.env.FRONTEND_URL}/auth/login?ref=${user?.referralCode}`,
                totalReferrals: referrals.length,
                activeReferrals: referrals.filter(r => r.status === 'ACTIVE').length,
                totalEarned: earnings._sum.amount || 0,
                referrals,
            },
        });
    }
    catch (e) {
        next(e);
    }
});
router.get('/leaderboard', async (req, res, next) => {
    try {
        const results = await database_1.prisma.referralEarning.groupBy({
            by: ['userId'],
            _sum: { amount: true },
            _count: true,
            orderBy: { _sum: { amount: 'desc' } },
            take: 20,
        });
        const withUsers = await Promise.all(results.map(async (r) => {
            const user = await database_1.prisma.user.findUnique({ where: { id: r.userId }, select: { username: true, phone: true } });
            return { ...r, user };
        }));
        res.json({ success: true, data: withUsers });
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
//# sourceMappingURL=referral.routes.js.map