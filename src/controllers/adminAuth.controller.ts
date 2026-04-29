import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/database';
import { generateTokenPair } from '../utils/jwt';
import { sendSms } from '../services/sms.service';
import { redis, OTP_KEY } from '../config/redis';
import { generateOtp, hashOtp, verifyOtpHash } from '../utils/otp';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

// ── POST /api/v1/auth/admin/login ────────────────────────────
// Admin/Agent login: phone + password + OTP second factor
export const adminLogin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phone, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { phone },
      select: { id: true, phone: true, role: true, status: true, passwordHash: true, firstName: true },
    });

    if (!user || !['ADMIN', 'AGENT'].includes(user.role)) {
      throw new AppError('Invalid credentials', 401);
    }
    if (user.status === 'SUSPENDED' || user.status === 'BANNED') {
      throw new AppError('Account suspended. Contact support.', 403);
    }
    if (!user.passwordHash) {
      throw new AppError('No password set. Use the setup link sent to your phone.', 401);
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      // Log failed attempt
      logger.warn(`Failed admin login attempt for ${phone}`);
      throw new AppError('Invalid credentials', 401);
    }

    // Send 2FA OTP
    const otp = generateOtp();
    const hashedOtp = await hashOtp(otp);
    await redis.set(OTP_KEY(`admin:${phone}`), hashedOtp, 'EX', 300); // 5 min

   // await sendSms(phone, `PesaApp Admin: Your 2FA code is ${otp}. Valid 5 minutes. Do NOT share.`);

    logger.info(`Admin 2FA sent to ${phone} otp ${otp} (hashed: ${hashedOtp})`);

    res.json({
      success: true,
      message: '2FA code sent to your phone',
      requiresOtp: true,
      // Dev only
      ...(process.env.NODE_ENV === 'development' && { debug_otp: otp }),
    });
  } catch (err) { next(err); }
};

// ── POST /api/v1/auth/admin/verify-2fa ──────────────────────
export const adminVerify2FA = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phone, otp } = req.body;

    const storedHash = await redis.get(OTP_KEY(`admin:${phone}`));
    if (!storedHash) throw new AppError('OTP expired. Login again.', 400);

    const valid = await verifyOtpHash(otp, storedHash);
    if (!valid) throw new AppError('Invalid OTP', 400);

    await redis.del(OTP_KEY(`admin:${phone}`));

    const user = await prisma.user.findUnique({
      where: { phone },
      select: { id: true, phone: true, role: true, firstName: true, lastName: true, kycStatus: true, status: true },
    });
    if (!user) throw new AppError('User not found', 404);

    // Log admin session
   // await prisma.adminAuditLog.create({
    //  data: { userId: user.id, action: 'LOGIN', ip: req.ip || '', userAgent: req.headers['user-agent'] || '' },
   // });

    const { accessToken, refreshToken } = await generateTokenPair(user.id, user.role);

    res.json({
      success: true,
      message: `Welcome back, ${user.firstName || 'Admin'}`,
      data: { accessToken, refreshToken, user },
    });
  } catch (err) { next(err); }
};

// ── POST /api/v1/auth/admin/setup-password ──────────────────
// First-time setup: admin sets their password via phone+OTP
export const adminSetupPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phone, otp, password } = req.body;

    if (password.length < 8) throw new AppError('Password must be at least 8 characters', 400);

    const storedHash = await redis.get(OTP_KEY(`setup:${phone}`));
    if (!storedHash) throw new AppError('Setup link expired. Request a new one.', 400);

    const valid = await verifyOtpHash(otp, storedHash);
    if (!valid) throw new AppError('Invalid OTP', 400);
    await redis.del(OTP_KEY(`setup:${phone}`));

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { phone },
      data: { passwordHash },
    });

    res.json({ success: true, message: 'Password set. You can now login.' });
  } catch (err) { next(err); }
};

// ── POST /api/v1/admin/staff/invite ─────────────────────────
// Super admin invites a new admin/agent
export const inviteStaff = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phone, role, firstName, lastName } = req.body;

    if (!['ADMIN', 'AGENT'].includes(role)) throw new AppError('Invalid role', 400);

    // Check not already registered as staff
    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing && ['ADMIN', 'AGENT'].includes(existing.role)) {
      throw new AppError('User is already a staff member', 409);
    }

    const otp = generateOtp(8); // longer OTP for setup
    const hashedOtp = await hashOtp(otp);
    await redis.set(OTP_KEY(`setup:${phone}`), hashedOtp, 'EX', 24 * 60 * 60); // 24 hours

    // Create or upgrade user
    const user = await prisma.user.upsert({
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

    logger.info(`Staff invited: ${phone} as ${role}`);

    res.json({
      success: true,
      message: `${role} invited. Setup link sent to ${phone}`,
      data: { userId: user.id, setupLink: process.env.NODE_ENV === 'development' ? setupLink : undefined },
    });
  } catch (err) { next(err); }
};

// ── POST /api/v1/admin/staff/list ───────────────────────────
export const listStaff = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const staff = await prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'AGENT'] } },
      select: { id: true, phone: true, firstName: true, lastName: true, role: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: staff });
  } catch (err) { next(err); }
};
