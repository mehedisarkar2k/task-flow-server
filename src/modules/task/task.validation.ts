import { z } from 'zod';

// ─── Shared ────────────────────────────────────────────────────────────────

const taskStatus = z.enum(['TODO', 'IN_PROGRESS', 'COMPLETED']);
const taskPriority = z.enum(['HIGH', 'MEDIUM', 'LOW']);

// Entity ids are UUIDs; user ids come from Better Auth and are not UUIDs.
const userId = z.string().min(1).max(64);

const projectIdParams = z.object({ projectId: z.string().uuid() });
const taskIdParams = z.object({ taskId: z.string().uuid() });

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  status: taskStatus.optional(),
  priority: taskPriority.optional(),
  assignee: userId.optional(),
  projectId: z.string().uuid().optional(),
  deadlineStatus: z.enum(['upcoming', 'overdue']).optional(),
  sort: z.enum(['latest', 'deadline', 'priority', 'updated']).default('latest'),
});

// ─── List ──────────────────────────────────────────────────────────────────

export const listTasksSchema = z.object({
  query: listQuery,
});

export const listProjectTasksSchema = z.object({
  params: projectIdParams,
  // projectId is taken from the path, so it is omitted from the query here.
  query: listQuery.omit({ projectId: true }),
});

// ─── Create ────────────────────────────────────────────────────────────────

export const createTaskSchema = z.object({
  params: projectIdParams,
  body: z.object({
    title: z.string().trim().min(2).max(200),
    description: z.string().trim().max(5000).optional(),
    assigneeIds: z.array(userId).max(20).optional(),
    dueDate: z.coerce.date().refine((d) => d.getTime() >= startOfToday(), {
      message: 'Please select a valid deadline. Due date cannot be in the past.',
    }),
    estimatedMinutes: z.coerce.number().int().positive().optional(),
    priority: taskPriority.default('MEDIUM'),
    status: taskStatus.default('TODO'),
    columnId: z.string().uuid().optional(),
  }),
});

// ─── Get / Delete ────────────────────────────────────────────────────────────

export const taskIdParamsSchema = z.object({ params: taskIdParams });

// ─── Update ────────────────────────────────────────────────────────────────

export const updateTaskSchema = z.object({
  params: taskIdParams,
  body: z
    .object({
      title: z.string().trim().min(2).max(200).optional(),
      description: z.string().trim().max(5000).nullable().optional(),
      assigneeIds: z.array(userId).max(20).optional(),
      dueDate: z.coerce
        .date()
        .refine((d) => d.getTime() >= startOfToday(), {
          message: 'Due date cannot be in the past.',
        })
        .optional(),
      estimatedMinutes: z.coerce.number().int().positive().nullable().optional(),
      priority: taskPriority.optional(),
      status: taskStatus.optional(),
    })
    .refine((b) => Object.keys(b).length > 0, { message: 'Provide at least one field to update.' }),
});

// ─── Status ────────────────────────────────────────────────────────────────

export const updateTaskStatusSchema = z.object({
  params: taskIdParams,
  body: z.object({ status: taskStatus }),
});

// ─── Move (Kanban) ────────────────────────────────────────────────────────────

export const moveTaskSchema = z.object({
  params: taskIdParams,
  body: z.object({
    columnId: z.string().uuid(),
    position: z.coerce.number().int().min(0),
  }),
});

// ─── Helpers ───────────────────────────────────────────────────────────────

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

// ─── Inferred types ──────────────────────────────────────────────────────────

export type ListTasksQuery = z.infer<typeof listQuery>;
export type CreateTaskBody = z.infer<typeof createTaskSchema>['body'];
export type UpdateTaskBody = z.infer<typeof updateTaskSchema>['body'];
export type UpdateTaskStatusBody = z.infer<typeof updateTaskStatusSchema>['body'];
export type MoveTaskBody = z.infer<typeof moveTaskSchema>['body'];
