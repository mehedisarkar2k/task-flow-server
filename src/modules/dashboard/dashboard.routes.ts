import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import { dashboardStats } from './dashboard.controller';

const router = Router();
router.use(requireAuth);

router.get('/stats', dashboardStats);

export const dashboardRoutes = router;
