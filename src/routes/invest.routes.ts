// ═══════════════════════════════════════════════════════════
// backend/src/routes/invest.routes.ts  — Copy Trade + Portfolio
// ═══════════════════════════════════════════════════════════
import { Router } from 'express';
import { body } from 'express-validator';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

const router = Router();
router.use(authenticate);

// POST /invest/copy-trade
router.post('/copy-trade',
  body('signalId').isString(),
  body('amount').isFloat({ min: 10 }),
  body('targetTP').isIn(['tp1', 'tp2', 'tp3']),
  validate,
  async (req: any, res, next) => {
    try {
      const { signalId, amount, targetTP } = req.body;

      const signal = await prisma.signal.findUnique({ where: { id: signalId } });
      if (!signal) throw new AppError('Signal not found', 404);
      if (signal.status !== 'ACTIVE') throw new AppError('Signal is no longer active', 400);

      const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
      if (!wallet || Number(wallet.balance) < amount) throw new AppError('Insufficient balance', 400);

      // Deduct and record
      await prisma.$transaction([
        prisma.wallet.update({ where: { userId: req.user.id }, data: { balance: { decrement: amount } } }),
        prisma.copyTrade.create({
          data: {
            userId: req.user.id,
            signalId,
            amount,
            targetTP,
            entryPrice: signal.entryPrice,
            status: 'OPEN',
          },
        }),
        prisma.transaction.create({
          data: {
            userId: req.user.id,
            type: 'GAME_BET', // reuse type for now
            status: 'COMPLETED',
            amount,
            fee: 0,
            balanceBefore: Number(wallet.balance),
            balanceAfter: Number(wallet.balance) - amount,
            description: `Copy trade: ${signal.pair} ${signal.direction}`,
            provider: 'INTERNAL',
            completedAt: new Date(),
            metadata: { signalId, targetTP, pair: signal.pair },
          },
        }),
      ]);

      res.json({ success: true, message: 'Trade copied! We will notify you when it closes.' });
    } catch (e) { next(e); }
  }
);

// GET /invest/portfolio  — user's open/closed copy trades
router.get('/portfolio', async (req: any, res, next) => {
  try {
    const trades = await prisma.copyTrade.findMany({
      where: { userId: req.user.id },
      include: { signal: { select: { pair: true, direction: true, assetType: true, status: true, pnlPercent: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ success: true, data: trades });
  } catch (e) { next(e); }
});

// GET /invest/signals  — plan-gated signals
router.get('/signals', async (req: any, res, next) => {
  try {
    const PLAN_ORDER = ['FREE', 'BASIC', 'PRO', 'VIP'];

    // Get user's active subscription
    const sub = await prisma.signalSubscription.findFirst({
      where: { userId: req.user.id, isActive: true, expiresAt: { gte: new Date() } },
    });
    const userPlan = sub?.planName || 'FREE';
    const userTier = PLAN_ORDER.indexOf(userPlan);

    const signals = await prisma.signal.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Filter by plan tier
    const filtered = signals.filter(s => {
      const sigPlan = s.targetPlan || 'FREE';
      const sigTier = PLAN_ORDER.indexOf(sigPlan);
      return sigTier <= userTier;
    });

    // For FREE users: hide analysis on non-FREE signals
    const safe = filtered.map(s => ({
      ...s,
      analysis: userTier > 0 ? s.analysis : null, // hide analysis for free plan
    }));

    res.json({ success: true, data: safe, userPlan });
  } catch (e) { next(e); }
});

export default router;
