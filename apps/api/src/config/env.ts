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

  // NextAuth secret (validated in production)
  NEXTAUTH_SECRET: z.string().optional(),

  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
}).superRefine((data, ctx) => {
  if (data.NODE_ENV === 'production') {
    const defaultJwt = 'change-this-to-a-very-long-random-secret-string-minimum-64-chars'
    const defaultRefresh = 'change-this-to-another-very-long-random-secret-string-min-64-chars'
    const defaultNextAuth = 'change-this-to-a-random-secret-for-next-auth-session-encryption'

    if (data.JWT_SECRET === defaultJwt || data.JWT_SECRET === 'super-secret-jwt-key-change-in-production') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'JWT_SECRET must not be the default placeholder value in production',
        path: ['JWT_SECRET'],
      })
    }
    if (data.JWT_REFRESH_SECRET === defaultRefresh || data.JWT_REFRESH_SECRET === 'super-secret-refresh-key-change-in-production') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'JWT_REFRESH_SECRET must not be the default placeholder value in production',
        path: ['JWT_REFRESH_SECRET'],
      })
    }
    if (!data.NEXTAUTH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'NEXTAUTH_SECRET is required in production',
        path: ['NEXTAUTH_SECRET'],
      })
    } else if (data.NEXTAUTH_SECRET === defaultNextAuth || data.NEXTAUTH_SECRET === 'next-auth-secret-change-in-production') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'NEXTAUTH_SECRET must not be the default placeholder value in production',
        path: ['NEXTAUTH_SECRET'],
      })
    }
  }
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
