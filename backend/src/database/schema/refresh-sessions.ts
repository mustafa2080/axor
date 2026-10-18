import { char, index, mysqlTable, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import { createdAt, dateTime, id, uuidRef } from './columns.js';
import { users } from './users.js';

/**
 * Refresh sessions. The token itself is an opaque random value that is never stored:
 * only its SHA-256 hex digest is. Rotated on every use; reuse of a rotated token revokes the whole family.
 */
export const refreshSessions = mysqlTable(
  'refresh_sessions',
  {
    id: id(),
    userId: uuidRef('user_id')
      .notNull()
      .references(() => users.id),
    familyId: uuidRef('family_id').notNull(),
    tokenHash: char('token_hash', { length: 64 }).notNull(),
    expiresAt: dateTime('expires_at').notNull(),
    revokedAt: dateTime('revoked_at'),
    replacedById: uuidRef('replaced_by_id'),
    userAgent: varchar('user_agent', { length: 255 }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('refresh_sessions_token_hash_uq').on(t.tokenHash),
    index('refresh_sessions_user_id_idx').on(t.userId),
    index('refresh_sessions_family_id_idx').on(t.familyId),
  ],
);
