import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client.ts'
import { errorMessage, registerErrorMessage } from './labels.ts'

describe('registerErrorMessage', () => {
  it('بريد مسجّل قبل كده', () => {
    const error = new ApiError(409, 'CONFLICT', 'This email is already registered')
    expect(registerErrorMessage(error)).toContain('مسجّل بالفعل')
  })

  it('سياسة كلمة السر بالعربي من غير تكرار', () => {
    const error = new ApiError(400, 'VALIDATION_ERROR', 'Request validation failed', [
      { path: 'password', message: 'Password is too short' },
      { path: 'password', message: 'Password is too common' },
    ])
    const message = registerErrorMessage(error)
    expect(message).toContain('قصيرة')
    expect(message).toContain('شائعة')
    expect(message).not.toMatch(/Password/)
  })

  it('اسم الشركة والبريد', () => {
    const error = new ApiError(400, 'VALIDATION_ERROR', 'x', [
      { path: 'companyName', message: 'Too small' },
      { path: 'email', message: 'Invalid email' },
    ])
    const message = registerErrorMessage(error)
    expect(message).toContain('اسم الشركة')
    expect(message).toContain('البريد')
  })

  it('أي خطأ تاني بيعدّي على الرسائل العامة', () => {
    expect(registerErrorMessage(new ApiError(0, 'NETWORK_ERROR', 'x'))).toContain('تعذّر الاتصال')
    expect(registerErrorMessage(new Error('boom'))).toContain('غير متوقع')
  })
})

describe('errorMessage (members and companies)', () => {
  it('explains the last-owner rule instead of a generic conflict', () => {
    const error = new ApiError(409, 'CONFLICT', 'A company must keep at least one active owner')
    expect(errorMessage(error, 'member')).toContain('مالك نشط')
  })

  it('uses a state-changed message for other member and company conflicts', () => {
    const error = new ApiError(409, 'CONFLICT', 'Only an active user can be disabled')
    expect(errorMessage(error, 'member')).toContain('حالة العضو')
    expect(errorMessage(error, 'tenant')).toContain('حالة الشركة')
    expect(errorMessage(error, 'member')).not.toMatch(/[a-z]{4}/)
  })

  it('tells the user to upgrade or free a seat when the plan user limit is reached', () => {
    const error = new ApiError(409, 'PLAN_LIMIT_REACHED', 'Your plan does not allow more users.')
    const message = errorMessage(error, 'member')
    expect(message).toContain('الباقة')
    expect(message).toContain('عطّل')
    expect(message).not.toMatch(/[a-z]{4}/)
  })

  it('keeps the old conflict message for the other contexts', () => {
    const error = new ApiError(409, 'CONFLICT', 'x')
    expect(errorMessage(error)).toContain('الكود مكرر')
  })
})

describe('errorMessage (timeouts and busy service, ADR-0019 / ADR-0020 / ADR-0026)', () => {
  const timeout = (retryAfter: number | null) =>
    new ApiError(504, 'REQUEST_TIMEOUT', 'x', undefined, retryAfter)

  it('a write timeout says the outcome is unknown and never invites a blind retry', () => {
    const message = errorMessage(timeout(null))
    expect(message).toContain('نتيجته مش معروفة')
    expect(message).toContain('اتأكد من الحالة')
    expect(message).not.toContain('تأكيد تاني')
    expect(message).not.toMatch(/[a-z]{4}/)
  })

  it('a write timeout on a retry-safe operation says pressing confirm again is safe', () => {
    const message = errorMessage(timeout(null), 'subscription', { retrySafe: true })
    expect(message).toContain('نتيجته مش معروفة')
    expect(message).toContain('مش هتتكرر')
  })

  it('a read timeout (Retry-After present) just asks to try again shortly', () => {
    const message = errorMessage(timeout(5))
    expect(message).toContain('جرّب تاني')
    expect(message).not.toContain('نتيجته مش معروفة')
  })

  it('a busy service shows the wait from Retry-After, or a generic wait without it', () => {
    expect(errorMessage(new ApiError(503, 'SERVICE_BUSY', 'x', undefined, 5))).toContain('5 ثانية')
    expect(errorMessage(new ApiError(503, 'SERVICE_BUSY', 'x'))).toContain('بعد شوية')
  })

  it('an in-flight idempotent request asks to wait, using details when there is no header', () => {
    const fromDetails = new ApiError(409, 'IDEMPOTENCY_IN_PROGRESS', 'x', { retryAfterSeconds: 2 })
    expect(errorMessage(fromDetails)).toContain('2 ثانية')
    expect(errorMessage(new ApiError(409, 'IDEMPOTENCY_IN_PROGRESS', 'x'))).toContain('لسه بتتنفّذ')
  })

  it('a reused key tells the user to refresh, in Arabic only', () => {
    const message = errorMessage(new ApiError(422, 'IDEMPOTENCY_KEY_REUSED', 'x'))
    expect(message).toContain('حدّث الصفحة')
    expect(message).not.toMatch(/[a-z]{4}/)
  })

  it('the rate-limit message still reads the wait from details', () => {
    const error = new ApiError(429, 'TOO_MANY_REQUESTS', 'x', { retryAfterSeconds: 30 })
    expect(errorMessage(error)).toContain('30 ثانية')
  })
})
