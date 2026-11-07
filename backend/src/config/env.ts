import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z.url().default('http://localhost:5173'),
  /** Set to true ONLY behind a reverse proxy you control, so request.ip is the real client IP. */
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  DATABASE_URL: z.url({ protocol: /^mysql$/ }),
  /** HMAC secret for access tokens (ADR-0004). Never commit a real value. */
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters')
    .refine((value) => !value.startsWith('CHANGE_ME'), 'JWT_ACCESS_SECRET still has the placeholder value'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
}).superRefine((env, ctx) => {
  // Production hardening: a setting that is fine on a laptop but unsafe on a server stops the
  // process at startup instead of running quietly with it (ADR-0016).
  if (env.NODE_ENV !== 'production') return;

  if (new URL(env.WEB_ORIGIN).protocol !== 'https:') {
    ctx.addIssue({
      code: 'custom',
      path: ['WEB_ORIGIN'],
      message: 'WEB_ORIGIN must be an https origin in production',
    });
  }
  if (env.LOG_LEVEL === 'debug' || env.LOG_LEVEL === 'trace') {
    ctx.addIssue({
      code: 'custom',
      path: ['LOG_LEVEL'],
      message: 'LOG_LEVEL must not be debug or trace in production',
    });
  }
  if (decodeURIComponent(new URL(env.DATABASE_URL).username).toLowerCase() === 'root') {
    ctx.addIssue({
      code: 'custom',
      path: ['DATABASE_URL'],
      message: 'DATABASE_URL must use a dedicated least-privilege user, not root, in production',
    });
  }
});

export type Env = z.infer<typeof envSchema>;

/** Parses and validates environment variables. Throws if invalid (fail fast at startup). */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}
