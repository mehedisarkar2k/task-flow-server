import type { Response } from 'express';
import type { Prisma } from '../../../generated/prisma';
import { prisma } from '../../config/prisma';
import { catchAsync } from '../../shared/utils/catch-async';
import { sendResponse } from '../../shared/utils/send-response';
import { BadRequestError, NotFoundError } from '../../shared/errors/custom-errors';
import type { ChangeUserRoleBody, ListUsersQuery, SearchUsersQuery } from './user.validation';

// ─── List users (admin) ─────────────────────────────────────────────────────

export const listUsers = catchAsync(async (req, res: Response) => {
  const { page, limit, search, role } = req.query as unknown as ListUsersQuery;

  const where: Prisma.UserWhereInput = {
    ...(role ? { role } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        jobTitle: true,
        department: true,
        image: true,
        createdAt: true,
      },
    }),
  ]);

  sendResponse.success({
    res,
    data: users,
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
});

// ─── Change role (admin) ─────────────────────────────────────────────────────

export const changeUserRole = catchAsync<ChangeUserRoleBody>(async (req, res: Response) => {
  const actor = req.user!;
  const { userId } = req.params as { userId: string };
  const { role } = req.body;

  // A user cannot change their own role — only a higher level may.
  if (actor.id === userId) throw new BadRequestError('Cannot change your own role.');

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!target) throw new NotFoundError('User not found.');

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { role },
    select: { id: true, name: true, role: true },
  });

  sendResponse.success({ res, message: 'User role updated.', data: updated });
});

// ─── Search users ─────────────────────────────────────────────────────────────

export const searchUsers = catchAsync(async (req, res: Response) => {
  const { q, projectId, excludeProjectId } = req.query as unknown as SearchUsersQuery;

  const where: Prisma.UserWhereInput = {
    OR: [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
    ],
    ...(projectId ? { memberships: { some: { projectId } } } : {}),
    ...(excludeProjectId ? { memberships: { none: { projectId: excludeProjectId } } } : {}),
  };

  const users = await prisma.user.findMany({
    where,
    orderBy: { name: 'asc' },
    take: 10,
    select: { id: true, name: true, email: true, role: true, image: true },
  });

  sendResponse.success({ res, data: users });
});
