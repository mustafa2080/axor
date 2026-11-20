import { useEffect, useState } from 'react'
import { getPublicHome } from '../api/site.ts'
import { DEFAULT_HOME, readHomeContent } from '../lib/home-content.ts'
import type { HomeContent } from '../lib/home-content.ts'

/** أقصى انتظار لمحتوى الرئيسية قبل ما نعرض الافتراضي. الصفحة التسويقية ما تفضلش فاضية لو الخادم بطيء. */
export const HOME_CONTENT_TIMEOUT_MS = 4000

export type HomeContentState = { status: 'loading' } | { status: 'ready'; content: HomeContent }

/**
 * محتوى الصفحة الرئيسية من الخادم (من غير دخول). أي فشل (خادم واقف أو بطيء أو شكل غريب) = المحتوى
 * الافتراضي، من غير رسالة خطأ: الزائر ما يعرفش ولا يحتاج يعرف إن في إعدادات قابلة للتعديل.
 */
export function useHomeContent(): HomeContentState {
  const [state, setState] = useState<HomeContentState>({ status: 'loading' })

  useEffect(() => {
    let active = true
    const settle = (content: HomeContent) => {
      if (active) setState({ status: 'ready', content })
    }
    const timer = setTimeout(() => settle(DEFAULT_HOME), HOME_CONTENT_TIMEOUT_MS)
    getPublicHome().then(
      (setting) => settle(readHomeContent(setting.content)),
      () => settle(DEFAULT_HOME),
    )
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [])

  return state
}
