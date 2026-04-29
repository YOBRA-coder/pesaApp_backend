"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.kycService = exports.KycService = void 0;
const axios_1 = __importDefault(require("axios"));
const uuid_1 = require("uuid");
const database_1 = require("../config/database");
const AppError_1 = require("../utils/AppError");
const logger_1 = require("../utils/logger");
const cloudinary_service_1 = require("./cloudinary.service");
class KycService {
    // ─── Submit KYC Documents ────────────────────────────
    async submitKyc(userId, data) {
        const existing = await database_1.prisma.kycRecord.findUnique({ where: { userId } });
        if (existing?.status === 'APPROVED') {
            throw new AppError_1.AppError('KYC already approved', 400);
        }
        if (existing?.status === 'PENDING') {
            throw new AppError_1.AppError('KYC review in progress', 400);
        }
        // Upload images to Cloudinary
        const [idFrontUrl, selfieUrl, idBackUrl] = await Promise.all([
            (0, cloudinary_service_1.uploadToCloudinary)(data.idFrontBuffer, `kyc/${userId}/id_front`),
            (0, cloudinary_service_1.uploadToCloudinary)(data.selfieBuffer, `kyc/${userId}/selfie`),
            data.idBackBuffer
                ? (0, cloudinary_service_1.uploadToCloudinary)(data.idBackBuffer, `kyc/${userId}/id_back`)
                : Promise.resolve(null),
        ]);
        // Create/update KYC record
        const kycRecord = await database_1.prisma.kycRecord.upsert({
            where: { userId },
            create: {
                userId,
                docType: data.docType,
                docNumber: data.docNumber,
                firstName: data.firstName,
                lastName: data.lastName,
                dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
                idFrontUrl,
                idBackUrl: idBackUrl || undefined,
                selfieUrl,
                status: 'PENDING',
            },
            update: {
                docType: data.docType,
                docNumber: data.docNumber,
                firstName: data.firstName,
                lastName: data.lastName,
                dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
                idFrontUrl,
                idBackUrl: idBackUrl || undefined,
                selfieUrl,
                status: 'PENDING',
                rejectionReason: null,
            },
        });
        // Submit to Smile Identity
        const smileJobId = await this.submitToSmileIdentity({
            userId,
            docNumber: data.docNumber,
            docType: data.docType,
            firstName: data.firstName,
            lastName: data.lastName,
            idFrontUrl,
            selfieUrl,
        });
        if (smileJobId) {
            await database_1.prisma.kycRecord.update({
                where: { userId },
                data: { smileJobId },
            });
        }
        await database_1.prisma.user.update({
            where: { id: userId },
            data: { kycStatus: 'PENDING' },
        });
        return kycRecord;
    }
    // ─── Smile Identity API call ─────────────────────────
    async submitToSmileIdentity(params) {
        try {
            const partnerId = process.env.SMILE_PARTNER_ID;
            const apiKey = process.env.SMILE_API_KEY;
            if (!partnerId || !apiKey)
                return null;
            const baseUrl = process.env.SMILE_ENVIRONMENT === 'production'
                ? 'https://3eydmgh10d.execute-api.us-west-2.amazonaws.com/prod'
                : 'https://testapi.smileidentity.com/v1';
            const jobId = (0, uuid_1.v4)();
            const timestamp = new Date().toISOString();
            const signature = this.generateSmileSignature(timestamp, apiKey, partnerId);
            const response = await axios_1.default.post(`${baseUrl}/id_verification`, {
                source_sdk: 'rest_api',
                source_sdk_version: '1.0.0',
                partner_id: partnerId,
                timestamp,
                sec_key: signature,
                smile_client_id: params.userId,
                job_id: jobId,
                job_type: 6, // Document + Selfie
                country: 'KE',
                id_type: params.docType === 'NATIONAL_ID' ? 'NATIONAL_ID' : 'PASSPORT',
                id_number: params.docNumber,
                first_name: params.firstName,
                last_name: params.lastName,
                callback_url: process.env.SMILE_CALLBACK_URL,
            });
            return jobId;
        }
        catch (err) {
            logger_1.logger.error('Smile Identity submission error:', err);
            return null; // Fall back to manual review
        }
    }
    // ─── Handle Smile Callback ───────────────────────────
    async handleSmileCallback(body) {
        const { SmileJobID, ResultCode, Actions } = body;
        logger_1.logger.info(`Smile Identity callback: ${SmileJobID}, result: ${ResultCode}`);
        const kycRecord = await database_1.prisma.kycRecord.findFirst({
            where: { smileJobId: SmileJobID },
        });
        if (!kycRecord)
            return;
        const approved = ResultCode === '0810'; // Approved
        const rejected = ['0811', '0812', '0814'].includes(ResultCode);
        if (approved) {
            await this.approveKyc(kycRecord.userId);
        }
        else if (rejected) {
            await this.rejectKyc(kycRecord.userId, 'Verification failed. Please resubmit with clearer documents.');
        }
    }
    // ─── Manual Admin Approve/Reject ─────────────────────
    async approveKyc(userId) {
        await database_1.prisma.$transaction([
            database_1.prisma.kycRecord.update({
                where: { userId },
                data: { status: 'APPROVED', verifiedAt: new Date() },
            }),
            database_1.prisma.user.update({
                where: { id: userId },
                data: { kycStatus: 'APPROVED', status: 'ACTIVE' },
            }),
        ]);
        logger_1.logger.info(`KYC approved for user: ${userId}`);
    }
    async rejectKyc(userId, reason) {
        await database_1.prisma.$transaction([
            database_1.prisma.kycRecord.update({
                where: { userId },
                data: { status: 'REJECTED', rejectionReason: reason },
            }),
            database_1.prisma.user.update({
                where: { id: userId },
                data: { kycStatus: 'REJECTED' },
            }),
        ]);
    }
    generateSmileSignature(timestamp, apiKey, partnerId) {
        const crypto = require('crypto');
        return crypto
            .createHmac('sha256', apiKey)
            .update(`${timestamp}${partnerId}`)
            .digest('base64');
    }
}
exports.KycService = KycService;
exports.kycService = new KycService();
//# sourceMappingURL=kyc.service.js.map