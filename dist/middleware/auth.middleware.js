"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireKyc = exports.requireAdmin = exports.authenticate = void 0;
const jwt_1 = require("../utils/jwt");
const database_1 = require("../config/database");
const AppError_1 = require("../utils/AppError");
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            throw new AppError_1.AppError('No token provided', 401);
        }
        const token = authHeader.split(' ')[1];
        const payload = (0, jwt_1.verifyAccessToken)(token);
        const user = await database_1.prisma.user.findUnique({
            where: { id: payload.userId },
            select: { id: true, phone: true, role: true, status: true },
        });
        if (!user)
            throw new AppError_1.AppError('User not found', 401);
        if (user.status === 'BANNED')
            throw new AppError_1.AppError('Account suspended', 403);
        req.user = { id: user.id, role: user.role, phone: user.phone };
        next();
    }
    catch (err) {
        if (err.name === 'JsonWebTokenError')
            return next(new AppError_1.AppError('Invalid token', 401));
        if (err.name === 'TokenExpiredError')
            return next(new AppError_1.AppError('Token expired', 401));
        next(err);
    }
};
exports.authenticate = authenticate;
const requireAdmin = (req, res, next) => {
    if (req.user?.role !== 'ADMIN') {
        return next(new AppError_1.AppError('Admin access required', 403));
    }
    next();
};
exports.requireAdmin = requireAdmin;
const requireKyc = async (req, res, next) => {
    const user = await database_1.prisma.user.findUnique({
        where: { id: req.user.id },
        select: { kycStatus: true },
    });
    if (user?.kycStatus !== 'APPROVED') {
        return next(new AppError_1.AppError('KYC verification required to use this feature', 403));
    }
    next();
};
exports.requireKyc = requireKyc;
//# sourceMappingURL=auth.middleware.js.map