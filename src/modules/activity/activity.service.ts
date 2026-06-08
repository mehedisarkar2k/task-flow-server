import { prisma } from '../../config/prisma';
import type { ActivityEntityType } from '../../../generated/prisma';

export type LogActivityInput = {
  actorId: string;
  projectId?: string | null;
  action: string;
  entityType: ActivityEntityType;
  entityId: string;
  message: string;
};

/**
 * Records an activity-log entry. Best-effort: a logging failure must never
 * break the user-facing mutation that triggered it.
 */
export const logActivity = async (input: LogActivityInput) => {
  try {
    await prisma.activityLog.create({
      data: {
        actorId: input.actorId,
        projectId: input.projectId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        message: input.message,
      },
    });
  } catch (err) {
    console.error('Failed to write activity log:', err);
  }
};
