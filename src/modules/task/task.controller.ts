import type { Response } from 'express';
import { prisma } from '../../config/prisma';
import { catchAsync } from '../../shared/utils/catch-async';
import { sendResponse } from '../../shared/utils/send-response';
import { BadRequestError, ForbiddenError } from '../../shared/errors/custom-errors';
import { assertProjectAccess } from '../project/project.access';
import {
  buildTaskScopeWhere,
  loadAccessibleTask,
  canManageTask,
  canChangeTaskStatus,
} from './task.access';
import {
  taskListInclude,
  taskDetailInclude,
  toTaskListItem,
  toTaskDetail,
  buildTaskFilters,
  buildTaskOrderBy,
} from './task.dto';
import type {
  ListTasksQuery,
  CreateTaskBody,
  UpdateTaskBody,
  UpdateTaskStatusBody,
  MoveTaskBody,
} from './task.validation';
import { sendNotifications } from '../notification/notification.service';

// ─── Internal helpers ────────────────────────────────────────────────────────

/** Resolves status side effects: completedAt toggle + optional column realign. */
const statusSideEffects = async (
  projectId: string,
  newStatus: 'TODO' | 'IN_PROGRESS' | 'COMPLETED',
  currentStatus: string,
) => {
  const data: { status: typeof newStatus; completedAt?: Date | null; columnId?: string } = {
    status: newStatus,
  };
  if (newStatus === 'COMPLETED' && currentStatus !== 'COMPLETED') data.completedAt = new Date();
  if (newStatus !== 'COMPLETED' && currentStatus === 'COMPLETED') data.completedAt = null;

  const mappedColumn = await prisma.boardColumn.findFirst({
    where: { projectId, mappedStatus: newStatus },
    select: { id: true },
  });
  if (mappedColumn) data.columnId = mappedColumn.id;

  return data;
};

const assertAssigneesAreMembers = async (projectId: string, assigneeIds: string[]) => {
  if (assigneeIds.length === 0) return;
  const members = await prisma.projectMember.findMany({
    where: { projectId, userId: { in: assigneeIds } },
    select: { userId: true },
  });
  const memberSet = new Set(members.map((m) => m.userId));
  if (assigneeIds.some((id) => !memberSet.has(id))) {
    throw new BadRequestError('This user is not a member of this project.');
  }
};

const assertTitleUnique = async (projectId: string, title: string, excludeTaskId?: string) => {
  const existing = await prisma.task.findFirst({
    where: {
      projectId,
      deletedAt: null,
      title: { equals: title, mode: 'insensitive' },
      ...(excludeTaskId ? { id: { not: excludeTaskId } } : {}),
    },
    select: { id: true },
  });
  if (existing) throw new BadRequestError('A task with this title already exists in this project.');
};

// ─── List (global) ────────────────────────────────────────────────────────────

export const listTasks = catchAsync(async (req, res: Response) => {
  const user = req.user!;
  const query = req.query as unknown as ListTasksQuery;

  const where = { ...buildTaskScopeWhere(user), ...buildTaskFilters(query) };
  const [total, tasks] = await Promise.all([
    prisma.task.count({ where }),
    prisma.task.findMany({
      where,
      orderBy: buildTaskOrderBy(query.sort),
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

// ─── List (project board) ─────────────────────────────────────────────────────

export const listProjectTasks = catchAsync(async (req, res: Response) => {
  const user = req.user!;
  const { projectId } = req.params as { projectId: string };
  const query = req.query as unknown as ListTasksQuery;

  await assertProjectAccess(projectId, user);

  const where = { ...buildTaskFilters(query), projectId, deletedAt: null };
  const tasks = await prisma.task.findMany({
    where,
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    include: taskListInclude,
  });

  sendResponse.success({ res, data: tasks.map(toTaskListItem) });
});

// ─── Create ───────────────────────────────────────────────────────────────────

export const createTask = catchAsync<CreateTaskBody>(async (req, res: Response) => {
  const user = req.user!;
  const { projectId } = req.params as { projectId: string };
  const body = req.body;

  // Confirm project exists & user may create tasks in it.
  await assertProjectAccess(projectId, user);
  if (!(await canManageTask(projectId, user))) {
    throw new ForbiddenError("You don't have permission to create tasks.");
  }

  await assertTitleUnique(projectId, body.title);
  if (body.assigneeIds) await assertAssigneesAreMembers(projectId, body.assigneeIds);

  // Resolve target column: explicit → mapped to status → first column.
  let columnId = body.columnId;
  if (columnId) {
    const column = await prisma.boardColumn.findFirst({
      where: { id: columnId, projectId },
      select: { id: true },
    });
    if (!column) throw new BadRequestError('Target column does not belong to this project.');
  } else {
    const fallback =
      (await prisma.boardColumn.findFirst({
        where: { projectId, mappedStatus: body.status },
        select: { id: true },
      })) ??
      (await prisma.boardColumn.findFirst({
        where: { projectId },
        orderBy: { position: 'asc' },
        select: { id: true },
      }));
    columnId = fallback?.id;
  }

  const last = await prisma.task.findFirst({
    where: { projectId, columnId: columnId ?? null, deletedAt: null },
    orderBy: { position: 'desc' },
    select: { position: true },
  });

  const task = await prisma.task.create({
    data: {
      projectId,
      columnId: columnId ?? null,
      position: (last?.position ?? -1) + 1,
      title: body.title,
      description: body.description,
      dueDate: body.dueDate,
      estimatedMinutes: body.estimatedMinutes,
      priority: body.priority,
      status: body.status,
      createdBy: user.id,
      ...(body.status === 'COMPLETED' ? { completedAt: new Date() } : {}),
      ...(body.assigneeIds && body.assigneeIds.length > 0
        ? { assignees: { create: body.assigneeIds.map((userId) => ({ userId })) } }
        : {}),
    },
    include: taskListInclude,
  });

  if (body.assigneeIds && body.assigneeIds.length > 0) {
    await sendNotifications(body.assigneeIds, {
      actorId: user.id,
      type: 'TASK_ASSIGNED',
      entityType: 'TASK',
      entityId: task.id,
      message: `"${user.name}" assigned you to task "${task.title}".`,
    });
  }

  sendResponse.created({ res, message: 'Task created successfully.', data: toTaskListItem(task) });
});

// ─── Get one ──────────────────────────────────────────────────────────────────

export const getTask = catchAsync(async (req, res: Response) => {
  const user = req.user!;
  const { taskId } = req.params as { taskId: string };

  await loadAccessibleTask(taskId, user);
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: taskDetailInclude,
  });

  sendResponse.success({ res, data: toTaskDetail(task) });
});

// ─── Update ───────────────────────────────────────────────────────────────────

export const updateTask = catchAsync<UpdateTaskBody>(async (req, res: Response) => {
  const user = req.user!;
  const { taskId } = req.params as { taskId: string };
  const body = req.body;

  const task = await loadAccessibleTask(taskId, user);
  const isManager = await canManageTask(task.projectId, user);

  // Members may only toggle status on tasks assigned to them.
  if (!isManager) {
    const onlyStatus = Object.keys(body).every((k) => k === 'status');
    const isAssignee = task.assignees.some((a) => a.userId === user.id);
    if (!onlyStatus || !isAssignee) {
      throw new ForbiddenError('You can only update the status of tasks assigned to you.');
    }
  }

  const data: Record<string, unknown> = {};

  if (body.title !== undefined) {
    await assertTitleUnique(task.projectId, body.title, taskId);
    data.title = body.title;
  }
  if (body.description !== undefined) data.description = body.description;
  if (body.dueDate !== undefined) data.dueDate = body.dueDate;
  if (body.estimatedMinutes !== undefined) data.estimatedMinutes = body.estimatedMinutes;
  if (body.priority !== undefined) data.priority = body.priority;

  if (body.status !== undefined) {
    Object.assign(data, await statusSideEffects(task.projectId, body.status, task.status));
  }

  if (body.assigneeIds !== undefined) {
    const oldIds = new Set(task.assignees.map((a) => a.userId));
    const newIds = new Set(body.assigneeIds);
    const assigneesChanged = oldIds.size !== newIds.size || [...newIds].some(id => !oldIds.has(id));

    if (!assigneesChanged) {
      body.assigneeIds = undefined; // skip processing if nothing changed
    } else {
      // Reassigning a completed task is blocked unless it is also being reopened.
      const staysCompleted =
        task.status === 'COMPLETED' && (body.status === undefined || body.status === 'COMPLETED');
      if (staysCompleted) throw new BadRequestError('Completed tasks cannot be reassigned.');
      await assertAssigneesAreMembers(task.projectId, body.assigneeIds);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id: taskId }, data });
    if (body.assigneeIds !== undefined) {
      await tx.taskAssignee.deleteMany({ where: { taskId } });
      if (body.assigneeIds.length > 0) {
        await tx.taskAssignee.createMany({
          data: body.assigneeIds.map((userId) => ({ taskId, userId })),
        });
      }
    }
  });

  const updated = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: taskDetailInclude,
  });

  if (body.assigneeIds !== undefined) {
    const oldIds = new Set(task.assignees.map((a) => a.userId));
    const newIds = new Set(body.assigneeIds);
    const added = body.assigneeIds.filter((id) => !oldIds.has(id));
    const removed = task.assignees.map((a) => a.userId).filter((id) => !newIds.has(id));

    if (added.length > 0) {
      await sendNotifications(added, {
        actorId: user.id,
        type: 'TASK_ASSIGNED',
        entityType: 'TASK',
        entityId: task.id,
        message: `"${user.name}" assigned you to task "${updated.title}".`,
      });
    }
    if (removed.length > 0) {
      await sendNotifications(removed, {
        actorId: user.id,
        type: 'TASK_UNASSIGNED',
        entityType: 'TASK',
        entityId: task.id,
        message: `"${user.name}" unassigned you from task "${updated.title}".`,
      });
    }
  }

  if (body.status !== undefined && body.status !== task.status) {
    const pms = await prisma.projectMember.findMany({
      where: { projectId: task.projectId, role: 'LEAD' },
      select: { userId: true },
    });
    const recipients = [task.createdBy, ...pms.map((pm) => pm.userId)];
    await sendNotifications(recipients, {
      actorId: user.id,
      type: 'TASK_STATUS_CHANGED',
      entityType: 'TASK',
      entityId: task.id,
      message: `"${user.name}" changed "${updated.title}" status to ${body.status}.`,
    });
  }

  sendResponse.success({ res, message: 'Task updated successfully.', data: toTaskDetail(updated) });
});

// ─── Update status ────────────────────────────────────────────────────────────

export const updateTaskStatus = catchAsync<UpdateTaskStatusBody>(async (req, res: Response) => {
  const user = req.user!;
  const { taskId } = req.params as { taskId: string };
  const { status } = req.body;

  const task = await loadAccessibleTask(taskId, user);
  if (!(await canChangeTaskStatus(task, user))) {
    throw new ForbiddenError('You can only update the status of tasks assigned to you.');
  }

  await prisma.task.update({
    where: { id: taskId },
    data: await statusSideEffects(task.projectId, status, task.status),
  });

  const updated = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: taskDetailInclude,
  });

  if (status !== task.status) {
    const pms = await prisma.projectMember.findMany({
      where: { projectId: task.projectId, role: 'LEAD' },
      select: { userId: true },
    });
    const recipients = [task.createdBy, ...pms.map((pm) => pm.userId)];
    await sendNotifications(recipients, {
      actorId: user.id,
      type: 'TASK_STATUS_CHANGED',
      entityType: 'TASK',
      entityId: task.id,
      message: `"${user.name}" changed "${updated.title}" status to ${status}.`,
    });
  }

  sendResponse.success({ res, data: toTaskDetail(updated) });
});

// ─── Move (Kanban drag-and-drop) ──────────────────────────────────────────────

export const moveTask = catchAsync<MoveTaskBody>(async (req, res: Response) => {
  const user = req.user!;
  const { taskId } = req.params as { taskId: string };
  const { columnId, position } = req.body;

  const task = await loadAccessibleTask(taskId, user);
  if (!(await canChangeTaskStatus(task, user))) {
    throw new ForbiddenError("You don't have permission to move this task.");
  }

  const destColumn = await prisma.boardColumn.findFirst({
    where: { id: columnId, projectId: task.projectId },
    select: { id: true, mappedStatus: true },
  });
  if (!destColumn) throw new BadRequestError('Target column does not belong to this project.');

  const sourceColumnId = task.columnId;

  await prisma.$transaction(async (tx) => {
    // Re-sequence the destination column with the moved task inserted at `position`.
    const destSiblings = await tx.task.findMany({
      where: { projectId: task.projectId, columnId, deletedAt: null, id: { not: taskId } },
      orderBy: { position: 'asc' },
      select: { id: true },
    });
    const clamped = Math.min(position, destSiblings.length);
    const destOrder = [
      ...destSiblings.slice(0, clamped).map((t) => t.id),
      taskId,
      ...destSiblings.slice(clamped).map((t) => t.id),
    ];
    await Promise.all(
      destOrder.map((id, index) =>
        tx.task.update({ where: { id }, data: { position: index } }),
      ),
    );

    // If moving across columns, compact the source column too.
    if (sourceColumnId && sourceColumnId !== columnId) {
      const sourceSiblings = await tx.task.findMany({
        where: {
          projectId: task.projectId,
          columnId: sourceColumnId,
          deletedAt: null,
          id: { not: taskId },
        },
        orderBy: { position: 'asc' },
        select: { id: true },
      });
      await Promise.all(
        sourceSiblings.map((t, index) =>
          tx.task.update({ where: { id: t.id }, data: { position: index } }),
        ),
      );
    }

    // Set the new column + status side effects (keeps analytics aligned).
    const statusData: { completedAt?: Date | null; status?: 'TODO' | 'IN_PROGRESS' | 'COMPLETED' } =
      {};
    if (destColumn.mappedStatus && destColumn.mappedStatus !== task.status) {
      statusData.status = destColumn.mappedStatus;
      if (destColumn.mappedStatus === 'COMPLETED') statusData.completedAt = new Date();
      else if (task.status === 'COMPLETED') statusData.completedAt = null;
    }
    await tx.task.update({ where: { id: taskId }, data: { columnId, ...statusData } });
  });

  const updated = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: taskDetailInclude,
  });

  if (updated.status !== task.status) {
    const pms = await prisma.projectMember.findMany({
      where: { projectId: task.projectId, role: 'LEAD' },
      select: { userId: true },
    });
    const recipients = [task.createdBy, ...pms.map((pm) => pm.userId)];
    await sendNotifications(recipients, {
      actorId: user.id,
      type: 'TASK_STATUS_CHANGED',
      entityType: 'TASK',
      entityId: task.id,
      message: `"${user.name}" changed "${updated.title}" status to ${updated.status}.`,
    });
  }

  sendResponse.success({ res, data: toTaskDetail(updated) });
});

// ─── Delete (soft) ────────────────────────────────────────────────────────────

export const deleteTask = catchAsync(async (req, res: Response) => {
  const user = req.user!;
  const { taskId } = req.params as { taskId: string };

  const task = await loadAccessibleTask(taskId, user);
  if (!(await canManageTask(task.projectId, user))) {
    throw new ForbiddenError("You don't have permission to delete this task.");
  }

  await prisma.task.update({ where: { id: taskId }, data: { deletedAt: new Date() } });

  sendResponse.deleted({ res, message: 'Task deleted successfully.' });
});
