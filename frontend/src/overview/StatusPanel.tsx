import { describeSegments } from '../lib/overview.ts'
import type { Segment } from '../lib/overview.ts'

/**
 * شريط توزيع بـ SVG. العرض بيتحسب بالنسبة (attributes مش style، فمفيش inline style ولا مشكلة CSP)،
 * والشرايح بتبدأ من اليمين لأن الواجهة RTL. الشريط للنظر بس: الأرقام الفعلية في القايمة تحته،
 * وقارئ الشاشة بياخد نفس الأرقام من الوصف.
 */
function DistributionBar({ segments }: { segments: readonly Segment[] }) {
  return (
    <svg
      className="overview-bar"
      viewBox="0 0 100 4"
      preserveAspectRatio="none"
      role="img"
      aria-label={describeSegments(segments)}
    >
      {segments.map((segment, index) => {
        const width = segment.share * 100
        // مجموع الشرايح قبل دي، من غير متغيّر بيتعدّل أثناء الرسم.
        const before = segments.slice(0, index).reduce((sum, other) => sum + other.share, 0) * 100
        const x = 100 - before - width
        return width > 0 ? (
          <rect key={segment.key} className={`bar-seg tone-${segment.tone}`} x={x} y={0} width={width} height={4} />
        ) : null
      })}
    </svg>
  )
}

interface Props {
  title: string
  total: number
  totalLabel: string
  segments: readonly Segment[]
  href: string
  linkLabel: string
}

/** لوحة واحدة: الإجمالي، وشريط التوزيع، وصف لكل حالة بعددها ونسبتها. */
export function StatusPanel({ title, total, totalLabel, segments, href, linkLabel }: Props) {
  return (
    <article className="card overview-panel">
      <header className="card-head">
        <h2>{title}</h2>
        <a className="btn btn-small" href={href}>
          {linkLabel}
        </a>
      </header>
      <p className="overview-total">
        <strong>{total}</strong>
        <span className="muted">{totalLabel}</span>
      </p>
      <DistributionBar segments={segments} />
      <ul className="overview-legend">
        {segments.map((segment) => (
          <li key={segment.key}>
            <span className={`dot dot-${segment.tone}`} aria-hidden="true" />
            <span>{segment.label}</span>
            <strong>{segment.count}</strong>
            <span className="pct">{segment.percent}%</span>
          </li>
        ))}
      </ul>
    </article>
  )
}
