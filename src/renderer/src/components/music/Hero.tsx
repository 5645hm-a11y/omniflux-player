import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { YouTubeTrack } from '@shared/api'
import { useT } from '../../i18n'
import { queueKey, useQueue } from '../../store/queue'
import { Button, Icon } from '../ui'
import { MusicProviderBadge } from '../MusicProviderBadge'
import { youTubeItem } from '../MusicShelves'

export interface Release {
  id: string
  title: string
  artist: string
  cover: string | null
  releaseDate: string | null
}

type Slide =
  | { kind: 'trending'; track: YouTubeTrack; index: number }
  | { kind: 'release'; release: Release }

/**
 * הבאנר הראשי: מה שמתנגן עכשיו בעולם, ומה שיצא השבוע.
 *
 * שקופיות מתחלפות — פופולרי מ-YouTube (מתנגן מלא, בלחיצה) ואלבומים חדשים
 * מ-Deezer (לחיצה מחפשת אותם בכל המקורות, כי ל-Deezer בלי מנוי יש רק
 * קטעים). התחלופה נעצרת בריחוף ובפוקוס — מי שקורא לא מאבד את השקופית
 * באמצע — ואינה רצה בכלל כשהמערכת מבקשת פחות תנועה.
 */
export function Hero({
  trending,
  releases,
  onExplore
}: {
  trending: YouTubeTrack[]
  releases: Release[]
  onExplore: (query: string) => void
}): React.JSX.Element | null {
  const t = useT()
  const reduced = useReducedMotion()
  const [index, setIndex] = useState(0)
  const [hold, setHold] = useState(false)

  const slides = useMemo<Slide[]>(() => {
    const top = trending.slice(0, 4).map((track, i) => ({ kind: 'trending' as const, track, index: i }))
    const fresh = releases.slice(0, 4).map((release) => ({ kind: 'release' as const, release }))
    // לסירוגין: פופולרי, חדש, פופולרי, חדש — כדי ששני הסוגים ייראו מהר
    const out: Slide[] = []
    for (let i = 0; i < Math.max(top.length, fresh.length); i++) {
      if (top[i]) out.push(top[i])
      if (fresh[i]) out.push(fresh[i])
    }
    return out
  }, [trending, releases])

  useEffect(() => {
    if (reduced || hold || slides.length < 2) return
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % slides.length), 8000)
    return () => window.clearInterval(timer)
  }, [reduced, hold, slides.length])

  if (slides.length === 0) return null
  const slide = slides[index % slides.length]
  const image = slide.kind === 'trending' ? slide.track.thumbnail : slide.release.cover
  const title = slide.kind === 'trending' ? slide.track.title : slide.release.title
  const artist = slide.kind === 'trending' ? slide.track.artist : slide.release.artist

  const play = (): void => {
    if (slide.kind !== 'trending') return
    // השיר מהבאנר, והפופולריים שאחריו ממשיכים בתור
    useQueue.getState().playList(trending.slice(slide.index).map((track) => ({ ...youTubeItem(track), key: queueKey() })), 0)
  }

  return (
    <section
      className="relative h-[clamp(240px,32vh,340px)] overflow-hidden rounded-o-2xl bg-surf-1"
      onPointerEnter={() => setHold(true)}
      onPointerLeave={() => setHold(false)}
      onFocus={() => setHold(true)}
      onBlur={() => setHold(false)}
      aria-roledescription="carousel"
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.div
          key={slide.kind === 'trending' ? slide.track.videoId : slide.release.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-0"
        >
          {/* הרקע: העטיפה עצמה, מטושטשת ומוגדלת — הצבע של השקופית בא ממנה */}
          {image && <img src={image} alt="" className="absolute inset-0 h-full w-full scale-125 object-cover opacity-55 blur-3xl saturate-150" />}
          <div className="absolute inset-0 bg-gradient-to-r from-canvas via-canvas/70 to-canvas/20 rtl:bg-gradient-to-l" />
          <div className="grain-layer pointer-events-none absolute inset-0" />

          <div className="relative flex h-full items-center gap-8 px-10">
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <span className="inline-flex w-fit items-center gap-2 rounded-full bg-ink/10 px-3 py-1 text-[11.5px] font-semibold tracking-[0.06em] text-ink-2 uppercase backdrop-blur-md">
                <Icon name="sparkles" size={13} />
                {slide.kind === 'trending' ? t('music.heroTrending') : t('music.heroNew')}
              </span>
              <h1 dir="auto" className="font-display line-clamp-2 text-[clamp(28px,3.2vw,44px)] leading-[1.05] font-extrabold tracking-tight">
                {title}
              </h1>
              <p dir="auto" className="truncate text-[15px] text-ink-2">{artist}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2.5">
                {slide.kind === 'trending' ? (
                  <>
                    <Button variant="primary" onClick={play}><Icon name="play" size={14} fill />{t('player.play')}</Button>
                    <Button variant="outline" onClick={() => useQueue.getState().enqueue([{ ...youTubeItem(slide.track), key: queueKey() }])}>
                      <Icon name="plus" size={14} />{t('music.addQueue')}
                    </Button>
                    <MusicProviderBadge provider="YouTube" />
                  </>
                ) : (
                  <Button variant="primary" onClick={() => onExplore(`${slide.release.artist} ${slide.release.title}`)}>
                    <Icon name="search" size={14} />{t('music.heroExplore')}
                  </Button>
                )}
              </div>
            </div>
            {image && (
              <img
                src={image}
                alt=""
                className={`hidden shrink-0 rounded-o-xl object-cover shadow-e4 md:block ${
                  slide.kind === 'trending' ? 'aspect-video h-[62%]' : 'aspect-square h-[70%]'
                }`}
              />
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {slides.length > 1 && (
        <div className="absolute inset-x-0 bottom-4 flex justify-center gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              aria-label={`${i + 1} / ${slides.length}`}
              aria-current={i === index % slides.length}
              className={`h-1.5 rounded-full transition-all duration-normal ${
                i === index % slides.length ? 'w-6 bg-ink' : 'w-1.5 bg-ink/35 hover:bg-ink/60'
              }`}
            />
          ))}
        </div>
      )}
    </section>
  )
}
