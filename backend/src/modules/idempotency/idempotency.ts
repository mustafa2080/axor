import { createHash } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError, badRequest } from '../../common/errors.js';
import type { IdempotencyBegin, IdempotencyBeginInput } from '../../database/repositories/idempotency-keys.repository.js';

/** What the service needs from storage (ADR-0026); the repository implements it. */
export interface IdempotencyStore {
  begin(input: IdempotencyBeginInput): Promise<IdempotencyBegin>;
  complete(id: string, status: number, body: unknown): Promise<void>;
  release(id: string): Promise<void>;
}

export interface IdempotencyOptions {
  /** How long a stored response is kept. Default 24 hours. */
  ttlMs?: number;
  /** An unfinished reservation older than this is treated as abandoned. Default 5 minutes. */
  staleAfterMs?: number;
  clock?: () => Date;
}

/** What a guarded handler produces; the response is stored exactly like this. */
export interface IdempotentResult {
  status: number;
  body: unknown;
}

export const IDEMPOTENCY_HEADER = 'idempotency-key';
const KEY_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

/** JSON with object keys sorted, so the same content always gives the same text. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export interface RequestFingerprint {
  method: string;
  /** The route pattern (`/admin/subscriptions/:id/extend-trial`), not the concrete URL. */
  route: string;
  params: unknown;
  body: unknown;
}

/** SHA-256 over method, route pattern, params and body: what "the same request" means. */
export function hashRequest(fingerprint: RequestFingerprint): string {
  return createHash('sha256').update(canonicalJson(fingerprint)).digest('hex');
}

/**
 * Applies the status and returns the body. After a handler timeout (ADR-0020) the 504 is already
 * on the wire, so only an unsent reply is touched.
 */
function finish(reply: FastifyReply, result: IdempotentResult): unknown {
  if (!reply.sent) void reply.code(result.status);
  return result.body;
}

export function createIdempotency(store: IdempotencyStore, options: IdempotencyOptions = {}) {
  const ttlMs = options.ttlMs ?? 24 * 60 * 60_000;
  const staleAfterMs = options.staleAfterMs ?? 5 * 60_000;
  const clock = options.clock ?? (() => new Date());

  return {
    /**
     * Runs `handler` at most once per `Idempotency-Key` for this caller (ADR-0026). Without the
     * header the handler simply runs. With it: the first request reserves the key and its response
     * is stored; a repeat with the same content gets that response (`Idempotent-Replayed: true`),
     * a repeat with different content gets 422, and a repeat while the first is still running
     * gets 409 with `Retry-After`. A handler that throws gives the key back, because a thrown
     * error means its transaction was rolled back.
     */
    async run(
      request: FastifyRequest,
      reply: FastifyReply,
      actorUserId: string,
      handler: () => Promise<IdempotentResult>,
    ): Promise<unknown> {
      const header = request.headers[IDEMPOTENCY_HEADER];
      if (header === undefined) return finish(reply, await handler());
      if (typeof header !== 'string' || !KEY_PATTERN.test(header)) {
        throw badRequest('Idempotency-Key must be 16 to 64 letters, digits, "-" or "_"');
      }

      const begin = await store.begin({
        actorUserId,
        key: header,
        requestHash: hashRequest({
          method: request.method,
          route: request.routeOptions.url ?? request.url,
          params: request.params,
          body: request.body,
        }),
        now: clock(),
        ttlMs,
        staleAfterMs,
      });

      if (begin.kind === 'replay') {
        void reply.header('idempotent-replayed', 'true');
        return finish(reply, { status: begin.status, body: begin.body });
      }
      if (begin.kind === 'mismatch') {
        throw new AppError(422, 'IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used for a different request');
      }
      if (begin.kind === 'in_progress') {
        throw new AppError(409, 'IDEMPOTENCY_IN_PROGRESS', 'The first request with this key is still running', {
          retryAfterSeconds: 2,
        });
      }

      let result: IdempotentResult;
      try {
        result = await handler();
      } catch (error) {
        await store.release(begin.id).catch((releaseError: unknown) => {
          request.log.error({ err: releaseError }, 'could not release idempotency key');
        });
        throw error;
      }
      // The work is done. If storing the answer fails the client still gets it, and the key stays
      // reserved until it goes stale: a retry then sees "in progress", never a second execution.
      await store.complete(begin.id, result.status, result.body).catch((completeError: unknown) => {
        request.log.error({ err: completeError }, 'could not store idempotent response');
      });
      return finish(reply, result);
    },
  };
}

export type Idempotency = ReturnType<typeof createIdempotency>;

/** Route helper: runs through the service when it is configured, otherwise just the handler. */
export async function withIdempotency(
  idempotency: Idempotency | undefined,
  request: FastifyRequest,
  reply: FastifyReply,
  actorUserId: string,
  handler: () => Promise<IdempotentResult>,
): Promise<unknown> {
  if (idempotency === undefined) return finish(reply, await handler());
  return idempotency.run(request, reply, actorUserId, handler);
}
