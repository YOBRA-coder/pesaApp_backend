import Redis from 'ioredis';
import { logger } from '../utils/logger';

export let redis: Redis;

export async function connectRedis(): Promise<void> {
  redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    password: process.env.REDIS_PASSWORD || undefined,
    retryStrategy: (times) => {
      const delay = Math.min(times * 100, 3000);
      return delay;
    },
    maxRetriesPerRequest: 3,
  });

  redis.on('connect', () => logger.info('Redis: connected'));
  redis.on('error', (err) => logger.error('Redis error:', err));
  redis.on('reconnecting', () => logger.warn('Redis: reconnecting...'));

  await redis.ping();
}

// Helper wrappers
export const redisGet = async (key: string): Promise<string | null> => {
  return redis.get(key);
};

export const redisSet = async (key: string, value: string, ttlSeconds?: number): Promise<void> => {
  if (ttlSeconds) {
    await redis.set(key, value, 'EX', ttlSeconds);
  } else {
    await redis.set(key, value);
  }
};

export const redisDel = async (key: string): Promise<void> => {
  await redis.del(key);
};

// OTP keys
export const OTP_KEY = (phone: string) => `otp:${phone}`;
export const OTP_ATTEMPTS_KEY = (phone: string) => `otp_attempts:${phone}`;
export const SESSION_KEY = (userId: string, jti: string) => `session:${userId}:${jti}`;
export const WALLET_LOCK_KEY = (walletId: string) => `wallet_lock:${walletId}`;
export const RATE_LIMIT_KEY = (ip: string) => `rate:${ip}`;
