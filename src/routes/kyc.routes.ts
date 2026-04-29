import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware';
import { kycService } from '../services/kyc.service';
import { prisma } from '../config/database';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticate);

router.get('/status', async (req: any, res, next) => {
  try {
    const { prisma } = await import('../config/database');
    const record = await prisma.kycRecord.findUnique({ where: { userId: req.user.id } });
    res.json({ success: true, data: record });
  } catch (e) { next(e); }
});

router.post('/submit',
  upload.fields([{ name: 'idFront', maxCount: 1 }, { name: 'idBack', maxCount: 1 }, { name: 'selfie', maxCount: 1 }]),
  async (req: any, res, next) => {
    try {
      const files = req.files as any;
      if (!files?.idFront?.[0] || !files?.selfie?.[0]) {
        return res.status(400).json({ success: false, message: 'ID front and selfie are required' });
      }
      const result = await kycService.submitKyc(req.user.id, {
        docType: req.body.docType, docNumber: req.body.docNumber,
        firstName: req.body.firstName, lastName: req.body.lastName,
        dateOfBirth: req.body.dateOfBirth,
        idFrontBuffer: files.idFront[0].buffer,
        idBackBuffer: files.idBack?.[0]?.buffer,
        selfieBuffer: files.selfie[0].buffer,
      });
      await prisma.user.update({
        where: { id: req.user.id },
        data: { firstName: req.body.firstName, lastName: req.body.lastName, username: req.body.username, email: req.body.email },
      });
      res.json({ success: true, message: 'KYC submitted for review. Usually approved within 24 hours.', data: result });
    } catch (e) { next(e); }
  }
);

// Called by Smile Identity (no auth)
router.post('/callback', async (req, res) => {
  await kycService.handleSmileCallback(req.body);
  res.sendStatus(200);
});

export default router;
