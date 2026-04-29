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
const express_validator_1 = require("express-validator");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_1 = require("../middleware/validate");
const wallet_service_1 = require("../services/wallet.service");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
// GET /api/v1/wallet/balance
router.get('/balance', async (req, res, next) => {
    try {
        const wallet = await wallet_service_1.walletService.getBalance(req.user.id);
        res.json({ success: true, data: wallet });
    }
    catch (e) {
        next(e);
    }
});
// GET /api/v1/wallet/transactions
router.get('/transactions', async (req, res, next) => {
    try {
        const { page = 1, limit = 20, type } = req.query;
        const { prisma } = await Promise.resolve().then(() => __importStar(require('../config/database')));
        const where = { userId: req.user.id };
        if (type)
            where.type = type;
        const [txs, total] = await Promise.all([
            prisma.transaction.findMany({
                where, orderBy: { createdAt: 'desc' },
                skip: (Number(page) - 1) * Number(limit),
                take: Number(limit),
            }),
            prisma.transaction.count({ where }),
        ]);
        res.json({ success: true, data: { transactions: txs, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) } });
    }
    catch (e) {
        next(e);
    }
});
// POST /api/v1/wallet/deposit
router.post('/deposit', (0, express_validator_1.body)('phone').isMobilePhone('any'), (0, express_validator_1.body)('amount').isFloat({ min: 100 }), validate_1.validate, async (req, res, next) => {
    try {
        const result = await wallet_service_1.walletService.initiateDeposit(req.user.id, req.body.phone, req.body.amount);
        res.json({ success: true, data: result });
    }
    catch (e) {
        next(e);
    }
});
// POST /api/v1/wallet/withdraw
router.post('/withdraw', (0, express_validator_1.body)('phone').isMobilePhone('any'), (0, express_validator_1.body)('amount').isFloat({ min: 100 }), validate_1.validate, async (req, res, next) => {
    try {
        const result = await wallet_service_1.walletService.initiateWithdrawal(req.user.id, req.body.phone, req.body.amount);
        res.json({ success: true, data: result });
    }
    catch (e) {
        next(e);
    }
});
// POST /api/v1/wallet/send
router.post('/send', (0, express_validator_1.body)('recipientPhone').isMobilePhone('any'), (0, express_validator_1.body)('amount').isFloat({ min: 10 }), validate_1.validate, async (req, res, next) => {
    try {
        const result = await wallet_service_1.walletService.sendMoney(req.user.id, req.body.recipientPhone, req.body.amount, req.body.note);
        res.json({ success: true, data: result });
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
//# sourceMappingURL=wallet.routes.js.map