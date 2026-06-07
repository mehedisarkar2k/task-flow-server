import { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '../shared/errors/custom-errors';
import { Role } from '../../generated/prisma';

/**
 * Middleware to restrict access based on user roles.
 * Must be used AFTER `requireAuth` middleware so that `req.user` is available.
 * 
 * @param allowedRoles List of roles permitted to access the route (e.g., Role.ADMIN)
 */
export const requireRole = (...allowedRoles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new UnauthorizedError('User is not authenticated', [
        'Make sure to use requireAuth middleware before requireRole',
      ]);
    }

    const userRole = req.user.role;

    if (!userRole || !allowedRoles.includes(userRole)) {
      throw new ForbiddenError('You do not have permission to perform this action', [
        `This action requires one of the following roles: ${allowedRoles.join(', ')}`,
        `Your current role is: ${userRole || 'Not assigned'}`,
      ]);
    }

    next();
  };
};
