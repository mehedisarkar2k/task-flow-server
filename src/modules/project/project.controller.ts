import type { Response } from 'express';
import type { Prisma } from '../../../generated/prisma';
import { prisma } from '../../config/prisma';
import { catchAsync } from '../../shared/utils/catch-async';
import { sendResponse } from '../../shared/utils/send-response';
import { ForbiddenError } from '../../shared/errors/custom-errors';
import {
  buildProjectScopeWhere,
  assertProjectAccess,
  assertProjectManage,
} from './project.access';
import { DEFAULT_COLUMNS } from './column.controller';
import type {
  ListProjectsQuery,
  CreateProjectBody,
  UpdateProjectBody,
} from './project.validation';
import { sendNotifications } from '../notification/notification.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const toDateOnly = (d: Date | null) => (d ? d.toISOString().split('T')[0] : null);

const progressOf = (total: number, completed: number) => ({
  total,
  completed,
  percentage: total === 0 ? 0 : Math.round((completed / total) * 100),
});

const memberSnippet = { select: { id: true, name: true, image: true } } as const;

// ─── List ─────────────────────────────────────────────────────────────────────

export const listProjects = catchAsync(async (req, res: Response) => {
    const user = req.user!;
    const { page, limit, search, status, sort } = req.query as unknown as ListProjectsQuery;

    const where: Prisma.ProjectWhereInput = {
      ...buildProjectScopeWhere(user),
      ...(status ? { status } : {}),
      ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
    };

    const orderBy: Prisma.ProjectOrderByWithRelationInput =
      sort === 'deadline'
        ? { deadline: 'asc' }
        : sort === 'updated'
          ? { updatedAt: 'desc' }
          : { createdAt: 'desc' };

    const [total, projects] = await Promise.all([
      prisma.project.count({ where }),
      prisma.project.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          creator: { select: { id: true, name: true } },
          members: { take: 5, include: { user: memberSnippet } },
          _count: { select: { members: true } },
        },
      }),
    ]);

    const ids = projects.map((p) => p.id);
    const taskGroups = ids.length
      ? await prisma.task.groupBy({
          by: ['projectId', 'status'],
          where: { projectId: { in: ids }, deletedAt: null },
          _count: { _all: true },
        })
      : [];

    const statsByProject = new Map<string, { total: number; completed: number }>();
    for (const g of taskGroups) {
      const current = statsByProject.get(g.projectId) ?? { total: 0, completed: 0 };
      current.total += g._count._all;
      if (g.status === 'COMPLETED') current.completed += g._count._all;
      statsByProject.set(g.projectId, current);
    }

    const data = projects.map((p) => {
      const stats = statsByProject.get(p.id) ?? { total: 0, completed: 0 };
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        deadline: toDateOnly(p.deadline),
        status: p.status,
        createdBy: p.creator,
        progress: progressOf(stats.total, stats.completed),
        memberCount: p._count.members,
        members: p.members.map((m) => ({ id: m.user.id, name: m.user.name, avatar: m.user.image })),
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      };
    });

    sendResponse.success({
      res,
      data,
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  },
);

// ─── Create ─────────────────────────────────────────────────────────────────

export const createProject = catchAsync<CreateProjectBody>(async (req, res: Response) => {
  const user = req.user!;
  const { name, description, deadline, status } = req.body;

  const project = await prisma.project.create({
    data: {
      name,
      description,
      deadline,
      status,
      createdBy: user.id,
      // Creator is automatically a project LEAD.
      members: { create: { userId: user.id, role: 'LEAD' } },
      // Seed the default Kanban columns mapped to task statuses.
      columns: { create: DEFAULT_COLUMNS },
    },
    include: { creator: { select: { id: true, name: true } } },
  });

  sendResponse.created({
    res,
    message: 'Project created successfully.',
    data: {
      id: project.id,
      name: project.name,
      description: project.description,
      deadline: toDateOnly(project.deadline),
      status: project.status,
      createdBy: project.creator,
      createdAt: project.createdAt,
    },
  });
});

// ─── Get one ──────────────────────────────────────────────────────────────────

export const getProject = catchAsync(async (req, res: Response) => {
  const user = req.user!;
  const { projectId } = req.params as { projectId: string };

  await assertProjectAccess(projectId, user);

  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      creator: { select: { id: true, name: true } },
      members: {
        orderBy: { addedAt: 'asc' },
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
      },
    },
  });

  const [total, completed] = await Promise.all([
    prisma.task.count({ where: { projectId, deletedAt: null } }),
    prisma.task.count({ where: { projectId, status: 'COMPLETED', deletedAt: null } }),
  ]);

  sendResponse.success({
    res,
    data: {
      id: project.id,
      name: project.name,
      description: project.description,
      deadline: toDateOnly(project.deadline),
      status: project.status,
      createdBy: project.creator,
      progress: progressOf(total, completed),
      members: project.members.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        role: m.user.role,
        projectRole: m.role,
        addedAt: m.addedAt,
      })),
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    },
  });
});

// ─── Update ───────────────────────────────────────────────────────────────────

export const updateProject = catchAsync<UpdateProjectBody>(async (req, res: Response) => {
  const user = req.user!;
  const { projectId } = req.params as { projectId: string };
  const { name, description, deadline, status } = req.body;

  const project = await assertProjectManage(projectId, user);

  const updated = await prisma.project.update({
    where: { id: projectId },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(deadline !== undefined ? { deadline } : {}),
      ...(status !== undefined ? { status } : {}),
    },
    include: { creator: { select: { id: true, name: true } }, members: { select: { userId: true } } },
  });

  if (status !== undefined && status !== project.status) {
    const recipients = updated.members.map((m) => m.userId);
    await sendNotifications(recipients, {
      actorId: user.id,
      type: 'PROJECT_STATUS_CHANGED',
      entityType: 'PROJECT',
      entityId: projectId,
      message: `"${user.name}" changed project "${updated.name}" status to ${status}.`,
    });
  }

  sendResponse.success({
    res,
    message: 'Project updated successfully.',
    data: {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      deadline: toDateOnly(updated.deadline),
      status: updated.status,
      createdBy: updated.creator,
      updatedAt: updated.updatedAt,
    },
  });
});

// ─── Delete (soft) ────────────────────────────────────────────────────────────

export const deleteProject = catchAsync(async (req, res: Response) => {
  const user = req.user!;
  const { projectId } = req.params as { projectId: string };

  const project = await assertProjectAccess(projectId, user);

  // Only ADMIN or the PM who created it may delete.
  const canDelete = user.role === 'ADMIN' || project.createdBy === user.id;
  if (!canDelete) throw new ForbiddenError("You don't have permission to delete this project.");

  await prisma.project.update({
    where: { id: projectId },
    data: { deletedAt: new Date() },
  });

  sendResponse.deleted({ res, message: 'Project deleted successfully.' });
});
