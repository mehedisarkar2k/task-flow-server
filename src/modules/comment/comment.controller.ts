import type { Response } from 'express';
import { prisma } from '../../config/prisma';
import { catchAsync } from '../../shared/utils/catch-async';
import { sendResponse } from '../../shared/utils/send-response';
import { ForbiddenError, NotFoundError } from '../../shared/errors/custom-errors';
import { loadAccessibleTask } from '../task/task.access';
import { canManageTask } from '../task/task.access';
import { sendNotifications } from '../notification/notification.service';
import { logActivity } from '../activity/activity.service';
import { commentInclude, toComment } from './comment.dto';
import type { CreateCommentBody, ListCommentsQuery, UpdateCommentBody } from './comment.validation';

// ─── List ──────────────────────────────────────────────────────────────────

export const listComments = catchAsync(async (req, res: Response) => {
  const user = req.user!;
  const { taskId } = req.params as { taskId: string };
  const query = req.query as unknown as ListCommentsQuery;

  await loadAccessibleTask(taskId, user);

  const where = { taskId };
  const [total, comments] = await Promise.all([
    prisma.comment.count({ where }),
    prisma.comment.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: commentInclude,
    }),
  ]);

  sendResponse.success({
    res,
    data: comments.map(toComment),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  });
});

// ─── Create ────────────────────────────────────────────────────────────────

export const createComment = catchAsync<CreateCommentBody>(async (req, res: Response) => {
  const user = req.user!;
  const { taskId } = req.params as { taskId: string };
  const body = req.body;

  const task = await loadAccessibleTask(taskId, user);

  const comment = await prisma.comment.create({
    data: { taskId, userId: user.id, body: body.body },
    include: commentInclude,
  });

  // Recipients: task assignees + task creator + previous commenters (deduped,
  // actor excluded inside sendNotifications). Mentioned users get a distinct type.
  const previousCommenters = await prisma.comment.findMany({
    where: { taskId, id: { not: comment.id } },
    select: { userId: true },
    distinct: ['userId'],
  });

  const mentioned = body.mentions ?? [];
  const mentionSet = new Set(mentioned);
  const baseRecipients = [
    ...task.assignees.map((a) => a.userId),
    task.createdBy,
    ...previousCommenters.map((c) => c.userId),
  ].filter((id) => !mentionSet.has(id));

  await sendNotifications(baseRecipients, {
    actorId: user.id,
    type: 'COMMENT_ADDED',
    entityType: 'TASK',
    entityId: taskId,
    message: `"${user.name}" commented on task "${task.title}".`,
  });

  if (mentioned.length > 0) {
    await sendNotifications(mentioned, {
      actorId: user.id,
      type: 'COMMENT_MENTION',
      entityType: 'TASK',
      entityId: taskId,
      message: `"${user.name}" mentioned you in a comment on "${task.title}".`,
    });
  }

  await logActivity({
    actorId: user.id,
    projectId: task.projectId,
    action: 'COMMENT_ADDED',
    entityType: 'COMMENT',
    entityId: comment.id,
    message: `${user.name} commented on "${task.title}"`,
  });

  sendResponse.created({ res, message: 'Comment added.', data: toComment(comment) });
});

// ─── Update (own only) ────────────────────────────────────────────────────────

export const updateComment = catchAsync<UpdateCommentBody>(async (req, res: Response) => {
  const user = req.user!;
  const { taskId, commentId } = req.params as { taskId: string; commentId: string };
  const body = req.body;

  await loadAccessibleTask(taskId, user);

  const existing = await prisma.comment.findFirst({ where: { id: commentId, taskId } });
  if (!existing) throw new NotFoundError('Comment not found.');
  if (existing.userId !== user.id) throw new ForbiddenError('You can only edit your own comments.');

  const updated = await prisma.$transaction(async (tx) => {
    // Snapshot the current body before overwriting it.
    await tx.commentVersion.create({ data: { commentId, body: existing.body } });
    return tx.comment.update({
      where: { id: commentId },
      data: { body: body.body, isEdited: true },
      include: commentInclude,
    });
  });

  sendResponse.success({ res, message: 'Comment updated.', data: toComment(updated) });
});

// ─── Versions ────────────────────────────────────────────────────────────────

export const getCommentVersions = catchAsync(async (req, res: Response) => {
  const user = req.user!;
  const { taskId, commentId } = req.params as { taskId: string; commentId: string };

  await loadAccessibleTask(taskId, user);

  const comment = await prisma.comment.findFirst({
    where: { id: commentId, taskId },
    include: { versions: { orderBy: { editedAt: 'desc' } } },
  });
  if (!comment) throw new NotFoundError('Comment not found.');

  sendResponse.success({
    res,
    data: {
      current: { body: comment.body, updatedAt: comment.updatedAt },
      versions: comment.versions.map((v) => ({ id: v.id, body: v.body, editedAt: v.editedAt })),
    },
  });
});

// ─── Delete (own or project manager) ──────────────────────────────────────────

export const deleteComment = catchAsync(async (req, res: Response) => {
  const user = req.user!;
  const { taskId, commentId } = req.params as { taskId: string; commentId: string };

  const task = await loadAccessibleTask(taskId, user);

  const existing = await prisma.comment.findFirst({ where: { id: commentId, taskId } });
  if (!existing) throw new NotFoundError('Comment not found.');

  const isOwner = existing.userId === user.id;
  const isManager = await canManageTask(task.projectId, user);
  if (!isOwner && !isManager) {
    throw new ForbiddenError('You can only delete your own comments.');
  }

  await prisma.comment.delete({ where: { id: commentId } });

  sendResponse.deleted({ res, message: 'Comment deleted.' });
});
