import type { Response } from 'express';
import type { Prisma } from '../../../generated/prisma';
import { prisma } from '../../config/prisma';
import { catchAsync } from '../../shared/utils/catch-async';
import { sendResponse } from '../../shared/utils/send-response';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors/custom-errors';
import { assertProjectAccess, assertProjectManage } from './project.access';
import type { CreateColumnBody, UpdateColumnBody, ReorderColumnsBody } from './project.validation';

/**
 * Default Kanban columns seeded on project creation. The three mapped columns
 * mirror the TaskStatus enum so status changes and board moves stay in sync.
 */
export const DEFAULT_COLUMNS: Prisma.BoardColumnCreateWithoutProjectInput[] = [
  { name: 'Todo', color: 'muted', position: 0, mappedStatus: 'TODO' },
  { name: 'In Progress', color: 'primary', position: 1, mappedStatus: 'IN_PROGRESS' },
  { name: 'Completed', color: 'emerald', position: 2, mappedStatus: 'COMPLETED' },
];

const toColumnDto = (c: {
  id: string;
  name: string;
  color: string;
  position: number;
  mappedStatus: string | null;
}) => ({
  id: c.id,
  name: c.name,
  color: c.color,
  position: c.position,
  mappedStatus: c.mappedStatus,
});

// ─── List ─────────────────────────────────────────────────────────────────────

export const listColumns = catchAsync(async (req, res: Response) => {
  const user = req.user!;
  const { projectId } = req.params as { projectId: string };

  await assertProjectAccess(projectId, user);

  const columns = await prisma.boardColumn.findMany({
    where: { projectId },
    orderBy: { position: 'asc' },
  });

  const counts = await prisma.task.groupBy({
    by: ['columnId'],
    where: { projectId, deletedAt: null },
    _count: { _all: true },
  });
  const countByColumn = new Map(counts.map((c) => [c.columnId, c._count._all]));

  sendResponse.success({
    res,
    data: columns.map((c) => ({ ...toColumnDto(c), taskCount: countByColumn.get(c.id) ?? 0 })),
  });
});

// ─── Create ───────────────────────────────────────────────────────────────────

export const createColumn = catchAsync<CreateColumnBody>(async (req, res: Response) => {
  const user = req.user!;
  const { projectId } = req.params as { projectId: string };
  const { name, color } = req.body;

  await assertProjectManage(projectId, user);

  const duplicate = await prisma.boardColumn.findFirst({
    where: { projectId, name: { equals: name, mode: 'insensitive' } },
  });
  if (duplicate) {
    throw new BadRequestError('A column with this name already exists in this project.');
  }

  const last = await prisma.boardColumn.findFirst({
    where: { projectId },
    orderBy: { position: 'desc' },
    select: { position: true },
  });

  const column = await prisma.boardColumn.create({
    data: { projectId, name, color, position: (last?.position ?? -1) + 1, mappedStatus: null },
  });

  sendResponse.created({ res, message: 'Column created.', data: toColumnDto(column) });
});

// ─── Update ───────────────────────────────────────────────────────────────────

export const updateColumn = catchAsync<UpdateColumnBody>(async (req, res: Response) => {
  const user = req.user!;
  const { projectId, columnId } = req.params as { projectId: string; columnId: string };
  const { name, color } = req.body;

  await assertProjectManage(projectId, user);

  const column = await prisma.boardColumn.findFirst({ where: { id: columnId, projectId } });
  if (!column) throw new NotFoundError('Column not found.');

  if (name && name.toLowerCase() !== column.name.toLowerCase()) {
    const duplicate = await prisma.boardColumn.findFirst({
      where: { projectId, name: { equals: name, mode: 'insensitive' }, id: { not: columnId } },
    });
    if (duplicate) {
      throw new BadRequestError('A column with this name already exists in this project.');
    }
  }

  const updated = await prisma.boardColumn.update({
    where: { id: columnId },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(color !== undefined ? { color } : {}),
    },
  });

  sendResponse.success({ res, message: 'Column updated.', data: toColumnDto(updated) });
});

// ─── Reorder ──────────────────────────────────────────────────────────────────

export const reorderColumns = catchAsync<ReorderColumnsBody>(async (req, res: Response) => {
  const user = req.user!;
  const { projectId } = req.params as { projectId: string };
  const { orderedColumnIds } = req.body;

  await assertProjectManage(projectId, user);

  const existing = await prisma.boardColumn.findMany({
    where: { projectId },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((c) => c.id));

  const sameSet =
    existing.length === orderedColumnIds.length &&
    orderedColumnIds.every((id) => existingIds.has(id));
  if (!sameSet) {
    throw new BadRequestError('orderedColumnIds must include every column for this project.');
  }

  await prisma.$transaction(
    orderedColumnIds.map((id, index) =>
      prisma.boardColumn.update({ where: { id }, data: { position: index } }),
    ),
  );

  const columns = await prisma.boardColumn.findMany({
    where: { projectId },
    orderBy: { position: 'asc' },
  });

  sendResponse.success({ res, message: 'Columns reordered.', data: columns.map(toColumnDto) });
});

// ─── Delete ───────────────────────────────────────────────────────────────────

export const deleteColumn = catchAsync(async (req, res: Response) => {
  const user = req.user!;
  const { projectId, columnId } = req.params as { projectId: string; columnId: string };
  const moveTasksTo = typeof req.query.moveTasksTo === 'string' ? req.query.moveTasksTo : undefined;

  await assertProjectManage(projectId, user);

  const column = await prisma.boardColumn.findFirst({ where: { id: columnId, projectId } });
  if (!column) throw new NotFoundError('Column not found.');

  if (column.mappedStatus) {
    throw new BadRequestError('System columns cannot be deleted.');
  }

  const taskCount = await prisma.task.count({ where: { columnId, deletedAt: null } });
  if (taskCount > 0) {
    if (!moveTasksTo) {
      throw new ConflictError('Column is not empty. Provide moveTasksTo to relocate its tasks.');
    }
    const target = await prisma.boardColumn.findFirst({ where: { id: moveTasksTo, projectId } });
    if (!target) throw new NotFoundError('Target column not found.');

    await prisma.$transaction([
      prisma.task.updateMany({ where: { columnId }, data: { columnId: moveTasksTo } }),
      prisma.boardColumn.delete({ where: { id: columnId } }),
    ]);
  } else {
    await prisma.boardColumn.delete({ where: { id: columnId } });
  }

  sendResponse.deleted({ res, message: 'Column deleted.' });
});
