import { isIPv4, isIPv6 } from 'node:net';

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

// Client IP addresses are personal data in some jurisdictions, and log files are the place that
// gets copied the most (monitoring tools, support, screenshots). Ordinary logs therefore carry a
// masked address: enough to see the network during an attack, not enough to point at one device.
// The full address stays in audit_logs for security events, which has access control and retention.
const INVALID_IP = '[invalid-ip]';

/** The 8 groups of an IPv6 address as numbers, or null if it is not a valid IPv6 address. */
function ipv6Groups(address: string): number[] | null {
  const bare = address.split('%', 1)[0] ?? '';
  if (!isIPv6(bare)) return null;
  // An embedded IPv4 tail (::ffff:1.2.3.4) is two groups.
  const tail = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(bare);
  const text = tail
    ? `${bare.slice(0, tail.index)}${((Number(tail[1]) << 8) | Number(tail[2])).toString(16)}:${((Number(tail[3]) << 8) | Number(tail[4])).toString(16)}`
    : bare;
  const [head = '', rest] = text.split('::');
  const first = head === '' ? [] : head.split(':');
  const last = rest === undefined || rest === '' ? [] : rest.split(':');
  const fill = rest === undefined ? [] : Array<string>(8 - first.length - last.length).fill('0');
  return [...first, ...fill, ...last].map((group) => parseInt(group, 16));
}

/**
 * Masks a client IP for ordinary logs. IPv4: last octet zeroed (41.33.12.7 -> 41.33.12.0).
 * IPv6: only the first 48 bits kept (2001:db8:85a3:8d3:1319:8a2e:370:7344 -> 2001:db8:85a3::).
 * IPv4-mapped IPv6 is masked as IPv4. Anything that is not an IP address is not echoed back.
 */
export function maskIp(ip: string): string {
  if (isIPv4(ip)) return `${ip.slice(0, ip.lastIndexOf('.'))}.0`;
  const groups = ipv6Groups(ip);
  if (groups === null) return INVALID_IP;
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0] = groups;
  // ::ffff:a.b.c.d is an IPv4 client seen through a dual-stack socket.
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && f === 0xffff) {
    return `${g >> 8}.${g & 255}.${h >> 8}.0`;
  }
  return `${a.toString(16)}:${b.toString(16)}:${c.toString(16)}::`;
}
