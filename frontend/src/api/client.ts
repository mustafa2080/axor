// عميل الـ API. الـ access token في الذاكرة بس (مش localStorage)، والـ refresh token في كوكي
// HttpOnly بيتبعت لوحده. الطلبات بتروح على /api/v1 (نفس الأصل، Vite بيعمل proxy في التطوير).

const BASE = '/api/v1'

export interface SessionUser {
  id: string
  email: string
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

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
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

async function rawRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (accessToken !== null) headers.authorization = `Bearer ${accessToken}`

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

/** طلب موثّق. لو رجع 401 بيجدد الجلسة مرة واحدة ويعيد الطلب، ولو فشل التجديد بيرجّع لشاشة الدخول. */
export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  try {
    return unwrap<T>(await rawRequest(method, path, body))
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error
    const session = await refreshSession()
    if (session === null) {
      onSessionLost?.()
      throw error
    }
    return unwrap<T>(await rawRequest(method, path, body))
  }
}
