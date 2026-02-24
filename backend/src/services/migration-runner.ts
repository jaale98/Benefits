import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Pool } from 'pg';
import { env } from '../config/env.js';

interface MigrationFile {
  version: string;
  name: string;
  filename: string;
  sql: string;
  checksum: string;
}

interface AppliedMigration {
  version: string;
  checksum: string;
}

export async function runMigrations(pool: Pool): Promise<void> {
  const migrations = await loadMigrationFiles();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const appliedResult = await pool.query<AppliedMigration>(
    `SELECT version, checksum FROM schema_migrations ORDER BY version ASC`,
  );

  const appliedMap = new Map(appliedResult.rows.map((row) => [row.version, row.checksum]));

  for (const migration of migrations) {
    const appliedChecksum = appliedMap.get(migration.version);
    if (appliedChecksum) {
      if (appliedChecksum !== migration.checksum) {
        throw new Error(
          `Migration checksum mismatch for ${migration.filename}. ` +
            `Expected ${appliedChecksum}, got ${migration.checksum}`,
        );
      }
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(migration.sql);
      await client.query(
        `INSERT INTO schema_migrations (version, name, checksum)
         VALUES ($1, $2, $3)`,
        [migration.version, migration.name, migration.checksum],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export async function assertSchemaUpToDate(pool: Pool): Promise<void> {
  const migrations = await loadMigrationFiles();

  const tableExists = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'schema_migrations'
    ) AS exists`,
  );

  if (!tableExists.rows[0]?.exists) {
    throw new Error('schema_migrations table does not exist. Run migrations first.');
  }

  const appliedResult = await pool.query<AppliedMigration>(
    `SELECT version, checksum FROM schema_migrations ORDER BY version ASC`,
  );

  const appliedMap = new Map(appliedResult.rows.map((row) => [row.version, row.checksum]));

  const missing: string[] = [];
  const mismatched: string[] = [];

  for (const migration of migrations) {
    const checksum = appliedMap.get(migration.version);
    if (!checksum) {
      missing.push(migration.filename);
      continue;
    }
    if (checksum !== migration.checksum) {
      mismatched.push(migration.filename);
    }
  }

  if (missing.length || mismatched.length) {
    const messages: string[] = [];
    if (missing.length) {
      messages.push(`Missing migrations: ${missing.join(', ')}`);
    }
    if (mismatched.length) {
      messages.push(`Checksum mismatches: ${mismatched.join(', ')}`);
    }

    throw new Error(messages.join(' | '));
  }
}

async function loadMigrationFiles(): Promise<MigrationFile[]> {
  const migrationsDir = resolveMigrationsDir();
  const files = (await fs.readdir(migrationsDir)).filter((entry) => entry.endsWith('.sql')).sort();

  const parsedFiles: MigrationFile[] = [];

  for (const filename of files) {
    const versionMatch = filename.match(/^(\d+)_/);
    if (!versionMatch) {
      throw new Error(`Invalid migration filename: ${filename}. Use NNN_name.sql format.`);
    }

    const fullPath = path.join(migrationsDir, filename);
    const sql = await fs.readFile(fullPath, 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');

    parsedFiles.push({
      version: versionMatch[1],
      name: filename.replace(/\.sql$/, ''),
      filename,
      sql,
      checksum,
    });
  }

  return parsedFiles;
}

function resolveMigrationsDir(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const projectRoot = path.resolve(path.dirname(currentFile), '../../..');

  if (path.isAbsolute(env.MIGRATIONS_DIR)) {
    return env.MIGRATIONS_DIR;
  }

  return path.resolve(projectRoot, env.MIGRATIONS_DIR);
}
