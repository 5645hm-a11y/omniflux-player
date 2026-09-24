import { Children, useCallback, useEffect, useRef, useState } from 'react'
import { useT } from '../../i18n'
import { IconButton } from '../ui'

/**
 * מדף אופקי — הבסיס של כל המתחם.
 *
 * כמו ב-Apple Music וב-Spotify: שורה אחת שנגללת לצד, ולא רשת שדוחפת
 * את כל השאר מתחת לקיפול. עשרים שירים תופסים גובה של כרטיס אחד, והעמוד
 * כולו נקרא במבט אחד — כותרת, שורה, כותרת, שורה.
 *
 * החצים מכבדים כיוון: בעברית "קדימה" הוא שמאלה, וה-scrollLeft של Chromium
 * שלילי ב-RTL — ולכן הקצוות מחושבים בערך מוחלט. חץ בקצה נכבה, כדי שלא
 * יהיה כפתור שלוחצים עליו ולא קורה כלום.
 */
export function Carousel({
  title,
  subtitle,
  action,
  itemWidth = 176,
  children
}: {
  title: string
  subtitle?: string | null
  action?: React.ReactNode
  /** רוחב כל פריט, בפיקסלים */
  itemWidth?: number
  children: React.ReactNode
}): React.JSX.Element | null {
  const t = useT()
  const row = useRef<HTMLDivElement>(null)
  const [edge, setEdge] = useState({ start: true, end: true })
  const items = Children.toArray(children)

  const measure = useCallback(() => {
    const el = row.current
    if (!el) return
    const pos = Math.abs(el.scrollLeft)
    setEdge({ start: pos < 4, end: pos + el.clientWidth >= el.scrollWidth - 4 })
  }, [])

  useEffect(() => {
    measure()
    const el = row.current
    if (!el) return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [measure, items.length])

  if (items.length === 0) return null

  const scroll = (direction: 1 | -1): void => {
    const el = row.current
    if (!el) return
    const rtl = getComputedStyle(el).direction === 'rtl'
    el.scrollBy({ left: direction * el.clientWidth * 0.85 * (rtl ? -1 : 1), behavior: 'smooth' })
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end gap-3">
        <div className="min-w-0">
          <h2 className="font-display truncate text-[20px] leading-tight font-bold tracking-tight">{title}</h2>
          {subtitle && <p className="mt-0.5 truncate text-[12.5px] text-ink-3">{subtitle}</p>}
        </div>
        <span className="flex-1" />
        {action}
        {!(edge.start && edge.end) && (
          <span className="flex gap-1">
            <IconButton icon="chevronBack" label={t('music.scrollBack')} size={16} className="h-8 w-8 rtl:-scale-x-100"
              onClick={() => scroll(-1)} disabled={edge.start} />
            <IconButton icon="chevron" label={t('music.scrollForward')} size={16} className="h-8 w-8 rtl:-scale-x-100"
              onClick={() => scroll(1)} disabled={edge.end} />
          </span>
        )}
      </div>
      <div
        ref={row}
        onScroll={measure}
        className="-mx-2 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-2 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((child, index) => (
          <div key={index} className="shrink-0 snap-start" style={{ width: itemWidth }}>
            {child}
          </div>
        ))}
      </div>
    </section>
  )
}
