import type { Request, Response, NextFunction } from 'express';
import { HttpError } from '../types/http-error.js';

export function requireTenantAccess(paramName = 'tenantId') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new HttpError(401, 'Authentication required'));
      return;
    }

    if (req.user.role === 'FULL_ADMIN') {
      next();
      return;
    }

    const tenantId = req.params[paramName];
    if (!tenantId) {
      next(new HttpError(400, `Missing tenant path param: ${paramName}`));
      return;
    }

    if (!req.user.tenantId || req.user.tenantId !== tenantId) {
      next(new HttpError(403, 'Tenant access denied'));
      return;
    }

    next();
  };
}

export function requireSelfEmployeeOrFullAdmin(paramName = 'employeeUserId') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new HttpError(401, 'Authentication required'));
      return;
    }

    if (req.user.role === 'FULL_ADMIN') {
      next();
      return;
    }

    const employeeUserId = req.params[paramName];
    if (!employeeUserId) {
      next(new HttpError(400, `Missing employee path param: ${paramName}`));
      return;
    }

    if (req.user.role === 'EMPLOYEE' && req.user.id !== employeeUserId) {
      next(new HttpError(403, 'Employees may only access their own records'));
      return;
    }

    next();
  };
}
