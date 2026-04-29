import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { billService } from '../services/bill.service';

const router = Router();
router.use(authenticate);

router.post('/pay', async (req: any, res, next) => {
  try {
    const result = await billService.payBill(req.user.id, req.body.billType, req.body.accountNumber, Number(req.body.amount));
    res.json({ success: true, data: result });
  } catch (e) { next(e); }
});

router.post('/airtime', async (req: any, res, next) => {
  try {
    const result = await billService.buyAirtime(req.user.id, req.body.phone, Number(req.body.amount), req.body.network);
    res.json({ success: true, data: result });
  } catch (e) { next(e); }
});

export default router;
