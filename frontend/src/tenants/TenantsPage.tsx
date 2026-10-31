import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { TENANTS_PAGE_SIZE, listTenants, reactivateTenant, suspendTenant } from '../api/tenants.ts'
import type { AdminTenant, TenantStatus } from '../api/tenants.ts'
import { Badge, ErrorNote, Field, Loading, Modal } from '../components/ui.tsx'
import type { Tone } from '../components/ui.tsx'
import { errorMessage, tenantStatusLabel } from '../lib/labels.ts'
import { REASON_MAX, normalizeReason } from '../lib/member-rules.ts'

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: AdminTenant[]; hasMore: boolean }

type Dialog = { action: 'suspend' | 'reactivate'; tenant: AdminTenant }

const dateFormat = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'medium' })
const statusTone: Record<TenantStatus, Tone> = { active: 'good', suspended: 'warn', closed: 'muted' }
const STATUSES: TenantStatus[] = ['active', 'suspended', 'closed']

async function fetchFirstPage(filter: TenantStatus | null): Promise<State> {
  try {
    const items = await listTenants(filter, 0)
    return { status: 'ready', items, hasMore: items.length === TENANTS_PAGE_SIZE }
  } catch (error) {
    return { status: 'error', message: errorMessage(error) }
  }
}

function TenantActionModal({
  dialog,
  onDone,
  onClose,
}: {
  dialog: Dialog
  onDone: (updated: AdminTenant) => void
  onClose: () => void
}) {
  const suspending = dialog.action === 'suspend'
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (inFlight.current) return
    // التعليق بسبب إجباري (3 لـ 500 حرف). إعادة التفعيل السبب فيها اختياري.
    const normalized = normalizeReason(reason)
    if (suspending && normalized === null) {
      setError('اكتب سبب التعليق (من 3 لـ 500 حرف).')
      return
    }
    if (!suspending && reason.trim() !== '' && normalized === null) {
      setError('السبب لازم يكون من 3 لـ 500 حرف، أو سيبه فاضي.')
      return
    }
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      const updated = suspending
        ? await suspendTenant(dialog.tenant.id, normalized ?? '')
        : await reactivateTenant(dialog.tenant.id, normalized)
      onDone(updated)
      onClose()
    } catch (caught) {
      setError(errorMessage(caught, 'tenant'))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return (
    <Modal title={suspending ? 'تعليق شركة' : 'إعادة تفعيل شركة'} onClose={onClose}>
      <form onSubmit={(event) => void submit(event)} className="form">
        <p className="muted">{dialog.tenant.name}</p>
        {suspending ? (
          <p className="notice">
            التعليق بيمنع كل مستخدمي الشركة من الدخول فوراً، والسبب بيتسجّل في سجل التدقيق.
          </p>
        ) : (
          <p className="notice">مستخدمو الشركة هيقدروا يدخلوا تاني على طول.</p>
        )}
        <Field label={suspending ? 'سبب التعليق' : 'السبب (اختياري)'} hint="من 3 لـ 500 حرف.">
          <input
            type="text"
            value={reason}
            maxLength={REASON_MAX}
            required={suspending}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        <ErrorNote message={error} />
        <div className="form-actions">
          <button type="submit" className={suspending ? 'btn btn-danger' : 'btn btn-primary'} disabled={busy}>
            {busy ? 'جاري التنفيذ…' : suspending ? 'تأكيد التعليق' : 'تأكيد'}
          </button>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            رجوع
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** الشركات لموظفي المنصة: قائمة بفلتر الحالة، وتعليق وإعادة تفعيل (ADR-0011). */
export function TenantsPage() {
  const [filter, setFilter] = useState<TenantStatus | null>(null)
  const [state, setState] = useState<State>({ status: 'loading' })
  const [version, setVersion] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog | null>(null)

  useEffect(() => {
    let active = true
    void fetchFirstPage(filter).then((next) => {
      if (active) setState(next)
    })
    return () => {
      active = false
    }
  }, [filter, version])

  function replace(updated: AdminTenant) {
    setState((current) => {
      if (current.status !== 'ready') return current
      // لو الفلتر مفعّل على حالة تانية، الشركة بتختفي من القائمة بعد التغيير.
      const keep = filter === null || updated.status === filter
      const items = current.items.flatMap((item) => (item.id !== updated.id ? [item] : keep ? [updated] : []))
      return { ...current, items }
    })
  }

  async function loadMore() {
    if (state.status !== 'ready') return
    setLoadingMore(true)
    setMoreError(null)
    try {
      const next = await listTenants(filter, state.items.length)
      setState({ status: 'ready', items: [...state.items, ...next], hasMore: next.length === TENANTS_PAGE_SIZE })
    } catch (caught) {
      setMoreError(errorMessage(caught))
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <section>
      <div className="page-head">
        <h1>الشركات</h1>
        <label className="check">
          <span>الحالة:</span>
          <select
            value={filter ?? ''}
            onChange={(event) => {
              const value = event.target.value
              setState({ status: 'loading' })
              setFilter(value === '' ? null : (value as TenantStatus))
            }}
          >
            <option value="">الكل</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {tenantStatusLabel[status]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {state.status === 'loading' ? <Loading /> : null}
      {state.status === 'error' ? (
        <>
          <ErrorNote message={state.message} />
          <button type="button" className="btn" onClick={() => setVersion((v) => v + 1)}>
            إعادة المحاولة
          </button>
        </>
      ) : null}

      {state.status === 'ready' && state.items.length === 0 ? (
        <p className="empty">مفيش شركات{filter === null ? ' لسه.' : ' بالحالة دي.'}</p>
      ) : null}

      {state.status === 'ready' && state.items.length > 0 ? (
        <article className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>الشركة</th>
                  <th>الحالة</th>
                  <th>المستخدمين</th>
                  <th>اتسجّلت في</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {state.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>
                      <Badge tone={statusTone[item.status]}>{tenantStatusLabel[item.status]}</Badge>
                    </td>
                    <td>{item.userCount}</td>
                    <td>{dateFormat.format(new Date(item.createdAt))}</td>
                    <td className="cell-actions">
                      {item.status === 'active' ? (
                        <button
                          type="button"
                          className="btn btn-small"
                          onClick={() => setDialog({ action: 'suspend', tenant: item })}
                        >
                          تعليق
                        </button>
                      ) : null}
                      {item.status === 'suspended' ? (
                        <button
                          type="button"
                          className="btn btn-small"
                          onClick={() => setDialog({ action: 'reactivate', tenant: item })}
                        >
                          إعادة تفعيل
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ErrorNote message={moreError} />
          {state.hasMore ? (
            <p>
              <button type="button" className="btn" onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? 'جاري التحميل…' : 'تحميل المزيد'}
              </button>
            </p>
          ) : null}
        </article>
      ) : null}

      {dialog !== null ? (
        <TenantActionModal dialog={dialog} onDone={replace} onClose={() => setDialog(null)} />
      ) : null}
    </section>
  )
}
