import { Router } from 'express';
import { getSystemConfig } from './config.controller';

const router = Router();

router.get('/', getSystemConfig);

export const configRoutes = router;
