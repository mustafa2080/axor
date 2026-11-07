import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { uuidv7 } from '../common/id.js';
import { loadEnv } from '../config/env.js';
import { truncateDomainTables } from '../test/db-helpers.js';
import { createDatabase } from './client.js';
import { runMigrations } from './migrate.js';
import { createIdempotencyKeysRepository } from './repositories/idempotency-keys.repository.js';
import * as schema from './schema/index.js';

// The storage behind `Idempotency-Key` (ADR-0026) on a real MariaDB (axor_test): the UNIQUE index
// picks one winner, a stored answer survives a JSON round trip, and expired or abandoned
// reservations are taken over instead of blocking a key for ever.
const env = loadEnv(process.env);
const database = createDatabase(env.DATABASE_URL);
const { db } = database;
const store = createIdempotencyKeysRepository(db);

const HOUR = 60 * 60_000;
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const actor = uuidv7();

function input(overrides: Partial<Parameters<typeof store.begin>[0]> = {}) {
  return {
    actorUserId: actor,
    key: 'key-0123456789-abcdef',
    requestHash: HASH_A,
    now: new Date(),
    ttlMs: 24 * HOUR,
    staleAfterMs: 5 * 60_000,
    ...overrides,
  };
}

const rows = () => db.select().from(schema.idempotencyKeys);

beforeAll(async () => {
  expect(new URL(env.DATABASE_URL).pathname).toBe('/axor_test');
  await runMigrations(env.DATABASE_URL);
});

beforeEach(async () => {
  await truncateDomainTables(db);
});

afterAll(async () => {
  await database.close();
});

describe('begin', () => {
  it('reserves a new key and records when it expires', async () => {
    const now = new Date();
    const result = await store.begin(input({ now, ttlMs: HOUR }));
    expect(result.kind).toBe('started');
    const [row] = await rows();
    expect(row).toMatchObject({ state: 'in_progress', requestHash: HASH_A, responseStatus: null });
    expect(row?.expiresAt.getTime()).toBe(now.getTime() + HOUR);
    // Same clock as `expires_at`: the DB server's local time would be hours off (see the repository).
    expect(row?.createdAt.getTime()).toBe(now.getTime());
  });

  it('a repeat while the first is unfinished is "in progress", not a second start', async () => {
    await store.begin(input());
    expect(await store.begin(input())).toEqual({ kind: 'in_progress' });
    expect(await rows()).toHaveLength(1);
  });

  it('after complete, the same content gets the stored status and body back', async () => {
    const started = await store.begin(input());
    if (started.kind !== 'started') throw new Error('expected started');
    const body = { data: { id: 'v2', price: { amountMinor: 49900 }, tags: ['a', 'ب'], none: null } };
    await store.complete(started.id, 201, body);

    expect(await store.begin(input())).toEqual({ kind: 'replay', status: 201, body });
    expect(await rows()).toHaveLength(1);
  });

  it('after complete, different content under the same key is a mismatch and changes nothing', async () => {
    const started = await store.begin(input());
    if (started.kind !== 'started') throw new Error('expected started');
    await store.complete(started.id, 200, { ok: true });

    expect(await store.begin(input({ requestHash: HASH_B }))).toEqual({ kind: 'mismatch' });
    expect(await store.begin(input())).toMatchObject({ kind: 'replay', status: 200 });
  });

  it('different content while unfinished is also a mismatch', async () => {
    await store.begin(input());
    expect(await store.begin(input({ requestHash: HASH_B }))).toEqual({ kind: 'mismatch' });
  });

  it('keys are per caller: the same string from two users never meets', async () => {
    const other = uuidv7();
    expect((await store.begin(input())).kind).toBe('started');
    expect((await store.begin(input({ actorUserId: other }))).kind).toBe('started');
    expect(await rows()).toHaveLength(2);

    const mine = await store.begin(input());
    expect(mine.kind).toBe('in_progress');
  });

  it('with many simultaneous requests on one key, exactly one starts and none fails', async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => store.begin(input())));
    expect(results.filter((r) => r.kind === 'started')).toHaveLength(1);
    expect(results.filter((r) => r.kind === 'in_progress')).toHaveLength(11);
    expect(await rows()).toHaveLength(1);
  });

  it('with simultaneous requests and different content, one starts and the rest are told apart', async () => {
    const results = await Promise.all([
      ...Array.from({ length: 5 }, () => store.begin(input())),
      ...Array.from({ length: 5 }, () => store.begin(input({ requestHash: HASH_B }))),
    ]);
    expect(results.filter((r) => r.kind === 'started')).toHaveLength(1);
    expect(results.every((r) => ['started', 'in_progress', 'mismatch'].includes(r.kind))).toBe(true);
    expect(await rows()).toHaveLength(1);
  });

  it('an expired answer is forgotten: the key starts fresh, even with different content', async () => {
    const t0 = new Date();
    const first = await store.begin(input({ now: t0, ttlMs: HOUR }));
    if (first.kind !== 'started') throw new Error('expected started');
    await store.complete(first.id, 200, { old: true });

    const later = new Date(t0.getTime() + 2 * HOUR);
    const again = await store.begin(input({ now: later, requestHash: HASH_B }));
    expect(again.kind).toBe('started');
    const [row] = await rows();
    expect(row).toMatchObject({ state: 'in_progress', requestHash: HASH_B });
  });

  it('an unfinished reservation is taken over only after it went stale', async () => {
    const t0 = new Date();
    await store.begin(input({ now: t0, staleAfterMs: 5 * 60_000 }));

    const soon = new Date(t0.getTime() + 60_000);
    expect((await store.begin(input({ now: soon }))).kind).toBe('in_progress');

    const stale = new Date(t0.getTime() + 10 * 60_000);
    expect((await store.begin(input({ now: stale }))).kind).toBe('started');
    expect(await rows()).toHaveLength(1);
  });

  it('a finished answer is never taken over as "stale"', async () => {
    const t0 = new Date();
    const first = await store.begin(input({ now: t0 }));
    if (first.kind !== 'started') throw new Error('expected started');
    await store.complete(first.id, 200, { ok: 1 });

    const stale = new Date(t0.getTime() + 10 * 60_000);
    expect(await store.begin(input({ now: stale }))).toMatchObject({ kind: 'replay', status: 200 });
  });
});

describe('release', () => {
  it('gives the key back so a retry can start', async () => {
    const first = await store.begin(input());
    if (first.kind !== 'started') throw new Error('expected started');
    await store.release(first.id);
    expect(await rows()).toHaveLength(0);
    expect((await store.begin(input())).kind).toBe('started');
  });

  it('only removes its own reservation', async () => {
    const first = await store.begin(input());
    await store.begin(input({ key: 'another-key-0123456789' }));
    if (first.kind !== 'started') throw new Error('expected started');
    await store.release(first.id);
    const left = await rows();
    expect(left).toHaveLength(1);
    expect(left[0]?.key).toBe('another-key-0123456789');
  });
});

describe('purgeExpired', () => {
  async function seed(expiresAt: Date, key: string) {
    await db.insert(schema.idempotencyKeys).values({
      id: uuidv7(),
      actorUserId: actor,
      key,
      requestHash: HASH_A,
      state: 'done',
      responseStatus: 200,
      responseBody: { ok: true },
      expiresAt,
    });
  }

  it('deletes only rows that expired before the cutoff and reports how many', async () => {
    const now = Date.now();
    await seed(new Date(now - 2 * HOUR), 'expired-one-0123456789');
    await seed(new Date(now - 3 * HOUR), 'expired-two-0123456789');
    await seed(new Date(now + HOUR), 'still-valid-0123456789');

    expect(await store.purgeExpired(new Date(now), 100)).toBe(2);
    expect((await rows()).map((r) => r.key)).toEqual(['still-valid-0123456789']);
    expect(await store.purgeExpired(new Date(now), 100)).toBe(0);
  });

  it('works in bounded batches', async () => {
    const now = Date.now();
    for (let i = 0; i < 5; i += 1) await seed(new Date(now - HOUR), `expired-${i}-0123456789`);
    expect(await store.purgeExpired(new Date(now), 2)).toBe(2);
    expect(await store.purgeExpired(new Date(now), 2)).toBe(2);
    expect(await store.purgeExpired(new Date(now), 2)).toBe(1);
    expect(await rows()).toHaveLength(0);
  });

  it('leaves unfinished reservations that have not expired alone', async () => {
    const first = await store.begin(input());
    expect(first.kind).toBe('started');
    expect(await store.purgeExpired(new Date(), 100)).toBe(0);
    const [row] = await db.select().from(schema.idempotencyKeys).where(eq(schema.idempotencyKeys.state, 'in_progress'));
    expect(row).toBeDefined();
  });
});
