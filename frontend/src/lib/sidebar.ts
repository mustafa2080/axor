// حالة القائمة الجانبية على الشاشات الكبيرة (مطويّة لأيقونات أو مفتوحة). دوال نقية للاختبار.
// على الموبايل القائمة درج (drawer) بيتقفل لوحده، ومش بيتخزّن.

export const SIDEBAR_STORAGE_KEY = 'axor-sidebar'

/** مفتوحة هي الافتراضية؛ بس القيمة 'collapsed' بتطويها. أي قيمة تانية = مفتوحة. */
export function parseCollapsed(value: string | null): boolean {
  return value === 'collapsed'
}

export function serializeCollapsed(collapsed: boolean): string {
  return collapsed ? 'collapsed' : 'open'
}
