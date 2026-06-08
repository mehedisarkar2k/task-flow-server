import type OpenAI from 'openai';
import type { Prisma, Role } from '../../../generated/prisma';
import { prisma } from '../../config/prisma';
import { getDashboardStats } from '../dashboard/dashboard.service';
import { getNotifications, sendNotifications } from '../notification/notification.service';
import { buildProjectScopeWhere, assertProjectManage } from '../project/project.access';
import { DEFAULT_COLUMNS } from '../project/column.controller';
import { canChangeTaskStatus, canManageTask, loadAccessibleTask } from '../task/task.access';

/** The minimal session shape the tools need. Mirrors the other access helpers. */
export interface AssistantUser {
  id: string;
  role?: Role | null;
}

type ToolExecutor = (user: AssistantUser, args: Record<string, unknown>) => Promise<unknown>;

interface AssistantTool {
  /** Roles allowed to use this tool. The data each tool returns is ALSO role-scoped
   *  internally — this list is a second, coarser gate (defense in depth). */
  roles: Role[];
  definition: OpenAI.Chat.Completions.ChatCompletionTool;
  execute: ToolExecutor;
}

const ALL_ROLES: Role[] = ['ADMIN', 'PM', 'MEMBER'];

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const dateOnly = (d: Date | null) => (d ? d.toISOString().split('T')[0] : null);

/** Tasks assigned to THIS user (already implies they can see them). */
const myTasksWhere = (user: AssistantUser): Prisma.TaskWhereInput => ({
  deletedAt: null,
  assignees: { some: { userId: user.id } },
});

const STATUS_MAP = {
  todo: 'TODO',
  in_progress: 'IN_PROGRESS',
  completed: 'COMPLETED',
} as const;

// ---------------------------------------------------------------------------
// Tool implementations — each returns plain JSON-serialisable data, never raw
// Prisma rows with internal-only fields.
// ---------------------------------------------------------------------------

const getMyProgress: ToolExecutor = async (user) => {
  const where = myTasksWhere(user);
  const [total, completed, overdue] = await Promise.all([
    prisma.task.count({ where }),
    prisma.task.count({ where: { ...where, status: 'COMPLETED' } }),
    prisma.task.count({
      where: { ...where, status: { not: 'COMPLETED' }, dueDate: { lt: startOfToday() } },
    }),
  ]);

  const pending = total - completed;
  const completionRate = total ? Math.round((completed / total) * 100) : 0;

  return { total, completed, pending, overdue, completionRate };
};

const getMyTasks: ToolExecutor = async (user, args) => {
  const status = typeof args.status === 'string' ? args.status : undefined;
  const rawLimit = typeof args.limit === 'number' ? args.limit : 10;
  const limit = Math.min(Math.max(rawLimit, 1), 25);

  let where: Prisma.TaskWhereInput = myTasksWhere(user);
  if (status === 'overdue') {
    where = { ...where, status: { not: 'COMPLETED' }, dueDate: { lt: startOfToday() } };
  } else if (status && status in STATUS_MAP) {
    where = { ...where, status: STATUS_MAP[status as keyof typeof STATUS_MAP] };
  }

  const tasks = await prisma.task.findMany({
    where,
    orderBy: [{ dueDate: 'asc' }, { updatedAt: 'desc' }],
    take: limit,
    select: {
      title: true,
      status: true,
      priority: true,
      dueDate: true,
      project: { select: { name: true } },
    },
  });

  return tasks.map((t) => ({
    title: t.title,
    status: t.status,
    priority: t.priority,
    dueDate: dateOnly(t.dueDate),
    project: t.project?.name ?? null,
  }));
};

const getTeamTasks: ToolExecutor = async (user, args) => {
  const status = typeof args.status === 'string' ? args.status : undefined;
  const userId = typeof args.userId === 'string' ? args.userId : undefined;
  const rawLimit = typeof args.limit === 'number' ? args.limit : 15;
  const limit = Math.min(Math.max(rawLimit, 1), 50);

  // Use the same scope as projects
  const projectScope = buildProjectScopeWhere(user as any); // Type cast since user roles match
  
  // Find projects they have access to
  const projects = await prisma.project.findMany({
    where: projectScope,
    select: { id: true }
  });
  const projectIds = projects.map(p => p.id);

  let where: Prisma.TaskWhereInput = { deletedAt: null, projectId: { in: projectIds } };
  
  if (status === 'overdue') {
    where = { ...where, status: { not: 'COMPLETED' }, dueDate: { lt: startOfToday() } };
  } else if (status && status in STATUS_MAP) {
    where = { ...where, status: STATUS_MAP[status as keyof typeof STATUS_MAP] };
  }

  if (userId) {
    where = { ...where, assignees: { some: { userId } } };
  }

  const tasks = await prisma.task.findMany({
    where,
    orderBy: [{ dueDate: 'asc' }, { updatedAt: 'desc' }],
    take: limit,
    select: {
      title: true,
      status: true,
      priority: true,
      dueDate: true,
      project: { select: { name: true } },
      assignees: { select: { user: { select: { name: true } } } }
    },
  });

  return tasks.map((t) => ({
    title: t.title,
    status: t.status,
    priority: t.priority,
    dueDate: dateOnly(t.dueDate),
    project: t.project?.name ?? null,
    assignees: t.assignees.map(a => a.user.name).join(', ')
  }));
};

const getDashboardStatsTool: ToolExecutor = async (user) => {
  const stats = await getDashboardStats(user);

  // MEMBERs don't get to see other people's workload through the assistant.
  if (user.role !== 'ADMIN' && user.role !== 'PM') {
    const { memberWorkload, ...rest } = stats;
    return rest;
  }
  return stats;
};

const getMyNotificationsTool: ToolExecutor = async (user, args) => {
  const filter = typeof args.filter === 'string' ? args.filter : 'unread';
  const limit = typeof args.limit === 'number' ? args.limit : 10;
  
  const { notifications } = await getNotifications(user.id, { page: 1, limit, filter: filter as any });
  
  return notifications.map(n => ({
    message: n.message,
    type: n.type,
    isRead: n.isRead,
    createdAt: n.createdAt,
    actor: n.actor?.name
  }));
};

const searchUsersTool: ToolExecutor = async (user, args) => {
  const name = typeof args.name === 'string' ? args.name : '';
  const role = typeof args.role === 'string' ? args.role : undefined;
  
  const where: any = {};
  if (name) where.name = { contains: name, mode: 'insensitive' };
  
  if (role) {
    if (['ADMIN', 'PM', 'MEMBER'].includes(role)) {
      where.role = role;
    }
  }

  const users = await prisma.user.findMany({
    where,
    take: 10,
    select: { id: true, name: true, email: true, role: true }
  });
  
  return users;
};

// --- Mutations ---

const createProjectTool: ToolExecutor = async (user, args) => {
  if (user.role !== 'ADMIN' && user.role !== 'PM') {
    return { error: 'You do not have permission to create projects.' };
  }

  const name = typeof args.name === 'string' ? args.name : 'New Project';
  const description = typeof args.description === 'string' ? args.description : undefined;
  const status = typeof args.status === 'string' ? args.status : 'ACTIVE';
  const pmId = typeof args.pmId === 'string' ? args.pmId : user.id;
  const leadId = typeof args.leadId === 'string' ? args.leadId : undefined;

  if (!leadId) {
    return { error: 'leadId is required. You must ask the user to select a Project Lead.' };
  }

  const roleByUser = new Map<string, 'LEAD' | 'MEMBER'>();
  roleByUser.set(pmId, 'MEMBER');
  roleByUser.set(leadId, 'LEAD');

  const project = await prisma.project.create({
    data: {
      name,
      description,
      status: status as any,
      createdBy: pmId,
      members: { create: [...roleByUser.entries()].map(([userId, role]) => ({ userId, role })) },
      columns: { create: DEFAULT_COLUMNS },
    },
    select: { id: true, name: true }
  });

  return { success: true, message: `Project '${project.name}' created successfully.`, projectId: project.id };
};

const createTaskTool: ToolExecutor = async (user, args) => {
  const projectId = typeof args.projectId === 'string' ? args.projectId : '';
  const title = typeof args.title === 'string' ? args.title : '';
  const description = typeof args.description === 'string' ? args.description : undefined;
  const status = typeof args.status === 'string' ? args.status : 'TODO';

  if (!projectId || !title) return { error: 'projectId and title are required.' };

  try {
    const isManager = await canManageTask(projectId, user);
    if (!isManager) {
      return { error: 'You do not have permission to create tasks in this project.' };
    }

    const column = await prisma.boardColumn.findFirst({
      where: { projectId, mappedStatus: status as any },
      select: { id: true },
    });

    const task = await prisma.task.create({
      data: {
        projectId,
        title,
        description,
        status: status as any,
        createdBy: user.id,
        columnId: column?.id,
      },
      select: { id: true, title: true }
    });

    return { success: true, message: `Task '${task.title}' created successfully.` };
  } catch (error: any) {
    return { error: error.message };
  }
};

const updateTaskStatusTool: ToolExecutor = async (user, args) => {
  const taskId = typeof args.taskId === 'string' ? args.taskId : '';
  const status = typeof args.status === 'string' ? args.status : '';

  if (!taskId || !['TODO', 'IN_PROGRESS', 'COMPLETED'].includes(status)) {
    return { error: 'Invalid taskId or status.' };
  }

  try {
    const task = await loadAccessibleTask(taskId, user);
    if (!(await canChangeTaskStatus(task, user))) {
      return { error: 'You do not have permission to update this task.' };
    }

    const data: any = { status };
    if (status === 'COMPLETED' && task.status !== 'COMPLETED') data.completedAt = new Date();
    if (status !== 'COMPLETED' && task.status === 'COMPLETED') data.completedAt = null;

    const mappedColumn = await prisma.boardColumn.findFirst({
      where: { projectId: task.projectId, mappedStatus: status as any },
      select: { id: true },
    });
    if (mappedColumn) data.columnId = mappedColumn.id;

    await prisma.task.update({ where: { id: taskId }, data });
    return { success: true, message: `Task status updated to ${status}.` };
  } catch (error: any) {
    return { error: error.message };
  }
};

const assignTaskTool: ToolExecutor = async (user, args) => {
  const taskId = typeof args.taskId === 'string' ? args.taskId : '';
  const userId = typeof args.userId === 'string' ? args.userId : '';

  if (!taskId || !userId) return { error: 'taskId and userId are required.' };

  try {
    const task = await loadAccessibleTask(taskId, user);
    if (!(await canManageTask(task.projectId, user))) {
      return { error: 'You do not have permission to assign this task.' };
    }

    // Check if user is a member of the project
    const member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: task.projectId, userId } }
    });
    if (!member) return { error: 'The specified user is not a member of this project.' };

    const existing = task.assignees.find(a => a.userId === userId);
    if (existing) {
      // Remove assignee
      await prisma.taskAssignee.delete({
        where: { taskId_userId: { taskId, userId } }
      });
      return { success: true, message: 'User removed from task.' };
    } else {
      // Add assignee
      await prisma.taskAssignee.create({
        data: { taskId, userId }
      });
      
      await sendNotifications([userId], {
        actorId: user.id,
        type: 'TASK_ASSIGNED',
        entityType: 'TASK',
        entityId: task.id,
        message: `You have been assigned to task "${task.title}".`,
      });

      return { success: true, message: 'User assigned to task.' };
    }
  } catch (error: any) {
    return { error: error.message };
  }
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const TOOLS: Record<string, AssistantTool> = {
  get_my_progress: {
    roles: ALL_ROLES,
    execute: getMyProgress,
    definition: {
      type: 'function',
      function: {
        name: 'get_my_progress',
        description:
          "Get the current user's own task progress: total, completed, pending and overdue task counts plus completion rate. Use for questions like 'my progress', 'how am I doing', 'koto kaj baki'.",
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
  },
  get_my_tasks: {
    roles: ALL_ROLES,
    execute: getMyTasks,
    definition: {
      type: 'function',
      function: {
        name: 'get_my_tasks',
        description:
          "List the current user's own tasks, optionally filtered by status. Use for 'my ongoing tasks', 'what's due', 'overdue tasks', 'my todo list'.",
        parameters: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['todo', 'in_progress', 'completed', 'overdue'],
              description: 'Optional status filter. Omit to get all of the user\'s tasks.',
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 25,
              description: 'Max number of tasks to return (default 10).',
            },
          },
          additionalProperties: false,
        },
      },
    },
  },
  get_my_notifications: {
    roles: ALL_ROLES,
    execute: getMyNotificationsTool,
    definition: {
      type: 'function',
      function: {
        name: 'get_my_notifications',
        description: 'Get the current user\'s recent notifications. Use when they ask to check notifications or alerts.',
        parameters: {
          type: 'object',
          properties: {
            filter: { type: 'string', enum: ['unread', 'all'], description: 'Filter for notifications (default: unread)' },
            limit: { type: 'integer', description: 'Max number of notifications to return (default: 10)' }
          },
          additionalProperties: false
        }
      }
    }
  },
  search_users: {
    roles: ALL_ROLES,
    execute: searchUsersTool,
    definition: {
      type: 'function',
      function: {
        name: 'search_users',
        description: 'Search for users in the system by name and/or role. Use when the user asks about a specific person or you need to list users to select a PM or LEAD. Do NOT use role="LEAD" as it is not a system role.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the user to search for.' },
            role: { type: 'string', enum: ['ADMIN', 'PM', 'MEMBER'], description: 'Filter users by their global system role (ADMIN, PM, MEMBER).' }
          },
          additionalProperties: false
        }
      }
    }
  },
  get_team_tasks: {
    roles: ['ADMIN', 'PM'],
    execute: getTeamTasks,
    definition: {
      type: 'function',
      function: {
        name: 'get_team_tasks',
        description:
          "List tasks across the team's projects. For ADMINs, searches all projects. For PMs, searches their accessible projects. Optionally filter by status or a specific userId.",
        parameters: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['todo', 'in_progress', 'completed', 'overdue'],
              description: 'Optional status filter.',
            },
            userId: {
              type: 'string',
              description: 'Optional user ID to filter tasks assigned to a specific team member.',
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 50,
              description: 'Max number of tasks to return (default 15).',
            },
          },
          additionalProperties: false,
        },
      },
    },
  },
  get_dashboard_stats: {
    roles: ALL_ROLES,
    execute: getDashboardStatsTool,
    definition: {
      type: 'function',
      function: {
        name: 'get_dashboard_stats',
        description:
          'Get role-scoped dashboard statistics across the projects the user can access: project/task counts, tasks by status and priority, upcoming deadlines, per-project progress, AND member workload / team performance. Use for overview questions like "team status", "project summary", "who is doing the best work", "member workload".',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
  },
  create_project: {
    roles: ['ADMIN', 'PM'],
    execute: createProjectTool,
    definition: {
      type: 'function',
      function: {
        name: 'create_project',
        description: 'Create a new project. ONLY call this after getting explicit confirmation via a #action chip.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Project name' },
            description: { type: 'string', description: 'Project description' },
            status: { type: 'string', enum: ['ACTIVE', 'ON_HOLD', 'COMPLETED'], description: 'Project status' },
            pmId: { type: 'string', description: 'ID of the Project Manager. If Admin, MUST ask user to choose one.' },
            leadId: { type: 'string', description: 'ID of the Project Lead. You MUST ask the user to choose one.' }
          },
          required: ['name', 'leadId'],
          additionalProperties: false
        }
      }
    }
  },
  create_task: {
    roles: ALL_ROLES,
    execute: createTaskTool,
    definition: {
      type: 'function',
      function: {
        name: 'create_task',
        description: 'Create a new task in a project. ONLY call this after getting explicit confirmation via a #action chip.',
        parameters: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'ID of the project to create the task in' },
            title: { type: 'string', description: 'Task title' },
            description: { type: 'string', description: 'Task description' },
            status: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'COMPLETED'] }
          },
          required: ['projectId', 'title'],
          additionalProperties: false
        }
      }
    }
  },
  update_task_status: {
    roles: ALL_ROLES,
    execute: updateTaskStatusTool,
    definition: {
      type: 'function',
      function: {
        name: 'update_task_status',
        description: 'Update the status of a specific task. ONLY call this after getting explicit confirmation via a #action chip.',
        parameters: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'ID of the task' },
            status: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'COMPLETED'] }
          },
          required: ['taskId', 'status'],
          additionalProperties: false
        }
      }
    }
  },
  assign_task: {
    roles: ['ADMIN', 'PM'],
    execute: assignTaskTool,
    definition: {
      type: 'function',
      function: {
        name: 'assign_task',
        description: 'Assign or unassign a user from a task. Toggles assignment. ONLY call this after getting explicit confirmation via a #action chip.',
        parameters: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'ID of the task' },
            userId: { type: 'string', description: 'ID of the user to assign/unassign' }
          },
          required: ['taskId', 'userId'],
          additionalProperties: false
        }
      }
    }
  }
};

/** Tool definitions the model is allowed to call for this user's role. */
export const getToolDefs = (user: AssistantUser | null): OpenAI.Chat.Completions.ChatCompletionTool[] =>
  Object.values(TOOLS)
    .filter((t) => user ? (!user.role || t.roles.includes(user.role)) : t.roles.includes('UNAUTHENTICATED' as any))
    .map((t) => t.definition);

/** Run a tool by name with the caller's session. Throws on unknown/forbidden tool. */
export const executeTool = async (
  name: string,
  user: AssistantUser | null,
  args: Record<string, unknown>,
): Promise<unknown> => {
  const tool = TOOLS[name];
  if (!tool) return { error: `Unknown tool: ${name}` };
  if (!user && !tool.roles.includes('UNAUTHENTICATED' as any)) {
    return { error: 'You must be logged in to access this information.' };
  }
  if (user && user.role && !tool.roles.includes(user.role)) {
    return { error: 'You do not have access to this information.' };
  }
  return tool.execute(user as any, args); // Tools currently cast to user anyway or we can pass null to specific tools
};
