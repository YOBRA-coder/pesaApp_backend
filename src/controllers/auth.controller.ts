import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { redis, OTP_KEY, OTP_ATTEMPTS_KEY } from '../config/redis';
import { generateOtp, hashOtp, verifyOtpHash } from '../utils/otp';
import { generateTokenPair, verifyRefreshToken } from '../utils/jwt';
import { sendSms } from '../services/sms.service';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { log } from 'winston';

const OTP_TTL = parseInt(process.env.OTP_EXPIRY_MINUTES || '5') * 60;
const MAX_ATTEMPTS = parseInt(process.env.MAX_OTP_ATTEMPTS || '3');

// POST /api/v1/auth/request-otp
export const requestOtp = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phone } = req.body;

    // Check attempts
    const attemptsKey = OTP_ATTEMPTS_KEY(phone);
    const attempts = await redis.get(attemptsKey);
    if (attempts && parseInt(attempts) >= MAX_ATTEMPTS) {
      throw new AppError('Too many OTP requests. Try again in 15 minutes.', 429);
    }

    // Generate OTP
    const otp = generateOtp();
    const hashedOtp = await hashOtp(otp);

    // Store hashed OTP in Redis
    await redis.set(OTP_KEY(phone), hashedOtp, 'EX', OTP_TTL);

    // Increment attempts
    const pipe = redis.pipeline();
    pipe.incr(attemptsKey);
    pipe.expire(attemptsKey, 15 * 60); // 15 min window
    await pipe.exec();
    logger.info(`OTP for ${phone}: ${otp} (hashed: ${hashedOtp})`); // Log OTP for debugging (remove in production)
    // Send SMS
   // await sendSms(phone, `Your PesaApp OTP is: ${otp}. Valid for ${process.env.OTP_EXPIRY_MINUTES} minutes. Do not share.`);

    logger.info(`OTP sent to ${phone}`);

    res.json({
      success: true,
      message: 'OTP sent successfully',
      // Return OTP in dev mode only
      ...(process.env.NODE_ENV === 'development' && { debug_otp: otp }),
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/auth/verify-otp
export const verifyOtp = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phone, otp, referralCode } = req.body;

    // Get stored OTP
    const storedHash = await redis.get(OTP_KEY(phone));
    if (!storedHash) {
      throw new AppError('OTP expired or not found. Request a new one.', 400);
    }

    // Verify OTP
    const isValid = await verifyOtpHash(otp, storedHash);
    if (!isValid) {
      throw new AppError('Invalid OTP', 400);
    }

    // Delete OTP after use
    await redis.del(OTP_KEY(phone));
    await redis.del(OTP_ATTEMPTS_KEY(phone));

    // Upsert user
    let user = await prisma.user.findUnique({ where: { phone } });
    const isNewUser = !user;

    if (!user) {
      // Find referrer
      let referrerId: string | undefined;
      if (referralCode) {
        const referrer = await prisma.user.findUnique({ where: { referralCode } });
        if (referrer) referrerId = referrer.id;
      }

      user = await prisma.user.create({
        data: {
          phone,
          referredBy: referrerId,
          wallet: { create: { balance: 1000 } },
          role: : 'admin',
        },
      });

      // Give referral bonus if applicable
      if (referrerId) {
        await handleSignupReferralBonus(referrerId, user.id);
      }

      logger.info(`New user registered: ${phone}`);
    }

    // Generate tokens
    const { accessToken, refreshToken } = await generateTokenPair(user.id, user.role);

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
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/auth/refresh
export const refreshTokens = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) throw new AppError('Refresh token required', 400);

    const payload = await verifyRefreshToken(refreshToken);
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) throw new AppError('User not found', 404);

    const tokens = await generateTokenPair(user.id, user.role);

    res.json({ success: true, data: tokens });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/auth/logout
export const logout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
    }
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
};

async function handleSignupReferralBonus(referrerId: string, newUserId: string) {
  const bonusAmount = parseFloat(process.env.REFERRAL_BONUS_KES || '200');
  await prisma.$transaction(async (tx) => {
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
