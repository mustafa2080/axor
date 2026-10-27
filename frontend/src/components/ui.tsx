import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

export type Tone = 'good' | 'warn' | 'muted' | 'info'

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

/** علامة AXOR: مربع بلون الهوية وعليه X. بتتلون من الـ tokens فتتبع الوضع الفاتح والداكن تلقائياً. */
export function BrandMark() {
  return (
    <span className="brand">
      <svg className="brand-mark" viewBox="0 0 28 28" aria-hidden="true" focusable="false">
        <rect width="28" height="28" rx="8" fill="var(--accent)" />
        <path
          d="M9.5 9.5l9 9M18.5 9.5l-9 9"
          fill="none"
          stroke="var(--accent-text)"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
      <span className="brand-name">AXOR</span>
    </span>
  )
}

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />
}

/** حالة تحميل داخل الصفحة: هياكل بطاقات بدل نص ثابت، وقارئ الشاشة بياخد الرسالة. */
export function Loading({ label = 'جاري التحميل…' }: { label?: string }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {[0, 1].map((key) => (
        <div className="skeleton-card" aria-hidden="true" key={key}>
          <span className="skeleton skeleton-title" />
          <span className="skeleton skeleton-line" />
          <span className="skeleton skeleton-line short" />
        </div>
      ))}
    </div>
  )
}

export function ErrorNote({ message }: { message: string | null }) {
  if (message === null) return null
  return (
    <p className="error-note" role="alert">
      {message}
    </p>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint === undefined ? null : <span className="field-hint">{hint}</span>}
    </label>
  )
}

/** نافذة حوار باستخدام <dialog> الأصلي: Esc والتركيز وقفل الخلفية جاهزين من المتصفح. */
export function Modal({
  title,
  onClose,
  wide = false,
  children,
}: {
  title: string
  onClose: () => void
  wide?: boolean
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (dialog !== null && !dialog.open) dialog.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      className={wide ? 'modal modal-wide' : 'modal'}
      onClose={onClose}
      onClick={(event) => {
        // الضغط على الخلفية المعتمة (مش على المحتوى) بيقفل النافذة.
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="modal-body">
        <header className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="إغلاق" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>
        {children}
      </div>
    </dialog>
  )
}
