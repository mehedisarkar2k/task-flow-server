import { Router } from 'express';
import { optionalAuth } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { chat } from './assistant.controller';
import { chatSchema } from './assistant.validation';

const router = Router();
router.use(optionalAuth);

router.post('/chat', validate(chatSchema), chat);

export const assistantRoutes = router;
