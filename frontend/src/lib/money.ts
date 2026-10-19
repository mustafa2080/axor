// الفلوس في الـ API عدد صحيح بأصغر وحدة (قرش مثلاً). هنا كل التحويلات بنصوص وأعداد صحيحة
// من غير أي float، عشان ما يبقاش فيه 19.99 * 100 = 1998.9999.

/** عدد خانات الكسر للعملة (EGP=2، JPY=0، KWD=3). لو العملة مش معروفة بنفترض 2. */
export function currencyExponent(currency: string): number {
  try {
    const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits
    return digits ?? 2
  } catch {
    return 2
  }
}

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'
export const MAX_PRICE_MINOR = 1_000_000_000_000

/** "199.5" أو "١٩٩٫٥" ← 19950 (لـ EGP). بيرجع null لو المدخل مش رقم صالح أو كسوره أكتر من المسموح. */
export function parseMajorToMinor(input: string, exponent: number): number | null {
  const text = input
    .trim()
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace('٫', '.')
  const match = /^(\d{1,13})(?:\.(\d+))?$/.exec(text)
  if (match === null) return null
  const whole = match[1] ?? ''
  const fraction = match[2] ?? ''
  if (fraction.length > exponent) return null
  const minor = Number(whole + fraction.padEnd(exponent, '0'))
  return Number.isSafeInteger(minor) && minor <= MAX_PRICE_MINOR ? minor : null
}

/** 19950 ← "199.50" (نص بدقة كاملة، للحقول القابلة للتعديل). */
export function minorToMajorString(minor: number, exponent: number): string {
  if (exponent === 0) return String(minor)
  const padded = String(minor).padStart(exponent + 1, '0')
  return `${padded.slice(0, -exponent)}.${padded.slice(-exponent)}`
}

/** للعرض فقط (مش للحسابات): "١٩٩٫٥٠ ج.م.‏" */
export function formatPrice(minor: number, currency: string): string {
  const exponent = currencyExponent(currency)
  const major = Number(minorToMajorString(minor, exponent))
  try {
    return new Intl.NumberFormat('ar-EG', { style: 'currency', currency }).format(major)
  } catch {
    return `${minorToMajorString(minor, exponent)} ${currency}`
  }
}
