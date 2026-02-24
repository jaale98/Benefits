import { db } from './db.js';
import { log } from './logger.js';

interface SecurityEventInput {
  eventType: string;
  severity?: 'INFO' | 'WARN' | 'ERROR';
  userId?: string | null;
  tenantId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function emitSecurityEvent(input: SecurityEventInput): Promise<void> {
  try {
    await db.createSecurityEvent({
      eventType: input.eventType,
      severity: input.severity,
      userId: input.userId,
      tenantId: input.tenantId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadata: input.metadata,
    });
  } catch (error) {
    log({
      level: 'ERROR',
      message: 'security_event.persist_failed',
      context: {
        eventType: input.eventType,
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }

  log({
    level: input.severity ?? 'INFO',
    message: `security_event.${input.eventType}`,
    context: {
      userId: input.userId ?? null,
      tenantId: input.tenantId ?? null,
      ipAddress: input.ipAddress ?? null,
      metadata: input.metadata ?? null,
    },
  });
}
