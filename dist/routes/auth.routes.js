"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// ─── auth.routes.ts ──────────────────────────────────────
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_controller_1 = require("../controllers/auth.controller");
const validate_1 = require("../middleware/validate");
const router = (0, express_1.Router)();
router.post('/request-otp', (0, express_validator_1.body)('phone').isMobilePhone('any').withMessage('Valid phone required'), validate_1.validate, auth_controller_1.requestOtp);
router.post('/verify-otp', (0, express_validator_1.body)('phone').isMobilePhone('any'), (0, express_validator_1.body)('otp').isLength({ min: 6, max: 6 }).isNumeric(), validate_1.validate, auth_controller_1.verifyOtp);
router.post('/refresh', auth_controller_1.refreshTokens);
router.post('/logout', auth_controller_1.logout);
exports.default = router;
//# sourceMappingURL=auth.routes.js.map