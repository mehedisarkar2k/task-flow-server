import type { Response } from 'express';
import { catchAsync } from '../../shared/utils/catch-async';
import { sendResponse } from '../../shared/utils/send-response';
import { getDashboardStats } from './dashboard.service';

export const dashboardStats = catchAsync(async (req, res: Response) => {
  const user = req.user!;
  const data = await getDashboardStats(user);
  sendResponse.success({ res, data });
});
