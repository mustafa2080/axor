// فحص الاسم قبل الإرسال. نفس قواعد الخادم (backend/src/modules/auth/auth.routes.ts): بعد التقليم
// لحد 100 حرف، ومن غير رموز تحكم. الخادم هو اللي بيحسم؛ الفحص هنا عشان رسالة واضحة بدل رد 400.
export const FULL_NAME_MAX = 100

export type NameCheck = { ok: true; value: string | null } | { ok: false; message: string }

/** اسم فاضي = مسح الاسم (value: null). */
export function checkFullName(input: string): NameCheck {
  const value = input.trim()
  if (value === '') return { ok: true, value: null }
  if (value.length > FULL_NAME_MAX) {
    return { ok: false, message: `الاسم طويل (${FULL_NAME_MAX} حرف كحد أقصى).` }
  }
  const hasControl = [...value].some((char) => {
    const code = char.codePointAt(0) ?? 0
    return code <= 31 || code === 127
  })
  if (hasControl) return { ok: false, message: 'الاسم فيه رموز غير مسموحة.' }
  return { ok: true, value }
}

/** الاسم للعرض: الاسم لو موجود، وإلا البريد. */
export function displayName(user: { fullName: string | null; email: string }): string {
  return user.fullName !== null && user.fullName !== '' ? user.fullName : user.email
}
