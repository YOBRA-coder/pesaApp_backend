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
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const wallet_service_1 = require("../services/wallet.service");
const flutterwave_service_1 = require("../services/flutterwave.service");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
// M-Pesa STK Push callback (called by Safaricom)
router.post('/mpesa/callback', async (req, res) => {
    try {
        await wallet_service_1.walletService.handleMpesaCallback(req.body);
    }
    catch (err) {
        logger_1.logger.error('M-Pesa callback error:', err);
    }
    // Always return 200 to Safaricom
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});
// M-Pesa B2C result (withdrawal confirmation)
router.post('/mpesa/b2c/result', async (req, res) => {
    try {
        logger_1.logger.info('B2C Result:', JSON.stringify(req.body));
        const result = req.body.Result;
        const { prisma } = await Promise.resolve().then(() => __importStar(require('../config/database')));
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
        }
        else {
            logger_1.logger.warn('B2C failed:', result.ResultDesc);
            // Refund on failure
            const { prisma } = await Promise.resolve().then(() => __importStar(require('../config/database')));
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
    }
    catch (err) {
        logger_1.logger.error('B2C result error:', err);
    }
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});
// M-Pesa timeout
router.post('/mpesa/timeout', (req, res) => {
    logger_1.logger.warn('M-Pesa timeout:', req.body);
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});
// Flutterwave webhook
router.post('/flutterwave/webhook', async (req, res) => {
    try {
        const signature = req.headers['verif-hash'];
        if (!flutterwave_service_1.flutterwaveService.validateWebhook(signature, req.body)) {
            return res.status(401).json({ error: 'Invalid signature' });
        }
        const { event, data } = req.body;
        logger_1.logger.info(`FLW webhook: ${event}`, data);
        if (event === 'charge.completed' && data.status === 'successful') {
            // Handle successful deposit via Flutterwave
            const { prisma } = await Promise.resolve().then(() => __importStar(require('../config/database')));
            await prisma.transaction.updateMany({
                where: { externalRef: data.tx_ref, status: 'PENDING' },
                data: { status: 'COMPLETED', completedAt: new Date(), metadata: data },
            });
        }
    }
    catch (err) {
        logger_1.logger.error('Flutterwave webhook error:', err);
    }
    res.sendStatus(200);
});
exports.default = router;
//# sourceMappingURL=payment.routes.js.map