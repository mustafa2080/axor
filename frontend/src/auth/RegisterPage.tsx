import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { loadPublicCatalog, startTrial } from '../api/company.ts'
import type { PublicPlan, PublicProduct } from '../api/company.ts'
import { useAuth } from './auth-context.ts'
import { BrandMark, ErrorNote, Field } from '../components/ui.tsx'
import { buildOffers } from '../lib/company-offers.ts'
import { registerErrorMessage } from '../lib/labels.ts'
import { findOffer } from '../lib/plan-choice.ts'
import type { PlanChoice } from '../lib/plan-choice.ts'
import { TRIAL_FAILED_HASH, usePlanChoice } from '../lib/useRoute.ts'
import { useSingleFlight } from '../lib/useSingleFlight.ts'

type Selected =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'invalid' }
  | { status: 'valid'; product: PublicProduct; plan: PublicPlan }

/**
 * الباقة المختارة من الرابط، متراجعة على الكتالوج العام. الرابط مجرد اقتراح من برّه: لو النظام أو
 * الباقة مش متاحين (أو الكود متلاعب فيه) بنتجاهلها ونسجّل عادي. الخادم بيراجع تاني عند بدء التجربة.
 */
function useSelectedPlan(choice: PlanChoice | null): Selected {
  const key = choice === null ? null : `${choice.productCode}/${choice.planCode}`
  const [resolved, setResolved] = useState<{
    key: string
    found: { product: PublicProduct; plan: PublicPlan } | null
  } | null>(null)

  useEffect(() => {
    if (choice === null || key === null) return
    let active = true
    loadPublicCatalog()
      .then((catalog) => findOffer(buildOffers(catalog.products, catalog.plansByProduct, new Set()), choice))
      .catch(() => null)
      .then((found) => {
        if (active) setResolved({ key, found })
      })
    return () => {
      active = false
    }
  }, [choice, key])

  if (choice === null) return { status: 'none' }
  if (resolved?.key !== key) return { status: 'loading' }
  return resolved.found === null ? { status: 'invalid' } : { status: 'valid', ...resolved.found }
}

/**
 * تسجيل شركة جديدة: الخادم بيعمل الشركة والمالك في transaction واحدة وبيفتح جلسة جاهزة.
 * لو الزائر جاي من صفحة الباقات (#/register?product=&plan=)، بنبدأ له التجربة بعد التسجيل على طول.
 */
export function RegisterPage() {
  const { signUp } = useAuth()
  const selected = useSelectedPlan(usePlanChoice())
  const [companyName, setCompanyName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const once = useSingleFlight()

  // الواجهة بتبعت الكود بس (الخادم بيقرر المدة والحالة). لو فشل بدء التجربة، الزائر بيوصل لصفحة
  // «ابدأ تجربة» برسالة بتقوله إن التسجيل تم والتجربة هي اللي لسه، والتسجيل نفسه ثابت.
  async function afterRegister() {
    if (selected.status !== 'valid') {
      window.location.hash = '#/start'
      return
    }
    try {
      await startTrial(selected.product.code, selected.plan.code)
      window.location.hash = '#/'
    } catch {
      window.location.hash = TRIAL_FAILED_HASH
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    // نقرتين بسرعة كانوا هيبعتوا تسجيلين: التاني بيرجع «البريد مسجّل» بعد ما الأول نجح. القفل بيمنعه.
    await once(async () => {
      setBusy(true)
      setError(null)
      try {
        await signUp({ companyName: companyName.trim(), email: email.trim(), password }, afterRegister)
      } catch (caught) {
        setError(registerErrorMessage(caught))
        setBusy(false)
      }
    })
  }

  return (
    <main className="login">
      <form className="login-card form" onSubmit={(event) => void submit(event)}>
        <h1>
          <BrandMark />
        </h1>
        <p className="muted">سجّل شركتك وابدأ تجربة مجانية.</p>
        {selected.status === 'valid' ? (
          <p className="notice">
            بعد التسجيل هنبدأ لك تجربة <strong>{selected.plan.trialDays} يوم</strong> لنظام{' '}
            <strong>{selected.product.name}</strong> (باقة <span className="ltr">{selected.plan.code}</span>).{' '}
            <a href="#/plans">غيّر الباقة</a>
          </p>
        ) : null}
        {selected.status === 'invalid' ? (
          <p className="notice">
            الباقة المختارة مش متاحة دلوقتي. تقدر تسجّل وتختار من جوه حسابك، أو <a href="#/plans">اختار باقة</a>.
          </p>
        ) : null}
        <Field label="اسم الشركة">
          <input
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
            minLength={2}
            maxLength={200}
            required
            autoFocus
          />
        </Field>
        <Field label="البريد الإلكتروني">
          <input
            className="ltr"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </Field>
        <Field label="كلمة السر" hint="12 حرف على الأقل، وما تحتويش على بريدك ولا تكون شائعة.">
          <input
            className="ltr"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={12}
            maxLength={128}
            required
          />
        </Field>
        <ErrorNote message={error} />
        <button type="submit" className="btn btn-primary" disabled={busy || selected.status === 'loading'}>
          {busy ? 'جاري التسجيل…' : 'إنشاء الحساب'}
        </button>
        <p className="muted">
          عندك حساب؟ <a href="#/login">دخول</a> · <a href="#/plans">الباقات</a>
        </p>
      </form>
    </main>
  )
}
