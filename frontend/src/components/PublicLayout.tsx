import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  PUBLIC_ACCOUNT_LINKS,
  PUBLIC_INFO_LINKS,
  PUBLIC_NAV,
  isCurrentPublicLink,
} from '../lib/public-nav.ts'
import { useHash } from '../lib/useRoute.ts'
import { CloseIcon, MenuIcon } from './icons.tsx'
import { ThemeToggle } from './ThemeToggle.tsx'
import { BrandMark } from './ui.tsx'

// سنة الحقوق بتتحسب مرة واحدة وقت تحميل الصفحة (مش في كل render).
const COPYRIGHT_YEAR = new Date().getFullYear()

/**
 * إطار الصفحات العامة (ADR-0023): navbar لزق فوق + المحتوى + footer. مشترك بين الرئيسية والباقات والدخول والتسجيل
 * وصفحة 404، فالزائر عمره ما يشوف صفحة من غير تنقل. على الموبايل الروابط في قائمة بتنزل بقلبة rotateX من الشريط
 * (rotateX بس، ADR-0021) وبتتقفل بـ Escape أو باختيار رابط.
 */
export function PublicLayout({ children }: { children: ReactNode }) {
  const hash = useHash()
  const [open, setOpen] = useState(false)
  const toggle = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const button = toggle.current
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      button?.focus()
    }
  }, [open])

  return (
    <div className="public-shell">
      <header className="pub-nav" data-open={open ? 'true' : 'false'}>
        <div className="pub-nav-inner">
          <a href="#/" className="pub-brand" aria-label="AXOR - الرئيسية" onClick={() => setOpen(false)}>
            <BrandMark />
          </a>
          <nav className="pub-links" id="pub-menu" aria-label="التنقل الرئيسي">
            {PUBLIC_NAV.map((link) => (
              <a
                key={link.href}
                href={link.href}
                aria-current={isCurrentPublicLink(link.href, hash) ? 'page' : undefined}
                onClick={() => setOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <span className="pub-links-actions">
              <a className="btn btn-small" href="#/login" onClick={() => setOpen(false)}>
                دخول
              </a>
              <a className="btn btn-small btn-primary" href="#/plans" onClick={() => setOpen(false)}>
                ابدأ تجربتك
              </a>
            </span>
          </nav>
          <ThemeToggle />
          <button
            type="button"
            className="icon-btn pub-menu-btn"
            ref={toggle}
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="pub-menu"
            aria-label={open ? 'إغلاق القائمة' : 'فتح القائمة'}
          >
            {open ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </header>

      <div className="public-main">{children}</div>

      <footer className="pub-footer">
        <div className="pub-footer-inner">
          <div className="pub-footer-brand">
            <BrandMark />
            <p className="muted">منصة واحدة لحساب شركتك واشتراكاتها في الأنظمة.</p>
          </div>
          <nav className="pub-footer-col" aria-label="المنصة">
            <h2>المنصة</h2>
            {PUBLIC_NAV.map((link) => (
              <a key={link.href} href={link.href}>
                {link.label}
              </a>
            ))}
          </nav>
          <nav className="pub-footer-col" aria-label="معلومات">
            <h2>معلومات</h2>
            {PUBLIC_INFO_LINKS.map((link) => (
              <a key={link.href} href={link.href}>
                {link.label}
              </a>
            ))}
          </nav>
          <nav className="pub-footer-col" aria-label="الحساب">
            <h2>الحساب</h2>
            {PUBLIC_ACCOUNT_LINKS.map((link) => (
              <a key={link.href} href={link.href}>
                {link.label}
              </a>
            ))}
          </nav>
        </div>
        <p className="pub-footer-legal muted">© {COPYRIGHT_YEAR} AXOR. كل الحقوق محفوظة.</p>
      </footer>
    </div>
  )
}
