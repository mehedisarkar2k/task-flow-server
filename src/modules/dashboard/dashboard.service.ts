import type { Prisma } from '../../../generated/prisma';
import { prisma } from '../../config/prisma';
import { buildProjectScopeWhere } from '../project/project.access';

interface SessionUser {
  id: string;
  role?: 'ADMIN' | 'PM' | 'MEMBER' | null;
}

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const dateOnly = (d: Date | null) => (d ? d.toISOString().split('T')[0] : null);

export const getDashboardStats = async (user: SessionUser) => {
  // 1) Projects the user may see (drives the scope for every aggregate below).
  const projects = await prisma.project.findMany({
    where: buildProjectScopeWhere(user),
    select: { id: true, name: true, status: true, deadline: true },
    orderBy: { createdAt: 'desc' },
  });
  const projectIds = projects.map((p) => p.id);

  const empty = {
    totalProjects: projects.length,
    totalTasks: 0,
    completedTasks: 0,
    pendingTasks: 0,
    overdueTasks: 0,
    tasksByStatus: { todo: 0, inProgress: 0, completed: 0 },
    tasksByPriority: { high: 0, medium: 0, low: 0 },
    memberWorkload: [] as Array<{ id: string; name: string; total: number; completed: number; pending: number }>,
    upcomingDeadlines: [] as Array<{ id: string; title: string; dueDate: string | null; project: { id: string; name: string } | null; priority: string }>,
    projectSummary: [] as Array<{ id: string; name: string; status: string; progress: number; pendingTasks: number; deadline: string | null }>,
  };

  if (projectIds.length === 0) return empty;

  const taskWhere: Prisma.TaskWhereInput = { deletedAt: null, projectId: { in: projectIds } };

  const [byStatus, byPriority, byProjectStatus, overdueTasks, assigned, deadlineTasks] =
    await Promise.all([
      prisma.task.groupBy({ by: ['status'], where: taskWhere, _count: { _all: true } }),
      prisma.task.groupBy({ by: ['priority'], where: taskWhere, _count: { _all: true } }),
      prisma.task.groupBy({
        by: ['projectId', 'status'],
        where: taskWhere,
        _count: { _all: true },
      }),
      prisma.task.count({
        where: { ...taskWhere, status: { not: 'COMPLETED' }, dueDate: { lt: startOfToday() } },
      }),
      prisma.taskAssignee.findMany({
        where: { task: { deletedAt: null, projectId: { in: projectIds } } },
        select: {
          userId: true,
          user: { select: { id: true, name: true } },
          task: { select: { status: true } },
        },
      }),
      prisma.task.findMany({
        where: { ...taskWhere, status: { not: 'COMPLETED' }, dueDate: { not: null } },
        orderBy: { dueDate: 'asc' },
        take: 6,
        select: {
          id: true,
          title: true,
          dueDate: true,
          priority: true,
          project: { select: { id: true, name: true } },
        },
      }),
    ]);

  const statusCount = (s: string) => byStatus.find((g) => g.status === s)?._count._all ?? 0;
  const priorityCount = (p: string) => byPriority.find((g) => g.priority === p)?._count._all ?? 0;

  const todo = statusCount('TODO');
  const inProgress = statusCount('IN_PROGRESS');
  const completed = statusCount('COMPLETED');
  const totalTasks = todo + inProgress + completed;

  // Member workload — tally assigned tasks per user.
  const workloadMap = new Map<string, { id: string; name: string; total: number; completed: number; pending: number }>();
  for (const a of assigned) {
    const entry = workloadMap.get(a.userId) ?? {
      id: a.user.id,
      name: a.user.name,
      total: 0,
      completed: 0,
      pending: 0,
    };
    entry.total += 1;
    if (a.task.status === 'COMPLETED') entry.completed += 1;
    else entry.pending += 1;
    workloadMap.set(a.userId, entry);
  }
  const memberWorkload = [...workloadMap.values()]
    .sort((a, b) => b.pending - a.pending || b.total - a.total)
    .slice(0, 8);

  // Project summary — progress + pending per project.
  const perProject = new Map<string, { total: number; completed: number }>();
  for (const g of byProjectStatus) {
    const entry = perProject.get(g.projectId) ?? { total: 0, completed: 0 };
    entry.total += g._count._all;
    if (g.status === 'COMPLETED') entry.completed += g._count._all;
    perProject.set(g.projectId, entry);
  }
  const projectSummary = projects.slice(0, 12).map((p) => {
    const s = perProject.get(p.id) ?? { total: 0, completed: 0 };
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      progress: s.total === 0 ? 0 : Math.round((s.completed / s.total) * 100),
      pendingTasks: s.total - s.completed,
      deadline: dateOnly(p.deadline),
    };
  });

  return {
    totalProjects: projects.length,
    totalTasks,
    completedTasks: completed,
    pendingTasks: todo + inProgress,
    overdueTasks,
    tasksByStatus: { todo, inProgress, completed },
    tasksByPriority: {
      high: priorityCount('HIGH'),
      medium: priorityCount('MEDIUM'),
      low: priorityCount('LOW'),
    },
    memberWorkload,
    upcomingDeadlines: deadlineTasks.map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: dateOnly(t.dueDate),
      project: t.project,
      priority: t.priority,
    })),
    projectSummary,
  };
};
