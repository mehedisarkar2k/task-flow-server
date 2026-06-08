import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  listProjectsSchema,
  createProjectSchema,
  projectIdParamsSchema,
  updateProjectSchema,
  addMemberSchema,
  memberParamsSchema,
  updateMemberRoleSchema,
  createColumnSchema,
  updateColumnSchema,
  reorderColumnsSchema,
  deleteColumnSchema,
} from './project.validation';
import {
  listProjects,
  createProject,
  getProject,
  updateProject,
  deleteProject,
} from './project.controller';
import { listMembers, addMember, removeMember, updateMemberRole } from './member.controller';
import {
  listColumns,
  createColumn,
  updateColumn,
  reorderColumns,
  deleteColumn,
} from './column.controller';

const router = Router();

router.use(requireAuth);

// ─── Projects ──────────────────────────────────────────────────────────────
router.get('/', validate(listProjectsSchema), listProjects);
router.post('/', requireRole('ADMIN', 'PM'), validate(createProjectSchema), createProject);
router.get('/:projectId', validate(projectIdParamsSchema), getProject);
router.put('/:projectId', validate(updateProjectSchema), updateProject);
router.delete('/:projectId', validate(projectIdParamsSchema), deleteProject);

// ─── Members ───────────────────────────────────────────────────────────────
router.get('/:projectId/members', validate(projectIdParamsSchema), listMembers);
router.post('/:projectId/members', validate(addMemberSchema), addMember);
router.patch('/:projectId/members/:userId', validate(updateMemberRoleSchema), updateMemberRole);
router.delete('/:projectId/members/:userId', validate(memberParamsSchema), removeMember);

// ─── Board columns ───────────────────────────────────────────────────────────
// `/reorder` must be registered before `/:columnId` so it is not captured as an id.
router.get('/:projectId/columns', validate(projectIdParamsSchema), listColumns);
router.post('/:projectId/columns', validate(createColumnSchema), createColumn);
router.patch('/:projectId/columns/reorder', validate(reorderColumnsSchema), reorderColumns);
router.patch('/:projectId/columns/:columnId', validate(updateColumnSchema), updateColumn);
router.delete('/:projectId/columns/:columnId', validate(deleteColumnSchema), deleteColumn);

export const projectRoutes = router;
