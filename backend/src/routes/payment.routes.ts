import { Router } from 'express';
import { walletService } from '../services/wallet.service';
import { flutterwaveService } from '../services/flutterwave.service';
import { logger } from '../utils/logger';

const router = Router();

// M-Pesa STK Push callback (called by Safaricom)
router.post('/mpesa/callback', async (req, res) => {
  try {
    await walletService.handleMpesaCallback(req.body);
  } catch (err) {
    logger.error('M-Pesa callback error:', err);
  }
  // Always return 200 to Safaricom
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

// M-Pesa B2C result (withdrawal confirmation)
router.post('/mpesa/b2c/result', async (req, res) => {
  try {
    logger.info('B2C Result:', JSON.stringify(req.body));
    const result = req.body.Result;
    const { prisma } = await import('../config/database');
    if (result.ResultCode === 0) {
      const conversationId = result.ConversationID;
      await prisma.transaction.updateMany({
        where: { externalRef: conversationId, status: 'PROCESSING' },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      // Unlock locked balance
      const tx = await prisma.transaction.findFirst({ where: { externalRef: conversationId } });
      if (tx) {
        await prisma.wallet.update({
          where: { userId: tx.userId },
          data: { lockedBalance: { decrement: tx.amount }, totalWithdrawn: { increment: tx.amount } },
        });
      }
    } else {
      logger.warn('B2C failed:', result.ResultDesc);
      // Refund on failure
      const { prisma } = await import('../config/database');
      const tx = await prisma.transaction.findFirst({ where: { externalRef: result.ConversationID } });
      if (tx) {
        await prisma.$transaction([
          prisma.wallet.update({
            where: { userId: tx.userId },
            data: { balance: { increment: Number(tx.amount) + Number(tx.fee) }, lockedBalance: { decrement: tx.amount } },
          }),
          prisma.transaction.update({
            where: { id: tx.id },
            data: { status: 'FAILED', failureReason: result.ResultDesc },
          }),
        ]);
      }
    }
  } catch (err) {
    logger.error('B2C result error:', err);
  }
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

// M-Pesa timeout
router.post('/mpesa/timeout', (req, res) => {
  logger.warn('M-Pesa timeout:', req.body);
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

// Flutterwave webhook
router.post('/flutterwave/webhook', async (req, res) => {
  try {
    const signature = req.headers['verif-hash'] as string;
    if (!flutterwaveService.validateWebhook(signature, req.body)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    const { event, data } = req.body;
    logger.info(`FLW webhook: ${event}`, data);
    if (event === 'charge.completed' && data.status === 'successful') {
      // Handle successful deposit via Flutterwave
      const { prisma } = await import('../config/database');
      await prisma.transaction.updateMany({
        where: { externalRef: data.tx_ref, status: 'PENDING' },
        data: { status: 'COMPLETED', completedAt: new Date(), metadata: data },
      });
    }
  } catch (err) {
    logger.error('Flutterwave webhook error:', err);
  }
  res.sendStatus(200);
});

export default router;
