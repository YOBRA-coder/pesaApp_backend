"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
const logger_1 = require("../utils/logger");
exports.prisma = globalThis.__prisma ?? new client_1.PrismaClient({
    log: process.env.NODE_ENV === 'development'
        ? [{ emit: 'event', level: 'query' }, 'error', 'warn']
        : ['error'],
});
if (process.env.NODE_ENV === 'development') {
    exports.prisma.$on('query', (e) => {
        if (process.env.LOG_QUERIES === 'true') {
            logger_1.logger.debug(`Query: ${e.query} | Duration: ${e.duration}ms`);
        }
    });
    globalThis.__prisma = exports.prisma;
}
//# sourceMappingURL=database.js.map