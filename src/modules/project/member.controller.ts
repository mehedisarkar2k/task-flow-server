import type { Response } from 'express';
import { prisma } from '../../config/prisma';
import { catchAsync } from '../../shared/utils/catch-async';
import { sendResponse } from '../../shared/utils/send-response';
import { BadRequestError, NotFoundError } from '../../shared/errors/custom-errors';
import { assertProjectAccess, assertProjectManage } from './project.access';
import type { AddMemberBody, UpdateMemberRoleBody } from './project.validation';

// ─── List members ─────────────────────────────────────────────────────────────

export const listMembers = catchAsync(async (req, res: Response) => {
  const user = req.user!;
  const { projectId } = req.params as { projectId: string };

  await assertProjectAccess(projectId, user);

  const members = await prisma.projectMember.findMany({
    where: { projectId },
    orderBy: { addedAt: 'asc' },
    include: { user: { select: { id: true, name: true, email: true, role: true, image: true } } },
  });

  // Per-member workload within this project.
  const assignments = await prisma.taskAssignee.findMany({
    where: { task: { projectId, deletedAt: null } },
    select: { userId: true, task: { select: { status: true } } },
  });

  const workloadByUser = new Map<string, { total: number; completed: number }>();
  for (const a of assignments) {
    const current = workloadByUser.get(a.userId) ?? { total: 0, completed: 0 };
    current.total += 1;
    if (a.task.status === 'COMPLETED') current.completed += 1;
    workloadByUser.set(a.userId, current);
  }

  const data = members.map((m) => {
    const w = workloadByUser.get(m.userId) ?? { total: 0, completed: 0 };
    return {
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      avatar: m.user.image,
      role: m.user.role,
      projectRole: m.role,
      addedAt: m.addedAt,
      workload: { total: w.total, completed: w.completed, pending: w.total - w.completed },
    };
  });

  sendResponse.success({ res, data });
});

// ─── Add member ───────────────────────────────────────────────────────────────

export const addMember = catchAsync<AddMemberBody>(async (req, res: Response) => {
  const user = req.user!;
  const { projectId } = req.params as { projectId: string };
  const { userId, projectRole } = req.body;

  await assertProjectManage(projectId, user);

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new NotFoundError('User not found.');

  const existing = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (existing) throw new BadRequestError('User is already a member of this project.');

  const member = await prisma.projectMember.create({
    data: { projectId, userId, role: projectRole },
  });

  sendResponse.created({
    res,
    message: 'Member added to project.',
    data: {
      projectId: member.projectId,
      userId: member.userId,
      projectRole: member.role,
      addedAt: member.addedAt,
    },
  });
});

// ─── Remove member ────────────────────────────────────────────────────────────

export const removeMember = catchAsync(async (req, res: Response) => {
  const user = req.user!;
  const { projectId, userId } = req.params as { projectId: string; userId: string };

  const project = await assertProjectManage(projectId, user);

  if (project.createdBy === userId) {
    throw new BadRequestError('Cannot remove the project creator.');
  }

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!member) throw new NotFoundError('Member not found in this project.');

  const assignedCount = await prisma.taskAssignee.count({
    where: { userId, task: { projectId, deletedAt: null } },
  });
  if (assignedCount > 0) {
    throw new BadRequestError('User has assigned tasks. Reassign tasks before removing.');
  }

  await prisma.projectMember.delete({
    where: { projectId_userId: { projectId, userId } },
  });

  sendResponse.deleted({ res, message: 'Member removed from project.' });
});

// ─── Update member role ───────────────────────────────────────────────────────

export const updateMemberRole = catchAsync<UpdateMemberRoleBody>(async (req, res: Response) => {
  const user = req.user!;
  const { projectId, userId } = req.params as { projectId: string; userId: string };
  const { projectRole } = req.body;

  await assertProjectManage(projectId, user);

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!member) throw new NotFoundError('Member not found in this project.');

  const updated = await prisma.projectMember.update({
    where: { projectId_userId: { projectId, userId } },
    data: { role: projectRole },
  });

  sendResponse.success({
    res,
    message: 'Member role updated.',
    data: { projectId: updated.projectId, userId: updated.userId, projectRole: updated.role },
  });
});
