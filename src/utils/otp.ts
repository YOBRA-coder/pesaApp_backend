import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export function generateOtp(length = 6): string {
  return crypto.randomInt(100000, 999999).toString();
}

export async function hashOtp(otp: string): Promise<string> {
  return bcrypt.hash(otp, 10);
}

export async function verifyOtpHash(otp: string, hash: string): Promise<boolean> {
  return bcrypt.compare(otp, hash);
}
