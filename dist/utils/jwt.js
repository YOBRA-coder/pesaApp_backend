"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyAccessToken = verifyAccessToken;
exports.verifyRefreshToken = verifyRefreshToken;
exports.generateTokenPair = generateTokenPair;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_1 = require("../config/database");
const uuid_1 = require("uuid");
function verifyAccessToken(token) {
    return jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
}
async function verifyRefreshToken(token) {
    const payload = jsonwebtoken_1.default.verify(token, process.env.JWT_REFRESH_SECRET);
    const stored = await database_1.prisma.refreshToken.findUnique({ where: { token } });
    if (!stored || stored.expiresAt < new Date()) {
        throw new Error('Invalid or expired refresh token');
    }
    return payload;
}
async function generateTokenPair(userId, role) {
    const jti = (0, uuid_1.v4)();
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET is not defined');
    }
    const accessToken = jsonwebtoken_1.default.sign({ userId, role, jti }, secret, { expiresIn: process.env.JWT_EXPIRES_IN || '15m' });
    const refreshToken = jsonwebtoken_1.default.sign({ userId, role, jti }, secret, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' });
    // Persist refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    await database_1.prisma.refreshToken.create({ data: { userId, token: refreshToken, expiresAt } });
    // Clean old tokens
    await database_1.prisma.refreshToken.deleteMany({
        where: { userId, expiresAt: { lt: new Date() } },
    });
    return { accessToken, refreshToken };
}
//# sourceMappingURL=jwt.js.map