import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { errorPageCopy } from '../lib/error-pages.ts'
import type { ErrorPageKind } from '../lib/error-pages.ts'

/**
 * صفحة خطأ (403 أو 404 أو 500). بتنقل التركيز للعنوان أول ما تظهر عشان قارئ الشاشة والكيبورد
 * يعرفوا إن الصفحة اتغيّرت. الأزرار بتيجي من اللي بينادي (children)، و`message` بيستبدل النص الافتراضي.
 */
export function ErrorPage({
  kind,
  message,
  children,
}: {
  kind: ErrorPageKind
  message?: string
  children?: ReactNode
}) {
  const copy = errorPageCopy[kind]
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    heading.current?.focus()
  }, [])

  return (
    <section className="error-page" aria-labelledby="error-page-title">
      <p className="error-page-code ltr" aria-hidden="true">
        {copy.code}
      </p>
      <h1 id="error-page-title" ref={heading} tabIndex={-1}>
        {copy.title}
      </h1>
      <p className="muted">{message ?? copy.message}</p>
      {children === undefined ? null : <div className="error-page-actions">{children}</div>}
    </section>
  )
}

/** 404 بزرار الرجوع للرئيسية. الرئيسية بتتحدد حسب الحالة: دخول للزائر، واللوحة للمسجّل. */
export function NotFoundPage() {
  return (
    <ErrorPage kind="not-found">
      <a className="btn btn-primary" href="#/">
        الرجوع للرئيسية
      </a>
    </ErrorPage>
  )
}
