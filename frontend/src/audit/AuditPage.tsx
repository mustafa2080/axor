import { useEffect, useState } from 'react'
import { AUDIT_PAGE_SIZE, listAuditLogs } from '../api/audit.ts'
import type { AuditEntry } from '../api/audit.ts'
import { Badge, ErrorNote, Loading } from '../components/ui.tsx'
import { AUDIT_ACTIONS, auditActionLabel, formatAuditDetails, isWarningAction } from '../lib/audit-labels.ts'
import { errorMessage } from '../lib/labels.ts'

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: AuditEntry[]; hasMore: boolean }

const dateTimeFormat = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' })

async function fetchFirstPage(filter: string | null): Promise<State> {
  try {
    const items = await listAuditLogs(filter, 0)
    return { status: 'ready', items, hasMore: items.length === AUDIT_PAGE_SIZE }
  } catch (error) {
    return { status: 'error', message: errorMessage(error) }
  }
}

/** سجل التدقيق لموظفي المنصة (قراءة فقط): مين عمل إيه، على مين، ومتى. */
export function AuditPage() {
  const [filter, setFilter] = useState<string | null>(null)
  const [state, setState] = useState<State>({ status: 'loading' })
  const [version, setVersion] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void fetchFirstPage(filter).then((next) => {
      if (active) setState(next)
    })
    return () => {
      active = false
    }
  }, [filter, version])

  async function loadMore() {
    if (state.status !== 'ready') return
    setLoadingMore(true)
    setMoreError(null)
    try {
      const next = await listAuditLogs(filter, state.items.length)
      setState({
        status: 'ready',
        items: [...state.items, ...next],
        hasMore: next.length === AUDIT_PAGE_SIZE,
      })
    } catch (error) {
      setMoreError(errorMessage(error))
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <section>
      <div className="page-head">
        <h1>سجل التدقيق</h1>
        <label className="check">
          <span>الحدث:</span>
          <select
            value={filter ?? ''}
            onChange={(event) => {
              const value = event.target.value
              setState({ status: 'loading' })
              setFilter(value === '' ? null : value)
            }}
          >
            <option value="">الكل</option>
            {AUDIT_ACTIONS.map((action) => (
              <option key={action} value={action}>
                {auditActionLabel(action)}
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
        <p className="empty">مفيش أحداث{filter === null ? ' لسه.' : ' من النوع ده.'}</p>
      ) : null}

      {state.status === 'ready' && state.items.length > 0 ? (
        <article className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>الوقت</th>
                  <th>الحدث</th>
                  <th>المنفّذ</th>
                  <th>الشركة</th>
                  <th>الهدف</th>
                  <th>تفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {state.items.map((item) => {
                  const details = formatAuditDetails(item.metadata)
                  return (
                    <tr key={item.id}>
                      <td>{dateTimeFormat.format(new Date(item.createdAt))}</td>
                      <td>
                        <Badge tone={isWarningAction(item.action) ? 'warn' : 'info'}>
                          {auditActionLabel(item.action)}
                        </Badge>
                      </td>
                      <td>
                        {item.actorEmail !== null ? (
                          <span className="ltr">{item.actorEmail}</span>
                        ) : (
                          <span className="muted">{item.actorUserId === null ? 'النظام' : 'حساب محذوف'}</span>
                        )}
                      </td>
                      <td>{item.tenantName ?? '—'}</td>
                      <td>
                        {item.targetType === null ? (
                          '—'
                        ) : (
                          <code className="code">
                            {item.targetType}
                            {item.targetId === null ? '' : `:${item.targetId.slice(0, 8)}`}
                          </code>
                        )}
                      </td>
                      <td className="audit-details">
                        {details === null ? '—' : <code className="code">{details}</code>}
                      </td>
                    </tr>
                  )
                })}
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
    </section>
  )
}
