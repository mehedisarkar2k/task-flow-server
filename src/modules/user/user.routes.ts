import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { listUsersSchema, changeUserRoleSchema, searchUsersSchema } from './user.validation';
import { listUsers, changeUserRole, searchUsers } from './user.controller';

const router = Router();
router.use(requireAuth);

// Search is available to any authenticated user (member pickers, @mentions).
router.get('/search', validate(searchUsersSchema), searchUsers);

// System administration — admin only.
router.get('/', requireRole('ADMIN'), validate(listUsersSchema), listUsers);
router.patch('/:userId/role', requireRole('ADMIN'), validate(changeUserRoleSchema), changeUserRole);

export const userRoutes = router;
