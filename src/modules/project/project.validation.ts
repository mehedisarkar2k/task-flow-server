import { z } from 'zod';

// ─── Shared ────────────────────────────────────────────────────────────────

const projectStatus = z.enum(['ACTIVE', 'COMPLETED', 'ON_HOLD']);
const projectMemberRole = z.enum(['LEAD', 'MEMBER']);
const columnColor = z.enum(['muted', 'primary', 'secondary', 'destructive', 'emerald', 'blue']);

// Entity ids are UUIDs; user ids come from Better Auth and are not UUIDs.
const userId = z.string().min(1).max(64);

const projectIdParams = z.object({
  projectId: z.string().uuid(),
});

// ─── Projects ──────────────────────────────────────────────────────────────

export const listProjectsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(12),
    search: z.string().trim().optional(),
    status: projectStatus.optional(),
    sort: z.enum(['latest', 'deadline', 'updated']).default('latest'),
  }),
});

export const createProjectSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(200),
    description: z.string().trim().max(2000).optional(),
    deadline: z.coerce.date().refine((d) => d.getTime() > Date.now(), {
      message: 'Please select a future deadline.',
    }),
    status: projectStatus.default('ACTIVE'),
    // The project's manager (PM). Required when an ADMIN creates the project;
    // ignored for a PM creator (they become the PM of their own project).
    pmId: userId.optional(),
    // The project's team lead — required for everyone.
    leadId: userId,
  }),
});

export const projectIdParamsSchema = z.object({
  params: projectIdParams,
});

export const updateProjectSchema = z.object({
  params: projectIdParams,
  body: z.object({
    name: z.string().trim().min(2).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    deadline: z.coerce
      .date()
      .refine((d) => d.getTime() > Date.now(), { message: 'Please select a valid deadline.' })
      .optional(),
    status: projectStatus.optional(),
  }),
});

// ─── Members ───────────────────────────────────────────────────────────────

export const addMemberSchema = z.object({
  params: projectIdParams,
  body: z.object({
    userId,
    projectRole: projectMemberRole.default('MEMBER'),
  }),
});

export const memberParamsSchema = z.object({
  params: projectIdParams.extend({ userId }),
});

export const updateMemberRoleSchema = z.object({
  params: projectIdParams.extend({ userId }),
  body: z.object({
    projectRole: projectMemberRole,
  }),
});

// ─── Columns ───────────────────────────────────────────────────────────────

export const createColumnSchema = z.object({
  params: projectIdParams,
  body: z.object({
    name: z.string().trim().min(1).max(40),
    color: columnColor,
  }),
});

export const columnParamsSchema = z.object({
  params: projectIdParams.extend({ columnId: z.string().uuid() }),
});

export const updateColumnSchema = z.object({
  params: projectIdParams.extend({ columnId: z.string().uuid() }),
  body: z
    .object({
      name: z.string().trim().min(1).max(40).optional(),
      color: columnColor.optional(),
    })
    .refine((b) => b.name !== undefined || b.color !== undefined, {
      message: 'Provide a name or color to update.',
    }),
});

export const reorderColumnsSchema = z.object({
  params: projectIdParams,
  body: z.object({
    orderedColumnIds: z.array(z.string().uuid()).min(1),
  }),
});

export const deleteColumnSchema = z.object({
  params: projectIdParams.extend({ columnId: z.string().uuid() }),
  query: z.object({
    moveTasksTo: z.string().uuid().optional(),
  }),
});

// ─── Inferred Types ──────────────────────────────────────────────────────────

export type ListProjectsQuery = z.infer<typeof listProjectsSchema>['query'];
export type CreateProjectBody = z.infer<typeof createProjectSchema>['body'];
export type UpdateProjectBody = z.infer<typeof updateProjectSchema>['body'];
export type AddMemberBody = z.infer<typeof addMemberSchema>['body'];
export type UpdateMemberRoleBody = z.infer<typeof updateMemberRoleSchema>['body'];
export type CreateColumnBody = z.infer<typeof createColumnSchema>['body'];
export type UpdateColumnBody = z.infer<typeof updateColumnSchema>['body'];
export type ReorderColumnsBody = z.infer<typeof reorderColumnsSchema>['body'];
