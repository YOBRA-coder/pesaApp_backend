interface StkPushParams {
    phone: string;
    amount: number;
    accountRef: string;
    transactionDesc: string;
}
interface B2CParams {
    phone: string;
    amount: number;
    occasion: string;
}
declare class MpesaService {
    private consumerKey;
    private consumerSecret;
    private shortcode;
    private passkey;
    private env;
    private get baseUrl();
    private getAccessToken;
    private getTimestamp;
    private getPassword;
    stkPush({ phone, amount, accountRef, transactionDesc }: StkPushParams): Promise<any>;
    queryStkPush(checkoutRequestId: string): Promise<any>;
    b2cPayment({ phone, amount, occasion }: B2CParams): Promise<any>;
    parseStkCallback(body: any): {
        success: boolean;
        checkoutRequestId: string;
        mpesaReceiptNo?: string;
        amount?: number;
        phone?: string;
        resultCode: string;
        resultDesc: string;
    };
}
export declare const mpesa: MpesaService;
export {};
//# sourceMappingURL=mpesa.service.d.ts.map