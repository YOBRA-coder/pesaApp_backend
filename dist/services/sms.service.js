"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendSms = sendSms;
exports.sendOtpSms = sendOtpSms;
const africastalking_1 = __importDefault(require("africastalking"));
const logger_1 = require("../utils/logger");
const at = (0, africastalking_1.default)({
    username: process.env.AT_USERNAME || 'sandbox',
    apiKey: process.env.AT_API_KEY || '',
});
const sms = at.SMS;
async function sendSms(to, message) {
    try {
        const formattedTo = to.startsWith('+') ? to : to.startsWith('0') ? `+254${to.slice(1)}` : `+${to}`;
        const result = await sms.send({
            to: [formattedTo],
            message,
            from: process.env.AT_SENDER_ID || 'PESAAPP',
        });
        logger_1.logger.info(`SMS sent to ${formattedTo}:`, result);
    }
    catch (err) {
        logger_1.logger.error('SMS send error:', err);
        throw new Error('Failed to send SMS');
    }
}
async function sendOtpSms(phone, otp) {
    const message = `Your PesaApp verification code is: ${otp}\nValid for ${process.env.OTP_EXPIRY_MINUTES || 5} minutes.\nDo NOT share this code.`;
    await sendSms(phone, message);
}
//# sourceMappingURL=sms.service.js.map