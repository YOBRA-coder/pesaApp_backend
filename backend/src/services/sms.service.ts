import AfricasTalking from 'africastalking';
import { logger } from '../utils/logger';

const at = AfricasTalking({
  username: process.env.AT_USERNAME || 'sandbox',
  apiKey: process.env.AT_API_KEY || '',
});

const sms = at.SMS;

export async function sendSms(to: string, message: string): Promise<void> {
  try {
    const formattedTo = to.startsWith('+') ? to : to.startsWith('0') ? `+254${to.slice(1)}` : `+${to}`;
    const result = await sms.send({
      to: [formattedTo],
      message,
      from: process.env.AT_SENDER_ID || 'PESAAPP',
    });
    logger.info(`SMS sent to ${formattedTo}:`, result);
  } catch (err) {
    logger.error('SMS send error:', err);
    throw new Error('Failed to send SMS');
  }
}

export async function sendOtpSms(phone: string, otp: string): Promise<void> {
  const message = `Your PesaApp verification code is: ${otp}\nValid for ${process.env.OTP_EXPIRY_MINUTES || 5} minutes.\nDo NOT share this code.`;
  await sendSms(phone, message);
}
