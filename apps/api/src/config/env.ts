/**
 * @fileoverview Environment configuration with validation.
 * All env vars are validated at startup — fail fast if misconfigured.
 */

import './load-env.js'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  API_PREFIX: z.string().default('/api/v1'),

  // Database
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL connection URL'),

  // JWT — access token (short-lived, 15m)
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),

  // JWT — refresh token (long-lived, 7d)
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
})

function parseEnv() {
  const result = envSchema.safeParse(process.env)

  if (!result.success) {
    console.error('❌  Invalid environment variables:')
    for (const [key, issues] of Object.entries(result.error.flatten().fieldErrors)) {
      console.error(`  ${key}: ${issues?.join(', ')}`)
    }
    process.exit(1)
  }

  return result.data
}

export const env = parseEnv()
export type Env = typeof env
