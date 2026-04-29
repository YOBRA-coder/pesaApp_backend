"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const database_1 = require("../config/database");
const auth_middleware_1 = require("../middleware/auth.middleware");
const cloudinary_service_1 = require("../services/cloudinary.service");
const redis_1 = require("@/config/redis");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
router.use(auth_middleware_1.authenticate);
router.get('/me', async (req, res, next) => {
    try {
        const user = await database_1.prisma.user.findUnique({
            where: { id: req.user.id },
            include: { wallet: true, kycRecord: { select: { status: true, rejectionReason: true, verifiedAt: true } } },
        });
        res.json({ success: true, data: user });
    }
    catch (e) {
        next(e);
    }
});
router.patch('/me', async (req, res, next) => {
    try {
        const { firstName, lastName, username, email } = req.body;
        const user = await database_1.prisma.user.update({
            where: { id: req.user.id },
            data: { firstName, lastName, username, email },
        });
        res.json({ success: true, data: user });
    }
    catch (e) {
        next(e);
    }
});
router.post('/avatar', upload.single('avatar'), async (req, res, next) => {
    try {
        if (!req.file)
            return res.status(400).json({ success: false, message: 'No image uploaded' });
        const url = await (0, cloudinary_service_1.uploadToCloudinary)(req.file.buffer, `avatars/${req.user.id}`);
        await database_1.prisma.user.update({ where: { id: req.user.id }, data: { avatarUrl: url } });
        res.json({ success: true, data: { avatarUrl: url } });
    }
    catch (e) {
        next(e);
    }
});
// Lookup user by phone (for send money)
router.get('/lookup', async (req, res, next) => {
    try {
        const { phone } = req.query;
        const user = await database_1.prisma.user.findUnique({
            where: { phone: String(phone) },
            select: { id: true, phone: true, username: true, firstName: true, lastName: true, avatarUrl: true },
        });
        if (!user)
            return res.status(404).json({ success: false, message: 'User not found on PesaApp' });
        res.json({ success: true, data: user });
    }
    catch (e) {
        next(e);
    }
});
// GET /api/v1/users/online — returns list of online usernames
router.get('/online', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        // Track online users in Redis sorted set
        const raw = await redis_1.redis.zrange('online_users', 0, -1);
        const usernames = raw.slice(0, 50); // max 50
        res.json({ success: true, data: { usernames, count: raw.length } });
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
//# sourceMappingURL=user.routes.js.map