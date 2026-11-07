import { and, eq, lt } from 'drizzle-orm';
import { uuidv7 } from '../../common/id.js';
import type { Database } from '../client.js';
import { isDuplicateEntry } from '../errors.js';
import { idempotencyKeys } from '../schema/index.js';

/** How a call to `begin` ended (ADR-0026). */
export type IdempotencyBegin =
  | { kind: 'started'; id: string }
  | { kind: 'replay'; status: number; body: unknown }
  /** The key exists with different content: the client reused it for another request. */
  | { kind: 'mismatch' }
  /** The first request with this key has not finished yet. */
  | { kind: 'in_progress' };

export interface IdempotencyBeginInput {
  actorUserId: string;
  key: string;
  requestHash: string;
  now: Date;
  /** How long a stored response is kept. */
  ttlMs: number;
  /** An unfinished reservation older than this is treated as abandoned (crash) and taken over. */
  staleAfterMs: number;
}

export function createIdempotencyKeysRepository(db: Database['db']) {
  return {
    /**
     * Reserves `(actorUserId, key)`. The UNIQUE index decides the winner when two requests with
     * the same key arrive together, so exactly one gets `started`. Expired rows and unfinished
     * reservations older than `staleAfterMs` are removed first, so a crashed request cannot block
     * a key for ever (at the cost that the abandoned work may then run a second time).
     */
    async begin(input: IdempotencyBeginInput): Promise<IdempotencyBegin> {
      const id = uuidv7();
      // Two rounds: a row removed between our insert and our read means "try the insert again".
      for (let round = 0; round < 2; round += 1) {
        try {
          await db.insert(idempotencyKeys).values({
            id,
            actorUserId: input.actorUserId,
            key: input.key,
            requestHash: input.requestHash,
            state: 'in_progress',
            // Both times come from the application clock. The column default would use the
            // database server's local time, which this driver reads as UTC (timezone 'Z'), so the
            // staleness check below would compare two different clocks.
            createdAt: input.now,
            expiresAt: new Date(input.now.getTime() + input.ttlMs),
          });
          return { kind: 'started', id };
        } catch (error) {
          if (!isDuplicateEntry(error)) throw error;
        }

        const [row] = await db
          .select({
            id: idempotencyKeys.id,
            requestHash: idempotencyKeys.requestHash,
            state: idempotencyKeys.state,
            responseStatus: idempotencyKeys.responseStatus,
            responseBody: idempotencyKeys.responseBody,
            expiresAt: idempotencyKeys.expiresAt,
            createdAt: idempotencyKeys.createdAt,
          })
          .from(idempotencyKeys)
          .where(and(eq(idempotencyKeys.actorUserId, input.actorUserId), eq(idempotencyKeys.key, input.key)))
          .limit(1);
        if (row === undefined) continue;

        const expired = row.expiresAt.getTime() <= input.now.getTime();
        const abandoned =
          row.state === 'in_progress' && row.createdAt.getTime() <= input.now.getTime() - input.staleAfterMs;
        if (expired || abandoned) {
          await db.delete(idempotencyKeys).where(eq(idempotencyKeys.id, row.id));
          continue;
        }
        if (row.requestHash !== input.requestHash) return { kind: 'mismatch' };
        if (row.state === 'done' && row.responseStatus !== null) {
          return { kind: 'replay', status: row.responseStatus, body: row.responseBody };
        }
        return { kind: 'in_progress' };
      }
      return { kind: 'in_progress' };
    },

    /** Stores the response of the request that holds the reservation `id`. */
    async complete(id: string, status: number, body: unknown): Promise<void> {
      await db
        .update(idempotencyKeys)
        .set({ state: 'done', responseStatus: status, responseBody: body })
        .where(eq(idempotencyKeys.id, id));
    },

    /** Gives the key back (the request failed before changing anything), so a retry can run. */
    async release(id: string): Promise<void> {
      await db.delete(idempotencyKeys).where(eq(idempotencyKeys.id, id));
    },

    /** Housekeeping (ADR-0026): deletes at most `batchSize` rows that expired before `cutoff`. */
    async purgeExpired(cutoff: Date, batchSize: number): Promise<number> {
      const [result] = await db
        .delete(idempotencyKeys)
        .where(lt(idempotencyKeys.expiresAt, cutoff))
        .limit(batchSize);
      return result.affectedRows;
    },
  };
}

export type IdempotencyKeysRepository = ReturnType<typeof createIdempotencyKeysRepository>;
