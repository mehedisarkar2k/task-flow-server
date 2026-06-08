import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  listTeamMembersSchema,
  teamMemberParamsSchema,
  teamMemberTasksSchema,
} from './team.validation';
import { listTeamMembers, getTeamMember, getTeamMemberTasks } from './team.controller';

const router = Router();
router.use(requireAuth);

router.get('/members', validate(listTeamMembersSchema), listTeamMembers);
router.get('/:userId', validate(teamMemberParamsSchema), getTeamMember);
router.get('/:userId/tasks', validate(teamMemberTasksSchema), getTeamMemberTasks);

export const teamRoutes = router;
