export declare class KycService {
    submitKyc(userId: string, data: {
        docType: 'NATIONAL_ID' | 'PASSPORT' | 'DRIVING_LICENSE';
        docNumber: string;
        firstName: string;
        lastName: string;
        dateOfBirth?: string;
        idFrontBuffer: Buffer;
        idBackBuffer?: Buffer;
        selfieBuffer: Buffer;
    }): Promise<{
        id: string;
        userId: string;
        createdAt: Date;
        firstName: string;
        lastName: string;
        status: import(".prisma/client").$Enums.KycStatus;
        updatedAt: Date;
        docType: import(".prisma/client").$Enums.KycDocType;
        docNumber: string;
        dateOfBirth: Date | null;
        idFrontUrl: string | null;
        idBackUrl: string | null;
        selfieUrl: string | null;
        smileJobId: string | null;
        smileResult: import("@prisma/client/runtime/library").JsonValue | null;
        rejectionReason: string | null;
        verifiedAt: Date | null;
    }>;
    private submitToSmileIdentity;
    handleSmileCallback(body: any): Promise<void>;
    approveKyc(userId: string): Promise<void>;
    rejectKyc(userId: string, reason: string): Promise<void>;
    private generateSmileSignature;
}
export declare const kycService: KycService;
//# sourceMappingURL=kyc.service.d.ts.map