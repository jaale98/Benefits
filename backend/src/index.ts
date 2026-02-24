import { app } from './app.js';
import { env } from './config/env.js';
import { db } from './services/in-memory-db.js';

async function bootstrap(): Promise<void> {
  await db.init();

  app.listen(env.PORT, () => {
    console.log(`Backend listening on port ${env.PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error('Failed to bootstrap server', error);
  process.exit(1);
});
