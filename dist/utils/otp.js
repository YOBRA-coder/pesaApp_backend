"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateOtp = generateOtp;
exports.hashOtp = hashOtp;
exports.verifyOtpHash = verifyOtpHash;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = __importDefault(require("crypto"));
function generateOtp(length = 6) {
    return crypto_1.default.randomInt(100000, 999999).toString();
}
async function hashOtp(otp) {
    return bcryptjs_1.default.hash(otp, 10);
}
async function verifyOtpHash(otp, hash) {
    return bcryptjs_1.default.compare(otp, hash);
}
//# sourceMappingURL=otp.js.map