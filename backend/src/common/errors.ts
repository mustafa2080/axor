/**
 * Application errors. Throw these from services/controllers; the global error handler in
 * app.ts turns them into the unified `{ error: { code, message, details? } }` response.
 * Messages of AppError with status < 500 are sent to the client, so keep them safe.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Authentication required') =>
  new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'Access denied') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Resource not found') =>
  new AppError(404, 'NOT_FOUND', message);
export const conflict = (message: string) => new AppError(409, 'CONFLICT', message);
/**
 * The company's plan does not allow more of something (ADR-0012). A separate code from CONFLICT so
 * the UI can say "upgrade your plan" instead of a generic clash. The message must stay safe to show.
 */
export const planLimitReached = (message: string) =>
  new AppError(409, 'PLAN_LIMIT_REACHED', message);
/** `retryAfterSeconds` is turned into a Retry-After header by the global error handler. */
export const tooManyRequests = (retryAfterSeconds: number) =>
  new AppError(429, 'TOO_MANY_REQUESTS', 'Too many attempts. Try again later.', {
    retryAfterSeconds,
  });
