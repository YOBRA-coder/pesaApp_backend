import { Decimal } from '@prisma/client/runtime/library';
export declare class WalletService {
    initiateDeposit(userId: string, phone: string, amount: number): Promise<{
        transactionId: string;
        checkoutRequestId: any;
        message: string;
    }>;
    handleMpesaCallback(body: any): Promise<void>;
    initiateWithdrawal(userId: string, phone: string, amount: number): Promise<{
        transactionId: string;
        message: string;
    }>;
    sendMoney(senderId: string, recipientPhone: string, amount: number, note?: string): Promise<{
        message: string;
    }>;
    getBalance(userId: string): Promise<{
        id: string;
        userId: string;
        createdAt: Date;
        updatedAt: Date;
        balance: Decimal;
        lockedBalance: Decimal;
        totalDeposited: Decimal;
        totalWithdrawn: Decimal;
        currency: string;
    }>;
    private checkDailyDepositLimit;
}
export declare const walletService: WalletService;
//# sourceMappingURL=wallet.service.d.ts.map