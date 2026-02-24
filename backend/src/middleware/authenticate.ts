import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../services/token-service.js';
import { HttpError } from '../types/http-error.js';

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('authorization');
  if (!header) {
    next(new HttpError(401, 'Missing Authorization header'));
    return;
  }

  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    next(new HttpError(401, 'Authorization header must be in Bearer <token> format'));
    return;
  }

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    next(new HttpError(401, 'Invalid or expired token'));
  }
}
