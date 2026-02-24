export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface LogInput {
  level: LogLevel;
  message: string;
  requestId?: string;
  context?: Record<string, unknown>;
}

export function log(input: LogInput): void {
  const record = {
    ts: new Date().toISOString(),
    level: input.level,
    message: input.message,
    requestId: input.requestId,
    ...input.context,
  };

  if (input.level === 'ERROR') {
    console.error(JSON.stringify(record));
    return;
  }

  console.log(JSON.stringify(record));
}

export function logInfo(message: string, context?: Record<string, unknown>): void {
  log({ level: 'INFO', message, context });
}

export function logError(message: string, context?: Record<string, unknown>): void {
  log({ level: 'ERROR', message, context });
}
