import 'dotenv/config';
import http from 'http';
import app from './app';
import { logger } from './utils/logger';
import { connectRedis } from './config/redis';
import { prisma } from './config/database';
import { initWebSocket } from './services/websocket.service';

const PORT = parseInt(process.env.PORT || '3000');

async function main() {
  try {
    // DB
    await prisma.$connect();
    logger.info('✅ PostgreSQL connected');

    // Redis
    await connectRedis();
    logger.info('✅ Redis connected');

    // Create HTTP server (needed for WebSocket)
    const server = http.createServer(app);

    // WebSocket (crash game real-time)
    initWebSocket(server);
    logger.info('✅ WebSocket server initialized');

    server.listen(PORT, () => {
      logger.info(`🚀 PesaApp API running on port ${PORT}`);
      logger.info(`   WS:  ws://localhost:${PORT}/ws`);
      logger.info(`   ENV: ${process.env.NODE_ENV}`);
    });

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down gracefully...');
      server.close();
      await prisma.$disconnect();
      process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
