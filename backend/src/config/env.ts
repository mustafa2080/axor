import { z } from 'zod';

/** Words that mean "someone copied an example or test value into production". */
const PLACEHOLDER_WORDS = ['changeme', 'change_me', 'placeholder', 'password', 'example', 'unit-test', 'test-only'];
const MIN_DISTINCT_SECRET_CHARS = 16;

/**
 * True when a production signing secret is obviously guessable (ADR-0017). This is a floor, not a
 * proof of randomness: a random 32+ byte value (see deploy.md) has far more than 16 distinct
 * characters and practically never contains these words. The secret itself is never echoed in the error.
 */
export function isWeakSecret(secret: string): boolean {
  const lower = secret.toLowerCase();
  if (PLACEHOLDER_WORDS.some((word) => lower.includes(word))) return true;
  return new Set(secret).size < MIN_DISTINCT_SECRET_CHARS;
}

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
  /** Database limits (ADR-0019). Size the pool below MariaDB's max_connections divided by instances. */
  DB_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(10),
  /** Requests allowed to wait for a free connection; beyond it they fail fast with 503. */
  DB_POOL_QUEUE_LIMIT: z.coerce.number().int().min(1).max(10_000).default(100),
  /** Longest a single SQL statement may run, in ms. 0 turns the limit off. */
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(0).max(300_000).default(15_000),
  /**
   * Longest a request may spend in auth and its handler, in ms; past it the client gets a 504 (ADR-0020).
   * The handler itself is NOT cancelled. 0 turns the limit off, which production refuses.
   */
  REQUEST_HANDLER_TIMEOUT_MS: z.coerce.number().int().min(0).max(300_000).default(30_000),
  /** HMAC secret for access tokens (ADR-0004). Never commit a real value. */
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters')
    .refine((value) => !value.startsWith('CHANGE_ME'), 'JWT_ACCESS_SECRET still has the placeholder value'),
  /**
   * Previous HMAC secret, set ONLY during a rotation: it verifies old tokens but never signs
   * (ADR-0017 §5). Leave it unset or empty otherwise.
   */
  JWT_ACCESS_SECRET_PREVIOUS: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(32, 'JWT_ACCESS_SECRET_PREVIOUS must be at least 32 characters').optional(),
  ),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
}).superRefine((env, ctx) => {
  if (env.JWT_ACCESS_SECRET_PREVIOUS !== undefined && env.JWT_ACCESS_SECRET_PREVIOUS === env.JWT_ACCESS_SECRET) {
    ctx.addIssue({
      code: 'custom',
      path: ['JWT_ACCESS_SECRET_PREVIOUS'],
      message: 'JWT_ACCESS_SECRET_PREVIOUS must differ from JWT_ACCESS_SECRET',
    });
  }
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
  if (isWeakSecret(env.JWT_ACCESS_SECRET)) {
    ctx.addIssue({
      code: 'custom',
      path: ['JWT_ACCESS_SECRET'],
      message:
        'JWT_ACCESS_SECRET looks guessable (too few distinct characters or a placeholder/test word); generate a random one in production',
    });
  }
  if (env.JWT_ACCESS_SECRET_PREVIOUS !== undefined && isWeakSecret(env.JWT_ACCESS_SECRET_PREVIOUS)) {
    ctx.addIssue({
      code: 'custom',
      path: ['JWT_ACCESS_SECRET_PREVIOUS'],
      message: 'JWT_ACCESS_SECRET_PREVIOUS looks guessable; it must have been a random secret in production',
    });
  }
  if (decodeURIComponent(new URL(env.DATABASE_URL).username).toLowerCase() === 'root') {
    ctx.addIssue({
      code: 'custom',
      path: ['DATABASE_URL'],
      message: 'DATABASE_URL must use a dedicated least-privilege user, not root, in production',
    });
  }
  // The request limit is what stops a slow handler holding a client forever (ADR-0020). It must
  // also outlast the statement limit, so a slow query surfaces as the retry-safe 503 (ADR-0019)
  // before the 504 whose outcome is unknown.
  if (env.REQUEST_HANDLER_TIMEOUT_MS === 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['REQUEST_HANDLER_TIMEOUT_MS'],
      message: 'REQUEST_HANDLER_TIMEOUT_MS must not be 0 (no limit) in production',
    });
  } else if (
    env.DB_STATEMENT_TIMEOUT_MS > 0 &&
    env.REQUEST_HANDLER_TIMEOUT_MS <= env.DB_STATEMENT_TIMEOUT_MS
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['REQUEST_HANDLER_TIMEOUT_MS'],
      message: 'REQUEST_HANDLER_TIMEOUT_MS must be greater than DB_STATEMENT_TIMEOUT_MS in production',
    });
  }
});

export type Env = z.infer<typeof envSchema>;

/** Parses and validates environment variables. Throws if invalid (fail fast at startup). */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}
