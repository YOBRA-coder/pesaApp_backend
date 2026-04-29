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
export declare class FlutterwaveService {
    chargeMobileMoney({ phone, amount, email, txRef, description }: MobileMoneyParams): Promise<any>;
    verifyPayment(transactionId: string): Promise<any>;
    transferToMobile({ phone, amount, narration, reference }: TransferParams): Promise<any>;
    validateWebhook(signature: string, body: any): boolean;
}
export declare const flutterwaveService: FlutterwaveService;
export {};
//# sourceMappingURL=flutterwave.service.d.ts.map