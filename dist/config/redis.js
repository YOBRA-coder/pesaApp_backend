"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RATE_LIMIT_KEY = exports.WALLET_LOCK_KEY = exports.SESSION_KEY = exports.OTP_ATTEMPTS_KEY = exports.OTP_KEY = exports.redisDel = exports.redisSet = exports.redisGet = exports.redis = void 0;
exports.connectRedis = connectRedis;
const ioredis_1 = __importDefault(require("ioredis"));
const logger_1 = require("../utils/logger");
async function connectRedis() {
    exports.redis = new ioredis_1.default(process.env.REDIS_URL || 'redis://localhost:6379', {
        password: process.env.REDIS_PASSWORD || undefined,
        retryStrategy: (times) => {
            const delay = Math.min(times * 100, 3000);
            return delay;
        },
        maxRetriesPerRequest: 3,
    });
    exports.redis.on('connect', () => logger_1.logger.info('Redis: connected'));
    exports.redis.on('error', (err) => logger_1.logger.error('Redis error:', err));
    exports.redis.on('reconnecting', () => logger_1.logger.warn('Redis: reconnecting...'));
    await exports.redis.ping();
}
// Helper wrappers
const redisGet = async (key) => {
    return exports.redis.get(key);
};
exports.redisGet = redisGet;
const redisSet = async (key, value, ttlSeconds) => {
    if (ttlSeconds) {
        await exports.redis.set(key, value, 'EX', ttlSeconds);
    }
    else {
        await exports.redis.set(key, value);
    }
};
exports.redisSet = redisSet;
const redisDel = async (key) => {
    await exports.redis.del(key);
};
exports.redisDel = redisDel;
// OTP keys
const OTP_KEY = (phone) => `otp:${phone}`;
exports.OTP_KEY = OTP_KEY;
const OTP_ATTEMPTS_KEY = (phone) => `otp_attempts:${phone}`;
exports.OTP_ATTEMPTS_KEY = OTP_ATTEMPTS_KEY;
const SESSION_KEY = (userId, jti) => `session:${userId}:${jti}`;
exports.SESSION_KEY = SESSION_KEY;
const WALLET_LOCK_KEY = (walletId) => `wallet_lock:${walletId}`;
exports.WALLET_LOCK_KEY = WALLET_LOCK_KEY;
const RATE_LIMIT_KEY = (ip) => `rate:${ip}`;
exports.RATE_LIMIT_KEY = RATE_LIMIT_KEY;
//# sourceMappingURL=redis.js.map