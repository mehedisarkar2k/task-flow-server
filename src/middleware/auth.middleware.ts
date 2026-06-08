import { Request, Response, NextFunction } from 'express';
import { auth } from '../config/auth';
import { UnauthorizedError } from '../shared/errors/custom-errors';
import { catchAsync } from '../shared/utils/catch-async';

import { fromNodeHeaders } from 'better-auth/node';

export const requireAuth = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const headers = fromNodeHeaders(req.headers);
  const session = await auth.api.getSession({ headers });

  if (!session) {
    throw new UnauthorizedError('Please log in to access this resource', [
      'Your session may have expired.',
      'Check if cookies are blocked in your browser.',
    ]);
  }

// Attach session and user to the request object
  req.user = session.user;
  req.session = session.session;

  next();
});

export const optionalAuth = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const headers = fromNodeHeaders(req.headers);
  const session = await auth.api.getSession({ headers });

  if (session) {
    req.user = session.user;
    req.session = session.session;
  }

  next();
});
