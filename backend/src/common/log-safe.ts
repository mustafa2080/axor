// Log hygiene (TASKS.md section 9): what is safe to write to a log line.
//
// Database drivers put values into error objects: Drizzle appends the bound parameters to the
// message (`params: email,passwordHash`), mysql2 puts the duplicate value in the message
// (`Duplicate entry 'a@b.c'`), and both attach the values as properties. Logging such an error
// as-is writes emails and password hashes into the logs. So errors are not logged as-is: only a
// small allowlist of fields is kept, and text is scrubbed of anything shaped like a secret.

const MAX_TEXT = 4000;
const MAX_CAUSE_DEPTH = 4;
const REDACTED = '[REDACTED]';

// `params:` is where Drizzle starts listing bound values; everything after it is dropped.
const PARAMS_TAIL = /\r?\nparams:[\s\S]*$/;
const SCRUBBERS: readonly RegExp[] = [
  /\bBearer\s+[\w.~+/=-]+/gi,
  /\beyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]{5,}/g,
  /\$argon2[a-z]*\$[^\s'",;)]+/g,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
];

/** Text with anything shaped like a bearer token, JWT, password hash or email address removed. */
export function scrubText(text: string): string {
  let result = text.replace(PARAMS_TAIL, '\nparams: [OMITTED]');
  for (const pattern of SCRUBBERS) result = result.replace(pattern, REDACTED);
  return result.length > MAX_TEXT ? `${result.slice(0, MAX_TEXT)}…[truncated]` : result;
}

export interface SerializedError {
  [key: string]: unknown;
  type: string;
  message: string;
  stack: string;
}

/**
 * pino `err` serializer. Keeps what is needed to debug (type, scrubbed message and stack, driver
 * codes, the cause chain) and nothing else: no `params`, no `sql` with inlined values, no
 * arbitrary properties a library or a caller may have attached.
 */
export function serializeError(error: unknown, depth = 0): SerializedError {
  if (!(error instanceof Error)) {
    return { type: typeof error, message: scrubText(String(error)), stack: '' };
  }
  const extra = error as Error & Record<string, unknown>;
  const out: SerializedError = {
    type: error.constructor.name,
    message: scrubText(error.message),
    stack: typeof error.stack === 'string' ? scrubText(error.stack) : '',
  };
  for (const key of ['code', 'errno', 'sqlState'] as const) {
    const value = extra[key];
    if (typeof value === 'string' || typeof value === 'number') out[key] = value;
  }
  // Drizzle's `query` holds the statement with `?` placeholders, which is what you need to find
  // the failing call. Scrubbed anyway.
  if (typeof extra.query === 'string') out.query = scrubText(extra.query);
  if (error.cause !== undefined && depth < MAX_CAUSE_DEPTH) out.cause = serializeError(error.cause, depth + 1);
  return out;
}

// Keys that hold a credential or a secret, whatever object they sit in.
const SECRET_KEYS = [
  'password',
  'newPassword',
  'currentPassword',
  'passwordHash',
  'password_hash',
  'token',
  'accessToken',
  'refreshToken',
  'tokenHash',
  'secret',
  'authorization',
  'cookie',
  'JWT_ACCESS_SECRET',
  'DATABASE_URL',
];

/** pino redact paths: each key at the top level and up to two levels down. */
export const SECRET_PATHS: string[] = SECRET_KEYS.flatMap((key) => [key, `*.${key}`, `*.*.${key}`]);
