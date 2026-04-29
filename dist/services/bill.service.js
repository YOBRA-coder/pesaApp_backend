"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.billService = exports.BillService = void 0;
const database_1 = require("../config/database");
const AppError_1 = require("../utils/AppError");
const logger_1 = require("../utils/logger");
// In production, integrate with: Africa's Talking Airtime API,
// KPLC API, or a third-party aggregator like PesaLink/Craft Silicon
class BillService {
    async payBill(userId, billType, accountNumber, amount) {
        const wallet = await database_1.prisma.wallet.findUnique({ where: { userId } });
        if (!wallet)
            throw new AppError_1.AppError('Wallet not found', 404);
        if (Number(wallet.balance) < amount)
            throw new AppError_1.AppError('Insufficient balance', 400);
        const fee = this.getFee(billType, amount);
        const total = amount + fee;
        if (Number(wallet.balance) < total)
            throw new AppError_1.AppError('Insufficient balance (including fee)', 400);
        // Process the actual bill payment (placeholder — integrate real API per provider)
        const externalRef = await this.processExternalBillPayment(billType, accountNumber, amount);
        await database_1.prisma.$transaction(async (tx) => {
            await tx.wallet.update({
                where: { userId },
                data: { balance: { decrement: total } },
            });
            await tx.transaction.create({
                data: {
                    userId,
                    type: 'BILL_PAYMENT',
                    status: 'COMPLETED',
                    amount: total,
                    fee,
                    balanceBefore: Number(wallet.balance),
                    balanceAfter: Number(wallet.balance) - total,
                    provider: 'INTERNAL',
                    externalRef,
                    description: `${billType} - ${accountNumber}`,
                    metadata: { billType, accountNumber, amountPaid: amount },
                    completedAt: new Date(),
                },
            });
        });
        return {
            success: true,
            message: this.getSuccessMessage(billType, accountNumber, amount),
            reference: externalRef,
        };
    }
    async buyAirtime(userId, phone, amount, network) {
        if (amount < 5 || amount > 10000)
            throw new AppError_1.AppError('Airtime amount must be KES 5 - 10,000', 400);
        const wallet = await database_1.prisma.wallet.findUnique({ where: { userId } });
        if (!wallet)
            throw new AppError_1.AppError('Wallet not found', 404);
        if (Number(wallet.balance) < amount)
            throw new AppError_1.AppError('Insufficient balance', 400);
        // Africa's Talking Airtime API
        const externalRef = await this.sendAirtimeViaAT(phone, amount, network);
        await database_1.prisma.$transaction(async (tx) => {
            await tx.wallet.update({
                where: { userId },
                data: { balance: { decrement: amount } },
            });
            await tx.transaction.create({
                data: {
                    userId,
                    type: 'AIRTIME_PURCHASE',
                    status: 'COMPLETED',
                    amount,
                    fee: 0,
                    balanceBefore: Number(wallet.balance),
                    balanceAfter: Number(wallet.balance) - amount,
                    provider: 'INTERNAL',
                    externalRef,
                    description: `${network} airtime - ${phone}`,
                    metadata: { phone, network },
                    completedAt: new Date(),
                },
            });
        });
        return { success: true, message: `KES ${amount} airtime sent to ${phone}`, reference: externalRef };
    }
    async sendAirtimeViaAT(phone, amount, network) {
        try {
            const AfricasTalking = require('africastalking');
            const at = AfricasTalking({ username: process.env.AT_USERNAME, apiKey: process.env.AT_API_KEY });
            const formatted = phone.startsWith('0') ? `+254${phone.slice(1)}` : phone;
            const response = await at.AIRTIME.send({
                recipients: [{ phoneNumber: formatted, currencyCode: 'KES', amount }],
            });
            logger_1.logger.info('AT Airtime response:', response);
            return response.responses?.[0]?.requestId || `AT-${Date.now()}`;
        }
        catch (err) {
            logger_1.logger.error('Airtime send error:', err);
            throw new AppError_1.AppError('Failed to send airtime. Try again.', 500);
        }
    }
    async processExternalBillPayment(billType, accountNumber, amount) {
        // TODO: Integrate per-provider APIs
        // KPLC: https://ke.prepaid-bills.com or Safaricom Paybill 888880
        // Water: Nairobi Water Paybill 444700
        // For now, simulate with M-Pesa paybill codes
        logger_1.logger.info(`Processing ${billType} payment for account ${accountNumber}, amount KES ${amount}`);
        return `BILL-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    }
    getFee(billType, amount) {
        // Small platform fee per bill type
        const fees = {
            KPLC_PREPAID: 20,
            KPLC_POSTPAID: 20,
            WATER_NAIROBI: 15,
            WATER_MOMBASA: 15,
            DSTV: 30,
            GOTV: 20,
            STARTIMES: 15,
            NETFLIX: 50,
        };
        return fees[billType] || 20;
    }
    getSuccessMessage(billType, accountNumber, amount) {
        const messages = {
            KPLC_PREPAID: `KPLC token for meter ${accountNumber} sent to your phone`,
            KPLC_POSTPAID: `KPLC postpaid bill for account ${accountNumber} paid`,
            WATER_NAIROBI: `Water bill for account ${accountNumber} paid`,
            AIRTIME_SAFARICOM: `Safaricom airtime KES ${amount} sent`,
        };
        return messages[billType] || `${billType} payment of KES ${amount} processed successfully`;
    }
}
exports.BillService = BillService;
exports.billService = new BillService();
//# sourceMappingURL=bill.service.js.map