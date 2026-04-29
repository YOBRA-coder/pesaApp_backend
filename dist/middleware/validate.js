"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = void 0;
const express_validator_1 = require("express-validator");
const AppError_1 = require("../utils/AppError");
const validate = (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        const messages = errors.array().map(e => e.msg).join(', ');
        return next(new AppError_1.AppError(messages, 400));
    }
    next();
};
exports.validate = validate;
//# sourceMappingURL=validate.js.map