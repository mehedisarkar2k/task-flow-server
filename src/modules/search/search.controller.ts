import type { Response } from 'express';
import { prisma } from '../../config/prisma';
import { catchAsync } from '../../shared/utils/catch-async';
import { sendResponse } from '../../shared/utils/send-response';
import { buildTaskScopeWhere } from '../task/task.access';
import { buildProjectScopeWhere } from '../project/project.access';
import type { GlobalSearchQuery } from './search.validation';

/**
 * Global search across tasks, projects, users, and the caller's notifications.
 * Each group is independently role-scoped (a member only matches tasks/projects
 * they can access; notifications are always the caller's own).
 */
export const globalSearch = catchAsync(async (req, res: Response) => {
  const user = req.user!;
  const { q, limit } = req.query as unknown as GlobalSearchQuery;
  const contains = { contains: q, mode: 'insensitive' as const };

  const [tasks, projects, users, notifications] = await Promise.all([
    prisma.task.findMany({
      where: { ...buildTaskScopeWhere(user), title: contains },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        project: { select: { id: true, name: true } },
      },
    }),
    prisma.project.findMany({
      where: { ...buildProjectScopeWhere(user), name: contains },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: { id: true, name: true, status: true },
    }),
    prisma.user.findMany({
      where: { OR: [{ name: contains }, { email: contains }] },
      orderBy: { name: 'asc' },
      take: limit,
      select: { id: true, name: true, email: true, role: true, image: true, jobTitle: true },
    }),
    prisma.notification.findMany({
      where: { userId: user.id, message: contains, archivedAt: null },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, message: true, entityType: true, entityId: true, isRead: true, createdAt: true },
    }),
  ]);

  sendResponse.success({ res, data: { tasks, projects, users, notifications } });
});
