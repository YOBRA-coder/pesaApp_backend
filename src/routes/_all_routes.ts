// ============================================================
// kyc.routes.ts
// ============================================================
import { Router as KycRouter } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware';
import { kycService } from '../services/kyc.service';

const kycRouter = KycRouter();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

kycRouter.use(authenticate);

kycRouter.get('/status', async (req: any, res, next) => {
  try {
    const { prisma } = await import('../config/database');
    const record = await prisma.kycRecord.findUnique({ where: { userId: req.user.id } });
    res.json({ success: true, data: record });
  } catch (e) { next(e); }
});

kycRouter.post('/submit',
  upload.fields([
    { name: 'idFront', maxCount: 1 },
    { name: 'idBack', maxCount: 1 },
    { name: 'selfie', maxCount: 1 },
  ]),
  async (req: any, res, next) => {
    try {
      const files = req.files as any;
      if (!files?.idFront?.[0] || !files?.selfie?.[0]) {
        return res.status(400).json({ success: false, message: 'ID front and selfie required' });
      }
      const result = await kycService.submitKyc(req.user.id, {
        docType: req.body.docType,
        docNumber: req.body.docNumber,
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        dateOfBirth: req.body.dateOfBirth,
        idFrontBuffer: files.idFront[0].buffer,
        idBackBuffer: files.idBack?.[0]?.buffer,
        selfieBuffer: files.selfie[0].buffer,
      });
      res.json({ success: true, message: 'KYC submitted for review', data: result });
    } catch (e) { next(e); }
  }
);

// Smile Identity callback (no auth — called by Smile)
kycRouter.post('/callback', async (req, res) => {
  await kycService.handleSmileCallback(req.body);
  res.sendStatus(200);
});

export { kycRouter };


// ============================================================
// game.routes.ts
// ============================================================
import { Router as GameRouter } from 'express';
import { gameService } from '../services/game.service';

const gameRouter = GameRouter();
gameRouter.use(authenticate);

gameRouter.get('/crash/round', async (req, res, next) => {
  try {
    const round = await gameService.getActiveCrashRound();
    res.json({ success: true, data: { roundNumber: round.roundNumber, serverSeedHash: round.serverSeedHash } });
  } catch (e) { next(e); }
});

gameRouter.post('/bet', async (req: any, res, next) => {
  try {
    const { gameType, betAmount, clientSeed } = req.body;
    const session = await gameService.placeBet(req.user.id, gameType, betAmount, clientSeed);
    res.json({ success: true, data: session });
  } catch (e) { next(e); }
});

gameRouter.post('/cashout', async (req: any, res, next) => {
  try {
    const { sessionId, multiplier } = req.body;
    const result = await gameService.cashOut(req.user.id, sessionId, multiplier);
    res.json({ success: true, data: result });
  } catch (e) { next(e); }
});

gameRouter.get('/history', async (req: any, res, next) => {
  try {
    const { page, limit } = req.query;
    const data = await gameService.getHistory(req.user.id, Number(page), Number(limit));
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

export { gameRouter };


// ============================================================
// signal.routes.ts
// ============================================================
import { Router as SignalRouter } from 'express';

const signalRouter = SignalRouter();
signalRouter.use(authenticate);

signalRouter.get('/', async (req: any, res, next) => {
  try {
    const { prisma } = await import('../config/database');
    const signals = await prisma.signal.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json({ success: true, data: signals });
  } catch (e) { next(e); }
});

signalRouter.get('/subscription', async (req: any, res, next) => {
  try {
    const { prisma } = await import('../config/database');
    const sub = await prisma.signalSubscription.findFirst({
      where: { userId: req.user.id, isActive: true, expiresAt: { gte: new Date() } },
    });
    res.json({ success: true, data: sub });
  } catch (e) { next(e); }
});

signalRouter.post('/subscribe', async (req: any, res, next) => {
  try {
    const { prisma } = await import('../config/database');
    const plans: Record<string, number> = { BASIC: 500, PRO: 1500, VIP: 3000 };
    const { plan } = req.body;
    const price = plans[plan];
    if (!price) return res.status(400).json({ success: false, message: 'Invalid plan' });

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
          amount: price, fee: 0, balanceBefore: Number(wallet.balance),
          balanceAfter: Number(wallet.balance) - price, description: `${plan} signals subscription`,
          provider: 'INTERNAL', completedAt: new Date(),
        },
      }),
    ]);
    res.json({ success: true, message: `Subscribed to ${plan} plan for 30 days` });
  } catch (e) { next(e); }
});

export { signalRouter };


// ============================================================
// bill.routes.ts
// ============================================================
import { Router as BillRouter } from 'express';
import { billService } from '../services/bill.service';

const billRouter = BillRouter();
billRouter.use(authenticate);

billRouter.post('/pay', async (req: any, res, next) => {
  try {
    const { billType, accountNumber, amount } = req.body;
    const result = await billService.payBill(req.user.id, billType, accountNumber, amount);
    res.json({ success: true, data: result });
  } catch (e) { next(e); }
});

billRouter.post('/airtime', async (req: any, res, next) => {
  try {
    const { phone, amount, network } = req.body;
    const result = await billService.buyAirtime(req.user.id, phone, amount, network);
    res.json({ success: true, data: result });
  } catch (e) { next(e); }
});

export { billRouter };


// ============================================================
// referral.routes.ts
// ============================================================
import { Router as ReferralRouter } from 'express';

const referralRouter = ReferralRouter();
referralRouter.use(authenticate);

referralRouter.get('/stats', async (req: any, res, next) => {
  try {
    const { prisma } = await import('../config/database');
    const [referrals, earnings] = await Promise.all([
      prisma.user.findMany({ where: { referredBy: req.user.id }, select: { id: true, phone: true, createdAt: true, kycStatus: true } }),
      prisma.referralEarning.aggregate({ where: { userId: req.user.id }, _sum: { amount: true }, _count: true }),
    ]);
    res.json({ success: true, data: { referrals, totalEarned: earnings._sum.amount || 0, totalReferrals: referrals.length } });
  } catch (e) { next(e); }
});

export { referralRouter };


// ============================================================
// user.routes.ts
// ============================================================
import { Router as UserRouter } from 'express';
import multer as multerUser from 'multer';
import { uploadToCloudinary } from '../services/cloudinary.service';

const userRouter = UserRouter();
const uploadUser = multerUser({ storage: multerUser.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
userRouter.use(authenticate);

userRouter.get('/me', async (req: any, res, next) => {
  try {
    const { prisma } = await import('../config/database');
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { wallet: true, kycRecord: { select: { status: true, rejectionReason: true } } },
    });
    res.json({ success: true, data: user });
  } catch (e) { next(e); }
});

userRouter.patch('/me', async (req: any, res, next) => {
  try {
    const { prisma } = await import('../config/database');
    const { firstName, lastName, username, email } = req.body;
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { firstName, lastName, username, email },
    });
    res.json({ success: true, data: user });
  } catch (e) { next(e); }
});

userRouter.post('/avatar', uploadUser.single('avatar'), async (req: any, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const url = await uploadToCloudinary(req.file.buffer, `avatars/${req.user.id}`);
    const { prisma } = await import('../config/database');
    await prisma.user.update({ where: { id: req.user.id }, data: { avatarUrl: url } });
    res.json({ success: true, data: { avatarUrl: url } });
  } catch (e) { next(e); }
});

export { userRouter };


// ============================================================
// notification.routes.ts
// ============================================================
import { Router as NotifRouter } from 'express';

const notifRouter = NotifRouter();
notifRouter.use(authenticate);

notifRouter.get('/', async (req: any, res, next) => {
  try {
    const { prisma } = await import('../config/database');
    const notifs = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    res.json({ success: true, data: notifs });
  } catch (e) { next(e); }
});

notifRouter.patch('/read-all', async (req: any, res, next) => {
  try {
    const { prisma } = await import('../config/database');
    await prisma.notification.updateMany({ where: { userId: req.user.id }, data: { read: true } });
    res.json({ success: true });
  } catch (e) { next(e); }
});

export { notifRouter };


// ============================================================
// admin.routes.ts
// ============================================================
import { Router as AdminRouter } from 'express';
import { requireAdmin } from '../middleware/auth.middleware';

const adminRouter = AdminRouter();
adminRouter.use(authenticate, requireAdmin);

adminRouter.get('/stats', async (req, res, next) => {
  try {
    const { prisma } = await import('../config/database');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [totalUsers, activeUsers, todayTx, pendingKyc, totalDeposited] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: 'ACTIVE' } }),
      prisma.transaction.count({ where: { createdAt: { gte: today } } }),
      prisma.kycRecord.count({ where: { status: 'PENDING' } }),
      prisma.transaction.aggregate({ where: { type: 'DEPOSIT', status: 'COMPLETED' }, _sum: { amount: true } }),
    ]);
    res.json({ success: true, data: { totalUsers, activeUsers, todayTx, pendingKyc, totalDeposited: totalDeposited._sum.amount } });
  } catch (e) { next(e); }
});

adminRouter.get('/users', async (req, res, next) => {
  try {
    const { prisma } = await import('../config/database');
    const { page = 1, limit = 20, search } = req.query;
    const where: any = {};
    if (search) where.OR = [{ phone: { contains: String(search) } }, { username: { contains: String(search) } }];
    const [users, total] = await Promise.all([
      prisma.user.findMany({ where, include: { wallet: true }, orderBy: { createdAt: 'desc' }, skip: (Number(page) - 1) * Number(limit), take: Number(limit) }),
      prisma.user.count({ where }),
    ]);
    res.json({ success: true, data: { users, total } });
  } catch (e) { next(e); }
});

adminRouter.get('/kyc/pending', async (req, res, next) => {
  try {
    const { prisma } = await import('../config/database');
    const records = await prisma.kycRecord.findMany({
      where: { status: 'PENDING' },
      include: { user: { select: { phone: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ success: true, data: records });
  } catch (e) { next(e); }
});

adminRouter.post('/kyc/:userId/approve', async (req, res, next) => {
  try {
    await kycService.approveKyc(req.params.userId);
    res.json({ success: true, message: 'KYC approved' });
  } catch (e) { next(e); }
});

adminRouter.post('/kyc/:userId/reject', async (req, res, next) => {
  try {
    await kycService.rejectKyc(req.params.userId, req.body.reason || 'Documents unclear');
    res.json({ success: true, message: 'KYC rejected' });
  } catch (e) { next(e); }
});

adminRouter.patch('/users/:id/suspend', async (req, res, next) => {
  try {
    const { prisma } = await import('../config/database');
    await prisma.user.update({ where: { id: req.params.id }, data: { status: 'SUSPENDED' } });
    res.json({ success: true });
  } catch (e) { next(e); }
});

export { adminRouter };
