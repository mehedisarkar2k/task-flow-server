import { z } from 'zod';

const role = z.enum(['ADMIN', 'PM', 'MEMBER']);
const userIdParams = z.object({ userId: z.string().min(1).max(64) });

export const listUsersSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().optional(),
    role: role.optional(),
  }),
});

export const changeUserRoleSchema = z.object({
  params: userIdParams,
  body: z.object({ role }),
});

export const searchUsersSchema = z.object({
  query: z.object({
    q: z.string().trim().min(2, 'Search query must be at least 2 characters'),
    projectId: z.string().uuid().optional(),
    excludeProjectId: z.string().uuid().optional(),
  }),
});

export type ListUsersQuery = z.infer<typeof listUsersSchema>['query'];
export type ChangeUserRoleBody = z.infer<typeof changeUserRoleSchema>['body'];
export type SearchUsersQuery = z.infer<typeof searchUsersSchema>['query'];
