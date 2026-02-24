import { env } from '../config/env.js';
import { db as inMemoryDb } from './in-memory-db.js';
import { PostgresDb } from './postgres-db.js';

const provider = env.DB_PROVIDER === 'memory' ? inMemoryDb : new PostgresDb();

export const db = provider;
