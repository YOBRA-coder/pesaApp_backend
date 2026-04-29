// ─── auth.routes.ts ──────────────────────────────────────
import { Router } from 'express';
import { body } from 'express-validator';
import { requestOtp, verifyOtp, refreshTokens, logout } from '../controllers/auth.controller';
import { validate } from '../middleware/validate';

const router = Router();

router.post('/request-otp',
  body('phone').isMobilePhone('any').withMessage('Valid phone required'),
  validate,
  requestOtp
);

router.post('/verify-otp',
  body('phone').isMobilePhone('any'),
  body('otp').isLength({ min: 6, max: 6 }).isNumeric(),
  validate,
  verifyOtp
);

router.post('/refresh', refreshTokens);
router.post('/logout', logout);

export default router;
