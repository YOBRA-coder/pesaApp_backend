import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
    phone: string;
  };
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new AppError('No token provided', 401);
    }

    const token = authHeader.split(' ')[1];
    const payload = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, phone: true, role: true, status: true },
    });

    if (!user) throw new AppError('User not found', 401);
    if (user.status === 'BANNED') throw new AppError('Account suspended', 403);

    req.user = { id: user.id, role: user.role, phone: user.phone };
    next();
  } catch (err: any) {
    if (err.name === 'JsonWebTokenError') return next(new AppError('Invalid token', 401));
    if (err.name === 'TokenExpiredError') return next(new AppError('Token expired', 401));
    next(err);
  }
};

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'ADMIN') {
    return next(new AppError('Admin access required', 403));
  }
  next();
};

export const requireKyc = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { kycStatus: true },
  });
  if (user?.kycStatus !== 'APPROVED') {
    return next(new AppError('KYC verification required to use this feature', 403));
  }
  next();
};
