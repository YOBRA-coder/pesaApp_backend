import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma = globalThis.__prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? [{ emit: 'event', level: 'query' }, 'error', 'warn']
    : ['error'],
});

if (process.env.NODE_ENV === 'development') {
  (prisma as any).$on('query', (e: any) => {
    if (process.env.LOG_QUERIES === 'true') {
      logger.debug(`Query: ${e.query} | Duration: ${e.duration}ms`);
    }
  });
  globalThis.__prisma = prisma;
}
