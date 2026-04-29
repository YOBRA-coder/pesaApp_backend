import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

interface TokenPayload {
  userId: string;
  role: string;
  jti: string;
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, process.env.JWT_SECRET!) as TokenPayload;
}

export async function verifyRefreshToken(token: string): Promise<TokenPayload> {
  const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET!) as TokenPayload;
  const stored = await prisma.refreshToken.findUnique({ where: { token } });
  if (!stored || stored.expiresAt < new Date()) {
    throw new Error('Invalid or expired refresh token');
  }
  return payload;
}

export async function generateTokenPair(userId: string, role: string) {
  const jti = uuidv4();
const secret = process.env.JWT_SECRET;
if(!secret){
throw new Error("❌ MISSING JWT_SECRET IN PRODUCTION");
}
  const accessToken = jwt.sign(
    { userId, role, jti },
    secret,
    { expiresIn: (process.env.JWT_EXPIRES_IN || '15m' ) as any}
  );

  const refreshToken = jwt.sign(
    { userId, role, jti },
    secret,
    { expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as any}
  );

  // Persist refresh token
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  await prisma.refreshToken.create({ data: { userId, token: refreshToken, expiresAt } });

  // Clean old tokens
  await prisma.refreshToken.deleteMany({
    where: { userId, expiresAt: { lt: new Date() } },
  });

  return { accessToken, refreshToken };
}
