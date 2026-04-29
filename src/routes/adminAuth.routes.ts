// ═══════════════════════════════════════════════════════════
// backend/src/routes/adminAuth.routes.ts
// ═══════════════════════════════════════════════════════════
import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import { adminLogin, adminVerify2FA, adminSetupPassword, inviteStaff, listStaff } from '../controllers/adminAuth.controller';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import rateLimit from 'express-rate-limit';

const adminAuthRouter = Router();
const strictLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

// Admin login (step 1: password)
adminAuthRouter.post('/login', strictLimit,
  body('phone').isMobilePhone('any'),
  body('password').isLength({ min: 8 }),
  validate,
  adminLogin
);

// Admin login (step 2: 2FA OTP)
adminAuthRouter.post('/verify-2fa', strictLimit,
  body('phone').isMobilePhone('any'),
  body('otp').isLength({ min: 6, max: 6 }).isNumeric(),
  validate,
  adminVerify2FA
);

// Setup password (first-time)
adminAuthRouter.post('/setup-password',
  body('phone').isMobilePhone('any'),
  body('otp').isLength({ min: 6, max: 8 }).isNumeric(),
  body('password').isLength({ min: 8 }),
  validate,
  adminSetupPassword
);

// Invite staff (admin only)
adminAuthRouter.post('/invite', authenticate, requireAdmin,
  body('phone').isMobilePhone('any'),
  body('role').isIn(['ADMIN', 'AGENT']),
  body('firstName').isLength({ min: 2 }),
  validate,
  inviteStaff
);

// List staff (admin only)
adminAuthRouter.get('/staff', authenticate, requireAdmin, listStaff);

export default adminAuthRouter;
