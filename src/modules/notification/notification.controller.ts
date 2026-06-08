import type { Response } from 'express';
import { catchAsync } from '../../shared/utils/catch-async';
import { sendResponse } from '../../shared/utils/send-response';
import * as notificationService from './notification.service';
import type { NotificationListQuery } from './notification.types';

export const getNotifications = catchAsync(async (req, res: Response) => {
  const user = req.user!;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const filter = (req.query.filter as string) || 'all';

  const query: NotificationListQuery = {
    page,
    limit,
    filter: filter as NotificationListQuery['filter'],
  };

  const { total, notifications } = await notificationService.getNotifications(user.id, query);

  sendResponse.success({
    res,
    data: notifications,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

export const getUnreadCount = catchAsync(async (req, res: Response) => {
  const user = req.user!;
  const count = await notificationService.getUnreadCount(user.id);
  
  sendResponse.success({
    res,
    data: { count },
  });
});

export const markAsRead = catchAsync(async (req, res: Response) => {
  const user = req.user!;
  const { id } = req.params as { id: string };
  
  await notificationService.markAsRead(id, user.id);
  
  sendResponse.success({
    res,
    message: 'Notification marked as read',
  });
});

export const markAllAsRead = catchAsync(async (req, res: Response) => {
  const user = req.user!;
  
  await notificationService.markAllAsRead(user.id);
  
  sendResponse.success({
    res,
    message: 'All notifications marked as read',
  });
});

export const archiveNotification = catchAsync(async (req, res: Response) => {
  const user = req.user!;
  const { id } = req.params as { id: string };
  
  await notificationService.archiveNotification(id, user.id);
  
  sendResponse.success({
    res,
    message: 'Notification archived',
  });
});
