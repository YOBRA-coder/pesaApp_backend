// ── ADD to crashGame.service.ts ──────────────────────────────
// This ensures round history persists in Redis and is loaded on page refresh
import {redis} = from '../config/redis';
const HISTORY_KEY = 'crash:history:global';
const MAX_HISTORY = 50;

// In createRound(), after creating the round, cache history:
export async function cacheRoundHistory(roundNumber: number, crashPoint: number) {
  const existing = await redis.get(HISTORY_KEY);
  const history = existing ? JSON.parse(existing) : [];
  history.unshift({ roundNumber, crashPoint, timestamp: Date.now() });
  if (history.length > MAX_HISTORY) history.splice(MAX_HISTORY);
  await redis.set(HISTORY_KEY, JSON.stringify(history), 'EX', 86400); // 24h
}

// In settleRound(), call this:
// await cacheRoundHistory(round.roundNumber, crashPoint);

// Add this endpoint to games.routes.ts:
/*
router.get('/crash/history/global', async (req, res, next) => {
  try {
    // First check Redis cache (fast, survives refreshes)
    const cached = await redis.get('crash:history:global');
    if (cached) {
      return res.json({ success: true, data: JSON.parse(cached) });
    }
    // Fall back to DB
    const history = await crashGameService.getRoundHistory(50);
    res.json({ success: true, data: history });
  } catch (e) { next(e); }
});
*/

// ── In AviatorPage.tsx, update the useEffect to fetch global history: ─
/*
useEffect(() => {
  // Load persistent history (not just current session)
  api.get('/games/crash/history/global')
    .then(res => {
      if (res.data.data?.length) {
        setHistory(res.data.data.map((r: any) => ({
          crashPoint: Number(r.crashPoint),
          roundNumber: r.roundNumber
        })));
      }
    })
    .catch(() => {});
}, []); // Only on mount - then WebSocket keeps it updated
*/

// ── Also in websocket.service.ts, after settleRound(): ───────
/*
import { cacheRoundHistory } from './crashGame.service';

// After: const { houseProfit } = await crashGameService.settleRound(...)
// Add:
await cacheRoundHistory(dbRound.roundNumber, currentCrashPoint);
*/

export {};
