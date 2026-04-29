import Redis from 'ioredis';
export declare let redis: Redis;
export declare function connectRedis(): Promise<void>;
export declare const redisGet: (key: string) => Promise<string | null>;
export declare const redisSet: (key: string, value: string, ttlSeconds?: number) => Promise<void>;
export declare const redisDel: (key: string) => Promise<void>;
export declare const OTP_KEY: (phone: string) => string;
export declare const OTP_ATTEMPTS_KEY: (phone: string) => string;
export declare const SESSION_KEY: (userId: string, jti: string) => string;
export declare const WALLET_LOCK_KEY: (walletId: string) => string;
export declare const RATE_LIMIT_KEY: (ip: string) => string;
//# sourceMappingURL=redis.d.ts.map