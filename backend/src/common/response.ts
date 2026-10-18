/**
 * API response conventions (decided 2026-10-18):
 *  - success: `{ data: <payload> }` (use `ok(...)`); lists add `meta` (pagination) via `ok(items, meta)`.
 *  - error:   `{ error: { code, message } }` (see the error handler in app.ts).
 *  - infrastructure probes (`/health`, `/health/ready`) stay minimal and are exempt.
 */
export interface Ok<T, M = undefined> {
  data: T;
  meta?: M;
}

export function ok<T>(data: T): Ok<T>;
export function ok<T, M extends Record<string, unknown>>(data: T, meta: M): Ok<T, M>;
export function ok<T, M extends Record<string, unknown>>(data: T, meta?: M): Ok<T, M | undefined> {
  return meta === undefined ? { data } : { data, meta };
}
