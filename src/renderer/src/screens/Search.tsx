import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import type { HubCard, SearchGroup, SearchResult } from '@shared/api'
import { useT } from '../i18n'
import { Icon, IconButton, Pill } from '../components/ui'
import { activate, reasonKey } from '../lib/activate'
import { TitleCard } from '../components/TitleCard'
import { useUi } from '../store/ui'
import searchBackdrop from '../assets/hero-v2.png'

/**
 * החיפוש המאוחד.
 *
 * יעד בסרגל ולא חלון צף: החיפוש כאן אינו קופץ מעל מסך אחר אלא
 * מרגישה כמו ניווט לדף אחר, וזה לא מה שקורה כאן.
 *
 * הקיבוץ אינו קישוט אלא התשובה לשאלה היחידה שמעניינת: מה אפשר לנגן
 * עכשיו, ומה דורש מנוי או השכרה.
 */

/** מאיפה הגיעה השורה — נקרא במבט אחד, לפני הכותרת */
function SourceMark({ result }: { result: SearchResult }): React.JSX.Element | null {
  if (result.origin === 'music') {
    return (
      <span title={result.sourceLabel} className="grid h-5 w-5 place-items-center text-ink-3">
        <Icon name="audio" size={13} />
      </span>
    )
  }
  if (result.origin !== 'library') return null

  // הספרייה מכילה שני מקורות שונים לגמרי, והם נראים אחרת
  const drive = /drive/i.test(result.sourceLabel)
  return (
    <span
      title={result.sourceLabel}
      aria-label={result.sourceLabel}
      className="grid h-5 w-5 place-items-center text-ink-3"
    >
      <Icon name={drive ? 'cloud' : 'screen'} size={13} />
    </span>
  )
}

function Row({ result, index }: { result: SearchResult; index: number }): React.JSX.Element {
  const t = useT()
  const openDetails = useUi((state) => state.openDetails)
  const [failed, setFailed] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const hasArt = Boolean(result.poster) && !failed
  const art = result.poster ?? ''

  const KIND_LABEL: Record<string, string> = {
    flatrate: t('search.subscription'),
    rent: t('search.rent'),
    buy: t('search.buy')
  }

  const go = (): void => {
    // Catalog rows represent movies/TV, never audio. Opening details here keeps
    // them completely outside the Spotify/Deezer activation pipeline.
    if (result.origin === 'catalog') {
      openDetails(result.id)
      return
    }
    void activate(result).then((r) => {
      if (!r.ok) setNote(t(reasonKey(r.reason)))
    })
  }

  const actionable = result.origin === 'catalog' || result.playable || Boolean(result.externalUrl)

  return (
    <motion.button
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, delay: Math.min(index, 12) * 0.022, ease: [0.16, 1, 0.3, 1] }}
      className="group flex w-full items-center gap-3.5 rounded-o-lg p-2.5 text-start transition-colors duration-fast hover:bg-ink/7 disabled:cursor-default disabled:opacity-60"
      onClick={go}
      disabled={!actionable}
      data-result-origin={result.origin}
      data-result-id={result.id}
    >
      <div className="relative h-[78px] w-[52px] shrink-0 overflow-hidden rounded-o-md bg-surf-2 shadow-e1">
        {/*
          בגודל הזה אמנות מציין המקום נקראת כתמונה שבורה: היא כהה
          וחסרת פרטים, ובריבוע של 52 פיקסלים לא רואים בה כלום.
          אייקון על משטח אומר "אין כרזה" ברור יותר.
        */}
        {hasArt ? (
          <img src={art} alt="" loading="lazy" className="h-full w-full object-cover" onError={() => setFailed(true)} />
        ) : (
          <span className="grid h-full w-full place-items-center text-ink-3">
            <Icon name={result.origin === 'music' ? 'audio' : 'screen'} size={18} strokeWidth={1.4} />
          </span>
        )}
        {(result.playable || result.origin === 'catalog') && (
          <span className="absolute inset-0 grid place-items-center bg-canvas/55 opacity-0 backdrop-blur-[2px] transition-opacity group-hover:opacity-100">
            <Icon name={result.origin === 'catalog' ? 'info' : 'play'} size={16} fill={result.origin !== 'catalog'} className="text-arctic" />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <SourceMark result={result} />
          <span dir="auto" className="truncate text-[14.5px] font-medium">
            {result.title}
          </span>
          {result.rating > 0 && (
            <span className="flex shrink-0 items-center gap-0.5 text-[11.5px] text-ink tabular-nums">
              <Icon name="star" size={11} fill />
              {result.rating.toFixed(1)}
            </span>
          )}
        </div>
        <div dir="auto" className="truncate text-[12.5px] text-ink-3">
          {result.subtitle}
        </div>

        {result.watch && result.watch.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {result.watch.slice(0, 4).map((w) => (
              <Pill key={`${w.kind}:${w.provider}`} tone={w.kind === 'flatrate' ? 'mint' : 'neutral'}>
                {/*
                  הלוגו הרשמי מוגש מ-TMDB ומוצג כמו שהוא — בלי צביעה
                  ובלי עיוות. אלה סימנים מסחריים.
                */}
                {w.logo && <img src={w.logo} alt="" className="-ms-1 h-4 w-4 rounded-o-xs object-cover" />}
                {w.provider} · {KIND_LABEL[w.kind]}
              </Pill>
            ))}
          </div>
        )}
        {result.origin === 'catalog' && (!result.watch || result.watch.length === 0) && (
          <div className="mt-1.5 text-[11.5px] text-ink-3">{t('search.unavailable')}</div>
        )}
        {/* למה הלחיצה לא עשתה כלום — במקום כישלון שקט */}
        {note && <div className="mt-1.5 text-[11.5px] text-crimson">{note}</div>}
      </div>

      <span className="shrink-0 self-start rounded-full bg-ink/8 px-2.5 py-1 text-[11px] text-ink-2">
        {result.origin === 'catalog'
          ? t('details.more')
          : result.sourceLabel === 'Spotify'
          ? t('spotify.playOn')
          : result.playable
            ? t('library.play')
            : result.externalUrl
              ? t('search.open')
              : result.sourceLabel}
      </span>
    </motion.button>
  )
}

export function Search(): React.JSX.Element {
  const t = useT()
  const [query, setQuery] = useState('')
  const [groups, setGroups] = useState<SearchGroup[]>([])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ spotify: string | null; tmdb: boolean } | null>(null)
  const input = useRef<HTMLInputElement>(null)
  // כל הקלדה מבטלת את החיפוש הקודם — אחרת תשובה איטית דורסת חדשה
  const run = useRef(0)

  useEffect(() => {
    input.current?.focus()
    void window.cinema.search.status().then(setStatus)
  }, [])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setGroups([])
      setBusy(false)
      return
    }
    setBusy(true)
    const id = ++run.current
    // המתנה קצרה: אין טעם לשאול את הרשת על כל אות
    const timer = setTimeout(() => {
      void window.cinema.search
        .run(q)
        .then((res) => {
          if (id === run.current) setGroups(res)
        })
        .finally(() => {
          if (id === run.current) setBusy(false)
        })
    }, 350)
    return () => clearTimeout(timer)
  }, [query])

  const empty = query.trim().length >= 2 && !busy && groups.length === 0

  /*
   * מסך ריק אינו מסך פנוי.
   *
   * לפני שהמשתמש הקליד אות אחת אין מה להראות מהחיפוש, אבל יש מה
   * להראות: אותם כותרים שכבר נטענו למסך הבית. זה חוסך בקשת רשת,
   * ומחליף שדה ריח בשורה של אמנות.
   */
  const [suggested, setSuggested] = useState<HubCard[]>([])
  useEffect(() => {
    void window.cinema.hub.data().then((d) => {
      setSuggested(d.rows.find((r) => r.key === 'trending')?.cards.slice(0, 12) ?? [])
    })
  }, [])

  // הכותרת נגזרת מהמפתח ולא מהתווית שנשלחה, כדי שתהיה בשפת הממשק
  const groupLabel = (key: SearchGroup['key']): string =>
    key === 'library' ? t('search.inLibrary') : key === 'music' ? t('search.music') : t('search.streaming')

  const groupIcon = (key: SearchGroup['key']): 'library' | 'globe' | 'audio' =>
    key === 'library' ? 'library' : key === 'music' ? 'audio' : 'globe'

  return (
    /*
     * החיפוש הוא יעד ולא חלון צף.
     *
     * קודם הוא נפתח כלוח מעל מסך הבית, ולכן היה צריך רקע מטושטש
     * שיסביר מה מתחתיו וכפתור סגירה שיחזיר. עם סרגל צד קבוע הוא
     * פשוט מסך — נכנסים אליו ויוצאים ממנו כמו מכל מסך אחר.
     */
    <div className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center overflow-hidden bg-canvas/85 p-6 backdrop-blur-xl">
      <img
        src={searchBackdrop}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full scale-105 object-cover opacity-20 blur-xl"
      />
      <div className="pointer-events-none absolute inset-0 bg-canvas/60" />
      <motion.div
        initial={{ opacity: 0, y: -14, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="glass-regular relative z-10 flex h-full min-h-0 w-full max-w-[1080px] flex-col overflow-hidden rounded-o-2xl shadow-e4"
      >
        <h1 className="sr-only">{t('nav.search')}</h1>
        <header className="drag flex items-center gap-3 py-6 pr-32 pl-8 rtl:pr-8">
          <div className="no-drag glass-ultrathin flex flex-1 items-center gap-3 rounded-o-xl px-4 py-1">
            <Icon name="search" size={19} className="shrink-0 text-ink-3" />
            <input
              ref={input}
              className="h-12 flex-1 bg-transparent text-[17px] font-medium outline-none placeholder:font-normal placeholder:text-ink-3"
              placeholder={t('search.placeholder')}
              aria-label={t('search.placeholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {busy && (
              <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-ink/20 border-t-violet" />
            )}
            {query.length > 0 && (
              <IconButton icon="close" label={t('nav.close')} size={16} className="h-8 w-8" onClick={() => setQuery('')} />
            )}
          </div>
          
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-10">
          {query.trim().length < 2 && (
            <div className="flex flex-col gap-8">
              <div className="max-w-xl">
                <h2 className="font-display mb-2 text-[21px] font-bold">{t('search.title')}</h2>
                <p className="text-[14px] leading-relaxed text-ink-2">{t('search.subtitle')}</p>
                {status && !status.tmdb && <p className="mt-4 text-[13px] text-crimson">{t('search.noKey')}</p>}
              </div>

              {suggested.length > 0 && (
                <section>
                  <h3 className="mb-4 text-[11.5px] font-semibold tracking-[0.07em] text-ink-3 uppercase">
                    {t('hub.trending')}
                  </h3>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(172px,1fr))] gap-x-5 gap-y-8">
                    {suggested.map((c, i) => (
                      <TitleCard key={c.id} card={c} index={i} />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {empty && (
            <p className="my-14 text-center text-[14px] text-ink-2">
              {t('library.noResults')} — &quot;{query}&quot;
            </p>
          )}

          <div className="flex flex-col gap-6">
            {groups.map((group) => (
              <section key={group.key}>
                <h2 className="mb-2 flex items-center gap-2 px-2.5 text-[11.5px] font-semibold tracking-[0.07em] text-ink-3 uppercase">
                  <Icon name={groupIcon(group.key)} size={13} />
                  {groupLabel(group.key)}
                  <span className="rounded-full bg-ink/8 px-2 py-0.5 tabular-nums normal-case">
                    {group.results.length}
                  </span>
                </h2>
                <div className="flex flex-col">
                  {group.results.map((r, i) => (
                    <Row key={r.id} result={r} index={i} />
                  ))}
                </div>
              </section>
            ))}
          </div>

          {status?.spotify && !groups.some((g) => g.key === 'music') && query.trim().length >= 2 && (
            <p className="mt-6 px-2.5 text-[12px] text-ink-3">Spotify · {status.spotify}</p>
          )}

          {/*
            הזמינות מוצגת כאן, ולכן הייחוס חייב להופיע כאן.
            תנאי השימוש של TMDB מחייבים לזקוף את נתוני הזמינות
            ל-JustWatch בכל מקום שבו הם מוגשים למשתמש.
          */}
          {groups.some((g) => g.key === 'streaming') && (
            <p className="mt-6 px-2.5 text-[11.5px] leading-relaxed text-ink-3">{t('legal.attribution')}</p>
          )}
        </div>
      </motion.div>
    </div>
  )
}
