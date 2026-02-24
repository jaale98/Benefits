import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { log } from '../services/logger.js';
import { HttpError } from '../types/http-error.js';

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction): void {
  next(new HttpError(404, 'Route not found'));
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = req.requestId;

  if (err instanceof HttpError) {
    log({
      level: err.statusCode >= 500 ? 'ERROR' : 'WARN',
      message: 'request.error',
      requestId,
      context: {
        statusCode: err.statusCode,
        error: err.message,
      },
    });
    res.status(err.statusCode).json({ error: err.message, requestId });
    return;
  }

  if (err instanceof ZodError) {
    log({
      level: 'WARN',
      message: 'request.validation_error',
      requestId,
      context: {
        errorCount: err.errors.length,
      },
    });
    res.status(400).json({
      error: 'Validation failed',
      requestId,
      details: err.errors.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
    return;
  }

  log({
    level: 'ERROR',
    message: 'request.unhandled_error',
    requestId,
    context: {
      error: err instanceof Error ? err.message : String(err),
    },
  });
  res.status(500).json({ error: 'Internal server error', requestId });
}
