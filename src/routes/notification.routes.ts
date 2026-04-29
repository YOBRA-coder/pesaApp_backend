import { Router } from 'express';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
router.use(authenticate);

router.get('/', async (req: any, res, next) => {
  try {
    const notifs = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    const unread = notifs.filter(n => !n.read).length;
    res.json({ success: true, data: { notifications: notifs, unread } });
  } catch (e) { next(e); }
});

router.patch('/:id/read', async (req: any, res, next) => {
  try {
    await prisma.notification.updateMany({ where: { id: req.params.id, userId: req.user.id }, data: { read: true } });
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.patch('/read-all', async (req: any, res, next) => {
  try {
    await prisma.notification.updateMany({ where: { userId: req.user.id }, data: { read: true } });
    res.json({ success: true });
  } catch (e) { next(e); }
});

export default router;
