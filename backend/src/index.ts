import { app } from './app.js';
import { env } from './config/env.js';
import { db } from './services/db.js';
import { logError, logInfo } from './services/logger.js';

async function bootstrap(): Promise<void> {
  await db.init();

  app.listen(env.PORT, () => {
    logInfo('server.started', {
      port: env.PORT,
      nodeEnv: env.NODE_ENV,
      dbProvider: env.DB_PROVIDER,
    });
  });
}

bootstrap().catch((error) => {
  logError('server.bootstrap_failed', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
