import { useTheme } from '../lib/useTheme.ts'
import { MoonIcon, SunIcon } from './icons.tsx'

/**
 * زرار الليلي/النهاري. الأيقونتين موجودين دايماً، والـ CSS (حسب `data-theme` على <html>) بيقلب بينهم
 * بـ rotateX. الاسم لقارئ الشاشة بيقول الوضع اللي هيتحوّل له.
 */
export function ThemeToggle({ showLabel = false, className = '' }: { showLabel?: boolean; className?: string }) {
  const { theme, toggle } = useTheme()
  const target = theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'
  return (
    <button
      type="button"
      className={`theme-toggle ${showLabel ? 'theme-toggle-wide' : 'icon-btn'} ${className}`.trim()}
      onClick={toggle}
      aria-label={`التبديل إلى ${target}`}
      title={`التبديل إلى ${target}`}
    >
      <span className="theme-icons" aria-hidden="true">
        <span className="theme-icon theme-icon-sun">
          <SunIcon />
        </span>
        <span className="theme-icon theme-icon-moon">
          <MoonIcon />
        </span>
      </span>
      {showLabel ? <span className="nav-label">{target}</span> : null}
    </button>
  )
}
