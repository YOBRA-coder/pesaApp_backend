"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const adminAuth_routes_1 = __importDefault(require("./routes/adminAuth.routes"));
const game_routes_1 = __importDefault(require("./routes/game.routes"));
const errorHandler_1 = require("./middleware/errorHandler");
const notFound_1 = require("./middleware/notFound");
// Routes
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const user_routes_1 = __importDefault(require("./routes/user.routes"));
const wallet_routes_1 = __importDefault(require("./routes/wallet.routes"));
const payment_routes_1 = __importDefault(require("./routes/payment.routes"));
const kyc_routes_1 = __importDefault(require("./routes/kyc.routes"));
const signal_routes_1 = __importDefault(require("./routes/signal.routes"));
const bill_routes_1 = __importDefault(require("./routes/bill.routes"));
const referral_routes_1 = __importDefault(require("./routes/referral.routes"));
const notification_routes_1 = __importDefault(require("./routes/notification.routes"));
const admin_routes_1 = __importDefault(require("./routes/admin.routes"));
const adminRevenue_routes_1 = __importDefault(require("./routes/adminRevenue.routes"));
const sports_routes_1 = __importDefault(require("./routes/sports.routes"));
const app = (0, express_1.default)();
// ─── Security ───────────────────────────────────────
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: [
        'http://localhost:5173',
        'https://3cfb-102-207-163-35.ngrok-free.app' // Add your current frontend ngrok URL here
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
}));
// ─── Rate Limiting ───────────────────────────────────
const globalLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 300, //300 requests per 15 min per IP
    message: { success: false, message: 'Too many requests, please try again later.' },
});
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 100, // 10 OTP requests per 15 min
    message: { success: false, message: 'Too many auth attempts.' },
});
app.use(globalLimiter);
// ─── Body Parsing ────────────────────────────────────
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
// ─── Logging ─────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
    app.use((0, morgan_1.default)('combined'));
}
// ─── Health Check ────────────────────────────────────
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'pesaapp-api' });
});
// ─── API Routes ──────────────────────────────────────
const API = '/api/v1';
app.use(`${API}/auth`, authLimiter, auth_routes_1.default);
app.use(`${API}/auth/admin`, adminAuth_routes_1.default);
app.use(`${API}/users`, user_routes_1.default);
app.use(`${API}/wallet`, wallet_routes_1.default);
app.use(`${API}/payments`, payment_routes_1.default);
app.use(`${API}/kyc`, kyc_routes_1.default);
app.use(`${API}/games`, game_routes_1.default);
app.use(`${API}/signals`, signal_routes_1.default);
app.use(`${API}/sports`, sports_routes_1.default);
app.use(`${API}/bills`, bill_routes_1.default);
app.use(`${API}/referrals`, referral_routes_1.default);
app.use(`${API}/notifications`, notification_routes_1.default);
app.use(`${API}/admin`, admin_routes_1.default);
app.use(`${API}/admin`, adminRevenue_routes_1.default); // add to existing admin routes
// ─── Error Handling ──────────────────────────────────
app.use(notFound_1.notFound);
app.use(errorHandler_1.errorHandler);
exports.default = app;
//# sourceMappingURL=app.js.map