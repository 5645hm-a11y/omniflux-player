import { useMemo, useState } from 'react'
import { useCards, useLibrary } from '../store/library'
import { useT } from '../i18n'
import { Icon, IconButton } from '../components/ui'
import { ScreenHeader } from '../components/ScreenHeader'
import { Poster } from '../components/Poster'
import { AddDrive, AddLocal, FolderChips } from '../components/Sources'

/**
 * מסך הספרייה.
 *
 * כל מה שיש למשתמש בפועל — במחשב ובענן — ברשת אחת. החלוקה למקורות
 * שייכת למסך המקורות; כאן החלוקה היא לפי מה שהמשתמש מחפש: סרט,
 * סדרה או מוזיקה.
 */

type Filter = 'all' | 'movie' | 'series' | 'music'

export function Library(): React.JSX.Element {
  const t = useT()
  const cards = useCards()
  const catalog = useLibrary((s) => s.catalog)
  const scanning = useLibrary((s) => s.scanning)
  const progress = useLibrary((s) => s.progress)
  const query = useLibrary((s) => s.query)
  const setQuery = useLibrary((s) => s.setQuery)
  const scan = useLibrary((s) => s.scan)
  const [filter, setFilter] = useState<Filter>('all')

  const total = catalog?.items.length ?? 0
  const pct = progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0

  const shown = useMemo(() => {
    if (filter === 'all') return cards
    if (filter === 'series') return cards.filter((c) => c.episodes > 1 || c.kind === 'episode')
    if (filter === 'music') return cards.filter((c) => c.kind === 'audio')
    return cards.filter((c) => c.kind === 'movie' || (c.kind === 'unknown' && c.episodes <= 1))
  }, [cards, filter])

  const FILTERS: Array<{ id: Filter; label: string }> = [
    { id: 'all', label: t('library.filterAll') },
    { id: 'movie', label: t('library.filterMovies') },
    { id: 'series', label: t('library.filterSeries') },
    { id: 'music', label: t('library.filterMusic') }
  ]

  return (
    <div className="pointer-events-auto absolute inset-0 flex flex-col bg-canvas">
      {/*
        אין כאן זוהר צבעוני.
        תאורת אווירה נדגמת מאמנות בלבד, ולספרייה אין כותר יחיד שממנו
        לדגום — ולכן נשאר מדרג ניטרלי שמרים את ראש המסך.
      */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-surf-1 to-transparent opacity-70" />

      <ScreenHeader
        title={t('library.title')}
        subtitle={total > 0 ? t('library.count', { titles: shown.length, files: total }) : undefined}
        actions={
          <>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 start-3 grid place-items-center text-ink-3">
                <Icon name="search" size={15} />
              </span>
              <input
                /* רחב מספיק גם לצרפתית ולגרמנית — הן ארוכות בכרבע מאנגלית,
                   והשדה הצר קטע את מחרוזת ההנחיה באמצע מילה */
                className="no-drag w-72 rounded-o-md border border-ink/12 bg-surf-1/70 py-2 ps-9 pe-3 text-[13px] outline-none transition duration-normal placeholder:text-ink-3 focus:border-violet/50"
                placeholder={t('library.searchPlaceholder')}
                aria-label={t('library.searchPlaceholder')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <IconButton
              icon="refresh"
              label={scanning ? t('library.scanning') : t('library.scan')}
              size={17}
              onClick={() => void scan()}
              disabled={scanning}
              className={scanning ? 'animate-spin' : ''}
            />
          </>
        }
      />

      {scanning && progress && (
        <div className="relative z-10 border-b border-ink/8 px-8 py-2.5">
          <div className="mb-1.5 flex items-center gap-3 text-[12.5px] text-ink-2">
            <span className="truncate">{progress.message}</span>
            <span className="ms-auto tabular-nums">
              {progress.total > 0 ? `${progress.current}/${progress.total}` : progress.current}
            </span>
            <button
              className="no-drag text-ink-3 transition-colors hover:text-crimson"
              onClick={() => void window.cinema.library.cancelScan()}
            >
              {t('library.stop')}
            </button>
          </div>
          <div className="h-[3px] overflow-hidden rounded-full bg-ink/12">
            <div
              className={`h-full w-full bg-violet transition-transform duration-300 ease-out ltr:origin-left rtl:origin-right ${
                pct === 0 ? 'animate-pulse' : ''
              }`}
              style={{ transform: `scaleX(${pct > 0 ? pct / 100 : 0.25})` }}
            />
          </div>
        </div>
      )}

      <div className="relative z-10 flex-1 overflow-y-auto px-8 pb-10">
        {total === 0 ? (
          <div className="mx-auto mt-16 flex max-w-xl flex-col gap-7">
            <div>
              <h2 className="mb-3 text-[28px] leading-tight font-semibold tracking-tight">{t('library.empty')}</h2>
              <p className="text-[14.5px] leading-relaxed text-ink-2">{t('library.emptyBody')}</p>
            </div>
            <AddLocal size="lg" />
            <AddDrive />
          </div>
        ) : (
          <>
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <div className="flex gap-1.5">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFilter(f.id)}
                    className={`no-drag rounded-full px-4 py-1.5 text-[13px] font-medium transition duration-fast ${
                      filter === f.id ? 'bg-ink text-canvas' : 'text-ink-2 hover:bg-ink/10 hover:text-ink'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="ms-auto">
                <FolderChips />
              </div>
            </div>

            {shown.length > 0 ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(166px,1fr))] gap-x-5 gap-y-10 pt-2">
                {shown.map((card, i) => (
                  <Poster key={card.id} card={card} index={i} />
                ))}
              </div>
            ) : (
              <p className="mt-24 text-center text-[14px] text-ink-2">
                {query.trim() ? t('library.notFound') : t('library.noResults')}
              </p>
            )}

            <div className="mt-12 flex flex-col gap-4 border-t border-ink/8 pt-7">
              <AddLocal />
              <AddDrive />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
