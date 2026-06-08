import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  listTasksSchema,
  listProjectTasksSchema,
  createTaskSchema,
  taskIdParamsSchema,
  updateTaskSchema,
  updateTaskStatusSchema,
} from './task.validation';
import {
  listTasks,
  listProjectTasks,
  createTask,
  getTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
} from './task.controller';

// ─── /api/tasks ────────────────────────────────────────────────────────────
const router = Router();
router.use(requireAuth);

router.get('/', validate(listTasksSchema), listTasks);
router.get('/:taskId', validate(taskIdParamsSchema), getTask);
router.put('/:taskId', validate(updateTaskSchema), updateTask);
router.patch('/:taskId/status', validate(updateTaskStatusSchema), updateTaskStatus);
router.delete('/:taskId', validate(taskIdParamsSchema), deleteTask);

export const taskRoutes = router;

// ─── /api/projects/:projectId/tasks ──────────────────────────────────────────
// mergeParams so the nested router can read :projectId from the mount path.
const projectRouter = Router({ mergeParams: true });
projectRouter.use(requireAuth);

projectRouter.get('/', validate(listProjectTasksSchema), listProjectTasks);
projectRouter.post('/', validate(createTaskSchema), createTask);

export const projectTaskRoutes = projectRouter;
