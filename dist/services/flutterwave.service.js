"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.flutterwaveService = exports.FlutterwaveService = void 0;
//import Flutterwave from 'flutterwave-node-v3';
// Instead of: import Flutterwave from 'flutterwave-node-v3';
const Flutterwave = require('flutterwave-node-v3');
const AppError_1 = require("../utils/AppError");
const logger_1 = require("../utils/logger");
const flw = new Flutterwave(process.env.FLW_PUBLIC_KEY || '', process.env.FLW_SECRET_KEY || '');
class FlutterwaveService {
    // ─── Initiate Mobile Money Charge (Deposit fallback) ─
    async chargeMobileMoney({ phone, amount, email, txRef, description }) {
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
            throw new AppError_1.AppError(`Flutterwave error: ${response.message}`, 400);
        }
        logger_1.logger.info(`Flutterwave charge initiated: ${txRef}`);
        return response;
    }
    // ─── Verify Payment ───────────────────────────────────
    async verifyPayment(transactionId) {
        const response = await flw.Transaction.verify({ id: transactionId });
        return response;
    }
    // ─── Transfer to Mobile Money (Withdrawal fallback) ──
    async transferToMobile({ phone, amount, narration, reference }) {
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
            throw new AppError_1.AppError(`Transfer failed: ${response.message}`, 400);
        }
        logger_1.logger.info(`FLW transfer initiated: ${reference}`);
        return response;
    }
    // ─── Validate Webhook Signature ───────────────────────
    validateWebhook(signature, body) {
        const crypto = require('crypto');
        const hash = crypto
            .createHmac('sha256', process.env.FLW_WEBHOOK_SECRET || '')
            .update(JSON.stringify(body))
            .digest('hex');
        return hash === signature;
    }
}
exports.FlutterwaveService = FlutterwaveService;
exports.flutterwaveService = new FlutterwaveService();
//# sourceMappingURL=flutterwave.service.js.map