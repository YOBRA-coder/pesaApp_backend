import { Router } from 'express';
import { body, param } from 'express-validator';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate';
import { walletService } from '../services/wallet.service';

const router = Router();
router.use(authenticate);

// GET /api/v1/wallet/balance
router.get('/balance', async (req: any, res, next) => {
  try {
    const wallet = await walletService.getBalance(req.user.id);
    res.json({ success: true, data: wallet });
  } catch (e) { next(e); }
});

// GET /api/v1/wallet/transactions
router.get('/transactions', async (req: any, res, next) => {
  try {
    const { page = 1, limit = 20, type } = req.query;
    const { prisma } = await import('../config/database');
    const where: any = { userId: req.user.id };
    if (type) where.type = type;
    const [txs, total] = await Promise.all([
      prisma.transaction.findMany({
        where, orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.transaction.count({ where }),
    ]);
    res.json({ success: true, data: { transactions: txs, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) } });
  } catch (e) { next(e); }
});

// POST /api/v1/wallet/deposit
router.post('/deposit',
  body('phone').isMobilePhone('any'),
  body('amount').isFloat({ min: 100 }),
  validate,
  async (req: any, res, next) => {
    try {
      const result = await walletService.initiateDeposit(req.user.id, req.body.phone, req.body.amount);
      res.json({ success: true, data: result });
    } catch (e) { next(e); }
  }
);

// POST /api/v1/wallet/withdraw
router.post('/withdraw',
  body('phone').isMobilePhone('any'),
  body('amount').isFloat({ min: 100 }),
  validate,
  async (req: any, res, next) => {
    try {
      const result = await walletService.initiateWithdrawal(req.user.id, req.body.phone, req.body.amount);
      res.json({ success: true, data: result });
    } catch (e) { next(e); }
  }
);

// POST /api/v1/wallet/send
router.post('/send',
  body('recipientPhone').isMobilePhone('any'),
  body('amount').isFloat({ min: 10 }),
  validate,
  async (req: any, res, next) => {
    try {
      const result = await walletService.sendMoney(req.user.id, req.body.recipientPhone, req.body.amount, req.body.note);
      res.json({ success: true, data: result });
    } catch (e) { next(e); }
  }
);

export default router;
