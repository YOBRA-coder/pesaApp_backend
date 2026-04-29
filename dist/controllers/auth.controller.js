"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logout = exports.refreshTokens = exports.verifyOtp = exports.requestOtp = void 0;
const database_1 = require("../config/database");
const redis_1 = require("../config/redis");
const otp_1 = require("../utils/otp");
const jwt_1 = require("../utils/jwt");
const AppError_1 = require("../utils/AppError");
const logger_1 = require("../utils/logger");
const OTP_TTL = parseInt(process.env.OTP_EXPIRY_MINUTES || '5') * 60;
const MAX_ATTEMPTS = parseInt(process.env.MAX_OTP_ATTEMPTS || '3');
// POST /api/v1/auth/request-otp
const requestOtp = async (req, res, next) => {
    try {
        const { phone } = req.body;
        // Check attempts
        const attemptsKey = (0, redis_1.OTP_ATTEMPTS_KEY)(phone);
        const attempts = await redis_1.redis.get(attemptsKey);
        if (attempts && parseInt(attempts) >= MAX_ATTEMPTS) {
            throw new AppError_1.AppError('Too many OTP requests. Try again in 15 minutes.', 429);
        }
        // Generate OTP
        const otp = (0, otp_1.generateOtp)();
        const hashedOtp = await (0, otp_1.hashOtp)(otp);
        // Store hashed OTP in Redis
        await redis_1.redis.set((0, redis_1.OTP_KEY)(phone), hashedOtp, 'EX', OTP_TTL);
        // Increment attempts
        const pipe = redis_1.redis.pipeline();
        pipe.incr(attemptsKey);
        pipe.expire(attemptsKey, 15 * 60); // 15 min window
        await pipe.exec();
        logger_1.logger.info(`OTP for ${phone}: ${otp} (hashed: ${hashedOtp})`); // Log OTP for debugging (remove in production)
        // Send SMS
        // await sendSms(phone, `Your PesaApp OTP is: ${otp}. Valid for ${process.env.OTP_EXPIRY_MINUTES} minutes. Do not share.`);
        logger_1.logger.info(`OTP sent to ${phone}`);
        res.json({
            success: true,
            message: 'OTP sent successfully',
            // Return OTP in dev mode only
            ...(process.env.NODE_ENV === 'development' && { debug_otp: otp }),
        });
    }
    catch (err) {
        next(err);
    }
};
exports.requestOtp = requestOtp;
// POST /api/v1/auth/verify-otp
const verifyOtp = async (req, res, next) => {
    try {
        const { phone, otp, referralCode } = req.body;
        // Get stored OTP
        const storedHash = await redis_1.redis.get((0, redis_1.OTP_KEY)(phone));
        if (!storedHash) {
            throw new AppError_1.AppError('OTP expired or not found. Request a new one.', 400);
        }
        // Verify OTP
        const isValid = await (0, otp_1.verifyOtpHash)(otp, storedHash);
        if (!isValid) {
            throw new AppError_1.AppError('Invalid OTP', 400);
        }
        // Delete OTP after use
        await redis_1.redis.del((0, redis_1.OTP_KEY)(phone));
        await redis_1.redis.del((0, redis_1.OTP_ATTEMPTS_KEY)(phone));
        // Upsert user
        let user = await database_1.prisma.user.findUnique({ where: { phone } });
        const isNewUser = !user;
        if (!user) {
            // Find referrer
            let referrerId;
            if (referralCode) {
                const referrer = await database_1.prisma.user.findUnique({ where: { referralCode } });
                if (referrer)
                    referrerId = referrer.id;
            }
            user = await database_1.prisma.user.create({
                data: {
                    phone,
                    referredBy: referrerId,
                    wallet: { create: { balance: 1000 } },
                },
            });
            // Give referral bonus if applicable
            if (referrerId) {
                await handleSignupReferralBonus(referrerId, user.id);
            }
            logger_1.logger.info(`New user registered: ${phone}`);
        }
        // Generate tokens
        const { accessToken, refreshToken } = await (0, jwt_1.generateTokenPair)(user.id, user.role);
        res.json({
            success: true,
            isNewUser,
            message: isNewUser ? 'Account created successfully' : 'Login successful',
            data: {
                accessToken,
                refreshToken,
                user: {
                    id: user.id,
                    phone: user.phone,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    username: user.username,
                    kycStatus: user.kycStatus,
                    status: user.status,
                    role: user.role,
                    referralCode: user.referralCode,
                },
            },
        });
    }
    catch (err) {
        next(err);
    }
};
exports.verifyOtp = verifyOtp;
// POST /api/v1/auth/refresh
const refreshTokens = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken)
            throw new AppError_1.AppError('Refresh token required', 400);
        const payload = await (0, jwt_1.verifyRefreshToken)(refreshToken);
        const user = await database_1.prisma.user.findUnique({ where: { id: payload.userId } });
        if (!user)
            throw new AppError_1.AppError('User not found', 404);
        const tokens = await (0, jwt_1.generateTokenPair)(user.id, user.role);
        res.json({ success: true, data: tokens });
    }
    catch (err) {
        next(err);
    }
};
exports.refreshTokens = refreshTokens;
// POST /api/v1/auth/logout
const logout = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;
        if (refreshToken) {
            await database_1.prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
        }
        res.json({ success: true, message: 'Logged out successfully' });
    }
    catch (err) {
        next(err);
    }
};
exports.logout = logout;
async function handleSignupReferralBonus(referrerId, newUserId) {
    const bonusAmount = parseFloat(process.env.REFERRAL_BONUS_KES || '200');
    await database_1.prisma.$transaction(async (tx) => {
        await tx.wallet.update({
            where: { userId: referrerId },
            data: { balance: { increment: bonusAmount } },
        });
        await tx.referralEarning.create({
            data: {
                userId: referrerId,
                referredUserId: newUserId,
                amount: bonusAmount,
                type: 'SIGNUP',
                paid: true,
            },
        });
        await tx.transaction.create({
            data: {
                userId: referrerId,
                type: 'REFERRAL_BONUS',
                status: 'COMPLETED',
                amount: bonusAmount,
                balanceBefore: 0,
                balanceAfter: bonusAmount,
                description: 'Referral signup bonus',
            },
        });
    });
}
//# sourceMappingURL=auth.controller.js.map