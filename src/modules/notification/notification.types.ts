import { NotificationType, NotificationEntityType } from '../../../generated/prisma';

export type CreateNotificationDto = {
  userId: string;
  actorId?: string | null;
  type: NotificationType;
  entityType: NotificationEntityType;
  entityId: string;
  message: string;
};

export type NotificationListQuery = {
  page: number;
  limit: number;
  filter?: 'all' | 'unread' | 'archived';
};
