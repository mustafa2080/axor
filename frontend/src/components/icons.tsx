import type { ReactNode } from 'react'

// أيقونات خطية بسيطة (stroke بلون النص الحالي). inline SVG عشان الـ CSP (img-src 'self' data:) وعشان
// ما نحمّلش مكتبة. كلها aria-hidden: النص اللي جنبها (أو aria-label على الزرار) هو الاسم.

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export const MenuIcon = () => (
  <Icon>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
)
export const CloseIcon = () => (
  <Icon>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
)
/** سهم الطي: بيتقلب بالـ CSS لما الشريط يتفتح أو يتقفل. */
export const ChevronIcon = () => (
  <Icon>
    <path d="M9 6l6 6-6 6" />
  </Icon>
)
export const SunIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
  </Icon>
)
export const MoonIcon = () => (
  <Icon>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
  </Icon>
)
export const BoxIcon = () => (
  <Icon>
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM4 7.5l8 4.5 8-4.5M12 12v9" />
  </Icon>
)
export const LayersIcon = () => (
  <Icon>
    <path d="M12 4l9 5-9 5-9-5 9-5zM3 14l9 5 9-5" />
  </Icon>
)
export const RepeatIcon = () => (
  <Icon>
    <path d="M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4" />
  </Icon>
)
export const BuildingIcon = () => (
  <Icon>
    <path d="M5 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17M15 9h3a1 1 0 0 1 1 1v11M3 21h18M9 8h2M9 12h2M9 16h2" />
  </Icon>
)
export const ShieldIcon = () => (
  <Icon>
    <path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6l8-3zM9 12l2 2 4-4" />
  </Icon>
)
export const PlayIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M10.5 8.8l4.2 3.2-4.2 3.2V8.8z" />
  </Icon>
)
export const UsersIcon = () => (
  <Icon>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M16 5.2a3.2 3.2 0 0 1 0 5.6M18 14.8c1.7.7 3 2.3 3 5.2" />
  </Icon>
)
export const UserIcon = () => (
  <Icon>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6" />
  </Icon>
)
export const LogoutIcon = () => (
  <Icon>
    <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9" />
  </Icon>
)
