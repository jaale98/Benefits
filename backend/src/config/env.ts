import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  ACCESS_TOKEN_TTL: z.string().default('1h'),
  SEED_FULL_ADMIN_EMAIL: z.string().email(),
  SEED_FULL_ADMIN_PASSWORD: z.string().min(8),
});

export const env = EnvSchema.parse(process.env);
