import { z } from 'zod';

// User ids come from Better Auth and are not UUIDs.
const userIdParams = z.object({ userId: z.string().min(1).max(64) });

export const listTeamMembersSchema = z.object({
  query: z.object({
    search: z.string().trim().optional(),
    department: z.string().trim().optional(),
  }),
});

export const teamMemberParamsSchema = z.object({ params: userIdParams });

export const teamMemberTasksSchema = z.object({
  params: userIdParams,
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(['TODO', 'IN_PROGRESS', 'COMPLETED']).optional(),
    priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
    projectId: z.string().uuid().optional(),
  }),
});

export type ListTeamMembersQuery = z.infer<typeof listTeamMembersSchema>['query'];
export type TeamMemberTasksQuery = z.infer<typeof teamMemberTasksSchema>['query'];
