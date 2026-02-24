import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

function booleanFromEnv(defaultValue: boolean) {
  return z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? defaultValue : value === 'true'));
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default('*'),
  DB_PROVIDER: z.enum(['postgres', 'memory']).default('postgres'),
  DATABASE_URL: z.string().optional(),
  DB_AUTO_MIGRATE: booleanFromEnv(true),
  DB_REQUIRE_SCHEMA_CHECK: booleanFromEnv(true),
  MIGRATIONS_DIR: z.string().default('db/migrations'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  ACCESS_TOKEN_TTL: z.string().default('1h'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  PASSWORD_RESET_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(60),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().positive().default(15),
  SEED_FULL_ADMIN_EMAIL: z.string().email(),
  SEED_FULL_ADMIN_PASSWORD: z.string().min(8),
}).superRefine((env, ctx) => {
  if (env.DB_PROVIDER === 'postgres' && !env.DATABASE_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['DATABASE_URL'],
      message: 'DATABASE_URL is required when DB_PROVIDER=postgres',
    });
  }
});

export const env = EnvSchema.parse(process.env);
