
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, MAX_AUTO_RETRY_WAIT_SECONDS, parseRetryAfter } from './client.ts'

// عميل الـ API مع ADR-0019 وADR-0020 وADR-0026: هيدر Idempotency-Key، وقراءة Retry-After،
// وإعادة محاولة واحدة للقراءة بس عند 503/504.

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })

const ok = (data: unknown) => json(200, { data })
const failure = (status: number, code: string, headers: Record<string, string> = {}) =>
  json(status, { error: { code, message: code } }, headers)

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const headersOf = (call: number) =>
  (fetchMock.mock.calls[call]?.[1]?.headers ?? {}) as Record<string, string>

describe('parseRetryAfter', () => {
  it('بيقرا الثواني الرقمية بس', () => {
    expect(parseRetryAfter('5')).toBe(5)
    expect(parseRetryAfter(' 12 ')).toBe(12)
    expect(parseRetryAfter('0')).toBe(0)
  })

  it('أي صيغة تانية أو غايب = null', () => {
    expect(parseRetryAfter(null)).toBeNull()
    expect(parseRetryAfter('')).toBeNull()
    expect(parseRetryAfter('-3')).toBeNull()
    expect(parseRetryAfter('1.5')).toBeNull()
    expect(parseRetryAfter('Wed, 21 Oct 2026 07:28:00 GMT')).toBeNull()
    expect(parseRetryAfter('99999')).toBeNull()
  })
})

describe('Idempotency-Key', () => {
  it('بيتبعت كهيدر لما المفتاح موجود، ومش بيتبعت من غيره', async () => {
    fetchMock.mockResolvedValueOnce(ok({ id: 1 })).mockResolvedValueOnce(ok({ id: 2 }))
    await api('POST', '/x', { a: 1 }, { idempotencyKey: 'k'.repeat(32) })
    await api('POST', '/x', { a: 1 })
    expect(headersOf(0)['idempotency-key']).toBe('k'.repeat(32))
    expect(headersOf(1)['idempotency-key']).toBeUndefined()
  })

  it('نفس المفتاح بيتعاد لما الجلسة تتجدد بعد 401', async () => {
    fetchMock
      .mockResolvedValueOnce(failure(401, 'UNAUTHORIZED'))
      // /auth/refresh
      .mockResolvedValueOnce(
        ok({ accessToken: 't', accessTokenExpiresAt: 'x', user: { id: 'u' } }),
      )
      .mockResolvedValueOnce(ok({ id: 1 }))
    await api('POST', '/x', { a: 1 }, { idempotencyKey: 'a'.repeat(32) })
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/auth/refresh')
    expect(headersOf(0)['idempotency-key']).toBe('a'.repeat(32))
    expect(headersOf(2)['idempotency-key']).toBe('a'.repeat(32))
  })
})

describe('ApiError.retryAfterSeconds', () => {
  it('بيتاخد من هيدر Retry-After', async () => {
    fetchMock.mockResolvedValueOnce(failure(409, 'IDEMPOTENCY_IN_PROGRESS', { 'retry-after': '2' }))
    const error = await api('POST', '/x', {}).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).retryAfterSeconds).toBe(2)
  })

  it('null لو الهيدر مش موجود', async () => {
    fetchMock.mockResolvedValueOnce(failure(500, 'INTERNAL_ERROR'))
    const error = await api('POST', '/x', {}).catch((caught: unknown) => caught)
    expect((error as ApiError).retryAfterSeconds).toBeNull()
  })
})

describe('إعادة محاولة القراءة (GET)', () => {
  it('GET بيتعاد مرة واحدة بعد Retry-After لما الرد 503', async () => {
    fetchMock
      .mockResolvedValueOnce(failure(503, 'SERVICE_BUSY', { 'retry-after': '5' }))
      .mockResolvedValueOnce(ok([1, 2]))
    const pending = api<number[]>('GET', '/admin/catalog')
    await vi.advanceTimersByTimeAsync(4_999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await expect(pending).resolves.toEqual([1, 2])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('GET بيتعاد على 504 كمان', async () => {
    fetchMock
      .mockResolvedValueOnce(failure(504, 'REQUEST_TIMEOUT', { 'retry-after': '5' }))
      .mockResolvedValueOnce(ok('fine'))
    const pending = api<string>('GET', '/x')
    await vi.advanceTimersByTimeAsync(5_000)
    await expect(pending).resolves.toBe('fine')
  })

  it('محاولة واحدة بس: لو التانية فشلت الخطأ بيوصل زي ما هو', async () => {
    fetchMock
      .mockResolvedValueOnce(failure(503, 'SERVICE_BUSY', { 'retry-after': '5' }))
      .mockResolvedValueOnce(failure(503, 'SERVICE_BUSY', { 'retry-after': '5' }))
    const pending = api('GET', '/x').catch((caught: unknown) => caught)
    await vi.advanceTimersByTimeAsync(5_000)
    const error = await pending
    expect((error as ApiError).code).toBe('SERVICE_BUSY')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('مفيش إعادة لو الانتظار المطلوب أطول من الحد', async () => {
    const wait = String(MAX_AUTO_RETRY_WAIT_SECONDS + 1)
    fetchMock.mockResolvedValueOnce(failure(503, 'SERVICE_BUSY', { 'retry-after': wait }))
    const error = await api('GET', '/x').catch((caught: unknown) => caught)
    expect((error as ApiError).status).toBe(503)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('مفيش إعادة لو مفيش Retry-After', async () => {
    fetchMock.mockResolvedValueOnce(failure(503, 'SERVICE_BUSY'))
    await expect(api('GET', '/x')).rejects.toBeInstanceOf(ApiError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('مفيش إعادة لحالات تانية (500 و404)', async () => {
    fetchMock.mockResolvedValueOnce(failure(500, 'INTERNAL_ERROR', { 'retry-after': '1' }))
    await expect(api('GET', '/x')).rejects.toBeInstanceOf(ApiError)
    fetchMock.mockResolvedValueOnce(failure(404, 'NOT_FOUND', { 'retry-after': '1' }))
    await expect(api('GET', '/x')).rejects.toBeInstanceOf(ApiError)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it.each(['POST', 'PATCH', 'DELETE'])(
    'الكتابة (%s) ما بتتعادش تلقائياً أبداً: الـ 504 معناه نتيجة مجهولة',
    async (method) => {
      fetchMock.mockResolvedValueOnce(failure(504, 'REQUEST_TIMEOUT', { 'retry-after': '5' }))
      const pending = api(method, '/x', {}).catch((caught: unknown) => caught)
      await vi.advanceTimersByTimeAsync(60_000)
      expect(((await pending) as ApiError).status).toBe(504)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    },
  )
})
