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
import investRoutes from './routes/invest.routes';

const app = express();

// ─────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────

const allowedOrigins = [
  'http://localhost:5173',
  'https://pesa-app.yobbytech.com',
];

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow Postman/server-to-server requests
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked: ${origin}`));
  },

  credentials: true,

  methods: [
    'GET',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'OPTIONS',
  ],

  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
  ],

  optionsSuccessStatus: 204,
};

// CORS for normal requests
app.use(cors(corsOptions));

// Explicitly handle browser preflight requests
app.options('*', cors(corsOptions));


// ─────────────────────────────────────────────
// Security
// ─────────────────────────────────────────────

app.use(helmet());

app.set('trust proxy', 1);


// ─────────────────────────────────────────────
// Rate Limiting
// ─────────────────────────────────────────────

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: {
    success: false,
    message: 'Too many requests, please try again later.',
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    message: 'Too many auth attempts.',
  },
});

app.use(globalLimiter);


// ─────────────────────────────────────────────
// Body Parsing
// ─────────────────────────────────────────────

app.use(express.json({ limit: '10mb' }));

app.use(
  express.urlencoded({
    extended: true,
    limit: '10mb',
  })
);


// ─────────────────────────────────────────────
// Logging
// ─────────────────────────────────────────────

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}


// ─────────────────────────────────────────────
// Health Check
// ─────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    origin: req.headers.origin || null,
    service: 'pesaapp-api',
  });
});


// ─────────────────────────────────────────────
// API Routes
// ─────────────────────────────────────────────

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
app.use(`${API}/admin`, adminRevenueRoutes);


// ─────────────────────────────────────────────
// Error Handling
// ─────────────────────────────────────────────

app.use(notFound);
app.use(errorHandler);

export default app;
