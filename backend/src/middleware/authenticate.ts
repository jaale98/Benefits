import type { Request, Response, NextFunction } from 'express';
import { db } from '../services/db.js';
import { verifyAccessToken } from '../services/token-service.js';
import { HttpError } from '../types/http-error.js';

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  void (async () => {
    const header = req.header('authorization');
    if (!header) {
      throw new HttpError(401, 'Missing Authorization header');
    }

    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new HttpError(401, 'Authorization header must be in Bearer <token> format');
    }

    const authUser = verifyAccessToken(token);

    if (authUser.sessionId) {
      const activeSession = await db.isAuthSessionActive(authUser.sessionId);
      if (!activeSession) {
        throw new HttpError(401, 'Session is no longer active');
      }
    }

    req.user = authUser;
    next();
  })().catch((error) => {
    if (error instanceof HttpError) {
      next(error);
      return;
    }
    next(new HttpError(401, 'Invalid or expired token'));
  });
}
