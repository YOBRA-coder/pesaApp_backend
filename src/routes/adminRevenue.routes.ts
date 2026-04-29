import { Router } from 'express';
import { prisma } from '../config/database';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import { mpesa } from '../services/mpesa.service';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

const router = Router();
router.use(authenticate, requireAdmin);

// ── House wallet - special user for house funds ───────────────
const HOUSE_USER_ID = process.env.HOUSE_USER_ID || 'house';

// GET /admin/house/balance
router.get('/house/balance', async (req, res, next) => {
  try {
    // House "wallet" is tracked in SystemConfig
    const [totalBetsAgg, totalPayoutAgg] = await Promise.all([
      prisma.gameRevenue.aggregate({ _sum: { totalBets: true } }),
      prisma.gameRevenue.aggregate({ _sum: { totalPayout: true, houseProfit: true } }),
    ]);

    const houseDeposits = await prisma.transaction.aggregate({
      where: { type: 'HOUSE_DEPOSIT' },
      _sum: { amount: true },
    });
    const houseWithdrawals = await prisma.transaction.aggregate({
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
  } catch (e) { next(e); }
});

// POST /admin/house/deposit — admin deposits to house fund
router.post('/house/deposit',
  body('amount').isFloat({ min: 100 }),
  body('description').optional().isString(),
  validate,
  async (req: any, res, next) => {
    try {
      const { amount, description } = req.body;

      await prisma.transaction.create({
        data: {
          userId: req.user.id,
          type: 'HOUSE_DEPOSIT' as any,
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
      await prisma.adminAuditLog.create({
        data: { userId: req.user.id, action: 'HOUSE_DEPOSIT', details: { amount }, ip: req.ip || '', userAgent: req.headers['user-agent'] || '' },
      });

      logger.info(`Admin ${req.user.id} deposited ${amount} to house fund`);
      res.json({ success: true, message: `KES ${amount.toLocaleString()} deposited to house fund` });
    } catch (e) { next(e); }
  }
);

// POST /admin/house/withdraw — admin withdraws profit via M-Pesa
router.post('/house/withdraw',
  body('amount').isFloat({ min: 100 }),
  body('phone').optional().isMobilePhone('any'),
  body('description').optional().isString(),
  validate,
  async (req: any, res, next) => {
    try {
      const { amount, phone, description } = req.body;

      // Check balance
      const houseData = await getHouseBalance();
      if (houseData.balance < amount) {
        throw new AppError(`Insufficient house balance. Available: ${formatAmount(houseData.balance)}`, 400);
      }

      // Get admin's phone if not provided
      const adminUser = await prisma.user.findUnique({ where: { id: req.user.id }, select: { phone: true } });
      const targetPhone = phone || adminUser?.phone;

      if (!targetPhone) throw new AppError('Phone number required', 400);

      // Initiate B2C withdrawal
      let externalRef: string | undefined;
      try {
        const b2c = await mpesa.b2cPayment({
          phone: targetPhone,
          amount,
          occasion: `House profit withdrawal`,
        });
        externalRef = b2c.ConversationID;
      } catch (mpesaErr) {
        logger.warn('B2C failed for house withdrawal, recording manually:', mpesaErr);
      }

      await prisma.transaction.create({
        data: {
          userId: req.user.id,
          type: 'HOUSE_WITHDRAWAL' as any,
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

      await prisma.adminAuditLog.create({
        data: { userId: req.user.id, action: 'HOUSE_WITHDRAWAL', details: { amount, phone: targetPhone }, ip: req.ip || '', userAgent: req.headers['user-agent'] || '' },
      });

      logger.info(`Admin ${req.user.id} withdrew ${amount} from house to ${targetPhone}`);
      res.json({ success: true, message: `KES ${amount.toLocaleString()} withdrawal initiated to ${targetPhone}` });
    } catch (e) { next(e); }
  }
);

// GET /admin/revenue/games — game revenue breakdown
router.get('/revenue/games', async (req, res, next) => {
  try {
    const { period = 'today' } = req.query;
    const now = new Date();
    let startDate: Date;

    if (period === 'today') { startDate = new Date(now); startDate.setHours(0, 0, 0, 0); }
    else if (period === 'week') { startDate = new Date(now); startDate.setDate(now.getDate() - 7); }
    else { startDate = new Date(now); startDate.setMonth(now.getMonth() - 1); }

    const revenue = await prisma.gameRevenue.groupBy({
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
  } catch (e) { next(e); }
});

// GET /admin/revenue/daily — daily revenue chart data
router.get('/revenue/daily', async (req, res, next) => {
  try {
    const days = parseInt(req.query.days as string || '30');
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const daily = await prisma.dailyRevenue.findMany({
      where: { date: { gte: startDate } },
      orderBy: { date: 'asc' },
    });

    res.json({ success: true, data: daily });
  } catch (e) { next(e); }
});

// GET /admin/revenue/summary — total all-time summary
router.get('/revenue/summary', async (req, res, next) => {
  try {
    const [gameRev, txFees, signalRev, houseDeposits, houseWithdrawals] = await Promise.all([
      prisma.gameRevenue.aggregate({ _sum: { houseProfit: true, totalBets: true } }),
      prisma.transaction.aggregate({ where: { fee: { gt: 0 }, status: 'COMPLETED' }, _sum: { fee: true } }),
      prisma.transaction.aggregate({ where: { type: 'SIGNAL_SUBSCRIPTION', status: 'COMPLETED' }, _sum: { amount: true } }),
      prisma.transaction.aggregate({ where: { type: 'HOUSE_DEPOSIT' as any }, _sum: { amount: true } }),
      prisma.transaction.aggregate({ where: { type: 'HOUSE_WITHDRAWAL' as any }, _sum: { amount: true } }),
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
  } catch (e) { next(e); }
});

// Helpers
async function getHouseBalance() {
  const [bets, payouts, deposits, withdrawals] = await Promise.all([
    prisma.gameRevenue.aggregate({ _sum: { totalBets: true } }),
    prisma.gameRevenue.aggregate({ _sum: { totalPayout: true } }),
    prisma.transaction.aggregate({ where: { type: 'HOUSE_DEPOSIT' as any }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { type: 'HOUSE_WITHDRAWAL' as any }, _sum: { amount: true } }),
  ]);
  const profit = Number(bets._sum.totalBets || 0) - Number(payouts._sum.totalPayout || 0);
  const balance = profit + Number(deposits._sum.amount || 0) - Number(withdrawals._sum.amount || 0);
  return { balance, houseProfit: profit };
}

function formatAmount(n: number) {
  return `KES ${n.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
}

export default router;
