import type { Request, Response, NextFunction } from 'express';
import type { Role } from '../types/auth.js';
import { HttpError } from '../types/http-error.js';

export function requireRoles(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new HttpError(401, 'Authentication required'));
      return;
    }

    if (!roles.includes(req.user.role)) {
      next(new HttpError(403, `Requires role: ${roles.join(', ')}`));
      return;
    }

    next();
  };
}
