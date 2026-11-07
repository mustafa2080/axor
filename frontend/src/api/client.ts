// عميل الـ API. الـ access token في الذاكرة بس (مش localStorage)، والـ refresh token في كوكي
// HttpOnly بيتبعت لوحده. الطلبات بتروح على /api/v1 (نفس الأصل، Vite بيعمل proxy في التطوير).

const BASE = '/api/v1'

export interface SessionUser {
  id: string
  email: string
  /** الاسم اللي الشخص اختاره لنفسه (اختياري). مش بيُستخدم في الدخول. */
  fullName: string | null
  kind: 'platform' | 'tenant'
  role: string
  tenantId: string | null
}

export interface Session {
  accessToken: string
  accessTokenExpiresAt: string
  user: SessionUser
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: unknown
  /** من هيدر Retry-After لو الخادم بعته (بالثواني)، وإلا null. */
  readonly retryAfterSeconds: number | null

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
    retryAfterSeconds: number | null = null,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
    this.retryAfterSeconds = retryAfterSeconds
  }
}

/** خيارات طلب اختيارية. idempotencyKey بيتبعت كهيدر `Idempotency-Key` (ADR-0026). */
export interface RequestOptions {
  idempotencyKey?: string | undefined
}

/** ثواني من هيدر Retry-After. الصيغة الرقمية بس (الخادم بيبعتها كده)، وأي حاجة تانية = null. */
export function parseRetryAfter(value: string | null): number | null {
  if (value === null || !/^\d{1,4}$/.test(value.trim())) return null
  return Number(value.trim())
}

let accessToken: string | null = null
let refreshing: Promise<Session | null> | null = null
let onSessionLost: (() => void) | null = null

/** بيتنده لما الجلسة تنتهي نهائياً (refresh فشل)، عشان الواجهة ترجع لشاشة الدخول. */
export function setSessionLostHandler(handler: (() => void) | null): void {
  onSessionLost = handler
}

interface ErrorBody {
  error?: { code?: string; message?: string; details?: unknown }
}

async function rawRequest(
  method: string,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<unknown> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (accessToken !== null) headers.authorization = `Bearer ${accessToken}`
  if (options.idempotencyKey !== undefined) headers['idempotency-key'] = options.idempotencyKey

  let response: Response
  try {
    response = await fetch(BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    })
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'تعذّر الاتصال بالخادم')
  }
  if (response.status === 204) return undefined

  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const error = (payload as ErrorBody | null)?.error
    throw new ApiError(
      response.status,
      error?.code ?? 'UNKNOWN',
      error?.message ?? `HTTP ${response.status}`,
      error?.details,
      parseRetryAfter(response.headers.get('retry-after')),
    )
  }
  return payload
}

const unwrap = <T>(payload: unknown): T => (payload as { data: T }).data

export async function login(email: string, password: string): Promise<Session> {
  const session = unwrap<Session>(await rawRequest('POST', '/auth/login', { email, password }))
  accessToken = session.accessToken
  return session
}

/** تسجيل شركة جديدة + مالكها. الخادم بيفتح جلسة جاهزة (نفس شكل الدخول). */
export async function registerCompany(input: {
  companyName: string
  email: string
  password: string
}): Promise<Session> {
  const session = unwrap<Session>(await rawRequest('POST', '/auth/register', input))
  accessToken = session.accessToken
  return session
}

/**
 * بيجدد الجلسة من كوكي الـ refresh. طلب واحد بس في نفس الوقت (React StrictMode بينده مرتين،
 * والـ refresh token بيتغير مع كل استخدام: طلبين متوازيين = كشف إعادة استخدام وقفل الجلسة).
 * بيرجع null لو مفيش جلسة صالحة.
 */
export function refreshSession(): Promise<Session | null> {
  refreshing ??= (async () => {
    try {
      const session = unwrap<Session>(await rawRequest('POST', '/auth/refresh'))
      accessToken = session.accessToken
      return session
    } catch (error) {
      accessToken = null
      if (error instanceof ApiError && error.status === 401) return null
      throw error
    }
  })().finally(() => {
    refreshing = null
  })
  return refreshing
}

export async function logout(): Promise<void> {
  try {
    await rawRequest('POST', '/auth/logout')
  } finally {
    accessToken = null
  }
}

/** تعديل اسم الشخص لنفسه (PATCH /auth/me). null بيمسح الاسم. بيرجع بيانات المستخدم المحدّثة. */
export function updateProfile(fullName: string | null): Promise<SessionUser> {
  return api<SessionUser>('PATCH', '/auth/me', { fullName })
}

/** أقصى انتظار بنقبله قبل إعادة محاولة GET تلقائياً. أكتر من كده بنسيب القرار للمستخدم. */
export const MAX_AUTO_RETRY_WAIT_SECONDS = 10

/**
 * إعادة محاولة واحدة لطلبات القراءة (GET) بس لما الخادم يقول 503 أو 504 ومعاه Retry-After قصير
 * (ADR-0019 وADR-0020: الخادم بيبعت الهيدر ده للقراءة بس). الكتابة ما بتتعادش هنا أبداً: الـ 504
 * على كتابة معناه إن نتيجتها مجهولة، والإعادة الآمنة لها بتتم بمفتاح Idempotency-Key من الشاشة.
 */
async function send(
  method: string,
  path: string,
  body: unknown,
  options: RequestOptions,
): Promise<unknown> {
  try {
    return await rawRequest(method, path, body, options)
  } catch (error) {
    const wait = error instanceof ApiError ? error.retryAfterSeconds : null
    if (
      method !== 'GET' ||
      !(error instanceof ApiError) ||
      (error.status !== 503 && error.status !== 504) ||
      wait === null ||
      wait > MAX_AUTO_RETRY_WAIT_SECONDS
    ) {
      throw error
    }
    await new Promise((resolve) => setTimeout(resolve, wait * 1000))
    return rawRequest(method, path, body, options)
  }
}

/** طلب موثّق. لو رجع 401 بيجدد الجلسة مرة واحدة ويعيد الطلب، ولو فشل التجديد بيرجّع لشاشة الدخول. */
export async function api<T>(
  method: string,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  try {
    return unwrap<T>(await send(method, path, body, options))
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error
    const session = await refreshSession()
    if (session === null) {
      onSessionLost?.()
      throw error
    }
    // نفس المفتاح في إعادة المحاولة بعد تجديد الجلسة: لو الطلب الأول وصل فعلاً الخادم هيرجّع رده.
    return unwrap<T>(await send(method, path, body, options))
  }
}
