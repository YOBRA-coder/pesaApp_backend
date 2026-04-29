export declare class BillService {
    payBill(userId: string, billType: string, accountNumber: string, amount: number): Promise<{
        success: boolean;
        message: string;
        reference: string;
    }>;
    buyAirtime(userId: string, phone: string, amount: number, network: string): Promise<{
        success: boolean;
        message: string;
        reference: string;
    }>;
    private sendAirtimeViaAT;
    private processExternalBillPayment;
    private getFee;
    private getSuccessMessage;
}
export declare const billService: BillService;
//# sourceMappingURL=bill.service.d.ts.map