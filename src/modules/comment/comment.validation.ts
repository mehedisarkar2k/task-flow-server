import { z } from 'zod';

// Entity ids are UUIDs; user ids come from Better Auth and are not UUIDs.
const userId = z.string().min(1).max(64);

const taskIdParams = z.object({ taskId: z.string().uuid() });
const commentIdParams = z.object({ taskId: z.string().uuid(), commentId: z.string().uuid() });

// ─── List ──────────────────────────────────────────────────────────────────

export const listCommentsSchema = z.object({
  params: taskIdParams,
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

// ─── Create ────────────────────────────────────────────────────────────────

export const createCommentSchema = z.object({
  params: taskIdParams,
  body: z.object({
    body: z.string().trim().min(1).max(10000),
    mentions: z.array(userId).max(50).optional(),
  }),
});

// ─── Update ────────────────────────────────────────────────────────────────

export const updateCommentSchema = z.object({
  params: commentIdParams,
  body: z.object({
    body: z.string().trim().min(1).max(10000),
    mentions: z.array(userId).max(50).optional(),
  }),
});

// ─── Versions / Delete ───────────────────────────────────────────────────────

export const commentIdParamsSchema = z.object({ params: commentIdParams });

// ─── Inferred types ──────────────────────────────────────────────────────────

export type ListCommentsQuery = z.infer<typeof listCommentsSchema>['query'];
export type CreateCommentBody = z.infer<typeof createCommentSchema>['body'];
export type UpdateCommentBody = z.infer<typeof updateCommentSchema>['body'];
