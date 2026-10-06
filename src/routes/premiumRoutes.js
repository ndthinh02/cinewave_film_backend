import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { premiumPlans } from '../config/premiumPlans.js';
import { premiumStatus } from '../services/premiumPayments.js';
const router = Router();
router.get('/plans', (_, res) => res.json({ plans: premiumPlans }));
router.get('/me', auth, async (req, res, next) => {
  try { res.json(await premiumStatus(req.user.id)); } catch (error) { next(error); }
});
export default router;
