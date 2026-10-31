import { useState } from 'react'
import type { FormEvent } from 'react'
import { updateProfile } from '../api/client.ts'
import type { SessionUser } from '../api/client.ts'
import { useAuth } from '../auth/auth-context.ts'
import { checkFullName, FULL_NAME_MAX } from '../lib/profile-name.ts'
import { useSubmit } from '../lib/useSubmit.ts'
import { ErrorNote, Field, Modal } from './ui.tsx'

function ProfileModal({ user, onClose }: { user: SessionUser; onClose: () => void }) {
  const { replaceUser } = useAuth()
  const [name, setName] = useState(user.fullName ?? '')
  const { busy, error, setError, run } = useSubmit()

  async function submit(event: FormEvent) {
    event.preventDefault()
    const checked = checkFullName(name)
    if (!checked.ok) {
      setError(checked.message)
      return
    }
    const ok = await run(async () => {
      replaceUser(await updateProfile(checked.value))
    })
    if (ok) onClose()
  }

  return (
    <Modal title="حسابي" onClose={onClose}>
      <form onSubmit={(event) => void submit(event)} className="form">
        <Field label="البريد الإلكتروني" hint="ده اللي بتدخل بيه، ومش بيتغيّر من هنا.">
          <input className="ltr" value={user.email} readOnly />
        </Field>
        <Field
          label="الاسم"
          hint={
            user.kind === 'tenant'
              ? 'اختياري. بيظهر لباقي أعضاء شركتك. سيبه فاضي لو مش عايز تحط اسم.'
              : 'اختياري. سيبه فاضي لو مش عايز تحط اسم.'
          }
        >
          <input value={name} maxLength={FULL_NAME_MAX} onChange={(event) => setName(event.target.value)} />
        </Field>
        <ErrorNote message={error} />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'جاري الحفظ…' : 'حفظ'}
          </button>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            إلغاء
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** شريط المستخدم في أعلى اللوحة (الاسم أو البريد، الدور، حسابي، خروج). مشترك بين لوحة الشركة والمنصة. */
export function UserBar({
  user,
  roleLabel,
  onSignOut,
}: {
  user: SessionUser
  roleLabel: string
  onSignOut: () => void
}) {
  const [editing, setEditing] = useState(false)
  return (
    <div className="user">
      {user.fullName !== null && user.fullName !== '' ? <span>{user.fullName}</span> : null}
      <span className="ltr">{user.email}</span>
      <span className="muted">{roleLabel}</span>
      <button type="button" className="btn btn-small" onClick={() => setEditing(true)}>
        حسابي
      </button>
      <button type="button" className="btn btn-small" onClick={onSignOut}>
        خروج
      </button>
      {editing ? <ProfileModal user={user} onClose={() => setEditing(false)} /> : null}
    </div>
  )
}
