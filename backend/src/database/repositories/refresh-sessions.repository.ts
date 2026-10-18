import { and, eq, isNull } from 'drizzle-orm';
import { uuidv7 } from '../../common/id.js';
import type { Database } from '../client.js';
import { retryOnDeadlock } from '../retry.js';
import { refreshSessions } from '../schema/index.js';

export type RotateResult =
  | { status: 'rotated'; userId: string; familyId: string }
  | { status: 'invalid' }
  /** A token that was already used/revoked came back: the whole family is revoked. */
  | { status: 'reuse_detected'; userId: string; familyId: string };

export interface NewSessionInput {
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent: string | null;
}

const clipUserAgent = (value: string | null) => (value === null ? null : value.slice(0, 255));

/**
 * Refresh-session storage (ADR-0004). This is the authentication layer itself, so it is keyed by
 * user/token, not by TenantScope: it runs before any tenant context exists.
 */
export function createRefreshSessionsRepository(db: Database['db']) {
  return {
    async create(input: NewSessionInput): Promise<void> {
      await db.insert(refreshSessions).values({
        id: uuidv7(),
        ...input,
        userAgent: clipUserAgent(input.userAgent),
      });
    },

    /**
     * Atomically replaces a session by its successor. `FOR UPDATE` serializes concurrent uses of
     * the same token: exactly one wins, the other is seen as reuse and kills the family.
     */
    async rotate(
      oldTokenHash: string,
      next: Omit<NewSessionInput, 'userId' | 'familyId'>,
      now: Date,
    ): Promise<RotateResult> {
      // Two requests with the same token collide on the same rows; InnoDB may pick one as a
      // deadlock victim. Retrying makes it see the winner's result (and be treated as reuse)
      // instead of surfacing a 500.
      return retryOnDeadlock<RotateResult>(() => db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(refreshSessions)
          .where(eq(refreshSessions.tokenHash, oldTokenHash))
          .limit(1)
          .for('update');
        if (current === undefined) return { status: 'invalid' };

        const { userId, familyId } = current;
        if (current.revokedAt !== null) {
          await tx
            .update(refreshSessions)
            .set({ revokedAt: now })
            .where(and(eq(refreshSessions.familyId, familyId), isNull(refreshSessions.revokedAt)));
          return { status: 'reuse_detected', userId, familyId };
        }
        if (current.expiresAt.getTime() <= now.getTime()) return { status: 'invalid' };

        const nextId = uuidv7();
        await tx.insert(refreshSessions).values({
          id: nextId,
          userId,
          familyId,
          tokenHash: next.tokenHash,
          expiresAt: next.expiresAt,
          userAgent: clipUserAgent(next.userAgent),
        });
        await tx
          .update(refreshSessions)
          .set({ revokedAt: now, replacedById: nextId })
          .where(eq(refreshSessions.id, current.id));
        return { status: 'rotated', userId, familyId };
      }));
    },

    async revokeFamily(familyId: string, now: Date): Promise<void> {
      await db
        .update(refreshSessions)
        .set({ revokedAt: now })
        .where(and(eq(refreshSessions.familyId, familyId), isNull(refreshSessions.revokedAt)));
    },

    /**
     * Logout: revoke the whole family the presented token belongs to. Unknown tokens are ignored.
     * Returns the owner only when the presented token was still live, so callers audit a real
     * sign-out once and not every repeated or stale logout request.
     */
    async revokeFamilyByTokenHash(
      tokenHash: string,
      now: Date,
    ): Promise<{ userId: string } | null> {
      const [session] = await db
        .select({
          familyId: refreshSessions.familyId,
          userId: refreshSessions.userId,
          revokedAt: refreshSessions.revokedAt,
        })
        .from(refreshSessions)
        .where(eq(refreshSessions.tokenHash, tokenHash))
        .limit(1);
      if (session === undefined) return null;
      await db
        .update(refreshSessions)
        .set({ revokedAt: now })
        .where(
          and(eq(refreshSessions.familyId, session.familyId), isNull(refreshSessions.revokedAt)),
        );
      return session.revokedAt === null ? { userId: session.userId } : null;
    },

    async revokeAllForUser(userId: string, now: Date): Promise<void> {
      await db
        .update(refreshSessions)
        .set({ revokedAt: now })
        .where(and(eq(refreshSessions.userId, userId), isNull(refreshSessions.revokedAt)));
    },
  };
}

export type RefreshSessionsRepository = ReturnType<typeof createRefreshSessionsRepository>;
