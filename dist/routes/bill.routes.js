"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const bill_service_1 = require("../services/bill.service");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
router.post('/pay', async (req, res, next) => {
    try {
        const result = await bill_service_1.billService.payBill(req.user.id, req.body.billType, req.body.accountNumber, Number(req.body.amount));
        res.json({ success: true, data: result });
    }
    catch (e) {
        next(e);
    }
});
router.post('/airtime', async (req, res, next) => {
    try {
        const result = await bill_service_1.billService.buyAirtime(req.user.id, req.body.phone, Number(req.body.amount), req.body.network);
        res.json({ success: true, data: result });
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
//# sourceMappingURL=bill.routes.js.map