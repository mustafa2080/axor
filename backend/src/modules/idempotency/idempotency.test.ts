import type { FastifyReply, FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../common/errors.js';
import type { IdempotencyBegin } from '../../database/repositories/idempotency-keys.repository.js';
import {
  canonicalJson,
  createIdempotency,
  hashRequest,
  type IdempotencyStore,
  withIdempotency,
} from './idempotency.js';

// The decisions of the service (ADR-0026), with the storage scripted. How the storage itself
// behaves (the UNIQUE index, expiry, takeover) is tested against MariaDB in
// database/idempotency-keys.integration.test.ts.

const KEY = 'a-valid-key-0123456789';
const ACTOR = '0190aaaa-0000-7000-8000-000000000001';

function fakeStore(begin: IdempotencyBegin) {
  return {
    begin: vi.fn<IdempotencyStore['begin']>().mockResolvedValue(begin),
    complete: vi.fn<IdempotencyStore['complete']>().mockResolvedValue(undefined),
    release: vi.fn<IdempotencyStore['release']>().mockResolvedValue(undefined),
  };
}

function fakeRequest(headers: Record<string, unknown> = { 'idempotency-key': KEY }) {
  const log = { error: vi.fn() };
  const request = {
    headers,
    method: 'POST',
    url: '/api/v1/admin/subscriptions/abc/extend-trial',
    routeOptions: { url: '/api/v1/admin/subscriptions/:id/extend-trial' },
    params: { id: 'abc' },
    body: { days: 7 },
    log,
  } as unknown as FastifyRequest;
  return { request, log };
}

function fakeReply() {
  const state: { code?: number; headers: Record<string, string>; sent: boolean } = { headers: {}, sent: false };
  const reply = {
    get sent() {
      return state.sent;
    },
    code(status: number) {
      state.code = status;
      return reply;
    },
    header(name: string, value: string) {
      state.headers[name] = value;
      return reply;
    },
  } as unknown as FastifyReply;
  return { reply, state };
}

const created = async () => ({ status: 201, body: { data: { id: 'v2' } } });

describe('canonicalJson and hashRequest', () => {
  it('ignores key order and undefined fields, but not content', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: undefined } })).toBe(
      '{"a":{"d":[3,{"y":2,"z":1}]},"b":1}',
    );
    const base = { method: 'POST', route: '/x/:id', params: { id: '1' }, body: { days: 7, note: 'a' } };
    expect(hashRequest({ ...base, body: { note: 'a', days: 7 } })).toBe(hashRequest(base));
    expect(hashRequest(base)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRequest({ ...base, body: { days: 8, note: 'a' } })).not.toBe(hashRequest(base));
    expect(hashRequest({ ...base, params: { id: '2' } })).not.toBe(hashRequest(base));
    expect(hashRequest({ ...base, route: '/y/:id' })).not.toBe(hashRequest(base));
  });

  it('tells apart values that would look alike without quoting', () => {
    expect(canonicalJson({ a: '1' })).not.toBe(canonicalJson({ a: 1 }));
    expect(canonicalJson(null)).toBe('null');
  });
});

describe('createIdempotency().run', () => {
  it('without the header it just runs the handler and never touches the storage', async () => {
    const store = fakeStore({ kind: 'started', id: 'row' });
    const { request } = fakeRequest({});
    const { reply, state } = fakeReply();
    const body = await createIdempotency(store).run(request, reply, ACTOR, created);
    expect(body).toEqual({ data: { id: 'v2' } });
    expect(state.code).toBe(201);
    expect(store.begin).not.toHaveBeenCalled();
  });

  it.each(['short', 'has space in it 12345', 'x'.repeat(65), 'bad/chars/0123456789'])(
    'rejects the malformed key %j with 400 before running anything',
    async (key) => {
      const store = fakeStore({ kind: 'started', id: 'row' });
      const handler = vi.fn(created);
      const { request } = fakeRequest({ 'idempotency-key': key });
      await expect(createIdempotency(store).run(request, fakeReply().reply, ACTOR, handler)).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(handler).not.toHaveBeenCalled();
      expect(store.begin).not.toHaveBeenCalled();
    },
  );

  it('rejects a repeated header (an array) with 400', async () => {
    const store = fakeStore({ kind: 'started', id: 'row' });
    const { request } = fakeRequest({ 'idempotency-key': [KEY, KEY] });
    await expect(createIdempotency(store).run(request, fakeReply().reply, ACTOR, created)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('first request: reserves, runs once, stores exactly the response it returns', async () => {
    const store = fakeStore({ kind: 'started', id: 'row-1' });
    const handler = vi.fn(created);
    const { request } = fakeRequest();
    const { reply, state } = fakeReply();
    const body = await createIdempotency(store).run(request, reply, ACTOR, handler);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(body).toEqual({ data: { id: 'v2' } });
    expect(state.code).toBe(201);
    expect(state.headers['idempotent-replayed']).toBeUndefined();
    expect(store.complete).toHaveBeenCalledWith('row-1', 201, { data: { id: 'v2' } });
    expect(store.release).not.toHaveBeenCalled();
  });

  it('passes the caller, the key and a content hash to the storage, with the configured times', async () => {
    const store = fakeStore({ kind: 'started', id: 'row' });
    const now = new Date('2026-11-07T10:00:00.000Z');
    const { request } = fakeRequest();
    await createIdempotency(store, { ttlMs: 1000, staleAfterMs: 500, clock: () => now }).run(
      request,
      fakeReply().reply,
      ACTOR,
      created,
    );
    const input = store.begin.mock.calls[0]?.[0];
    expect(input).toMatchObject({ actorUserId: ACTOR, key: KEY, now, ttlMs: 1000, staleAfterMs: 500 });
    expect(input?.requestHash).toBe(
      hashRequest({
        method: 'POST',
        route: '/api/v1/admin/subscriptions/:id/extend-trial',
        params: { id: 'abc' },
        body: { days: 7 },
      }),
    );
  });

  it('repeat after success: returns the stored answer with the replay header and runs nothing', async () => {
    const store = fakeStore({ kind: 'replay', status: 201, body: { data: { id: 'v2' } } });
    const handler = vi.fn(created);
    const { request } = fakeRequest();
    const { reply, state } = fakeReply();
    const body = await createIdempotency(store).run(request, reply, ACTOR, handler);

    expect(handler).not.toHaveBeenCalled();
    expect(body).toEqual({ data: { id: 'v2' } });
    expect(state.code).toBe(201);
    expect(state.headers['idempotent-replayed']).toBe('true');
    expect(store.complete).not.toHaveBeenCalled();
  });

  it('same key with different content: 422 IDEMPOTENCY_KEY_REUSED and nothing runs', async () => {
    const store = fakeStore({ kind: 'mismatch' });
    const handler = vi.fn(created);
    const error = await createIdempotency(store)
      .run(fakeRequest().request, fakeReply().reply, ACTOR, handler)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 422, code: 'IDEMPOTENCY_KEY_REUSED' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('first request still running: 409 IDEMPOTENCY_IN_PROGRESS with a retry hint and nothing runs', async () => {
    const store = fakeStore({ kind: 'in_progress' });
    const handler = vi.fn(created);
    const error = await createIdempotency(store)
      .run(fakeRequest().request, fakeReply().reply, ACTOR, handler)
      .catch((e: unknown) => e);
    expect(error).toMatchObject({
      statusCode: 409,
      code: 'IDEMPOTENCY_IN_PROGRESS',
      details: { retryAfterSeconds: 2 },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('a handler that throws gives the key back and the error still reaches the client', async () => {
    const store = fakeStore({ kind: 'started', id: 'row-2' });
    const boom = new AppError(409, 'CONFLICT', 'nope');
    const error = await createIdempotency(store)
      .run(fakeRequest().request, fakeReply().reply, ACTOR, async () => {
        throw boom;
      })
      .catch((e: unknown) => e);
    expect(error).toBe(boom);
    expect(store.release).toHaveBeenCalledWith('row-2');
    expect(store.complete).not.toHaveBeenCalled();
  });

  it('if giving the key back fails, the original error is still the one thrown', async () => {
    const store = fakeStore({ kind: 'started', id: 'row-3' });
    store.release.mockRejectedValue(new Error('db down'));
    const boom = new AppError(500, 'X', 'handler failed');
    const { request, log } = fakeRequest();
    const error = await createIdempotency(store)
      .run(request, fakeReply().reply, ACTOR, async () => {
        throw boom;
      })
      .catch((e: unknown) => e);
    expect(error).toBe(boom);
    expect(log.error).toHaveBeenCalledTimes(1);
  });

  it('if storing the answer fails, the client still gets it and the failure is logged', async () => {
    const store = fakeStore({ kind: 'started', id: 'row-4' });
    store.complete.mockRejectedValue(new Error('db down'));
    const { request, log } = fakeRequest();
    const { reply, state } = fakeReply();
    const body = await createIdempotency(store).run(request, reply, ACTOR, created);
    expect(body).toEqual({ data: { id: 'v2' } });
    expect(state.code).toBe(201);
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(store.release).not.toHaveBeenCalled();
  });

  it('does not set the status on a reply that was already sent (the 504 of ADR-0020)', async () => {
    const store = fakeStore({ kind: 'started', id: 'row-5' });
    const { request } = fakeRequest();
    const { reply, state } = fakeReply();
    state.sent = true;
    await createIdempotency(store).run(request, reply, ACTOR, created);
    expect(state.code).toBeUndefined();
    expect(store.complete).toHaveBeenCalledWith('row-5', 201, { data: { id: 'v2' } });
  });
});

describe('withIdempotency', () => {
  it('without a configured service it just runs the handler and ignores the header', async () => {
    const { request } = fakeRequest();
    const { reply, state } = fakeReply();
    const body = await withIdempotency(undefined, request, reply, ACTOR, created);
    expect(body).toEqual({ data: { id: 'v2' } });
    expect(state.code).toBe(201);
  });
});
