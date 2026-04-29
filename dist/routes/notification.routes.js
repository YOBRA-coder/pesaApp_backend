"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../config/database");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
router.get('/', async (req, res, next) => {
    try {
        const notifs = await database_1.prisma.notification.findMany({
            where: { userId: req.user.id },
            orderBy: { createdAt: 'desc' },
            take: 30,
        });
        const unread = notifs.filter(n => !n.read).length;
        res.json({ success: true, data: { notifications: notifs, unread } });
    }
    catch (e) {
        next(e);
    }
});
router.patch('/:id/read', async (req, res, next) => {
    try {
        await database_1.prisma.notification.updateMany({ where: { id: req.params.id, userId: req.user.id }, data: { read: true } });
        res.json({ success: true });
    }
    catch (e) {
        next(e);
    }
});
router.patch('/read-all', async (req, res, next) => {
    try {
        await database_1.prisma.notification.updateMany({ where: { userId: req.user.id }, data: { read: true } });
        res.json({ success: true });
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
//# sourceMappingURL=notification.routes.js.map