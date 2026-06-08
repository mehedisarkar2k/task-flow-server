import type { Prisma } from '../../../generated/prisma';
import type { ListTasksQuery } from './task.validation';

// ─── Prisma include shapes ─────────────────────────────────────────────────

export const taskListInclude = {
  project: { select: { id: true, name: true } },
  creator: { select: { id: true, name: true } },
  assignees: {
    orderBy: { assignedAt: 'asc' },
    include: { user: { select: { id: true, name: true, image: true } } },
  },
  _count: { select: { comments: true, attachments: true } },
} satisfies Prisma.TaskInclude;

export const taskDetailInclude = {
  project: { select: { id: true, name: true } },
  creator: { select: { id: true, name: true } },
  column: { select: { id: true, name: true, color: true } },
  assignees: {
    orderBy: { assignedAt: 'asc' },
    include: { user: { select: { id: true, name: true, email: true, image: true } } },
  },
  _count: { select: { comments: true, attachments: true } },
} satisfies Prisma.TaskInclude;

type TaskListPayload = Prisma.TaskGetPayload<{ include: typeof taskListInclude }>;
type TaskDetailPayload = Prisma.TaskGetPayload<{ include: typeof taskDetailInclude }>;

// ─── Helpers ───────────────────────────────────────────────────────────────

const toDateOnly = (d: Date | null) => (d ? d.toISOString().split('T')[0] : null);

const isOverdue = (dueDate: Date | null, status: string) => {
  if (!dueDate || status === 'COMPLETED') return false;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return dueDate.getTime() < startOfToday.getTime();
};

// ─── Mappers ───────────────────────────────────────────────────────────────

export const toTaskListItem = (t: TaskListPayload) => ({
  id: t.id,
  title: t.title,
  description: t.description,
  status: t.status,
  priority: t.priority,
  dueDate: toDateOnly(t.dueDate),
  estimatedMinutes: t.estimatedMinutes,
  isOverdue: isOverdue(t.dueDate, t.status),
  project: t.project,
  columnId: t.columnId,
  position: t.position,
  assignees: t.assignees.map((a) => ({ id: a.user.id, name: a.user.name, image: a.user.image })),
  createdBy: t.creator,
  commentCount: t._count.comments,
  attachmentCount: t._count.attachments,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
});

export const toTaskDetail = (t: TaskDetailPayload) => ({
  id: t.id,
  title: t.title,
  description: t.description,
  status: t.status,
  priority: t.priority,
  dueDate: toDateOnly(t.dueDate),
  estimatedMinutes: t.estimatedMinutes,
  isOverdue: isOverdue(t.dueDate, t.status),
  completedAt: t.completedAt,
  project: t.project,
  column: t.column,
  position: t.position,
  assignees: t.assignees.map((a) => ({
    id: a.user.id,
    name: a.user.name,
    email: a.user.email,
    image: a.user.image,
  })),
  createdBy: t.creator,
  commentCount: t._count.comments,
  attachmentCount: t._count.attachments,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
});

// ─── Query building ──────────────────────────────────────────────────────────

/** Builds the filter fragment shared by global and project-scoped task lists. */
export const buildTaskFilters = (q: ListTasksQuery): Prisma.TaskWhereInput => {
  const where: Prisma.TaskWhereInput = {};

  if (q.status) where.status = q.status;
  if (q.priority) where.priority = q.priority;
  if (q.projectId) where.projectId = q.projectId;
  if (q.assignee) where.assignees = { some: { userId: q.assignee } };
  if (q.search) {
    where.OR = [
      { title: { contains: q.search, mode: 'insensitive' } },
      { description: { contains: q.search, mode: 'insensitive' } },
    ];
  }

  if (q.deadlineStatus) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    if (q.deadlineStatus === 'overdue') {
      where.dueDate = { lt: start };
      where.status = { not: 'COMPLETED' };
    } else {
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      where.dueDate = { gte: start, lte: end };
    }
  }

  return where;
};

export const buildTaskOrderBy = (
  sort: ListTasksQuery['sort'],
): Prisma.TaskOrderByWithRelationInput => {
  if (sort === 'deadline') return { dueDate: 'asc' };
  if (sort === 'priority') return { priority: 'asc' };
  if (sort === 'updated') return { updatedAt: 'desc' };
  return { createdAt: 'desc' };
};
