import { Request, Response } from 'express';
import { catchAsync } from '../../shared/utils/catch-async';
import { env } from '../../config/env';

export const getSystemConfig = catchAsync(async (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      profileImageBaseUrl: env.CF_PUBLIC_URL,
    },
  });
});
