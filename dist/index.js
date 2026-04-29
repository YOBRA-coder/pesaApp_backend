"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const http_1 = __importDefault(require("http"));
const app_1 = __importDefault(require("./app"));
const logger_1 = require("./utils/logger");
const redis_1 = require("./config/redis");
const database_1 = require("./config/database");
const websocket_service_1 = require("./services/websocket.service");
const PORT = parseInt(process.env.PORT || '3000');
async function main() {
    try {
        // DB
        await database_1.prisma.$connect();
        logger_1.logger.info('✅ PostgreSQL connected');
        // Redis
        await (0, redis_1.connectRedis)();
        logger_1.logger.info('✅ Redis connected');
        // Create HTTP server (needed for WebSocket)
        const server = http_1.default.createServer(app_1.default);
        // WebSocket (crash game real-time)
        (0, websocket_service_1.initWebSocket)(server);
        logger_1.logger.info('✅ WebSocket server initialized');
        server.listen(PORT, () => {
            logger_1.logger.info(`🚀 PesaApp API running on port ${PORT}`);
            logger_1.logger.info(`   WS:  ws://localhost:${PORT}/ws`);
            logger_1.logger.info(`   ENV: ${process.env.NODE_ENV}`);
        });
        // Graceful shutdown
        const shutdown = async () => {
            logger_1.logger.info('Shutting down gracefully...');
            server.close();
            await database_1.prisma.$disconnect();
            process.exit(0);
        };
        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);
    }
    catch (error) {
        logger_1.logger.error('Failed to start server:', error);
        process.exit(1);
    }
}
main();
//# sourceMappingURL=index.js.map