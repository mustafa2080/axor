import { useCallback, useEffect, useState } from 'react'
import { getPublicPage } from '../api/site.ts'
import { readPageContent } from '../lib/page-content.ts'
import type { PageContents, PageKey } from '../lib/page-content.ts'
import { createSettler } from '../lib/settler.ts'

/** أقصى انتظار لمحتوى صفحة معلومات قبل ما نقول للزائر إن التحميل فشل. */
export const PAGE_CONTENT_TIMEOUT_MS = 6000

export type PageContentState<K extends PageKey> =
  | { status: 'loading' }
  /** `content: null` = الصفحة ما اتنشرتش (أو المخزّن شكله غير سليم). */
  | { status: 'ready'; content: PageContents[K] | null }
  | { status: 'error'; retry: () => void }

/**
 * محتوى صفحة معلومات من الخادم (من غير دخول، ADR-0028). مفيش نص افتراضي: لو الخادم وقع الزائر بيشوف
 * رسالة تحميل فاشل مع إعادة المحاولة، ولو الصفحة ما اتنشرتش بيشوف «لسه ما اتنشرتش». الاتنين مختلفين عن قصد.
 */
export function usePageContent<K extends PageKey>(key: K): PageContentState<K> {
  const [state, setState] = useState<{ key: K; attempt: number; result: PageContentState<K> }>({
    key,
    attempt: 0,
    result: { status: 'loading' },
  })
  const retry = useCallback(() => setState((s) => ({ key: s.key, attempt: s.attempt + 1, result: { status: 'loading' } })), [])
  const attempt = state.key === key ? state.attempt : 0

  useEffect(() => {
    // أول نتيجة (نجاح أو فشل أو انتهاء المهلة) هي اللي بتتسجّل (createSettler بيمسح المؤقّت ويتجاهل اللي بعدها):
    // من غير كده مهلة الـ 6 ثواني كانت بتقلب صفحة اتحمّلت بنجاح لرسالة «تعذّر تحميل الصفحة» بعد ما الزائر يكون بدأ يقرا.
    const waiting = createSettler<PageContentState<K>>(
      (result) => setState({ key, attempt, result }),
      PAGE_CONTENT_TIMEOUT_MS,
      () => ({ status: 'error', retry }),
    )
    getPublicPage(key).then(
      (setting) => waiting.settle({ status: 'ready', content: readPageContent(key, setting.content) }),
      () => waiting.settle({ status: 'error', retry }),
    )
    return waiting.dispose
  }, [key, attempt, retry])

  // لما المفتاح يتغير (من صفحة لصفحة) نعرض تحميل لحد ما محتوى الصفحة الجديدة يوصل، مش محتوى القديمة.
  return state.key === key ? state.result : { status: 'loading' }
}
