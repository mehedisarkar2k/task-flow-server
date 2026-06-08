import type { Response } from 'express';
import type { Prisma } from '../../../generated/prisma';
import { prisma } from '../../config/prisma';
import { catchAsync } from '../../shared/utils/catch-async';
import { sendResponse } from '../../shared/utils/send-response';
import { ForbiddenError, NotFoundError } from '../../shared/errors/custom-errors';
import { buildProjectScopeWhere } from '../project/project.access';
import { buildTaskScopeWhere } from '../task/task.access';
import { taskListInclude, toTaskListItem } from '../task/task.dto';
import type { ListTeamMembersQuery, TeamMemberTasksQuery } from './team.validation';

interface SessionUser {
  id: string;
  role?: 'ADMIN' | 'PM' | 'MEMBER' | null;
}

// Reference capacity used to turn open-task counts into a 0–100 load indicator.
const WORKLOAD_CAPACITY = 10;

type Workload = { total: number; completed: number; pending: number; percentage: number };

const emptyWorkload = (): Workload => ({ total: 0, completed: 0, pending: 0, percentage: 0 });

const toWorkload = (total: number, completed: number): Workload => {
  const pending = total - completed;
  return {
    total,
    completed,
    pending,
    percentage: Math.min(100, Math.round((pending / WORKLOAD_CAPACITY) * 100)),
  };
};

/** Project ids the requester is allowed to see (ADMIN → all). */
const accessibleProjectIds = async (user: SessionUser): Promise<string[]> => {
  const projects = await prisma.project.findMany({
    where: buildProjectScopeWhere(user),
    select: { id: true },
  });
  return projects.map((p) => p.id);
};

/** Aggregates assigned-task workload per user within the given project scope. */
const workloadByUser = async (userIds: string[], scopeProjectIds: string[] | null) => {
  if (userIds.length === 0) return new Map<string, Workload>();

  const taskWhere: Prisma.TaskWhereInput = { deletedAt: null };
  if (scopeProjectIds) taskWhere.projectId = { in: scopeProjectIds };

  const assignments = await prisma.taskAssignee.findMany({
    where: { userId: { in: userIds }, task: taskWhere },
    select: { userId: true, task: { select: { status: true } } },
  });

  const acc = new Map<string, { total: number; completed: number }>();
  for (const a of assignments) {
    const current = acc.get(a.userId) ?? { total: 0, completed: 0 };
    current.total += 1;
    if (a.task.status === 'COMPLETED') current.completed += 1;
    acc.set(a.userId, current);
  }

  const result = new Map<string, Workload>();
  for (const [userId, v] of acc) result.set(userId, toWorkload(v.total, v.completed));
  return result;
};

// ─── List members ─────────────────────────────────────────────────────────────

export const listTeamMembers = catchAsync(async (req, res: Response) => {
  const user = req.user! as SessionUser;
  const { search, department } = req.query as unknown as ListTeamMembersQuery;
  const isAdmin = user.role === 'ADMIN';

  const scopeIds = isAdmin ? null : await accessibleProjectIds(user);

  // Determine which users are visible.
  let memberFilter: Prisma.UserWhereInput = {};
  if (!isAdmin) {
    const memberships = await prisma.projectMember.findMany({
      where: { projectId: { in: scopeIds ?? [] } },
      select: { userId: true },
    });
    const ids = new Set(memberships.map((m) => m.userId));
    ids.add(user.id);
    memberFilter = { id: { in: [...ids] } };
  }

  const where: Prisma.UserWhereInput = {
    ...memberFilter,
    ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
    ...(department ? { department: { equals: department, mode: 'insensitive' } } : {}),
  };

  const users = await prisma.user.findMany({
    where,
    orderBy: { name: 'asc' },
    select: { id: true, name: true, role: true, jobTitle: true, department: true, image: true },
  });

  const loads = await workloadByUser(
    users.map((u) => u.id),
    scopeIds,
  );

  sendResponse.success({
    res,
    data: users.map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      jobTitle: u.jobTitle,
      department: u.department,
      image: u.image,
      workload: loads.get(u.id) ?? emptyWorkload(),
    })),
  });
});

// ─── Shared access resolution ───────────────────────────────────────────────

/** Returns the projects the requester shares with the target (ADMIN → all of target's). */
const sharedProjectsBetween = async (requester: SessionUser, targetId: string) => {
  const targetProjects = await prisma.project.findMany({
    where: { deletedAt: null, members: { some: { userId: targetId } } },
    select: { id: true, name: true, createdBy: true },
  });

  if (requester.role === 'ADMIN') {
    return targetProjects.map((p) => ({ id: p.id, name: p.name }));
  }

  const requesterIds = new Set(await accessibleProjectIds(requester));
  return targetProjects.filter((p) => requesterIds.has(p.id)).map((p) => ({ id: p.id, name: p.name }));
};

// ─── Member profile ───────────────────────────────────────────────────────────

export const getTeamMember = catchAsync(async (req, res: Response) => {
  const user = req.user! as SessionUser;
  const { userId } = req.params as { userId: string };

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      jobTitle: true,
      department: true,
      location: true,
      phone: true,
      bio: true,
      skills: true,
      image: true,
    },
  });
  if (!target) throw new NotFoundError('Member not found.');

  const shared = await sharedProjectsBetween(user, userId);
  const isSelf = user.id === userId;
  if (user.role !== 'ADMIN' && !isSelf && shared.length === 0) {
    throw new ForbiddenError("You don't share a project with this member.");
  }

  const scopeIds = user.role === 'ADMIN' ? null : await accessibleProjectIds(user);
  const loads = await workloadByUser([userId], scopeIds);

  sendResponse.success({
    res,
    data: {
      ...target,
      workload: loads.get(userId) ?? emptyWorkload(),
      sharedProjects: shared,
    },
  });
});

// ─── Member tasks ─────────────────────────────────────────────────────────────

export const getTeamMemberTasks = catchAsync(async (req, res: Response) => {
  const user = req.user! as SessionUser;
  const { userId } = req.params as { userId: string };
  const query = req.query as unknown as TeamMemberTasksQuery;

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!target) throw new NotFoundError('Member not found.');

  const shared = await sharedProjectsBetween(user, userId);
  if (user.role !== 'ADMIN' && user.id !== userId && shared.length === 0) {
    throw new ForbiddenError("You don't share a project with this member.");
  }

  const where: Prisma.TaskWhereInput = {
    ...buildTaskScopeWhere(user),
    assignees: { some: { userId } },
    ...(query.status ? { status: query.status } : {}),
    ...(query.priority ? { priority: query.priority } : {}),
    ...(query.projectId ? { projectId: query.projectId } : {}),
  };

  const [total, tasks] = await Promise.all([
    prisma.task.count({ where }),
    prisma.task.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: taskListInclude,
    }),
  ]);

  sendResponse.success({
    res,
    data: tasks.map(toTaskListItem),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  });
});
