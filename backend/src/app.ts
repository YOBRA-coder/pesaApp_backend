import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import adminAuthRoutes from './routes/adminAuth.routes';
import gamesRoutes from './routes/game.routes';

import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';

// Routes
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import walletRoutes from './routes/wallet.routes';
import paymentRoutes from './routes/payment.routes';
import kycRoutes from './routes/kyc.routes';
import signalRoutes from './routes/signal.routes';
import billRoutes from './routes/bill.routes';
import referralRoutes from './routes/referral.routes';
import notificationRoutes from './routes/notification.routes';
import adminRoutes from './routes/admin.routes';
import adminRevenueRoutes from './routes/adminRevenue.routes';
import sportsRoutes from './routes/sports.routes';

const app = express();

// ─── Security ───────────────────────────────────────
app.use(helmet());
app.use(cors({
    origin: [
    'http://localhost:5173', 
    'https://3cfb-102-207-163-35.ngrok-free.app' // Add your current frontend ngrok URL here
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
}));

// ─── Rate Limiting ───────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 300, //300 requests per 15 min per IP
  message: { success: false, message: 'Too many requests, please try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, // 10 OTP requests per 15 min
  message: { success: false, message: 'Too many auth attempts.' },
});

app.use(globalLimiter);

// ─── Body Parsing ────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Logging ─────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// ─── Health Check ────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'pesaapp-api' });
});

// ─── API Routes ──────────────────────────────────────
const API = '/api/v1';

app.use(`${API}/auth`, authLimiter, authRoutes);
app.use(`${API}/auth/admin`, adminAuthRoutes);
app.use(`${API}/users`, userRoutes);
app.use(`${API}/wallet`, walletRoutes);
app.use(`${API}/payments`, paymentRoutes);
app.use(`${API}/kyc`, kycRoutes);
app.use(`${API}/games`, gamesRoutes);
app.use(`${API}/signals`, signalRoutes);
app.use(`${API}/sports`, sportsRoutes);
app.use(`${API}/bills`, billRoutes);
app.use(`${API}/referrals`, referralRoutes);
app.use(`${API}/notifications`, notificationRoutes);
app.use(`${API}/admin`, adminRoutes);
app.use(`${API}/admin`, adminRevenueRoutes); // add to existing admin routes

// ─── Error Handling ──────────────────────────────────
app.use(notFound);
app.use(errorHandler);

export default app;
