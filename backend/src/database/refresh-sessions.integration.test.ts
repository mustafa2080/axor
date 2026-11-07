import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { uuidv7 } from '../common/id.js';
import { loadEnv } from '../config/env.js';
import { truncateDomainTables } from '../test/db-helpers.js';
import { createDatabase } from './client.js';
import { runMigrations } from './migrate.js';
import { createRefreshSessionsRepository } from './repositories/refresh-sessions.repository.js';
import { isDeadlock, retryOnDeadlock } from './retry.js';
import * as schema from './schema/index.js';

const env = loadEnv(process.env);
const database = createDatabase(env.DATABASE_URL);
const { db } = database;
const sessions = createRefreshSessionsRepository(db);

let userId: string;
const future = () => new Date(Date.now() + 60_000);
const next = () => ({ tokenHash: uuidv7().replaceAll('-', '').padEnd(64, '0'), expiresAt: future(), userAgent: null });

beforeAll(async () => {
  expect(new URL(env.DATABASE_URL).pathname).toBe('/axor_test');
  await runMigrations(env.DATABASE_URL);
});

beforeEach(async () => {
  await truncateDomainTables(db);
  const tenantId = uuidv7();
  userId = uuidv7();
  await db.insert(schema.tenants).values({ id: tenantId, name: 'alpha' });
  await db.insert(schema.users).values({
    id: userId,
    email: 'owner@alpha.test',
    passwordHash: 'not-used',
    tenantId,
    tenantRole: 'owner',
  });
});

afterAll(async () => {
  await database.close();
});

describe('refresh session rotation under concurrency', () => {
  it('always has exactly one winner and never throws, even when InnoDB deadlocks', async () => {
    // A deadlock between two requests using the same token used to surface as a 500 about 1 time
    // in 15. Many rounds make a regression practically certain to show up.
    for (let round = 0; round < 40; round += 1) {
      const first = next();
      await sessions.create({ userId, familyId: uuidv7(), ...first });
      const results = await Promise.all([
        sessions.rotate(first.tokenHash, next(), new Date()),
        sessions.rotate(first.tokenHash, next(), new Date()),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual(['reuse_detected', 'rotated']);
    }
  }, 60_000);
});

describe('retryOnDeadlock', () => {
  const deadlock = () => Object.assign(new Error('Deadlock found'), { code: 'ER_LOCK_DEADLOCK', errno: 1213 });

  it('recognizes a deadlock however deeply the driver error is wrapped', () => {
    expect(isDeadlock(deadlock())).toBe(true);
    expect(isDeadlock(new Error('Failed query', { cause: deadlock() }))).toBe(true);
    expect(isDeadlock(new Error('something else'))).toBe(false);
    expect(isDeadlock(undefined)).toBe(false);
  });

  it('restarts the work after a deadlock and returns its result', async () => {
    let calls = 0;
    const result = await retryOnDeadlock(async () => {
      calls += 1;
      if (calls < 3) throw deadlock();
      return 'done';
    });
    expect(result).toBe('done');
    expect(calls).toBe(3);
  });

  it('does not retry other errors', async () => {
    let calls = 0;
    await expect(
      retryOnDeadlock(async () => {
        calls += 1;
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(calls).toBe(1);
  });

  it('gives up after the allowed attempts instead of looping forever', async () => {
    let calls = 0;
    await expect(
      retryOnDeadlock(async () => {
        calls += 1;
        throw deadlock();
      }, 3),
    ).rejects.toThrow('Deadlock found');
    expect(calls).toBe(3);
  });
});

describe('purgeExpired (ADR-0025)', () => {
  const DAY = 24 * 60 * 60_000;
  const cutoff = new Date(Date.now() - 7 * DAY);

  async function seed(expiresAt: Date, revokedAt: Date | null = null): Promise<string> {
    const id = uuidv7();
    await db.insert(schema.refreshSessions).values({
      id,
      userId,
      familyId: uuidv7(),
      tokenHash: uuidv7().replaceAll('-', '').padEnd(64, '0'),
      expiresAt,
      revokedAt,
    });
    return id;
  }

  const remaining = async () => (await db.select({ id: schema.refreshSessions.id }).from(schema.refreshSessions)).map((r) => r.id);

  it('deletes only sessions that expired before the cutoff', async () => {
    const old = await seed(new Date(cutoff.getTime() - DAY));
    const withinGrace = await seed(new Date(cutoff.getTime() + DAY));
    const live = await seed(new Date(Date.now() + DAY));
    expect(await sessions.purgeExpired(cutoff, 100)).toBe(1);
    const left = await remaining();
    expect(left).not.toContain(old);
    expect(left).toEqual(expect.arrayContaining([withinGrace, live]));
  });

  it('keeps a revoked session that has not expired, because reuse detection needs it', async () => {
    const revoked = await seed(new Date(Date.now() + DAY), new Date());
    expect(await sessions.purgeExpired(cutoff, 100)).toBe(0);
    expect(await remaining()).toContain(revoked);
  });

  it('deletes expired revoked sessions too once they are past the grace period', async () => {
    await seed(new Date(cutoff.getTime() - DAY), new Date(cutoff.getTime() - 2 * DAY));
    expect(await sessions.purgeExpired(cutoff, 100)).toBe(1);
    expect(await remaining()).toHaveLength(0);
  });

  it('never deletes more than the batch size in one call', async () => {
    for (let i = 0; i < 5; i += 1) await seed(new Date(cutoff.getTime() - DAY));
    expect(await sessions.purgeExpired(cutoff, 2)).toBe(2);
    expect(await remaining()).toHaveLength(3);
    expect(await sessions.purgeExpired(cutoff, 100)).toBe(3);
  });

  it('keeps reuse detectable during the grace period and answers "invalid" only after the purge', async () => {
    const tokenHash = uuidv7().replaceAll('-', '').padEnd(64, '0');
    const expiredAt = new Date(Date.now() - DAY);
    const insert = () =>
      db.insert(schema.refreshSessions).values({
        id: uuidv7(),
        userId,
        familyId: uuidv7(),
        tokenHash,
        expiresAt: expiredAt,
        revokedAt: new Date(Date.now() - 2 * DAY),
      });

    // Expired yesterday, so still inside a 7-day grace period: a purge with that cutoff keeps it.
    await insert();
    expect(await sessions.purgeExpired(cutoff, 100)).toBe(0);
    expect((await sessions.rotate(tokenHash, next(), new Date())).status).toBe('reuse_detected');

    // After the grace period it is deleted, and the same token is just unknown.
    expect(await sessions.purgeExpired(new Date(), 100)).toBe(1);
    expect((await sessions.rotate(tokenHash, next(), new Date())).status).toBe('invalid');
  });

  it('does nothing when the table is empty', async () => {
    expect(await sessions.purgeExpired(cutoff, 100)).toBe(0);
  });
});
