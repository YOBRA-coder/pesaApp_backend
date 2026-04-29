import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate';
import { crashGameService } from '../services/crashGame.service';
import { minesGameService } from '../services/minesGame.service';
import { diceGameService, plinkoGameService } from '../services/diceAndPlinko.service';
import rateLimit from 'express-rate-limit';

const router = Router();
router.use(authenticate);

// Rate limiter for bets (prevent rapid-fire)
const betLimiter = rateLimit({ windowMs: 1000, max: 3, message: { success: false, message: 'Too many requests' } });

// ─────────────────────────────────────────────────────────────
// CRASH / AVIATOR ROUTES
// ─────────────────────────────────────────────────────────────

// GET /games/crash/round — get current round state
router.get('/crash/round', async (req, res, next) => {
  try {
    const round = await crashGameService.getCurrentRound();
    const history = await crashGameService.getRoundHistory(20);
    res.json({ success: true, data: { round, history } });
  } catch (e) { next(e); }
});

// GET /games/crash/round/:roundId/bets — live bets for round
router.get('/crash/round/:roundId/bets', async (req, res, next) => {
  try {
    const bets = await crashGameService.getRoundBets(req.params.roundId);
    // Anonymize: show partial phone/username only
    const safe = bets.map(b => ({
      ...b,
      user: { username: b.user.username || `***${b.user.phone.slice(-3)}` },
    }));
    res.json({ success: true, data: safe });
  } catch (e) { next(e); }
});

// POST /games/crash/bet — HTTP fallback (prefer WS)
router.post('/crash/bet',
  betLimiter,
  body('roundId').isString(),
  body('amount').isFloat({ min: 10, max: 50000 }),
  body('autoCashout').optional().isFloat({ min: 1.01, max: 1000 }),
  validate,
  async (req: any, res, next) => {
    try {
      const bet = await crashGameService.placeBet(req.user.id, req.body.roundId, req.body.amount, req.body.autoCashout);
      res.json({ success: true, data: bet });
    } catch (e) { next(e); }
  }
);

// POST /games/crash/cashout — HTTP fallback (prefer WS)
router.post('/crash/cashout',
  body('roundId').isString(),
  body('multiplier').isFloat({ min: 1 }),
  validate,
  async (req: any, res, next) => {
    try {
      const result = await crashGameService.cashOut(req.user.id, req.body.roundId, req.body.multiplier);
      res.json({ success: true, data: result });
    } catch (e) { next(e); }
  }
);

// GET /games/crash/history — user's crash bet history
router.get('/crash/history', async (req: any, res, next) => {
  try {
    const data = await crashGameService.getUserBetHistory(req.user.id, Number(req.query.page || 1));
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

// ─────────────────────────────────────────────────────────────
// MINES ROUTES
// ─────────────────────────────────────────────────────────────

// GET /games/mines/active — resume active game
router.get('/mines/active', async (req: any, res, next) => {
  try {
    const game = await minesGameService.getActiveGame(req.user.id);
    res.json({ success: true, data: game }); // null if no active game
  } catch (e) { next(e); }
});

// POST /games/mines/start
router.post('/mines/start',
  betLimiter,
  body('betAmount').isFloat({ min: 10, max: 50000 }),
  body('minesCount').isInt({ min: 1, max: 24 }),
  validate,
  async (req: any, res, next) => {
    try {
      const game = await minesGameService.startGame(req.user.id, req.body.betAmount, req.body.minesCount);
      res.json({ success: true, data: game });
    } catch (e) { next(e); }
  }
);

// POST /games/mines/reveal
router.post('/mines/reveal',
  body('gameId').isString(),
  body('cellIndex').isInt({ min: 0, max: 24 }),
  validate,
  async (req: any, res, next) => {
    try {
      const result = await minesGameService.revealCell(req.user.id, req.body.gameId, req.body.cellIndex);
      res.json({ success: true, data: result });
    } catch (e) { next(e); }
  }
);

// POST /games/mines/cashout
router.post('/mines/cashout',
  body('gameId').isString(),
  validate,
  async (req: any, res, next) => {
    try {
      const result = await minesGameService.cashOut(req.user.id, req.body.gameId);
      res.json({ success: true, data: result });
    } catch (e) { next(e); }
  }
);

// GET /games/mines/history
router.get('/mines/history', async (req: any, res, next) => {
  try {
    const data = await minesGameService.getGameHistory(req.user.id, Number(req.query.page || 1));
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

// ─────────────────────────────────────────────────────────────
// DICE ROUTES
// ─────────────────────────────────────────────────────────────

// POST /games/dice/roll
router.post('/dice/roll',
  betLimiter,
  body('betAmount').isFloat({ min: 10, max: 50000 }),
  body('target').isInt({ min: 2, max: 98 }),
  body('mode').isIn(['OVER', 'UNDER']),
  body('clientSeed').optional().isString(),
  validate,
  async (req: any, res, next) => {
    try {
      const result = await diceGameService.roll(
        req.user.id, req.body.betAmount, req.body.target, req.body.mode, req.body.clientSeed
      );
      res.json({ success: true, data: result });
    } catch (e) { next(e); }
  }
);

// GET /games/dice/history
router.get('/dice/history', async (req: any, res, next) => {
  try {
    const data = await diceGameService.getHistory(req.user.id, Number(req.query.page || 1));
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

// GET /games/dice/stats
router.get('/dice/stats', async (req: any, res, next) => {
  try {
    const stats = await diceGameService.getStats(req.user.id);
    res.json({ success: true, data: stats });
  } catch (e) { next(e); }
});

// ─────────────────────────────────────────────────────────────
// PLINKO ROUTES
// ─────────────────────────────────────────────────────────────

// POST /games/plinko/drop
router.post('/plinko/drop',
  betLimiter,
  body('betAmount').isFloat({ min: 10, max: 50000 }),
  body('risk').isIn(['LOW', 'MEDIUM', 'HIGH']),
  validate,
  async (req: any, res, next) => {
    try {
      const result = await plinkoGameService.drop(req.user.id, req.body.betAmount, req.body.risk);
      res.json({ success: true, data: result });
    } catch (e) { next(e); }
  }
);

// GET /games/plinko/history
router.get('/plinko/history', async (req: any, res, next) => {
  try {
    const data = await plinkoGameService.getHistory(req.user.id, Number(req.query.page || 1));
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

// ─────────────────────────────────────────────────────────────
// GENERAL STATS (all games)
// ─────────────────────────────────────────────────────────────

// GET /games/stats — overall leaderboard & stats
router.get('/stats', async (req: any, res, next) => {
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [revenue, biggestWin] = await Promise.all([
      prisma.gameRevenue.findMany({
        where: { date: { gte: today } },
        select: { gameType: true, totalBets: true, totalPayout: true, houseProfit: true },
      }),
      prisma.transaction.findFirst({
        where: { type: 'GAME_WIN', createdAt: { gte: today } },
        orderBy: { amount: 'desc' },
        select: { amount: true, metadata: true },
      }),
    ]);
    res.json({ success: true, data: { revenue, biggestWin } });
  } catch (e) { next(e); }
});

router.get('/crash/history/global', async (req, res, next) => {
  try {
    const { redis } = await import('../config/redis');
    const cached = await redis.get('crash:history:global');
    if (cached) return res.json({ success: true, data: JSON.parse(cached) });
    const history = await crashGameService.getRoundHistory(50);
    res.json({ success: true, data: history });
  } catch (e) { next(e); }
});

import { prisma } from '../config/database';
export default router;
