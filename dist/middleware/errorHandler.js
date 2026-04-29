"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFound = exports.errorHandler = void 0;
const logger_1 = require("../utils/logger");
const errorHandler = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    if (process.env.NODE_ENV === 'development') {
        logger_1.logger.error(err);
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
    logger_1.logger.error('UNHANDLED ERROR:', err);
    return res.status(500).json({
        success: false,
        message: 'Something went wrong. Please try again.',
    });
};
exports.errorHandler = errorHandler;
const notFound = (req, res) => {
    res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
};
exports.notFound = notFound;
//# sourceMappingURL=errorHandler.js.map