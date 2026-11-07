// الوضع الليلي/النهاري: دوال نقية عشان تتختبر من غير متصفح (الربط بالـ DOM في useTheme.ts).
// الاختيار الصريح للمستخدم بيتخزّن؛ من غيره الواجهة بتتبع إعداد الجهاز.

export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'axor-theme'

/** القيمة المخزّنة لو صالحة، وإلا null (أي قيمة غريبة = كأنه ما اختارش). */
export function parseStoredTheme(value: string | null): Theme | null {
  return value === 'light' || value === 'dark' ? value : null
}

export function resolveTheme(stored: Theme | null, systemDark: boolean): Theme {
  return stored ?? (systemDark ? 'dark' : 'light')
}

export function nextTheme(current: Theme): Theme {
  return current === 'dark' ? 'light' : 'dark'
}

/** لون `theme-color` (شريط المتصفح على الموبايل) لكل وضع. نفس قيم --surface في index.css. */
export const THEME_COLOR: Record<Theme, string> = { light: '#ffffff', dark: '#151a22' }
