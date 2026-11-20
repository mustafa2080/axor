import { useEffect, useState } from 'react'
import { getPublicHome } from '../api/site.ts'
import { DEFAULT_HOME, readHomeContent } from '../lib/home-content.ts'
import type { HomeContent } from '../lib/home-content.ts'
import { createSettler } from '../lib/settler.ts'

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
    // أول نتيجة هي اللي بتتسجّل (createSettler بيمسح المؤقّت ويتجاهل أي نتيجة بعدها): من غير كده مهلة الـ 4 ثواني
    // كانت بترجّع الافتراضي فوق المحتوى المخصّص اللي اتحمّل بنجاح.
    const waiting = createSettler<HomeContent>(
      (content) => setState({ status: 'ready', content }),
      HOME_CONTENT_TIMEOUT_MS,
      () => DEFAULT_HOME,
    )
    getPublicHome().then(
      (setting) => waiting.settle(readHomeContent(setting.content)),
      () => waiting.settle(DEFAULT_HOME),
    )
    return waiting.dispose
  }, [])

  return state
}
