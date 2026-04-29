import Flutterwave from 'flutterwave-node-v3';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

const flw = new Flutterwave(
  process.env.FLW_PUBLIC_KEY || '',
  process.env.FLW_SECRET_KEY || ''
);

interface MobileMoneyParams {
  phone: string;
  amount: number;
  email: string;
  txRef: string;
  description?: string;
}

interface TransferParams {
  phone: string;
  amount: number;
  narration: string;
  reference: string;
}

export class FlutterwaveService {

  // ─── Initiate Mobile Money Charge (Deposit fallback) ─
  async chargeMobileMoney({ phone, amount, email, txRef, description }: MobileMoneyParams) {
    const formatted = phone.startsWith('0') ? `254${phone.slice(1)}` : phone.replace('+', '');
    const payload = {
      phone_number: formatted,
      amount,
      currency: 'KES',
      email,
      tx_ref: txRef,
      network: 'SAFARICOM', // or AIRTEL
      narration: description || 'PesaApp deposit',
      redirect_url: `${process.env.FRONTEND_URL}/wallet?status=paid`,
    };

    const response = await flw.MobileMoney.mpesa(payload);
    if (response.status !== 'success') {
      throw new AppError(`Flutterwave error: ${response.message}`, 400);
    }
    logger.info(`Flutterwave charge initiated: ${txRef}`);
    return response;
  }

  // ─── Verify Payment ───────────────────────────────────
  async verifyPayment(transactionId: string) {
    const response = await flw.Transaction.verify({ id: transactionId });
    return response;
  }

  // ─── Transfer to Mobile Money (Withdrawal fallback) ──
  async transferToMobile({ phone, amount, narration, reference }: TransferParams) {
    const formatted = phone.startsWith('0') ? `254${phone.slice(1)}` : phone.replace('+', '');
    const payload = {
      account_bank: 'MPS', // M-Pesa
      account_number: formatted,
      amount,
      narration,
      currency: 'KES',
      reference,
      callback_url: `${process.env.API_BASE_URL}/api/v1/payments/flutterwave/callback`,
    };

    const response = await flw.Transfer.initiate(payload);
    if (response.status !== 'success') {
      throw new AppError(`Transfer failed: ${response.message}`, 400);
    }
    logger.info(`FLW transfer initiated: ${reference}`);
    return response;
  }

  // ─── Validate Webhook Signature ───────────────────────
  validateWebhook(signature: string, body: any): boolean {
    const crypto = require('crypto');
    const hash = crypto
      .createHmac('sha256', process.env.FLW_WEBHOOK_SECRET || '')
      .update(JSON.stringify(body))
      .digest('hex');
    return hash === signature;
  }
}

export const flutterwaveService = new FlutterwaveService();
