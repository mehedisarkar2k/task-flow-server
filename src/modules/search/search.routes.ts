import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { globalSearchSchema } from './search.validation';
import { globalSearch } from './search.controller';

const router = Router();
router.use(requireAuth);

router.get('/', validate(globalSearchSchema), globalSearch);

export const searchRoutes = router;
