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


// 3. Jaribu 500 Internal Server Error (Hitilafu ya seva)
router.get('/api/database', (req, res) => {
 try {
        throw new Error("Database connection failed!");
    } catch (err) {
        // Hapa tunatengeneza muonekano wa logi kwenye terminal ya seva
        console.error(`\n[${new Date().toISOString()}] 🚨 ERROR 500: ${req.method} ${req.url}`);
        console.error((err as Error).stack); // Hii inaleta ule mstari mrefu wa kosa (Stack Trace)
        console.error("--------------------------------------------------\n");

        res.status(500).json({ error: "Internal Server Error" });
    }
});

export default router;