"use strict";
// ── ADD to crashGame.service.ts ──────────────────────────────
// This ensures round history persists in Redis and is loaded on page refresh
Object.defineProperty(exports, "__esModule", { value: true });
exports.cacheRoundHistory = cacheRoundHistory;
const redis_1 = require("@/config/redis");
const HISTORY_KEY = 'crash:history:global';
const MAX_HISTORY = 50;
// In createRound(), after creating the round, cache history:
async function cacheRoundHistory(roundNumber, crashPoint) {
    const existing = await redis_1.redis.get(HISTORY_KEY);
    const history = existing ? JSON.parse(existing) : [];
    history.unshift({ roundNumber, crashPoint, timestamp: Date.now() });
    if (history.length > MAX_HISTORY)
        history.splice(MAX_HISTORY);
    await redis_1.redis.set(HISTORY_KEY, JSON.stringify(history), 'EX', 86400); // 24h
}
//# sourceMappingURL=crashHistory.persistence.js.map