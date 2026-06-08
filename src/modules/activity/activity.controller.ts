import type { Response } from 'express';
import { prisma } from '../../config/prisma';
import { catchAsync } from '../../shared/utils/catch-async';
import { sendResponse } from '../../shared/utils/send-response';
import { buildProjectScopeWhere } from '../project/project.access';

/**
 * Resolves the set of project ids whose activity the user may read.
 * ADMIN → null (no restriction); everyone else → ids of accessible projects.
 */
const accessibleProjectIds = async (user: { id: string; role?: string | null }) => {
  if (user.role === 'ADMIN') return null;
  const projects = await prisma.project.findMany({
    where: buildProjectScopeWhere(user as never),
    select: { id: true },
  });
  return projects.map((p) => p.id);
};

export const listActivities = catchAsync(async (req, res: Response) => {
  const user = req.user!;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));
  const projectId = (req.query.projectId as string) || undefined;

  const scopeIds = await accessibleProjectIds(user);

  const where: Record<string, unknown> = {};
  if (projectId) {
    // A specific project was requested — only honour it if it's in scope.
    if (scopeIds && !scopeIds.includes(projectId)) {
      sendResponse.success({ res, data: [], meta: { page, limit, total: 0, totalPages: 1 } });
      return;
    }
    where.projectId = projectId;
  } else if (scopeIds) {
    where.projectId = { in: scopeIds };
  }

  const [total, activities] = await Promise.all([
    prisma.activityLog.count({ where }),
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { actor: { select: { id: true, name: true, image: true } } },
    }),
  ]);

  sendResponse.success({
    res,
    data: activities.map((a) => ({
      id: a.id,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      message: a.message,
      actor: a.actor,
      createdAt: a.createdAt,
    })),
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
});
