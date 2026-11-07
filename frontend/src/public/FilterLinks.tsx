export interface FilterItem {
  href: string
  label: string
  active: boolean
}

/**
 * روابط تصفية (نظام، نشاط، وضع عرض): كلها روابط عادية بتغيّر الـ hash، فتشتغل من غير JavaScript إضافي
 * وبتتشارك وبترجع بزرار الرجوع. الاختيار الحالي بيتعلّم بـ `aria-current` (مش باللون بس).
 */
export function FilterLinks({ label, items }: { label: string; items: readonly FilterItem[] }) {
  return (
    <nav className="filter-links" aria-label={label}>
      {items.map((item) => (
        <a key={item.href} href={item.href} aria-current={item.active ? 'true' : undefined}>
          {item.label}
        </a>
      ))}
    </nav>
  )
}
