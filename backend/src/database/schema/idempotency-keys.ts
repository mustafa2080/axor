import { char, index, json, mysqlTable, smallint, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import { createdAt, dateTime, id, uuidRef } from './columns.js';

/**
 * Idempotency keys (ADR-0026). A client that retries a write (for example after a 504) sends the
 * same `Idempotency-Key`; the first request reserves the key here and stores its response, later
 * requests with the same key and the same content get that stored response instead of running
 * again. Like `audit_logs` it has no foreign keys, so keeping it can never block a business write.
 * `request_hash` is a SHA-256 of the canonical request, never the request itself.
 */
export const idempotencyKeys = mysqlTable(
  'idempotency_keys',
  {
    id: id(),
    actorUserId: uuidRef('actor_user_id').notNull(),
    key: varchar('idem_key', { length: 64 }).notNull(),
    requestHash: char('request_hash', { length: 64 }).notNull(),
    state: varchar('state', { length: 16 }).notNull(),
    responseStatus: smallint('response_status'),
    responseBody: json('response_body').$type<unknown>(),
    expiresAt: dateTime('expires_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    // One key per caller: two callers choosing the same string never see each other's responses.
    uniqueIndex('idempotency_keys_actor_key_uq').on(t.actorUserId, t.key),
    // The purge job deletes by `expires_at`.
    index('idempotency_keys_expires_at_idx').on(t.expiresAt),
  ],
);
