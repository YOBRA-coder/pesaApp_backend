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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const kyc_service_1 = require("../services/kyc.service");
const database_1 = require("../config/database");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
router.use(auth_middleware_1.authenticate);
router.get('/status', async (req, res, next) => {
    try {
        const { prisma } = await Promise.resolve().then(() => __importStar(require('../config/database')));
        const record = await prisma.kycRecord.findUnique({ where: { userId: req.user.id } });
        res.json({ success: true, data: record });
    }
    catch (e) {
        next(e);
    }
});
router.post('/submit', upload.fields([{ name: 'idFront', maxCount: 1 }, { name: 'idBack', maxCount: 1 }, { name: 'selfie', maxCount: 1 }]), async (req, res, next) => {
    try {
        const files = req.files;
        if (!files?.idFront?.[0] || !files?.selfie?.[0]) {
            return res.status(400).json({ success: false, message: 'ID front and selfie are required' });
        }
        const result = await kyc_service_1.kycService.submitKyc(req.user.id, {
            docType: req.body.docType, docNumber: req.body.docNumber,
            firstName: req.body.firstName, lastName: req.body.lastName,
            dateOfBirth: req.body.dateOfBirth,
            idFrontBuffer: files.idFront[0].buffer,
            idBackBuffer: files.idBack?.[0]?.buffer,
            selfieBuffer: files.selfie[0].buffer,
        });
        await database_1.prisma.user.update({
            where: { id: req.user.id },
            data: { firstName: req.body.firstName, lastName: req.body.lastName, username: req.body.username, email: req.body.email },
        });
        res.json({ success: true, message: 'KYC submitted for review. Usually approved within 24 hours.', data: result });
    }
    catch (e) {
        next(e);
    }
});
// Called by Smile Identity (no auth)
router.post('/callback', async (req, res) => {
    await kyc_service_1.kycService.handleSmileCallback(req.body);
    res.sendStatus(200);
});
exports.default = router;
//# sourceMappingURL=kyc.routes.js.map