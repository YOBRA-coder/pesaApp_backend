import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../config/database';
import { redis, WALLET_LOCK_KEY } from '../config/redis';
import { mpesa } from './mpesa.service';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

const FEE_PERCENT = parseFloat(process.env.TRANSACTION_FEE_PERCENT || '0.015');
const MIN_AMOUNT = parseFloat(process.env.MIN_DEPOSIT_KES || '100');

export class WalletService {

  // ─── Initiate Deposit via M-Pesa ────────────────────
  async initiateDeposit(userId: string, phone: string, amount: number) {
    if (amount < MIN_AMOUNT) {
      throw new AppError(`Minimum deposit is KES ${MIN_AMOUNT}`, 400);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { wallet: true },
    });
    if (!user) throw new AppError('User not found', 404);

    // Check daily limits
    await this.checkDailyDepositLimit(userId, amount, user.kycStatus === 'APPROVED');

    // Create pending transaction
    const wallet = user.wallet!;
    const transaction = await prisma.transaction.create({
      data: {
        userId,
        type: 'DEPOSIT',
        status: 'PENDING',
        amount,
        fee: 0,
        balanceBefore: Number(wallet.balance),
        balanceAfter: Number(wallet.balance) + amount,
        provider: 'MPESA',
        description: 'M-Pesa deposit',
        metadata: { phone },
      },
    });

    // Initiate STK Push
    const stkResponse = await mpesa.stkPush({
      phone,
      amount,
      accountRef: `DEP-${transaction.id.slice(-8).toUpperCase()}`,
      transactionDesc: 'PesaApp Deposit',
    });

    // Save M-Pesa request details
    await prisma.mpesaTransaction.create({
      data: {
        transactionId: transaction.id,
        checkoutRequestId: stkResponse.CheckoutRequestID,
        merchantRequestId: stkResponse.MerchantRequestID,
        phone,
        amount,
        type: 'STK_PUSH',
      },
    });

    return {
      transactionId: transaction.id,
      checkoutRequestId: stkResponse.CheckoutRequestID,
      message: 'STK Push sent. Enter M-Pesa PIN to complete.',
    };
  }

  // ─── Handle M-Pesa Callback ──────────────────────────
  async handleMpesaCallback(body: any) {
    const result = mpesa.parseStkCallback(body);
    logger.info('M-Pesa callback:', result);

    // Find the pending M-Pesa record
    const mpesaTx = await prisma.mpesaTransaction.findUnique({
      where: { checkoutRequestId: result.checkoutRequestId },
    });
    if (!mpesaTx) {
      logger.warn(`Unknown STK callback: ${result.checkoutRequestId}`);
      return;
    }

    await prisma.mpesaTransaction.update({
      where: { id: mpesaTx.id },
      data: {
        resultCode: result.resultCode,
        resultDesc: result.resultDesc,
        mpesaReceiptNo: result.mpesaReceiptNo,
        raw: body,
      },
    });

    if (!result.success || !mpesaTx.transactionId) return;

    // Credit wallet atomically
    await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: { userId: (await tx.transaction.findUnique({ where: { id: mpesaTx.transactionId! } }))!.userId },
      });
      if (!wallet) return;

      const transaction = await tx.transaction.findUnique({
        where: { id: mpesaTx.transactionId! },
      });
      if (!transaction || transaction.status !== 'PENDING') return;

      const newBalance = Number(wallet.balance) + Number(transaction.amount);

      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: { increment: transaction.amount },
          totalDeposited: { increment: transaction.amount },
        },
      });

      await tx.transaction.update({
        where: { id: transaction.id },
        data: {
          status: 'COMPLETED',
          externalRef: result.mpesaReceiptNo,
          balanceAfter: newBalance,
          completedAt: new Date(),
          metadata: {
            ...(transaction.metadata as object),
            mpesaReceiptNo: result.mpesaReceiptNo,
          },
        },
      });
    });

    logger.info(`Deposit completed: ${mpesaTx.transactionId}`);
  }









  
  // ─── Withdraw (B2C) ─────────────────────────────────
  async initiateWithdrawal(userId: string, phone: string, amount: number) {
    const lockKey = WALLET_LOCK_KEY(userId);
    const locked = await redis.set(lockKey, '1', 'EX', 30, 'NX');
    if (!locked) throw new AppError('Another transaction is in progress. Try again.', 409);

    try {
      const wallet = await prisma.wallet.findUnique({ where: { userId } });
      if (!wallet) throw new AppError('Wallet not found', 404);

      const fee = amount * FEE_PERCENT;
      const totalDeduction = amount + fee;

      if (Number(wallet.balance) < totalDeduction) {
        throw new AppError(`Insufficient balance. Need KES ${totalDeduction.toFixed(2)}`, 400);
      }

      // Deduct balance & lock
      await prisma.wallet.update({
        where: { userId },
        data: {
          balance: { decrement: totalDeduction },
          lockedBalance: { increment: amount },
        },
      });

      const transaction = await prisma.transaction.create({
        data: {
          userId,
          type: 'WITHDRAWAL',
          status: 'PROCESSING',
          amount,
          fee,
          balanceBefore: Number(wallet.balance),
          balanceAfter: Number(wallet.balance) - totalDeduction,
          provider: 'MPESA',
          description: 'M-Pesa withdrawal',
          metadata: { phone },
        },
      });

      // Initiate B2C
      const b2cResponse = await mpesa.b2cPayment({
        phone,
        amount,
        occasion: `Withdrawal ${transaction.id.slice(-8)}`,
      });
      /*
      await transaction.update({
        where: { id: transaction.id },
        data: { externalRef: b2cResponse.ConversationID },
      });
      */

      return { transactionId: transaction.id, message: 'Withdrawal processing. Funds will arrive shortly.' };
    } finally {
      await redis.del(lockKey);
    }
  }

  // ─── Send Money to Member ────────────────────────────
  async sendMoney(senderId: string, recipientPhone: string, amount: number, note?: string) {
    if (amount < 10) throw new AppError('Minimum transfer is KES 10', 400);

    const recipient = await prisma.user.findUnique({
      where: { phone: recipientPhone },
      include: { wallet: true },
    });
    if (!recipient) throw new AppError('Recipient not found on PesaApp', 404);
    if (recipient.id === senderId) throw new AppError('Cannot send to yourself', 400);

    const lockKey = WALLET_LOCK_KEY(senderId);
    const locked = await redis.set(lockKey, '1', 'EX', 15, 'NX');
    if (!locked) throw new AppError('Another transaction is in progress.', 409);

    try {
      const fee = amount * FEE_PERCENT;
      const totalDeduction = amount + fee;

      await prisma.$transaction(async (tx) => {
        const senderWallet = await tx.wallet.findUnique({ where: { userId: senderId } });
        if (!senderWallet) throw new AppError('Wallet not found', 404);
        if (Number(senderWallet.balance) < totalDeduction) {
          throw new AppError('Insufficient balance', 400);
        }

        // Deduct sender
        await tx.wallet.update({
          where: { userId: senderId },
          data: { balance: { decrement: totalDeduction }, totalWithdrawn: { increment: amount } },
        });

        // Credit recipient
        await tx.wallet.update({
          where: { userId: recipient.id },
          data: { balance: { increment: amount }, totalDeposited: { increment: amount } },
        });

        const ref = `SEND-${Date.now()}`;

        // Sender transaction
        await tx.transaction.create({
          data: {
            userId: senderId,
            type: 'SEND',
            status: 'COMPLETED',
            amount,
            fee,
            balanceBefore: Number(senderWallet.balance),
            balanceAfter: Number(senderWallet.balance) - totalDeduction,
            provider: 'INTERNAL',
            reference: ref,
            relatedUserId: recipient.id,
            description: note || `Sent to ${recipient.phone}`,
            completedAt: new Date(),
          },
        });

        // Recipient transaction
        await tx.transaction.create({
          data: {
            userId: recipient.id,
            type: 'RECEIVE',
            status: 'COMPLETED',
            amount,
            fee: 0,
            balanceBefore: Number(recipient.wallet!.balance),
            balanceAfter: Number(recipient.wallet!.balance) + amount,
            provider: 'INTERNAL',
            reference: `${ref}-RCV`,
            relatedUserId: senderId,
            description: note || `Received from ${senderId}`,
            completedAt: new Date(),
          },
        });
      });

      return { message: `KES ${amount} sent to ${recipient.phone} successfully.` };
    } finally {
      await redis.del(lockKey);
    }
  }

  // ─── Get Balance ─────────────────────────────────────
  async getBalance(userId: string) {
    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new AppError('Wallet not found', 404);
    return wallet;
  }

  // ─── Private helpers ──────────────────────────────────
  private async checkDailyDepositLimit(userId: string, amount: number, isVerified: boolean) {
    const limit = isVerified
      ? parseFloat(process.env.DAILY_DEPOSIT_LIMIT_VERIFIED || '300000')
      : parseFloat(process.env.DAILY_DEPOSIT_LIMIT_UNVERIFIED || '10000');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayDeposits = await prisma.transaction.aggregate({
      where: {
        userId,
        type: 'DEPOSIT',
        status: 'COMPLETED',
        createdAt: { gte: today },
      },
      _sum: { amount: true },
    });

    const todayTotal = Number(todayDeposits._sum.amount || 0) + amount;
    if (todayTotal > limit) {
      throw new AppError(
        `Daily deposit limit of KES ${limit.toLocaleString()} exceeded. ${isVerified ? '' : 'Complete KYC to increase limits.'}`,
        400
      );
    }
  }
}

export const walletService = new WalletService();
