import { Router } from 'express';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
router.use(authenticate);

router.get('/', async (req : any, res, next) => {
  try {
    const sub = await prisma.signalSubscription.findFirst({
      where: { userId: req.user.id, isActive: true, expiresAt: { gte: new Date() } },
    });
    const userPlan = sub?.planName || 'FREE';
    const planOrder = ['FREE', 'BASIC', 'PRO', 'VIP'];
    const userTier = planOrder.indexOf(userPlan);

    const signals = await prisma.signal.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });

    // Filter by plan tier
    const filtered = signals.filter((s: any) => {
      const sigPlan = s.metadata?.targetPlan || 'FREE';
      return planOrder.indexOf(sigPlan) <= userTier;
    });

    res.json({ success: true, data: filtered });
  } catch (e) { next(e); }
});

router.get('/history', async (req, res, next) => {
  try {
    const signals = await prisma.signal.findMany({ where: { status: { not: 'ACTIVE' } }, orderBy: { closedAt: 'desc' }, take: 50 });
    res.json({ success: true, data: signals });
  } catch (e) { next(e); }
});

router.get('/subscription', async (req: any, res, next) => {
  try {
    const sub = await prisma.signalSubscription.findFirst({
      where: { userId: req.user.id, isActive: true, expiresAt: { gte: new Date() } },
    });
    res.json({ success: true, data: sub });
  } catch (e) { next(e); }
});

router.post('/subscribe', async (req: any, res, next) => {
  try {
    const plans: Record<string, number> = { BASIC: 500, PRO: 1500, VIP: 3000 };
    const { plan } = req.body;
    const price = plans[plan];
    if (!price) return res.status(400).json({ success: false, message: 'Invalid plan. Choose BASIC, PRO, or VIP' });

    const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
    if (!wallet || Number(wallet.balance) < price) {
      return res.status(400).json({ success: false, message: 'Insufficient balance' });
    }

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    await prisma.$transaction([
      prisma.wallet.update({ where: { userId: req.user.id }, data: { balance: { decrement: price } } }),
      prisma.signalSubscription.create({ data: { userId: req.user.id, planName: plan, priceKes: price, expiresAt } }),
      prisma.transaction.create({
        data: {
          userId: req.user.id, type: 'SIGNAL_SUBSCRIPTION', status: 'COMPLETED',
          amount: price, fee: 0,
          balanceBefore: Number(wallet.balance), balanceAfter: Number(wallet.balance) - price,
          description: `${plan} signals subscription (30 days)`, provider: 'INTERNAL', completedAt: new Date(),
        },
      }),
    ]);
    res.json({ success: true, message: `Subscribed to ${plan} plan. Valid for 30 days.` });
  } catch (e) { next(e); }
});

export default router;
