"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// ═══════════════════════════════════════════════════════════
// backend/src/routes/adminAuth.routes.ts
// ═══════════════════════════════════════════════════════════
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const validate_1 = require("../middleware/validate");
const adminAuth_controller_1 = require("../controllers/adminAuth.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const adminAuthRouter = (0, express_1.Router)();
const strictLimit = (0, express_rate_limit_1.default)({ windowMs: 15 * 60 * 1000, max: 10 });
// Admin login (step 1: password)
adminAuthRouter.post('/login', strictLimit, (0, express_validator_1.body)('phone').isMobilePhone('any'), (0, express_validator_1.body)('password').isLength({ min: 8 }), validate_1.validate, adminAuth_controller_1.adminLogin);
// Admin login (step 2: 2FA OTP)
adminAuthRouter.post('/verify-2fa', strictLimit, (0, express_validator_1.body)('phone').isMobilePhone('any'), (0, express_validator_1.body)('otp').isLength({ min: 6, max: 6 }).isNumeric(), validate_1.validate, adminAuth_controller_1.adminVerify2FA);
// Setup password (first-time)
adminAuthRouter.post('/setup-password', (0, express_validator_1.body)('phone').isMobilePhone('any'), (0, express_validator_1.body)('otp').isLength({ min: 6, max: 8 }).isNumeric(), (0, express_validator_1.body)('password').isLength({ min: 8 }), validate_1.validate, adminAuth_controller_1.adminSetupPassword);
// Invite staff (admin only)
adminAuthRouter.post('/invite', auth_middleware_1.authenticate, auth_middleware_1.requireAdmin, (0, express_validator_1.body)('phone').isMobilePhone('any'), (0, express_validator_1.body)('role').isIn(['ADMIN', 'AGENT']), (0, express_validator_1.body)('firstName').isLength({ min: 2 }), validate_1.validate, adminAuth_controller_1.inviteStaff);
// List staff (admin only)
adminAuthRouter.get('/staff', auth_middleware_1.authenticate, auth_middleware_1.requireAdmin, adminAuth_controller_1.listStaff);
exports.default = adminAuthRouter;
//# sourceMappingURL=adminAuth.routes.js.map