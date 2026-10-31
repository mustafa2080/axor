import { useEffect, useRef, useState } from 'react'
import { MEMBERS_PAGE_SIZE, changeMemberRole, disableMember, enableMember, listMembers } from '../api/members.ts'
import type { Member, MemberStatus, TenantRole } from '../api/members.ts'
import type { SessionUser } from '../api/client.ts'
import { Badge, ErrorNote, Loading, Modal } from '../components/ui.tsx'
import type { Tone } from '../components/ui.tsx'
import { errorMessage, memberStatusLabel, tenantRoleLabel } from '../lib/labels.ts'
import { assignableRoles, memberActions } from '../lib/member-rules.ts'

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: Member[]; hasMore: boolean }

const dateFormat = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'medium' })
const statusTone: Record<MemberStatus, Tone> = { active: 'good', invited: 'info', disabled: 'muted' }

async function fetchFirstPage(): Promise<State> {
  try {
    const items = await listMembers(0)
    return { status: 'ready', items, hasMore: items.length === MEMBERS_PAGE_SIZE }
  } catch (error) {
    return { status: 'error', message: errorMessage(error) }
  }
}

/**
 * أعضاء الشركة: تغيير الدور وتعطيل وإعادة تفعيل (ADR-0011). الأزرار بتتخفى حسب الدور للراحة بس؛
 * الخادم بيفرض القواعد (مين يعدّل مين، وآخر مالك نشط) ويرد 403 أو 409.
 */
export function MembersPage({ user }: { user: SessionUser }) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [version, setVersion] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState<string | null>(null)
  const [confirmDisable, setConfirmDisable] = useState<Member | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)

  useEffect(() => {
    let active = true
    void fetchFirstPage().then((next) => {
      if (active) setState(next)
    })
    return () => {
      active = false
    }
  }, [version])

  function replace(updated: Member) {
    setState((current) =>
      current.status === 'ready'
        ? { ...current, items: current.items.map((item) => (item.id === updated.id ? updated : item)) }
        : current,
    )
  }

  async function perform(action: () => Promise<Member>): Promise<boolean> {
    if (inFlight.current) return false // نقر مزدوج أثناء عملية شغّالة
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      replace(await action())
      return true
    } catch (caught) {
      setError(errorMessage(caught, 'member'))
      return false
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  async function loadMore() {
    if (state.status !== 'ready') return
    setLoadingMore(true)
    setMoreError(null)
    try {
      const next = await listMembers(state.items.length)
      setState({ status: 'ready', items: [...state.items, ...next], hasMore: next.length === MEMBERS_PAGE_SIZE })
    } catch (caught) {
      setMoreError(errorMessage(caught))
    } finally {
      setLoadingMore(false)
    }
  }

  const actor = { id: user.id, role: user.role }

  return (
    <section>
      <div className="page-head">
        <h1>الأعضاء</h1>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setError(null)
            setState({ status: 'loading' })
            setVersion((v) => v + 1)
          }}
        >
          تحديث
        </button>
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

      {state.status === 'ready' && state.items.length === 0 ? <p className="empty">مفيش أعضاء.</p> : null}

      {state.status === 'ready' && state.items.length > 0 ? (
        <article className="card">
          <ErrorNote message={confirmDisable === null ? error : null} />
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>البريد</th>
                  <th>الدور</th>
                  <th>الحالة</th>
                  <th>انضم في</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {state.items.map((item) => {
                  const actions = memberActions(actor, item)
                  const roles = assignableRoles(actor.role, item.tenantRole)
                  return (
                    <tr key={item.id}>
                      <td>
                        <span className="ltr">{item.email}</span>
                        {item.id === user.id ? <span className="muted"> (أنت)</span> : null}
                      </td>
                      <td>
                        {actions.canChangeRole ? (
                          <select
                            aria-label={`دور ${item.email}`}
                            value={item.tenantRole}
                            disabled={busy}
                            onChange={(event) => {
                              const role = event.target.value as TenantRole
                              if (role !== item.tenantRole) void perform(() => changeMemberRole(item.id, role))
                            }}
                          >
                            {roles.map((role) => (
                              <option key={role} value={role}>
                                {tenantRoleLabel[role] ?? role}
                              </option>
                            ))}
                          </select>
                        ) : (
                          (tenantRoleLabel[item.tenantRole] ?? item.tenantRole)
                        )}
                      </td>
                      <td>
                        <Badge tone={statusTone[item.status]}>{memberStatusLabel[item.status]}</Badge>
                      </td>
                      <td>{dateFormat.format(new Date(item.createdAt))}</td>
                      <td className="cell-actions">
                        {actions.canDisable ? (
                          <button
                            type="button"
                            className="btn btn-small"
                            disabled={busy}
                            onClick={() => {
                              setError(null)
                              setConfirmDisable(item)
                            }}
                          >
                            تعطيل
                          </button>
                        ) : null}
                        {actions.canEnable ? (
                          <button
                            type="button"
                            className="btn btn-small"
                            disabled={busy}
                            onClick={() => void perform(() => enableMember(item.id))}
                          >
                            إعادة تفعيل
                          </button>
                        ) : null}
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

      {confirmDisable !== null ? (
        <Modal title="تعطيل عضو" onClose={() => setConfirmDisable(null)}>
          <div className="form">
            <p className="muted">
              <span className="ltr">{confirmDisable.email}</span>
            </p>
            <p className="notice">التعطيل بيقفل دخوله فوراً وبينهي كل جلساته. تقدر تعيد تفعيله بعد كده.</p>
            <ErrorNote message={error} />
            <div className="form-actions">
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy}
                onClick={() => {
                  const target = confirmDisable
                  void perform(() => disableMember(target.id)).then((done) => {
                    if (done) setConfirmDisable(null)
                  })
                }}
              >
                {busy ? 'جاري التنفيذ…' : 'تأكيد التعطيل'}
              </button>
              <button type="button" className="btn" onClick={() => setConfirmDisable(null)} disabled={busy}>
                رجوع
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </section>
  )
}
