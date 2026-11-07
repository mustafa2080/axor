import { useSyncExternalStore } from 'react'
import { THEME_COLOR, THEME_STORAGE_KEY, nextTheme, parseStoredTheme, resolveTheme } from './theme.ts'
import type { Theme } from './theme.ts'

// الوضع الحالي محفوظ على <html data-theme> (theme-init.js بيضبطه قبل أول رسم). المكوّنات بتقراه من هنا،
// فأي زرار تبديل في أي مكان بيحدّث الباقي.

const listeners = new Set<() => void>()

function readStored(): Theme | null {
  try {
    return parseStoredTheme(localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return null
  }
}

function current(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
}

function apply(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.content = THEME_COLOR[theme]
  }
  for (const notify of listeners) notify()
}

/** التبديل بيخزّن اختيار المستخدم الصريح؛ لو التخزين ممنوع الوضع بيتغيّر للجلسة دي بس. */
export function toggleTheme(): void {
  const theme = nextTheme(current())
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // التخزين ممنوع (وضع خصوصية مثلاً): التغيير للجلسة بس.
  }
  apply(theme)
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify)
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  // لو المستخدم ما اختارش بنفسه، الواجهة بتتبع الجهاز لما يتغيّر.
  const onSystemChange = () => {
    if (readStored() === null) apply(resolveTheme(null, media.matches))
  }
  media.addEventListener('change', onSystemChange)
  return () => {
    listeners.delete(notify)
    media.removeEventListener('change', onSystemChange)
  }
}

export function useTheme(): { theme: Theme; toggle: () => void } {
  const theme = useSyncExternalStore(subscribe, current, () => 'light' as Theme)
  return { theme, toggle: toggleTheme }
}
