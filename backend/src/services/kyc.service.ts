import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { uploadToCloudinary } from './cloudinary.service';

export class KycService {

  // ─── Submit KYC Documents ────────────────────────────
  async submitKyc(
    userId: string,
    data: {
      docType: 'NATIONAL_ID' | 'PASSPORT' | 'DRIVING_LICENSE';
      docNumber: string;
      firstName: string;
      lastName: string;
      dateOfBirth?: string;
      idFrontBuffer: Buffer;
      idBackBuffer?: Buffer;
      selfieBuffer: Buffer;
    }
  ) {
    const existing = await prisma.kycRecord.findUnique({ where: { userId } });
    if (existing?.status === 'APPROVED') {
      throw new AppError('KYC already approved', 400);
    }
    if (existing?.status === 'PENDING') {
      throw new AppError('KYC review in progress', 400);
    }

    // Upload images to Cloudinary
    const [idFrontUrl, selfieUrl, idBackUrl] = await Promise.all([
      uploadToCloudinary(data.idFrontBuffer, `kyc/${userId}/id_front`),
      uploadToCloudinary(data.selfieBuffer, `kyc/${userId}/selfie`),
      data.idBackBuffer
        ? uploadToCloudinary(data.idBackBuffer, `kyc/${userId}/id_back`)
        : Promise.resolve(null),
    ]);

    // Create/update KYC record
    const kycRecord = await prisma.kycRecord.upsert({
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
      await prisma.kycRecord.update({
        where: { userId },
        data: { smileJobId },
      });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { kycStatus: 'PENDING' },
    });

    return kycRecord;
  }

  // ─── Smile Identity API call ─────────────────────────
  private async submitToSmileIdentity(params: {
    userId: string;
    docNumber: string;
    docType: string;
    firstName: string;
    lastName: string;
    idFrontUrl: string;
    selfieUrl: string;
  }): Promise<string | null> {
    try {
      const partnerId = process.env.SMILE_PARTNER_ID;
      const apiKey = process.env.SMILE_API_KEY;
      if (!partnerId || !apiKey) return null;

      const baseUrl = process.env.SMILE_ENVIRONMENT === 'production'
        ? 'https://3eydmgh10d.execute-api.us-west-2.amazonaws.com/prod'
        : 'https://testapi.smileidentity.com/v1';

      const jobId = uuidv4();
      const timestamp = new Date().toISOString();
      const signature = this.generateSmileSignature(timestamp, apiKey, partnerId);

      const response = await axios.post(`${baseUrl}/id_verification`, {
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
    } catch (err) {
      logger.error('Smile Identity submission error:', err);
      return null; // Fall back to manual review
    }
  }

  // ─── Handle Smile Callback ───────────────────────────
  async handleSmileCallback(body: any) {
    const { SmileJobID, ResultCode, Actions } = body;
    logger.info(`Smile Identity callback: ${SmileJobID}, result: ${ResultCode}`);

    const kycRecord = await prisma.kycRecord.findFirst({
      where: { smileJobId: SmileJobID },
    });
    if (!kycRecord) return;

    const approved = ResultCode === '0810'; // Approved
    const rejected = ['0811', '0812', '0814'].includes(ResultCode);

    if (approved) {
      await this.approveKyc(kycRecord.userId);
    } else if (rejected) {
      await this.rejectKyc(kycRecord.userId, 'Verification failed. Please resubmit with clearer documents.');
    }
  }

  // ─── Manual Admin Approve/Reject ─────────────────────
  async approveKyc(userId: string) {
    await prisma.$transaction([
      prisma.kycRecord.update({
        where: { userId },
        data: { status: 'APPROVED', verifiedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { kycStatus: 'APPROVED', status: 'ACTIVE' },
      }),
    ]);
    logger.info(`KYC approved for user: ${userId}`);
  }

  async rejectKyc(userId: string, reason: string) {
    await prisma.$transaction([
      prisma.kycRecord.update({
        where: { userId },
        data: { status: 'REJECTED', rejectionReason: reason },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { kycStatus: 'REJECTED' },
      }),
    ]);
  }

  private generateSmileSignature(timestamp: string, apiKey: string, partnerId: string): string {
    const crypto = require('crypto');
    return crypto
      .createHmac('sha256', apiKey)
      .update(`${timestamp}${partnerId}`)
      .digest('base64');
  }
}

export const kycService = new KycService();
