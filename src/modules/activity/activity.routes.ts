import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import { listActivities } from './activity.controller';

const router = Router();
router.use(requireAuth);

router.get('/', listActivities);

export const activityRoutes = router;
