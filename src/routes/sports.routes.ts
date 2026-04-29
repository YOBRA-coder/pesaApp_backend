// ═══════════════════════════════════════════════════════════
// backend/src/routes/sports.routes.ts
// ═══════════════════════════════════════════════════════════
import { Router } from 'express';
import { body } from 'express-validator';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

const router = Router();
router.use(authenticate);

// GET /sports/matches — return upcoming/live matches
router.get('/matches', async (req, res, next) => {
  try {
    const { league } = req.query;
    const where: any = { status: { in: ['upcoming', 'live'] } };
    if (league && league !== 'all') where.league = league;

    const matches = await prisma.sportMatch.findMany({
      where,
      orderBy: [{ status: 'asc' }, { kickoff: 'asc' }],
      take: 50,
    });
    res.json({ success: true, data: matches });
  } catch (e) { next(e); }
});

// POST /sports/bet — place sports bet
router.post('/bet',
  body('stake').isFloat({ min: 10, max: 500000 }),
  body('selections').isArray({ min: 1, max: 8 }),
  body('totalOdds').isFloat({ min: 1.01 }),
  validate,
  async (req: any, res, next) => {
    try {
      const { stake, selections, totalOdds } = req.body;

      // Verify wallet balance
      const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
      if (!wallet || Number(wallet.balance) < stake) throw new AppError('Insufficient balance', 400);

      const potentialWin = parseFloat((stake * totalOdds).toFixed(2));

      await prisma.$transaction([
        prisma.sportBet.create({
          data: {
            userId: req.user.id,
            stake,
            totalOdds,
            potentialWin,
            status: 'PENDING',
            selections: {
              create: selections.map((s: any) => ({
                matchId: s.matchId,
                outcome: s.outcome,
                odds: s.odds,
                outcomeLabel: s.outcomeLabel || s.outcome,
                matchLabel: s.matchLabel || 'Match',
              })),
            },
          },
        }),
        prisma.wallet.update({
          where: { userId: req.user.id },
          data: { balance: { decrement: stake } },
        }),
        prisma.transaction.create({
          data: {
            userId: req.user.id,
            type: 'GAME_BET',
            status: 'COMPLETED',
            amount: stake,
            fee: 0,
            balanceBefore: Number(wallet.balance),
            balanceAfter: Number(wallet.balance) - stake,
            description: `Sports bet (${selections.length} selection${selections.length>1?'s':''}) @ ${totalOdds.toFixed(2)}x`,
            provider: 'INTERNAL',
            completedAt: new Date(),
            metadata: { betType: 'SPORTS', selectionsCount: selections.length },
          },
        }),
      ]);

      logger.info(`Sports bet placed: user ${req.user.id}, stake ${stake}, odds ${totalOdds}`);
      res.json({ success: true, message: 'Bet placed! Good luck! 🍀' });
    } catch (e) { next(e); }
  }
);

// GET /sports/my-bets
router.get('/my-bets', async (req: any, res, next) => {
  try {
    const bets = await prisma.sportBet.findMany({
      where: { userId: req.user.id },
      include: { selections: true },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    res.json({ success: true, data: bets });
  } catch (e) { next(e); }
});

// ADMIN: settle a bet (mark won/lost)
// POST /sports/admin/settle/:betId
router.post('/admin/settle/:betId', async (req: any, res, next) => {
  try {
    if (req.user.role !== 'ADMIN') throw new AppError('Admin only', 403);
    const { won } = req.body;
    const bet = await prisma.sportBet.findUnique({
      where: { id: req.params.betId },
      include: { user: { include: { wallet: true } } },
    });
    if (!bet) throw new AppError('Bet not found', 404);
    if (bet.status !== 'PENDING') throw new AppError('Already settled', 400);

    if (won) {
      const winAmount = Number(bet.potentialWin);
      await prisma.$transaction([
        prisma.sportBet.update({ where: { id: bet.id }, data: { status: 'WON', winAmount, settledAt: new Date() } }),
        prisma.wallet.update({ where: { userId: bet.userId }, data: { balance: { increment: winAmount } } }),
        prisma.transaction.create({
          data: {
            userId: bet.userId,
            type: 'GAME_WIN',
            status: 'COMPLETED',
            amount: winAmount,
            fee: 0,
            balanceBefore: Number(bet.user.wallet!.balance),
            balanceAfter: Number(bet.user.wallet!.balance) + winAmount,
            description: `Sports bet win @ ${Number(bet.totalOdds).toFixed(2)}x`,
            provider: 'INTERNAL',
            completedAt: new Date(),
          },
        }),
      ]);
    } else {
      await prisma.sportBet.update({ where: { id: bet.id }, data: { status: 'LOST', winAmount: 0, settledAt: new Date() } });
    }

    res.json({ success: true, message: `Bet ${won ? 'WON' : 'LOST'} settled` });
  } catch (e) { next(e); }
});

export default router;


// ═══════════════════════════════════════════════════════════
// Prisma schema additions — add these models to schema.prisma
// ═══════════════════════════════════════════════════════════

/*

// Also add to User model:
// sportBets  SportBet[]

// Also add to Signal model for plan gating:
// targetPlan  String @default("FREE")  // FREE, BASIC, PRO, VIP
// (store in metadata Json for now, or add this column)
*/
