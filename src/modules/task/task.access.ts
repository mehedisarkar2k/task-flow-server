import type { Prisma } from '../../../generated/prisma';
import { prisma } from '../../config/prisma';
import { ForbiddenError, NotFoundError } from '../../shared/errors/custom-errors';

interface SessionUser {
  id: string;
  role?: 'ADMIN' | 'PM' | 'MEMBER' | null;
}

/**
 * Prisma `where` fragment scoping a task query to projects the user can access:
 *   - ADMIN  → all tasks
 *   - others → tasks in projects they created or are a member of
 * Soft-deleted tasks are always excluded.
 */
export const buildTaskScopeWhere = (user: SessionUser): Prisma.TaskWhereInput => {
  const base: Prisma.TaskWhereInput = { deletedAt: null };

  if (user.role === 'ADMIN') return base;

  return {
    ...base,
    project: {
      deletedAt: null,
      OR: [{ createdBy: user.id }, { members: { some: { userId: user.id } } }],
    },
  };
};

/** Task with its assignee ids — the minimal shape the permission helpers need. */
export type TaskWithAssignees = Prisma.TaskGetPayload<{
  include: { assignees: { select: { userId: true } } };
}>;

/**
 * Loads a non-deleted task the user is allowed to view (member of / created the
 * project, or ADMIN). Throws NotFound/Forbidden otherwise.
 */
export const loadAccessibleTask = async (
  taskId: string,
  user: SessionUser,
): Promise<TaskWithAssignees> => {
  const task = await prisma.task.findFirst({
    where: { id: taskId, deletedAt: null },
    include: { assignees: { select: { userId: true } } },
  });

  if (!task) throw new NotFoundError('Task not found.');

  const project = await prisma.project.findFirst({
    where: { id: task.projectId, deletedAt: null },
    include: { members: { select: { userId: true } } },
  });
  if (!project) throw new NotFoundError('Task not found.');

  const isMember = project.members.some((m) => m.userId === user.id);
  const canView = user.role === 'ADMIN' || project.createdBy === user.id || isMember;
  if (!canView) throw new ForbiddenError("You don't have access to this task.");

  return task;
};

/** ADMIN or PM (creator/member of the project) may fully manage a task. */
export const canManageTask = async (projectId: string, user: SessionUser) => {
  if (user.role === 'ADMIN') return true;
  if (user.role !== 'PM') return false;

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: { members: { select: { userId: true } } },
  });
  if (!project) return false;

  return project.createdBy === user.id || project.members.some((m) => m.userId === user.id);
};

/**
 * Status changes are allowed for managers (ADMIN/PM) or a MEMBER assigned to
 * the task.
 */
export const canChangeTaskStatus = async (task: TaskWithAssignees, user: SessionUser) => {
  if (await canManageTask(task.projectId, user)) return true;
  return task.assignees.some((a) => a.userId === user.id);
};
