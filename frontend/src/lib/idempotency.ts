
// مفاتيح Idempotency-Key للكتابات اللي مش بتتكرر بأمان (ADR-0026): تمديد التجربة وإضافة نسخة باقة.
// المفتاح بيتولّد عند أول محاولة وبيتعاد في كل إعادة محاولة لنفس العملية بنفس البيانات، فلو الطلب
// الأول وصل الخادم (حتى لو الرد ضاع أو جه 504) الإعادة بترجّع رده بدل ما تنفّذ مرة تانية.

/** 32 حرف hex عشوائي (128 bit). يطابق شكل الخادم: 16 لـ 64 حرف من الحروف والأرقام و`-` و`_`. */
export function newIdempotencyKey(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * بيحتفظ بمفتاح واحد لكل «بصمة» عملية. نفس البصمة = نفس المفتاح (إعادة محاولة)، وبصمة مختلفة
 * (المستخدم غيّر المدخلات) = مفتاح جديد، لأن الخادم بيرفض (422) نفس المفتاح بمحتوى مختلف.
 * `clear()` بعد النجاح عشان العملية الجاية تاخد مفتاح جديد.
 */
export function createKeyHolder(generate: () => string = newIdempotencyKey) {
  let current: { fingerprint: string; key: string } | null = null
  return {
    keyFor(fingerprint: string): string {
      if (current === null || current.fingerprint !== fingerprint) {
        current = { fingerprint, key: generate() }
      }
      return current.key
    },
    clear(): void {
      current = null
    },
  }
}

export type KeyHolder = ReturnType<typeof createKeyHolder>
