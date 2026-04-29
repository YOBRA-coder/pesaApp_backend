"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminRouter = exports.notifRouter = exports.userRouter = exports.referralRouter = exports.billRouter = exports.signalRouter = exports.gameRouter = exports.kycRouter = void 0;
// ============================================================
// kyc.routes.ts
// ============================================================
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const kyc_service_1 = require("../services/kyc.service");
const kycRouter = (0, express_1.Router)();
exports.kycRouter = kycRouter;
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
kycRouter.use(auth_middleware_1.authenticate);
kycRouter.get('/status', async (req, res, next) => {
    try {
        const { prisma } = await Promise.resolve().then(() => __importStar(require('../config/database')));
        const record = await prisma.kycRecord.findUnique({ where: { userId: req.user.id } });
        res.json({ success: true, data: record });
    }
    catch (e) {
        next(e);
    }
});
kycRouter.post('/submit', upload.fields([
    { name: 'idFront', maxCount: 1 },
    { name: 'idBack', maxCount: 1 },
    { name: 'selfie', maxCount: 1 },
]), async (req, res, next) => {
    try {
        const files = req.files;
        if (!files?.idFront?.[0] || !files?.selfie?.[0]) {
            return res.status(400).json({ success: false, message: 'ID front and selfie required' });
        }
        const result = await kyc_service_1.kycService.submitKyc(req.user.id, {
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
    }
    catch (e) {
        next(e);
    }
});
// Smile Identity callback (no auth — called by Smile)
kycRouter.post('/callback', async (req, res) => {
    await kyc_service_1.kycService.handleSmileCallback(req.body);
    res.sendStatus(200);
});
// ============================================================
// game.routes.ts
// ============================================================
const express_2 = require("express");
const game_service_1 = require("../services/game.service");
const gameRouter = (0, express_2.Router)();
exports.gameRouter = gameRouter;
gameRouter.use(auth_middleware_1.authenticate);
gameRouter.get('/crash/round', async (req, res, next) => {
    try {
        const round = await game_service_1.gameService.getActiveCrashRound();
        res.json({ success: true, data: { roundNumber: round.roundNumber, serverSeedHash: round.serverSeedHash } });
    }
    catch (e) {
        next(e);
    }
});
gameRouter.post('/bet', async (req, res, next) => {
    try {
        const { gameType, betAmount, clientSeed } = req.body;
        const session = await game_service_1.gameService.placeBet(req.user.id, gameType, betAmount, clientSeed);
        res.json({ success: true, data: session });
    }
    catch (e) {
        next(e);
    }
});
gameRouter.post('/cashout', async (req, res, next) => {
    try {
        const { sessionId, multiplier } = req.body;
        const result = await game_service_1.gameService.cashOut(req.user.id, sessionId, multiplier);
        res.json({ success: true, data: result });
    }
    catch (e) {
        next(e);
    }
});
gameRouter.get('/history', async (req, res, next) => {
    try {
        const { page, limit } = req.query;
        const data = await game_service_1.gameService.getHistory(req.user.id, Number(page), Number(limit));
        res.json({ success: true, data });
    }
    catch (e) {
        next(e);
    }
});
// ============================================================
// signal.routes.ts
// ============================================================
const express_3 = require("express");
const signalRouter = (0, express_3.Router)();
exports.signalRouter = signalRouter;
signalRouter.use(auth_middleware_1.authenticate);
signalRouter.get('/', async (req, res, next) => {
    try {
        const { prisma } = await Promise.resolve().then(() => __importStar(require('../config/database')));
        const signals = await prisma.signal.findMany({
            where: { status: 'ACTIVE' },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });
        res.json({ success: true, data: signals });
    }
    catch (e) {
        next(e);
    }
});
signalRouter.get('/subscription', async (req, res, next) => {
    try {
        const { prisma } = await Promise.resolve().then(() => __importStar(require('../config/database')));
        const sub = await prisma.signalSubscription.findFirst({
            where: { userId: req.user.id, isActive: true, expiresAt: { gte: new Date() } },
        });
        res.json({ success: true, data: sub });
    }
    catch (e) {
        next(e);
    }
});
signalRouter.post('/subscribe', async (req, res, next) => {
    try {
        const { prisma } = await Promise.resolve().then(() => __importStar(require('../config/database')));
        const plans = { BASIC: 500, PRO: 1500, VIP: 3000 };
        const { plan } = req.body;
        const price = plans[plan];
        if (!price)
            return res.status(400).json({ success: false, message: 'Invalid plan' });
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
    }
    catch (e) {
        next(e);
    }
});
// ============================================================
// bill.routes.ts
// ============================================================
const express_4 = require("express");
const bill_service_1 = require("../services/bill.service");
const billRouter = (0, express_4.Router)();
exports.billRouter = billRouter;
billRouter.use(auth_middleware_1.authenticate);
billRouter.post('/pay', async (req, res, next) => {
    try {
        const { billType, accountNumber, amount } = req.body;
        const result = await bill_service_1.billService.payBill(req.user.id, billType, accountNumber, amount);
        res.json({ success: true, data: result });
    }
    catch (e) {
        next(e);
    }
});
billRouter.post('/airtime', async (req, res, next) => {
    try {
        const { phone, amount, network } = req.body;
        const result = await bill_service_1.billService.buyAirtime(req.user.id, phone, amount, network);
        res.json({ success: true, data: result });
    }
    catch (e) {
        next(e);
    }
});
// ============================================================
// referral.routes.ts
// ============================================================
const express_5 = require("express");
const referralRouter = (0, express_5.Router)();
exports.referralRouter = referralRouter;
referralRouter.use(auth_middleware_1.authenticate);
referralRouter.get('/stats', async (req, res, next) => {
    try {
        const { prisma } = await Promise.resolve().then(() => __importStar(require('../config/database')));
        const [referrals, earnings] = await Promise.all([
            prisma.user.findMany({ where: { referredBy: req.user.id }, select: { id: true, phone: true, createdAt: true, kycStatus: true } }),
            prisma.referralEarning.aggregate({ where: { userId: req.user.id }, _sum: { amount: true }, _count: true }),
        ]);
        res.json({ success: true, data: { referrals, totalEarned: earnings._sum.amount || 0, totalReferrals: referrals.length } });
    }
    catch (e) {
        next(e);
    }
});
// ============================================================
// user.routes.ts
// ============================================================
const express_6 = require("express");
multerUser;
from;
'multer';
const cloudinary_service_1 = require("../services/cloudinary.service");
const userRouter = (0, express_6.Router)();
exports.userRouter = userRouter;
const uploadUser = multerUser({ storage: multerUser.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
userRouter.use(auth_middleware_1.authenticate);
userRouter.get('/me', async (req, res, next) => {
    try {
        const { prisma } = await Promise.resolve().then(() => __importStar(require('../config/database')));
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            include: { wallet: true, kycRecord: { select: { status: true, rejectionReason: true } } },
        });
        res.json({ success: true, data: user });
    }
    catch (e) {
        next(e);
    }
});
userRouter.patch('/me', async (req, res, next) => {
    try {
        const { prisma } = await Promise.resolve().then(() => __importStar(require('../config/database')));
        const { firstName, lastName, username, email } = req.body;
        const user = await prisma.user.update({
            where: { id: req.user.id },
            data: { firstName, lastName, username, email },
        });
        res.json({ success: true, data: user });
    }
    catch (e) {
        next(e);
    }
});
userRouter.post('/avatar', uploadUser.single('avatar'), async (req, res, next) => {
    try {
        if (!req.file)
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        const url = await (0, cloudinary_service_1.uploadToCloudinary)(req.file.buffer, `avatars/${req.user.id}`);
        const { prisma } = await Promise.resolve().then(() => __importStar(require('../config/database')));
        await prisma.user.update({ where: { id: req.user.id }, data: { avatarUrl: url } });
        res.json({ success: true, data: { avatarUrl: url } });
    }
    catch (e) {
        next(e);
    }
});
// ============================================================
// notification.routes.ts
// ============================================================
const express_7 = require("express");
const notifRouter = (0, express_7.Router)();
exports.notifRouter = notifRouter;
notifRouter.use(auth_middleware_1.authenticate);
notifRouter.get('/', async (req, res, next) => {
    try {
        const { prisma } = await Promise.resolve().then(() => __importStar(require('../config/database')));
        const notifs = await prisma.notification.findMany({
            where: { userId: req.user.id },
            orderBy: { createdAt: 'desc' },
            take: 30,
        });
        res.json({ success: true, data: notifs });
    }
    catch (e) {
        next(e);
    }
});
notifRouter.patch('/read-all', async (req, res, next) => {
    try {
        const { prisma } = await Promise.resolve().then(() => __importStar(require('../config/database')));
        await prisma.notification.updateMany({ where: { userId: req.user.id }, data: { read: true } });
        res.json({ success: true });
    }
    catch (e) {
        next(e);
    }
});
// ============================================================
// admin.routes.ts
// ============================================================
const express_8 = require("express");
const auth_middleware_2 = require("../middleware/auth.middleware");
const adminRouter = (0, express_8.Router)();
exports.adminRouter = adminRouter;
adminRouter.use(auth_middleware_1.authenticate, auth_middleware_2.requireAdmin);
adminRouter.get('/stats', async (req, res, next) => {
    try {
        const { prisma } = await Promise.resolve().then(() => __importStar(require('../config/database')));
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const [totalUsers, activeUsers, todayTx, pendingKyc, totalDeposited] = await Promise.all([
            prisma.user.count(),
            prisma.user.count({ where: { status: 'ACTIVE' } }),
            prisma.transaction.count({ where: { createdAt: { gte: today } } }),
            prisma.kycRecord.count({ where: { status: 'PENDING' } }),
            prisma.transaction.aggregate({ where: { type: 'DEPOSIT', status: 'COMPLETED' }, _sum: { amount: true } }),
        ]);
        res.json({ success: true, data: { totalUsers, activeUsers, todayTx, pendingKyc, totalDeposited: totalDeposited._sum.amount } });
    }
    catch (e) {
        next(e);
    }
});
adminRouter.get('/users', async (req, res, next) => {
    try {
        const { prisma } = await Promise.resolve().then(() => __importStar(require('../config/database')));
        const { page = 1, limit = 20, search } = req.query;
        const where = {};
        if (search)
            where.OR = [{ phone: { contains: String(search) } }, { username: { contains: String(search) } }];
        const [users, total] = await Promise.all([
            prisma.user.findMany({ where, include: { wallet: true }, orderBy: { createdAt: 'desc' }, skip: (Number(page) - 1) * Number(limit), take: Number(limit) }),
            prisma.user.count({ where }),
        ]);
        res.json({ success: true, data: { users, total } });
    }
    catch (e) {
        next(e);
    }
});
adminRouter.get('/kyc/pending', async (req, res, next) => {
    try {
        const { prisma } = await Promise.resolve().then(() => __importStar(require('../config/database')));
        const records = await prisma.kycRecord.findMany({
            where: { status: 'PENDING' },
            include: { user: { select: { phone: true } } },
            orderBy: { createdAt: 'asc' },
        });
        res.json({ success: true, data: records });
    }
    catch (e) {
        next(e);
    }
});
adminRouter.post('/kyc/:userId/approve', async (req, res, next) => {
    try {
        await kyc_service_1.kycService.approveKyc(req.params.userId);
        res.json({ success: true, message: 'KYC approved' });
    }
    catch (e) {
        next(e);
    }
});
adminRouter.post('/kyc/:userId/reject', async (req, res, next) => {
    try {
        await kyc_service_1.kycService.rejectKyc(req.params.userId, req.body.reason || 'Documents unclear');
        res.json({ success: true, message: 'KYC rejected' });
    }
    catch (e) {
        next(e);
    }
});
adminRouter.patch('/users/:id/suspend', async (req, res, next) => {
    try {
        const { prisma } = await Promise.resolve().then(() => __importStar(require('../config/database')));
        await prisma.user.update({ where: { id: req.params.id }, data: { status: 'SUSPENDED' } });
        res.json({ success: true });
    }
    catch (e) {
        next(e);
    }
});
//# sourceMappingURL=_all_routes.js.map