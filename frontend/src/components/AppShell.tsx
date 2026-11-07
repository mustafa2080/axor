import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { SessionUser } from '../api/client.ts'
import { SIDEBAR_STORAGE_KEY, parseCollapsed, serializeCollapsed } from '../lib/sidebar.ts'
import { ChevronIcon, CloseIcon, MenuIcon } from './icons.tsx'
import { ThemeToggle } from './ThemeToggle.tsx'
import { UserBar } from './UserBar.tsx'
import { BrandMark } from './ui.tsx'

export interface NavItem {
  href: string
  label: string
  icon: ReactNode
  current: boolean
}

function readCollapsed(): boolean {
  try {
    return parseCollapsed(localStorage.getItem(SIDEBAR_STORAGE_KEY))
  } catch {
    return false
  }
}

/**
 * هيكل اللوحة: قائمة جانبية بسُمك (ADR-0022) + المحتوى. على الشاشات الكبيرة القائمة بتتطوي لشريط أيقونات
 * وحالتها بتتخزّن. على الموبايل هي درج بيتفتح بمفصلة (rotateY) من حافتها وبيتقفل بـ Escape أو بالضغط برا.
 * الحالتين بالـ CSS على `data-collapsed` و`data-drawer`، من غير media query في JS.
 */
export function AppShell({
  items,
  user,
  roleLabel,
  onSignOut,
  children,
}: {
  items: readonly NavItem[]
  user: SessionUser
  roleLabel: string
  onSignOut: () => void
  children: ReactNode
}) {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)

  function toggleCollapsed() {
    const next = !collapsed
    setCollapsed(next)
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, serializeCollapsed(next))
    } catch {
      // التخزين ممنوع: الطي للجلسة دي بس.
    }
  }

  useEffect(() => {
    if (!drawerOpen) return
    closeButton.current?.focus()
    const button = menuButton.current
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      button?.focus()
    }
  }, [drawerOpen])

  return (
    <div className="shell" data-collapsed={collapsed ? 'true' : 'false'} data-drawer={drawerOpen ? 'open' : 'closed'}>
      <aside className="sidebar" id="app-sidebar">
        <div className="side-head">
          <BrandMark />
          <button
            type="button"
            className="icon-btn side-collapse"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-controls="app-sidebar"
            aria-label={collapsed ? 'فتح القائمة' : 'طيّ القائمة'}
            title={collapsed ? 'فتح القائمة' : 'طيّ القائمة'}
          >
            <ChevronIcon />
          </button>
          <button
            type="button"
            className="icon-btn side-close"
            ref={closeButton}
            onClick={() => setDrawerOpen(false)}
            aria-label="إغلاق القائمة"
          >
            <CloseIcon />
          </button>
        </div>
        <nav className="side-nav" aria-label="التنقل الرئيسي">
          {items.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="side-item"
              title={item.label}
              aria-current={item.current ? 'page' : undefined}
              onClick={() => setDrawerOpen(false)}
            >
              {item.icon}
              <span className="nav-label">{item.label}</span>
            </a>
          ))}
        </nav>
        <div className="side-foot">
          <ThemeToggle showLabel className="side-item" />
          <UserBar user={user} roleLabel={roleLabel} onSignOut={onSignOut} />
        </div>
      </aside>
      <button
        type="button"
        className="shell-backdrop"
        tabIndex={-1}
        aria-label="إغلاق القائمة"
        onClick={() => setDrawerOpen(false)}
      />
      <div className="shell-main">
        <header className="shell-bar">
          <button
            type="button"
            className="icon-btn"
            ref={menuButton}
            onClick={() => setDrawerOpen(true)}
            aria-expanded={drawerOpen}
            aria-controls="app-sidebar"
            aria-label="فتح القائمة"
          >
            <MenuIcon />
          </button>
          <BrandMark />
          <ThemeToggle />
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  )
}
