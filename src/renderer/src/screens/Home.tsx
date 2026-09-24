import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { HubCard, HubData, HubRowKey, HeroSlide } from '@shared/api'
import { useDir, useT } from '../i18n'
import { useUi } from '../store/ui'
import { BrandTag, Button, Icon, IconButton, Wordmark } from '../components/ui'
import { activate } from '../lib/activate'
import { TrailerPlayer } from '../components/TrailerPlayer'
import { TitleCard, CardSkeleton } from '../components/TitleCard'
import hero from '../assets/hero-v2.png'

/**
 * מסך הבית.
 *
 * המבנה הוא של אפליקציית סטרימינג ולא של סייר קבצים: באנר אחד גדול
 * שנושא כותר, ומתחתיו שורות אופקיות. הסיבה אינה חיקוי — היא שכרזה
 * גדולה עונה על "מה לראות עכשיו" בלי שהמשתמש יקרא מילה, ורשימת
 * קבצים לא עונה על זה בכלל.
 *
 * מידות המיקוד נלקחו מהתנהגות tvOS: הגדלה של כ-6% ב-180ms, ובלי
 * להזיז את השכנים.
 */

const ROW_ORDER: HubRowKey[] = ['continue', 'watchlist', 'trending', 'topRated', 'popularTv', 'recent', 'music']
const ROW_LABEL: Record<
  HubRowKey,
  'hub.continue' | 'hub.watchlist' | 'hub.trending' | 'hub.topRated' | 'hub.popularTv' | 'hub.recent' | 'hub.music'
> = {
  continue: 'hub.continue',
  watchlist: 'hub.watchlist',
  trending: 'hub.trending',
  topRated: 'hub.topRated',
  popularTv: 'hub.popularTv',
  recent: 'hub.recent',
  music: 'hub.music'
}

/**
 * שורה אופקית.
 *
 * החיצים מופיעים רק כשיש לאן לגלול ורק במעבר עכבר, כדי שהשורה
 * במנוחה תהיה תוכן בלבד.
 */
function Row({ label, cards }: { label: string; cards: HubCard[] }): React.JSX.Element {
  const t = useT()
  const strip = useRef<HTMLDivElement>(null)
  const [edge, setEdge] = useState({ start: false, end: true })

  const measure = (): void => {
    const el = strip.current
    if (!el) return
    // ‏RTL: scrollLeft שלילי בדפדפנים מודרניים, ולכן נמדד בערך מוחלט
    const x = Math.abs(el.scrollLeft)
    setEdge({ start: x > 8, end: x + el.clientWidth < el.scrollWidth - 8 })
  }

  useEffect(measure, [cards])

  const nudge = (dir: 1 | -1): void => {
    const el = strip.current
    if (!el) return
    const rtl = getComputedStyle(el).direction === 'rtl'
    el.scrollBy({ left: dir * (rtl ? -1 : 1) * (el.clientWidth * 0.82), behavior: 'smooth' })
  }

  return (
    <section className="group/row relative">
      <h2 className="font-display mb-3 px-10 text-[16px] font-bold">{label}</h2>

      <div
        ref={strip}
        onScroll={measure}
        /*
         * scroll-ps-10 חייב להתאים ל-px-10, אחרת הדפדפן מצמיד את
         * הכרטיס הראשון לקצה ובולע את הריפוד.
         *
         * pt-2/pb-8 נותנים מקום להרמה במעבר עכבר; בלעדיהם הכרטיס
         * המוגדל נחתך על ידי הגלילה עצמה.
         */
        className="flex snap-x scroll-ps-10 gap-4 overflow-x-auto px-10 pt-2 pb-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {cards.map((c, i) => (
          <TitleCard key={c.id} card={c} index={i} />
        ))}
      </div>

      {edge.start && (
        <IconButton
          icon="chevron"
          label={t('hub.scrollLeft')}
          size={20}
          onClick={() => nudge(-1)}
          className="glass-thin absolute start-1.5 top-[40%] h-11 w-11 rotate-180 opacity-0 transition-opacity group-hover/row:opacity-100 rtl:rotate-0"
        />
      )}
      {edge.end && (
        <IconButton
          icon="chevron"
          label={t('hub.scrollRight')}
          size={20}
          onClick={() => nudge(1)}
          className="glass-thin absolute end-1.5 top-[40%] h-11 w-11 opacity-0 transition-opacity group-hover/row:opacity-100 rtl:rotate-180"
        />
      )}
    </section>
  )
}

function Hero({
  slides,
  onArt,
  onDetails
}: {
  slides: HeroSlide[]
  onArt: (src: string | null) => void
  onDetails: (id: string) => void
}): React.JSX.Element {
  const t = useT()
  const dir = useDir()
  const [index, setIndex] = useState(0)
  const [hold, setHold] = useState(false)
  const [listed, setListed] = useState(false)
  const [showTrailer, setShowTrailer] = useState(false)

  useEffect(() => {
    if (slides.length < 2 || hold || showTrailer) return
    const timer = setInterval(() => setIndex((i) => (i + 1) % slides.length), 9000)
    return () => clearInterval(timer)
  }, [slides.length, hold, showTrailer])

  const slide = slides[index]
  const backdrop = slide?.backdrop ?? null
  const slideId = slide?.id

  // הזוהר מתחת לשורות נצבע לפי הכותר שבבאנר — ולפי שום דבר אחר
  useEffect(() => {
    onArt(backdrop)
  }, [backdrop, onArt])

  useEffect(() => {
    if (slideId) void window.cinema.hub.inWatchlist(slideId).then(setListed)
  }, [slideId])

  if (!slide) return <></>

  const go = (): void => {
    void activate(slide).then((r) => {
      if (!r.ok && r.reason === 'needs-details') onDetails(slide.id)
    })
  }

  const toggle = (): void => {
    void window.cinema.hub
      .toggleWatchlist({
        id: slide.id,
        title: slide.title,
        poster: slide.backdrop,
        year: slide.year,
        rating: slide.rating,
        itemId: slide.itemId,
        externalUrl: slide.externalUrl,
        brand: slide.brand
      })
      .then(setListed)
  }

  return (
    <div
      className="relative h-[clamp(420px,68vh,680px)] w-full overflow-hidden"
      onPointerEnter={() => setHold(true)}
      onPointerLeave={() => setHold(false)}
    >
      <AnimatePresence mode="popLayout">
        <motion.img
          key={slide.id}
          src={slide.backdrop ?? hero}
          alt=""
          initial={{ opacity: 0, scale: 1.06 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0 h-full w-full object-cover object-top"
          /*
           * התמונה עצמה נמוגה, ולא מכוסה בצבע אטום.
           *
           * קודם הבאנר הסתיים בקרקע אטומה (#08090c), ומתחתיו ישב זוהר
           * האווירה בצבע הכרזה. שני משטחים בצבע שונה נפגשו בקו ישר —
           * התפר שנראה מתחת לכל באנר. כשהתמונה נמוגה לשקיפות, מה שמתחת
           * לבאנר ממשיך דרכו בלי קצה.
           */
          style={{
            maskImage: 'linear-gradient(to bottom, black 58%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 58%, transparent 100%)'
          }}
        />
      </AnimatePresence>

      {/*
        הצללה לקריאות הטקסט, שגם היא מגיעה לשקיפות בקצה התחתון —
        אחרת היא עצמה הייתה הקו.
      */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to top, transparent 0%, rgb(8 9 12 / 0.72) 16%, rgb(8 9 12 / 0.5) 38%, rgb(8 9 12 / 0.12) 62%, transparent 80%)'
        }}
      />
      {/*
        הצללה אופקית לצד שבו יושב הטקסט.
        אין ב-Tailwind כיוון לוגי לשיפועים, ולכן הכיוון מחושב כאן.
      */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to ${dir === 'rtl' ? 'left' : 'right'}, rgb(8 9 12 / 0.94) 0%, rgb(8 9 12 / 0.52) 44%, transparent 80%)`,
          /*
           * גם ההצללה הצדדית נמוגה בתחתית. היא רצה לכל גובה הבאנר
           * ונעצרה בקצה, ולכן נשארה מדרגה של 4 רמות בהירות בדיוק שם —
           * נמדד על שורות הפיקסלים. עין מבחינה בקו חד גם כשההפרש קטן.
           */
          maskImage: 'linear-gradient(to bottom, black 82%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black 82%, transparent 100%)'
        }}
      />

      <div className="absolute inset-x-0 bottom-0 px-10 pb-9">
        <motion.div
          key={`${slide.id}-body`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-2xl"
        >
          {slide.logo ? (
            <img
              src={slide.logo}
              alt={slide.title}
              className="mb-4 max-h-28 w-auto max-w-[min(460px,62%)] object-contain drop-shadow-[0_8px_28px_rgba(0,0,0,0.75)]"
            />
          ) : (
            <h2
              dir="auto"
              className="font-display mb-4 text-[clamp(32px,5vw,56px)] leading-[1.02] font-extrabold"
            >
              {slide.title}
            </h2>
          )}

          <div className="mb-3 flex flex-wrap items-center gap-2.5 text-[12.5px] text-ink/70">
            {slide.rating > 0 && (
              <span className="flex items-center gap-1 font-semibold text-ink tabular-nums">
                <Icon name="star" size={12} fill />
                {slide.rating.toFixed(1)}
              </span>
            )}
            {slide.year && <span className="tabular-nums">{slide.year}</span>}
            {slide.genres.map((g) => (
              <span key={g} className="rounded-full bg-ink/10 px-2.5 py-0.5">
                {g}
              </span>
            ))}
            {slide.playable ? (
              <span className="font-medium text-mint">{t('hub.inLibrary')}</span>
            ) : (
              slide.brand && (
                <span className={`flex items-center gap-1.5 ${slide.subscribed ? 'font-semibold text-mint' : ''}`}>
                  <BrandTag brand={slide.brand} />
                  {slide.subscribed ? t('subs.included') : t('hub.onService', { name: slide.brand.name })}
                </span>
              )
            )}
          </div>

          <p dir="auto" className="mb-6 line-clamp-3 max-w-xl text-[14px] leading-relaxed text-ink/75">
            {slide.overview}
          </p>

          {/*
            הפעולה הראשית היא תמיד משהו שאפשר לעשות.

            קודם הכפתור הלבן היה "פתח" גם כשלא היה מה לפתוח — כותר חדש
            שאינו בספרייה ואינו בשום שירות — ולכן הוא הוצג מושבת, אפור,
            בשקיפות 40%. הכפתור הבולט ביותר במסך הראשון היה מת. עכשיו
            הראשי יורד בסולם עד שהוא מוצא פעולה אמיתית: נגינה, פתיחה
            בשירות, טריילר, ובסוף פרטים. הוא לעולם אינו מושבת.

            רשימה ופרטים הם כפתורי אייקון עגולים. ארבעה כפתורי טקסט לא
            נכנסו בשורה אחת בצרפתית, והרביעי ירד לשורה משלו.
          */}
          <div className="flex items-center gap-3">
            {(() => {
              const canOpen = slide.playable || Boolean(slide.externalUrl)
              if (canOpen) {
                return (
                  <Button variant="primary" size="lg" onClick={go}>
                    <Icon name="play" size={17} fill />
                    {slide.playable ? t('hub.play') : slide.subscribed ? t('subs.included') : t('search.open')}
                  </Button>
                )
              }
              if (slide.trailerKey) {
                return (
                  <Button variant="primary" size="lg" onClick={() => setShowTrailer(true)}>
                    <Icon name="play" size={17} fill />
                    {t('details.trailer')}
                  </Button>
                )
              }
              return (
                <Button variant="primary" size="lg" onClick={() => onDetails(slide.id)}>
                  <Icon name="info" size={17} />
                  {t('details.more')}
                </Button>
              )
            })()}
            {slide.trailerKey && (slide.playable || Boolean(slide.externalUrl)) && (
              <Button variant="glass" size="lg" onClick={() => setShowTrailer(true)}>
                <Icon name="play" size={17} fill />
                {t('details.trailer')}
              </Button>
            )}
            <IconButton
              icon={listed ? 'check' : 'plus'}
              label={t('hub.watchlist')}
              size={19}
              active={listed}
              onClick={toggle}
              className="glass-ultrathin h-12 w-12"
            />
            {(slide.playable || Boolean(slide.externalUrl) || Boolean(slide.trailerKey)) && (
              <IconButton
                icon="info"
                label={t('details.more')}
                size={19}
                onClick={() => onDetails(slide.id)}
                className="glass-ultrathin h-12 w-12"
              />
            )}
          </div>
        </motion.div>

        {slides.length > 1 && (
          <div className="mt-3 flex gap-0.5">
            {slides.map((s, i) => (
              /*
                אזור הלחיצה גבוה מהפס עצמו. הפס בגובה 3 פיקסלים, וכפתור
                בגודל הזה — 16×3 — היה כמעט בלתי אפשרי לפגוע בו.
              */
              <button
                key={s.id}
                onClick={() => setIndex(i)}
                aria-label={s.title}
                aria-current={i === index ? 'true' : undefined}
                className={`group/dot grid h-6 place-items-center ${i === index ? 'w-8' : 'w-6'}`}
              >
                <span
                  className={`h-[3px] rounded-full transition-colors duration-normal ${
                    i === index ? 'w-8 bg-violet-bright' : 'w-4 bg-ink/25 group-hover/dot:bg-ink/50'
                  }`}
                />
              </button>
            ))}
          </div>
        )}
      </div>
      {showTrailer && slide.trailerKey && (
        <TrailerPlayer trailerKey={slide.trailerKey} trailerLang={slide.trailerLang} title={slide.title} onClose={() => setShowTrailer(false)} />
      )}
    </div>
  )
}

/** שלד כרטיס — אותן מידות בדיוק, כדי שהמעבר לתוכן לא יקפיץ כלום */
function RowSkeleton(): React.JSX.Element {
  return (
    <section>
      <div className="skeleton mx-10 mb-3 h-4 w-40 rounded-o-xs" />
      <div className="flex gap-4 px-10 pt-2 pb-8">
        {Array.from({ length: 7 }, (_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </section>
  )
}

/**
 * שלד הבאנר.
 *
 * אותו גובה בדיוק כמו הבאנר האמיתי. שלד נמוך יותר היה גורם לכל
 * המסך לקפוץ ברגע שהנתונים מגיעים — וזו בדיוק ההפרעה שהשלד אמור
 * למנוע.
 */
function HeroSkeleton(): React.JSX.Element {
  return (
    <div className="relative h-[clamp(420px,68vh,680px)] w-full overflow-hidden">
      <div className="skeleton absolute inset-0" />
      <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/40 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-4 px-10 pb-9">
        <div className="skeleton h-12 w-[min(460px,58%)] rounded-o-md" />
        <div className="skeleton h-3 w-40 rounded-o-xs" />
        <div className="flex flex-col gap-2">
          <div className="skeleton h-3 w-[min(560px,70%)] rounded-o-xs" />
          <div className="skeleton h-3 w-[min(480px,58%)] rounded-o-xs" />
        </div>
        <div className="mt-2 flex gap-3">
          <div className="skeleton h-12 w-36 rounded-o-lg" />
          <div className="skeleton h-12 w-36 rounded-o-lg" />
        </div>
      </div>
    </div>
  )
}

export function Home(): React.JSX.Element {
  const t = useT()
  const onDetails = useUi((s) => s.openDetails)
  const go = useUi((s) => s.go)
  const [data, setData] = useState<HubData>({ hero: [], rows: [], loading: true })
  const [glow, setGlow] = useState<string | null>(null)

  useEffect(() => {
    void window.cinema.hub.data().then(setData)
    return window.cinema.hub.onData(setData)
  }, [])

  const onArt = useCallback((src: string | null) => setGlow(src), [])

  const rows = ROW_ORDER.map((key) => data.rows.find((r) => r.key === key)).filter(
    (r): r is NonNullable<typeof r> => Boolean(r)
  )
  const bare = rows.length === 0 && data.hero.length === 0

  return (
    <div className="pointer-events-auto absolute inset-0 isolate flex flex-col overflow-hidden bg-canvas">
      {/*
        תאורת אווירה: עותק מטושטש של כרזת הבאנר, מתחת לכל התוכן.
        הצבע מגיע מהאמנות בלבד — אין גוון נפילה, ובלי אמנות אין זוהר.
      */}
      {glow && (
        <img
          src={glow}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[110vh] w-full scale-125 object-cover opacity-25 blur-[90px] saturate-150 transition-opacity duration-1000"
          /*
           * הזוהר נמוג בתחתיתו ואינו נחתך.
           * קודם הוא היה בגובה 75vh והבאנר 68vh, ולכן רק פס דק שלו הציץ
           * מתחת לבאנר — פס חום עם קו עליון חד, שנראה כמו תפר.
           */
          style={{
            maskImage: 'linear-gradient(to bottom, black 45%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 45%, transparent 100%)'
          }}
        />
      )}

      <div className="flex-1 overflow-y-auto">
        {/* שם המסך לקורא מסך: כותר הבאנר מתחלף כל תשע שניות ואינו שם של מקום */}
        <h1 className="sr-only">{t('hub.home')}</h1>
        {data.loading && data.hero.length === 0 ? (
          <HeroSkeleton />
        ) : data.hero.length > 0 ? (
          <Hero slides={data.hero} onArt={onArt} onDetails={onDetails} />
        ) : (
          <div className="relative h-[clamp(260px,38vh,380px)] w-full overflow-hidden">
            <img src={hero} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/45 to-canvas/25" />
            <div className="absolute inset-x-0 bottom-0 px-10 pb-9">
              <Wordmark size={36} />
              <p className="mt-2.5 max-w-md text-[14px] text-ink-2">
                {data.loading ? t('hub.loading') : t('welcome.subtitle')}
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-6 pt-8 pb-14">
          {rows.map((row) => (
            <Row key={row.key} label={t(ROW_LABEL[row.key])} cards={row.cards} />
          ))}

          {/* שורות שעוד בדרך — צורת התוכן ולא הודעת המתנה */}
          {data.loading && rows.every((r) => r.cards.length === 0) && (
            <>
              <RowSkeleton />
              <RowSkeleton />
            </>
          )}

          {bare && !data.loading && (
            <div className="mx-auto mt-12 flex max-w-md flex-col items-center gap-5 text-center">
              <p className="text-[14.5px] text-ink-2">{t('hub.empty')}</p>
              <Button variant="primary" size="lg" onClick={() => go('library')}>
                <Icon name="folder" size={16} />
                {t('library.addLocal')}
              </Button>
            </div>
          )}
        </div>

        {/*
          ייחוס נתוני הזמינות.
          תנאי השימוש של TMDB מחייבים לזקוף אותם ל-JustWatch בכל מקום
          שבו הם מוצגים, ולציין שהתוכנה אינה מאושרת על ידי TMDB.
        */}
        <p className="px-10 pb-8 text-[11.5px] text-ink-3">{t('legal.attribution')}</p>
      </div>
    </div>
  )
}
