import { Pool } from 'pg';
import { env } from '../config/env.js';
import { assertSchemaUpToDate, runMigrations } from '../services/migration-runner.js';

async function main(): Promise<void> {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for migrations');
  }

  const pool = new Pool({ connectionString: env.DATABASE_URL });

  try {
    await runMigrations(pool);
    await assertSchemaUpToDate(pool);
    console.log('Migrations applied and schema verified.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
