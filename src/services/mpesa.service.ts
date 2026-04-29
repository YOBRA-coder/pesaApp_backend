import axios from 'axios';
import { logger } from '../utils/logger';

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

class MpesaService {
  private consumerKey = process.env.MPESA_CONSUMER_KEY!;
  private consumerSecret = process.env.MPESA_CONSUMER_SECRET!;
  private shortcode = process.env.MPESA_SHORTCODE!;
  private passkey = process.env.MPESA_PASSKEY!;
  private env = process.env.MPESA_ENVIRONMENT || 'sandbox';

  private get baseUrl() {
    return this.env === 'production'
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke';
  }

  private async getAccessToken(): Promise<string> {
    const credentials = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
    const response = await axios.get(
      `${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
      { headers: { Authorization: `Basic ${credentials}` } }
    );
    return response.data.access_token;
  }

  private getTimestamp(): string {
    return new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  }

  private getPassword(timestamp: string): string {
    return Buffer.from(`${this.shortcode}${this.passkey}${timestamp}`).toString('base64');
  }

  // ─── STK Push (Customer deposits money) ─────────────
  async stkPush({ phone, amount, accountRef, transactionDesc }: StkPushParams) {
    const token = await this.getAccessToken();
    const timestamp = this.getTimestamp();
    const password = this.getPassword(timestamp);

    // Format phone: 0712... -> 254712...
    const formattedPhone = phone.startsWith('0')
      ? `254${phone.slice(1)}`
      : phone.replace('+', '');

    const payload = {
      BusinessShortCode: this.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.floor(amount),
      PartyA: formattedPhone,
      PartyB: this.shortcode,
      PhoneNumber: formattedPhone,
      CallBackURL: process.env.MPESA_CALLBACK_URL,
      AccountReference: accountRef,
      TransactionDesc: transactionDesc,
    };

    const response = await axios.post(
      `${this.baseUrl}/mpesa/stkpush/v1/processrequest`,
      payload,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    logger.info(`STK Push initiated: ${response.data.CheckoutRequestID}`);
    return response.data;
  }







  
  // ─── Query STK Push status ───────────────────────────
  async queryStkPush(checkoutRequestId: string) {
    const token = await this.getAccessToken();
    const timestamp = this.getTimestamp();
    const password = this.getPassword(timestamp);

    const response = await axios.post(
      `${this.baseUrl}/mpesa/stkpushquery/v1/query`,
      {
        BusinessShortCode: this.shortcode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId,
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    return response.data;
  }

  // ─── B2C (Business pays customer - for withdrawals) ──
  async b2cPayment({ phone, amount, occasion }: B2CParams) {
    const token = await this.getAccessToken();
    const formattedPhone = phone.startsWith('0')
      ? `254${phone.slice(1)}`
      : phone.replace('+', '');

    const payload = {
      InitiatorName: process.env.MPESA_B2C_INITIATOR_NAME,
      SecurityCredential: process.env.MPESA_B2C_SECURITY_CREDENTIAL,
      CommandID: 'BusinessPayment',
      Amount: Math.floor(amount),
      PartyA: this.shortcode,
      PartyB: formattedPhone,
      Remarks: occasion,
      QueueTimeOutURL: process.env.MPESA_TIMEOUT_URL,
      ResultURL: process.env.MPESA_RESULT_URL,
      Occasion: occasion,
    };

    const response = await axios.post(
      `${this.baseUrl}/mpesa/b2c/v1/paymentrequest`,
      payload,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    logger.info(`B2C payment initiated: ${response.data.ConversationID}`);
    return response.data;
  }

  // ─── Parse STK Callback ──────────────────────────────
  parseStkCallback(body: any): {
    success: boolean;
    checkoutRequestId: string;
    mpesaReceiptNo?: string;
    amount?: number;
    phone?: string;
    resultCode: string;
    resultDesc: string;
  } {
    const stkCallback = body.Body?.stkCallback;
    const resultCode = String(stkCallback?.ResultCode);
    const checkoutRequestId = stkCallback?.CheckoutRequestID;
    const resultDesc = stkCallback?.ResultDesc;

    if (resultCode !== '0') {
      return { success: false, checkoutRequestId, resultCode, resultDesc };
    }

    const items = stkCallback?.CallbackMetadata?.Item || [];
    const get = (name: string) => items.find((i: any) => i.Name === name)?.Value;

    return {
      success: true,
      checkoutRequestId,
      mpesaReceiptNo: get('MpesaReceiptNumber'),
      amount: get('Amount'),
      phone: String(get('PhoneNumber')),
      resultCode,
      resultDesc,
    };
  }
}

export const mpesa = new MpesaService();
