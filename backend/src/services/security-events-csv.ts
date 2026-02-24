import type { SecurityEventRecord } from '../types/domain.js';

export function formatSecurityEventsCsv(events: SecurityEventRecord[]): string {
  const header = ['createdAt', 'severity', 'eventType', 'userId', 'tenantId', 'ipAddress', 'userAgent', 'metadata'];
  const rows = events.map((event) => [
    event.createdAt,
    event.severity,
    event.eventType,
    event.userId ?? '',
    event.tenantId ?? '',
    event.ipAddress ?? '',
    event.userAgent ?? '',
    JSON.stringify(event.metadata ?? {}),
  ]);

  return [header, ...rows]
    .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
    .join('\n');
}
