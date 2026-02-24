import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { log } from '../services/logger.js';

export function attachRequestContext(req: Request, res: Response, next: NextFunction): void {
  const requestId = req.header('x-request-id')?.trim() || randomUUID();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  const startNs = process.hrtime.bigint();

  log({
    level: 'INFO',
    message: 'request.started',
    requestId,
    context: {
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
      userAgent: req.header('user-agent') ?? null,
    },
  });

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startNs) / 1_000_000;
    log({
      level: res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO',
      message: 'request.completed',
      requestId,
      context: {
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Number(durationMs.toFixed(2)),
      },
    });
  });

  next();
}
