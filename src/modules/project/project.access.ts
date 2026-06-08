import type { Prisma } from '../../../generated/prisma';
import { prisma } from '../../config/prisma';
import { ForbiddenError, NotFoundError } from '../../shared/errors/custom-errors';

interface SessionUser {
  id: string;
  role?: 'ADMIN' | 'PM' | 'MEMBER' | null;
}

/**
 * Prisma `where` fragment that scopes a project list query to what the user
 * is allowed to see:
 *   - ADMIN  → every project
 *   - PM     → projects they created or are a member of
 *   - MEMBER → projects they are a member of
 * Soft-deleted projects are always excluded.
 */
export const buildProjectScopeWhere = (user: SessionUser): Prisma.ProjectWhereInput => {
  const base: Prisma.ProjectWhereInput = { deletedAt: null };

  if (user.role === 'ADMIN') return base;

  return {
    ...base,
    OR: [{ createdBy: user.id }, { members: { some: { userId: user.id } } }],
  };
};

/**
 * Loads a project the user is allowed to view, otherwise throws.
 * Returns the project row so callers can avoid a second query.
 */
export const assertProjectAccess = async (projectId: string, user: SessionUser) => {
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: { members: { select: { userId: true } } },
  });

  if (!project) throw new NotFoundError('Project not found.');

  const isMember = project.members.some((m) => m.userId === user.id);
  const canView = user.role === 'ADMIN' || project.createdBy === user.id || isMember;

  if (!canView) throw new ForbiddenError("You don't have access to this project.");

  return project;
};

/**
 * Asserts the user may manage (mutate) a project: add members, edit columns,
 * update the project. ADMIN anywhere; PM on projects they created or belong to.
 * MEMBER never manages.
 */
export const assertProjectManage = async (projectId: string, user: SessionUser) => {
  const project = await assertProjectAccess(projectId, user);

  if (user.role === 'ADMIN') return project;

  const isMember = project.members.some((m) => m.userId === user.id);
  const canManage = user.role === 'PM' && (project.createdBy === user.id || isMember);

  if (!canManage) throw new ForbiddenError("You don't have permission to manage this project.");

  return project;
};
