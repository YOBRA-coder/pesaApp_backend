import { Router } from 'express';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
router.use(authenticate);

router.get('/stats', async (req: any, res, next) => {
  try {
    const [user, referrals, earnings] = await Promise.all([
      prisma.user.findUnique({ where: { id: req.user.id }, select: { referralCode: true } }),
      prisma.user.findMany({ where: { referredBy: req.user.id }, select: { id: true, phone: true, createdAt: true, kycStatus: true, status: true } }),
      prisma.referralEarning.aggregate({ where: { userId: req.user.id }, _sum: { amount: true }, _count: true }),
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
  } catch (e) { next(e); }
});

router.get('/leaderboard', async (req, res, next) => {
  try {
    const results = await prisma.referralEarning.groupBy({
      by: ['userId'],
      _sum: { amount: true },
      _count: true,
      orderBy: { _sum: { amount: 'desc' } },
      take: 20,
    });
    const withUsers = await Promise.all(results.map(async (r) => {
      const user = await prisma.user.findUnique({ where: { id: r.userId }, select: { username: true, phone: true } });
      return { ...r, user };
    }));
    res.json({ success: true, data: withUsers });
  } catch (e) { next(e); }
});

export default router;
