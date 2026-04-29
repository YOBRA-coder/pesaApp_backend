"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listStaff = exports.inviteStaff = exports.adminSetupPassword = exports.adminVerify2FA = exports.adminLogin = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const database_1 = require("../config/database");
const jwt_1 = require("../utils/jwt");
const redis_1 = require("../config/redis");
const otp_1 = require("../utils/otp");
const AppError_1 = require("../utils/AppError");
const logger_1 = require("../utils/logger");
// ── POST /api/v1/auth/admin/login ────────────────────────────
// Admin/Agent login: phone + password + OTP second factor
const adminLogin = async (req, res, next) => {
    try {
        const { phone, password } = req.body;
        const user = await database_1.prisma.user.findUnique({
            where: { phone },
            select: { id: true, phone: true, role: true, status: true, passwordHash: true, firstName: true },
        });
        if (!user || !['ADMIN', 'AGENT'].includes(user.role)) {
            throw new AppError_1.AppError('Invalid credentials', 401);
        }
        if (user.status === 'SUSPENDED' || user.status === 'BANNED') {
            throw new AppError_1.AppError('Account suspended. Contact support.', 403);
        }
        if (!user.passwordHash) {
            throw new AppError_1.AppError('No password set. Use the setup link sent to your phone.', 401);
        }
        const validPassword = await bcryptjs_1.default.compare(password, user.passwordHash);
        if (!validPassword) {
            // Log failed attempt
            logger_1.logger.warn(`Failed admin login attempt for ${phone}`);
            throw new AppError_1.AppError('Invalid credentials', 401);
        }
        // Send 2FA OTP
        const otp = (0, otp_1.generateOtp)();
        const hashedOtp = await (0, otp_1.hashOtp)(otp);
        await redis_1.redis.set((0, redis_1.OTP_KEY)(`admin:${phone}`), hashedOtp, 'EX', 300); // 5 min
        // await sendSms(phone, `PesaApp Admin: Your 2FA code is ${otp}. Valid 5 minutes. Do NOT share.`);
        logger_1.logger.info(`Admin 2FA sent to ${phone} otp ${otp} (hashed: ${hashedOtp})`);
        res.json({
            success: true,
            message: '2FA code sent to your phone',
            requiresOtp: true,
            // Dev only
            ...(process.env.NODE_ENV === 'development' && { debug_otp: otp }),
        });
    }
    catch (err) {
        next(err);
    }
};
exports.adminLogin = adminLogin;
// ── POST /api/v1/auth/admin/verify-2fa ──────────────────────
const adminVerify2FA = async (req, res, next) => {
    try {
        const { phone, otp } = req.body;
        const storedHash = await redis_1.redis.get((0, redis_1.OTP_KEY)(`admin:${phone}`));
        if (!storedHash)
            throw new AppError_1.AppError('OTP expired. Login again.', 400);
        const valid = await (0, otp_1.verifyOtpHash)(otp, storedHash);
        if (!valid)
            throw new AppError_1.AppError('Invalid OTP', 400);
        await redis_1.redis.del((0, redis_1.OTP_KEY)(`admin:${phone}`));
        const user = await database_1.prisma.user.findUnique({
            where: { phone },
            select: { id: true, phone: true, role: true, firstName: true, lastName: true, kycStatus: true, status: true },
        });
        if (!user)
            throw new AppError_1.AppError('User not found', 404);
        // Log admin session
        // await prisma.adminAuditLog.create({
        //  data: { userId: user.id, action: 'LOGIN', ip: req.ip || '', userAgent: req.headers['user-agent'] || '' },
        // });
        const { accessToken, refreshToken } = await (0, jwt_1.generateTokenPair)(user.id, user.role);
        res.json({
            success: true,
            message: `Welcome back, ${user.firstName || 'Admin'}`,
            data: { accessToken, refreshToken, user },
        });
    }
    catch (err) {
        next(err);
    }
};
exports.adminVerify2FA = adminVerify2FA;
// ── POST /api/v1/auth/admin/setup-password ──────────────────
// First-time setup: admin sets their password via phone+OTP
const adminSetupPassword = async (req, res, next) => {
    try {
        const { phone, otp, password } = req.body;
        if (password.length < 8)
            throw new AppError_1.AppError('Password must be at least 8 characters', 400);
        const storedHash = await redis_1.redis.get((0, redis_1.OTP_KEY)(`setup:${phone}`));
        if (!storedHash)
            throw new AppError_1.AppError('Setup link expired. Request a new one.', 400);
        const valid = await (0, otp_1.verifyOtpHash)(otp, storedHash);
        if (!valid)
            throw new AppError_1.AppError('Invalid OTP', 400);
        await redis_1.redis.del((0, redis_1.OTP_KEY)(`setup:${phone}`));
        const passwordHash = await bcryptjs_1.default.hash(password, 12);
        await database_1.prisma.user.update({
            where: { phone },
            data: { passwordHash },
        });
        res.json({ success: true, message: 'Password set. You can now login.' });
    }
    catch (err) {
        next(err);
    }
};
exports.adminSetupPassword = adminSetupPassword;
// ── POST /api/v1/admin/staff/invite ─────────────────────────
// Super admin invites a new admin/agent
const inviteStaff = async (req, res, next) => {
    try {
        const { phone, role, firstName, lastName } = req.body;
        if (!['ADMIN', 'AGENT'].includes(role))
            throw new AppError_1.AppError('Invalid role', 400);
        // Check not already registered as staff
        const existing = await database_1.prisma.user.findUnique({ where: { phone } });
        if (existing && ['ADMIN', 'AGENT'].includes(existing.role)) {
            throw new AppError_1.AppError('User is already a staff member', 409);
        }
        const otp = (0, otp_1.generateOtp)(8); // longer OTP for setup
        const hashedOtp = await (0, otp_1.hashOtp)(otp);
        await redis_1.redis.set((0, redis_1.OTP_KEY)(`setup:${phone}`), hashedOtp, 'EX', 24 * 60 * 60); // 24 hours
        // Create or upgrade user
        const user = await database_1.prisma.user.upsert({
            where: { phone },
            update: { role, firstName, lastName, status: 'ACTIVE' },
            create: {
                phone, role, firstName, lastName,
                status: 'ACTIVE', kycStatus: 'APPROVED',
                wallet: { create: { balance: 0 } },
            },
        });
        const setupLink = `${process.env.FRONTEND_URL}/auth/setup?phone=${encodeURIComponent(phone)}&otp=${otp}`;
        //await sendSms(phone,
        //  `You've been added as a PesaApp ${role}.\nSet your password: ${setupLink}\nOTP: ${otp}\nExpires in 24 hours.`
        // );
        logger_1.logger.info(`Staff invited: ${phone} as ${role}`);
        res.json({
            success: true,
            message: `${role} invited. Setup link sent to ${phone}`,
            data: { userId: user.id, setupLink: process.env.NODE_ENV === 'development' ? setupLink : undefined },
        });
    }
    catch (err) {
        next(err);
    }
};
exports.inviteStaff = inviteStaff;
// ── POST /api/v1/admin/staff/list ───────────────────────────
const listStaff = async (req, res, next) => {
    try {
        const staff = await database_1.prisma.user.findMany({
            where: { role: { in: ['ADMIN', 'AGENT'] } },
            select: { id: true, phone: true, firstName: true, lastName: true, role: true, status: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
        });
        res.json({ success: true, data: staff });
    }
    catch (err) {
        next(err);
    }
};
exports.listStaff = listStaff;
//# sourceMappingURL=adminAuth.controller.js.map