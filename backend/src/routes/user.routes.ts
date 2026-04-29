import { Router } from 'express';
import multer from 'multer';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth.middleware';
import { uploadToCloudinary } from '../services/cloudinary.service';
import { redis } from '@/config/redis';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
router.use(authenticate);

router.get('/me', async (req: any, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { wallet: true, kycRecord: { select: { status: true, rejectionReason: true, verifiedAt: true } } },
    });
    res.json({ success: true, data: user });
  } catch (e) { next(e); }
});

router.patch('/me', async (req: any, res, next) => {
  try {
    const { firstName, lastName, username, email } = req.body;
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { firstName, lastName, username, email },
    });
    res.json({ success: true, data: user });
  } catch (e) { next(e); }
});

router.post('/avatar', upload.single('avatar'), async (req: any, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No image uploaded' });
    const url = await uploadToCloudinary(req.file.buffer, `avatars/${req.user.id}`);
    await prisma.user.update({ where: { id: req.user.id }, data: { avatarUrl: url } });
    res.json({ success: true, data: { avatarUrl: url } });
  } catch (e) { next(e); }
});

// Lookup user by phone (for send money)
router.get('/lookup', async (req: any, res, next) => {
  try {
    const { phone } = req.query;
    const user = await prisma.user.findUnique({
      where: { phone: String(phone) },
      select: { id: true, phone: true, username: true, firstName: true, lastName: true, avatarUrl: true },
    });
    if (!user) return res.status(404).json({ success: false, message: 'User not found on PesaApp' });
    res.json({ success: true, data: user });
  } catch (e) { next(e); }
});

// GET /api/v1/users/online — returns list of online usernames
router.get('/online', authenticate, async (req, res, next) => {
  try {
    // Track online users in Redis sorted set
    const raw = await redis.zrange('online_users', 0, -1);
    const usernames = raw.slice(0, 50); // max 50
    res.json({ success: true, data: { usernames, count: raw.length } });
  } catch (e) { next(e); }
});

export default router;
