"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_1 = require("../middleware/validate");
const crashGame_service_1 = require("../services/crashGame.service");
const minesGame_service_1 = require("../services/minesGame.service");
const diceAndPlinko_service_1 = require("../services/diceAndPlinko.service");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
// Rate limiter for bets (prevent rapid-fire)
const betLimiter = (0, express_rate_limit_1.default)({ windowMs: 1000, max: 3, message: { success: false, message: 'Too many requests' } });
// ─────────────────────────────────────────────────────────────
// CRASH / AVIATOR ROUTES
// ─────────────────────────────────────────────────────────────
// GET /games/crash/round — get current round state
router.get('/crash/round', async (req, res, next) => {
    try {
        const round = await crashGame_service_1.crashGameService.getCurrentRound();
        const history = await crashGame_service_1.crashGameService.getRoundHistory(20);
        res.json({ success: true, data: { round, history } });
    }
    catch (e) {
        next(e);
    }
});
// GET /games/crash/round/:roundId/bets — live bets for round
router.get('/crash/round/:roundId/bets', async (req, res, next) => {
    try {
        const bets = await crashGame_service_1.crashGameService.getRoundBets(req.params.roundId);
        // Anonymize: show partial phone/username only
        const safe = bets.map(b => ({
            ...b,
            user: { username: b.user.username || `***${b.user.phone.slice(-3)}` },
        }));
        res.json({ success: true, data: safe });
    }
    catch (e) {
        next(e);
    }
});
// POST /games/crash/bet — HTTP fallback (prefer WS)
router.post('/crash/bet', betLimiter, (0, express_validator_1.body)('roundId').isString(), (0, express_validator_1.body)('amount').isFloat({ min: 10, max: 50000 }), (0, express_validator_1.body)('autoCashout').optional().isFloat({ min: 1.01, max: 1000 }), validate_1.validate, async (req, res, next) => {
    try {
        const bet = await crashGame_service_1.crashGameService.placeBet(req.user.id, req.body.roundId, req.body.amount, req.body.autoCashout);
        res.json({ success: true, data: bet });
    }
    catch (e) {
        next(e);
    }
});
// POST /games/crash/cashout — HTTP fallback (prefer WS)
router.post('/crash/cashout', (0, express_validator_1.body)('roundId').isString(), (0, express_validator_1.body)('multiplier').isFloat({ min: 1 }), validate_1.validate, async (req, res, next) => {
    try {
        const result = await crashGame_service_1.crashGameService.cashOut(req.user.id, req.body.roundId, req.body.multiplier);
        res.json({ success: true, data: result });
    }
    catch (e) {
        next(e);
    }
});
// GET /games/crash/history — user's crash bet history
router.get('/crash/history', async (req, res, next) => {
    try {
        const data = await crashGame_service_1.crashGameService.getUserBetHistory(req.user.id, Number(req.query.page || 1));
        res.json({ success: true, data });
    }
    catch (e) {
        next(e);
    }
});
// ─────────────────────────────────────────────────────────────
// MINES ROUTES
// ─────────────────────────────────────────────────────────────
// GET /games/mines/active — resume active game
router.get('/mines/active', async (req, res, next) => {
    try {
        const game = await minesGame_service_1.minesGameService.getActiveGame(req.user.id);
        res.json({ success: true, data: game }); // null if no active game
    }
    catch (e) {
        next(e);
    }
});
// POST /games/mines/start
router.post('/mines/start', betLimiter, (0, express_validator_1.body)('betAmount').isFloat({ min: 10, max: 50000 }), (0, express_validator_1.body)('minesCount').isInt({ min: 1, max: 24 }), validate_1.validate, async (req, res, next) => {
    try {
        const game = await minesGame_service_1.minesGameService.startGame(req.user.id, req.body.betAmount, req.body.minesCount);
        res.json({ success: true, data: game });
    }
    catch (e) {
        next(e);
    }
});
// POST /games/mines/reveal
router.post('/mines/reveal', (0, express_validator_1.body)('gameId').isString(), (0, express_validator_1.body)('cellIndex').isInt({ min: 0, max: 24 }), validate_1.validate, async (req, res, next) => {
    try {
        const result = await minesGame_service_1.minesGameService.revealCell(req.user.id, req.body.gameId, req.body.cellIndex);
        res.json({ success: true, data: result });
    }
    catch (e) {
        next(e);
    }
});
// POST /games/mines/cashout
router.post('/mines/cashout', (0, express_validator_1.body)('gameId').isString(), validate_1.validate, async (req, res, next) => {
    try {
        const result = await minesGame_service_1.minesGameService.cashOut(req.user.id, req.body.gameId);
        res.json({ success: true, data: result });
    }
    catch (e) {
        next(e);
    }
});
// GET /games/mines/history
router.get('/mines/history', async (req, res, next) => {
    try {
        const data = await minesGame_service_1.minesGameService.getGameHistory(req.user.id, Number(req.query.page || 1));
        res.json({ success: true, data });
    }
    catch (e) {
        next(e);
    }
});
// ─────────────────────────────────────────────────────────────
// DICE ROUTES
// ─────────────────────────────────────────────────────────────
// POST /games/dice/roll
router.post('/dice/roll', betLimiter, (0, express_validator_1.body)('betAmount').isFloat({ min: 10, max: 50000 }), (0, express_validator_1.body)('target').isInt({ min: 2, max: 98 }), (0, express_validator_1.body)('mode').isIn(['OVER', 'UNDER']), (0, express_validator_1.body)('clientSeed').optional().isString(), validate_1.validate, async (req, res, next) => {
    try {
        const result = await diceAndPlinko_service_1.diceGameService.roll(req.user.id, req.body.betAmount, req.body.target, req.body.mode, req.body.clientSeed);
        res.json({ success: true, data: result });
    }
    catch (e) {
        next(e);
    }
});
// GET /games/dice/history
router.get('/dice/history', async (req, res, next) => {
    try {
        const data = await diceAndPlinko_service_1.diceGameService.getHistory(req.user.id, Number(req.query.page || 1));
        res.json({ success: true, data });
    }
    catch (e) {
        next(e);
    }
});
// GET /games/dice/stats
router.get('/dice/stats', async (req, res, next) => {
    try {
        const stats = await diceAndPlinko_service_1.diceGameService.getStats(req.user.id);
        res.json({ success: true, data: stats });
    }
    catch (e) {
        next(e);
    }
});
// ─────────────────────────────────────────────────────────────
// PLINKO ROUTES
// ─────────────────────────────────────────────────────────────
// POST /games/plinko/drop
router.post('/plinko/drop', betLimiter, (0, express_validator_1.body)('betAmount').isFloat({ min: 10, max: 50000 }), (0, express_validator_1.body)('risk').isIn(['LOW', 'MEDIUM', 'HIGH']), validate_1.validate, async (req, res, next) => {
    try {
        const result = await diceAndPlinko_service_1.plinkoGameService.drop(req.user.id, req.body.betAmount, req.body.risk);
        res.json({ success: true, data: result });
    }
    catch (e) {
        next(e);
    }
});
// GET /games/plinko/history
router.get('/plinko/history', async (req, res, next) => {
    try {
        const data = await diceAndPlinko_service_1.plinkoGameService.getHistory(req.user.id, Number(req.query.page || 1));
        res.json({ success: true, data });
    }
    catch (e) {
        next(e);
    }
});
// ─────────────────────────────────────────────────────────────
// GENERAL STATS (all games)
// ─────────────────────────────────────────────────────────────
// GET /games/stats — overall leaderboard & stats
router.get('/stats', async (req, res, next) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const [revenue, biggestWin] = await Promise.all([
            database_1.prisma.gameRevenue.findMany({
                where: { date: { gte: today } },
                select: { gameType: true, totalBets: true, totalPayout: true, houseProfit: true },
            }),
            database_1.prisma.transaction.findFirst({
                where: { type: 'GAME_WIN', createdAt: { gte: today } },
                orderBy: { amount: 'desc' },
                select: { amount: true, metadata: true },
            }),
        ]);
        res.json({ success: true, data: { revenue, biggestWin } });
    }
    catch (e) {
        next(e);
    }
});
router.get('/crash/history/global', async (req, res, next) => {
    try {
        const { redis } = await Promise.resolve().then(() => __importStar(require('../config/redis')));
        const cached = await redis.get('crash:history:global');
        if (cached)
            return res.json({ success: true, data: JSON.parse(cached) });
        const history = await crashGame_service_1.crashGameService.getRoundHistory(50);
        res.json({ success: true, data: history });
    }
    catch (e) {
        next(e);
    }
});
const database_1 = require("../config/database");
exports.default = router;
//# sourceMappingURL=game.routes.js.map