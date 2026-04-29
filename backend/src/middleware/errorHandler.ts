import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  err.statusCode = err.statusCode || 500;

  if (process.env.NODE_ENV === 'development') {
    logger.error(err);
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      stack: err.stack,
    });
  }

  // Production: only send operational errors to client
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
  }

  // Unknown error — don't leak details
  logger.error('UNHANDLED ERROR:', err);
  return res.status(500).json({
    success: false,
    message: 'Something went wrong. Please try again.',
  });
};

export const notFound = (req: Request, res: Response) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
};
