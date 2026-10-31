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
