import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client.ts'
import { registerErrorMessage } from './labels.ts'

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
