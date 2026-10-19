import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

export type Tone = 'good' | 'warn' | 'muted' | 'info'

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
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
            ×
          </button>
        </header>
        {children}
      </div>
    </dialog>
  )
}
