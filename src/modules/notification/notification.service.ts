import { prisma } from '../../config/prisma';
import { sendEmail } from '../../shared/utils/email';
import type { CreateNotificationDto, NotificationListQuery } from './notification.types';

/**
 * Utility to send notifications and optionally emails.
 */
export const sendNotifications = async (
  recipientIds: string[],
  data: Omit<CreateNotificationDto, 'userId'>,
) => {
  // Deduplicate recipients and exclude actor
  const uniqueRecipients = [...new Set(recipientIds)].filter((id) => id !== data.actorId);

  if (uniqueRecipients.length === 0) return;

  // Save notifications to database
  await prisma.notification.createMany({
    data: uniqueRecipients.map((userId) => ({
      userId,
      actorId: data.actorId,
      type: data.type,
      entityType: data.entityType,
      entityId: data.entityId,
      message: data.message,
    })),
  });

  // Fetch users to get emails (if we need to check email preference later)
  const users = await prisma.user.findMany({
    where: { id: { in: uniqueRecipients } },
    select: { email: true, name: true },
  });

  // Send dummy emails
  for (const user of users) {
    await sendEmail(
      user.email,
      `TaskFlow Notification: ${data.type.replace(/_/g, ' ')}`,
      `Hi ${user.name},\n\n${data.message}\n\nCheck it out on TaskFlow.`,
    );
  }
};

export const getNotifications = async (userId: string, query: NotificationListQuery) => {
  const where: any = { userId };
  
  if (query.filter === 'unread') {
    where.isRead = false;
    where.archivedAt = null;
  } else if (query.filter === 'archived') {
    where.archivedAt = { not: null };
  } else {
    // "all" typically means non-archived
    where.archivedAt = null;
  }

  const [total, notifications] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
    }),
  ]);

  return { total, notifications };
};

export const getUnreadCount = async (userId: string) => {
  return prisma.notification.count({
    where: { userId, isRead: false, archivedAt: null },
  });
};

export const markAsRead = async (notificationId: string, userId: string) => {
  return prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { isRead: true },
  });
};

export const markAllAsRead = async (userId: string) => {
  return prisma.notification.updateMany({
    where: { userId, isRead: false, archivedAt: null },
    data: { isRead: true },
  });
};

export const archiveNotification = async (notificationId: string, userId: string) => {
  return prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { archivedAt: new Date(), isRead: true },
  });
};
