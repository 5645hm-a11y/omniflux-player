import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Lyrics } from '@shared/api'
import { usePlayer } from '../store/player'
import { useT } from '../i18n'
import { Icon } from '../components/ui'
import { YouTubeSlot } from '../components/YouTubeDock'
import { paletteFromBlob } from '../lib/palette'
import { parseTrackTitle } from '@shared/track'

/**
 * מסך המוזיקה.
 *
 * כשמנגנים אודיו אין מה להראות בחלון הווידאו, ולכן העטיפה הופכת
 * לתוכן: גדולה, במרכז, עם הילה שנגזרת מצבעיה שלה ומשום דבר אחר.
 *
 * המילים מוצגות רק כשהן מסונכרנות ומוכרות. שורה שמופיעה בזמן הלא
 * נכון גרועה יותר מהיעדר מילים, כי היא גורמת למשתמש לחפש בעיניים
 * במקום להקשיב.
 */

/** מוצא את השורה הפעילה — האחרונה שכבר התחילה */
function activeLine(lines: Lyrics['lines'], seconds: number): number {
  let lo = 0
  let hi = lines.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].at <= seconds) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return found
}

const WAVEFORM = [24, 46, 68, 38, 82, 55, 92, 44, 72, 31, 64, 88, 52, 76, 36, 96, 61, 42, 79, 57, 87, 34, 70, 49]

function Waveform({ active }: { active: boolean }): React.JSX.Element {
  return (
    <div className="mt-5 flex h-9 w-full items-center gap-[3px]" aria-hidden="true">
      {WAVEFORM.map((height, index) => (
        <span
          key={index}
          className={`music-wave-bar flex-1 ${active ? 'music-wave-bar-on' : ''}`}
          style={
            {
              '--wave-height': `${height}%`,
              '--wave-duration': `${700 + (index % 7) * 110}ms`,
              '--wave-delay': `${(index % 5) * -120}ms`
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}

export function NowPlaying({ cover }: { cover: string | null }): React.JSX.Element {
  const t = useT()
  const title = usePlayer((s) => s.engine.title)
  const metadataArtist = usePlayer((s) => s.engine.artist)
  const path = usePlayer((s) => s.engine.path)
  const position = usePlayer((s) => s.engine.position)
  const duration = usePlayer((s) => s.engine.duration)
  const paused = usePlayer((s) => s.engine.paused)
  const provider = usePlayer((s) => s.engine.provider)

  const [lyrics, setLyrics] = useState<Lyrics | null>(null)
  const [halo, setHalo] = useState<{ a: string; b: string } | null>(null)
  const scroller = useRef<HTMLDivElement>(null)

  // אותה פרשנות שמשמשת לחיפוש המילים, כדי שהמוצג והמחופש יהיו זהים
  const { artist, track } = useMemo(() => {
    const parsed = parseTrackTitle(title ?? path?.split(/[\\/]/).pop() ?? '')
    return metadataArtist ? { artist: metadataArtist, track: title ?? parsed.track } : parsed
  }, [title, path, metadataArtist])

  useEffect(() => {
    setLyrics(null)
    if (!path) return
    let alive = true
    const request = provider === 'Spotify'
      ? window.cinema.player.lyricsFor(artist, track, duration)
      : window.cinema.player.lyrics()
    void request.then((l) => {
      if (alive) setLyrics(l)
    })
    return () => {
      alive = false
    }
  }, [path, provider, artist, track, duration])

  /*
   * ההילה נדגמת מהעטיפה עצמה.
   *
   * זה אותו כלל שחל על תאורת האווירה בווידאו: הצבע מגיע מהתוכן
   * ולא מלוח קבוע. בלי עטיפה אין הילה, ולא צבע ברירת מחדל.
   */
  useEffect(() => {
    setHalo(null)
    if (!cover) return
    let alive = true
    void fetch(cover)
      .then((r) => r.blob())
      .then(paletteFromBlob)
      .then((p) => {
        if (alive) setHalo({ a: p.primary, b: p.secondary })
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [cover])

  const index = lyrics?.synced ? activeLine(lyrics.lines, position) : -1

  // השורה הפעילה נשארת במרכז, והשאר נעות סביבה
  useEffect(() => {
    if (index < 0 || !scroller.current) return
    const el = scroller.current.querySelector(`[data-line="${index}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [index])

  return (
    <div className="pointer-events-auto absolute inset-0 isolate overflow-hidden bg-canvas">
      {cover && (
        <img
          src={cover}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-[-12%] -z-20 h-[124%] w-[124%] scale-110 object-cover opacity-[0.13] blur-[110px] saturate-[1.8]"
        />
      )}
      {halo && (
        <div
          className="pointer-events-none absolute inset-0 -z-10 transition-[background] duration-[1200ms]"
          style={{
            background: `radial-gradient(60% 55% at 30% 35%, ${halo.a} 0%, transparent 62%),
                         radial-gradient(55% 50% at 74% 68%, ${halo.b} 0%, transparent 60%)`,
            filter: 'blur(80px) saturate(1.5)',
            opacity: 0.45
          }}
        />
      )}
      <div className="grain-layer pointer-events-none absolute inset-0" />

      <div className="relative grid h-full grid-cols-1 items-center gap-12 px-12 pt-16 pb-36 lg:grid-cols-[minmax(0,460px)_1fr]">
        {/* העטיפה */}
        <div className="flex flex-col items-center gap-6 justify-self-center lg:items-start lg:justify-self-end">
          {/*
            ‏YouTube: הנגן הגלוי מתיישב כאן במקום העטיפה, ברוחב של 16:9.
            ה-iframe עצמו חי ב-YouTubeDock ורק זז לכאן — אינו נבנה מחדש.
          */}
          {provider === 'YouTube' ? (
            <YouTubeSlot className="aspect-video w-[min(60vw,640px)] rounded-o-2xl" />
          ) : (
          <motion.div
            animate={{ scale: paused ? 0.97 : 1 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="relative aspect-square w-[min(54vw,420px)] overflow-hidden rounded-o-2xl border border-white/10 bg-surf-1 shadow-e4"
          >
            {cover ? (
              <img src={cover} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full w-full place-items-center text-ink-3">
                <Icon name="audio" size={64} strokeWidth={1.2} />
              </div>
            )}
          </motion.div>
          )}

          <div className="min-w-0 text-center lg:text-start">
            <h1 dir="auto" className="font-display truncate text-[26px] leading-tight font-extrabold">
              {track || t('hub.music')}
            </h1>
            {artist && (
              <p dir="auto" className="mt-1 truncate text-[15px] text-ink-2">
                {artist}
              </p>
            )}
            <Waveform active={!paused} />
          </div>
        </div>

        {/* המילים */}
        <div className="glass-ultrathin relative hidden h-[min(72vh,680px)] min-h-0 overflow-hidden rounded-o-2xl p-6 lg:grid lg:place-items-center">
          {lyrics && lyrics.lines.length > 0 ? (
            <div
              ref={scroller}
              className="h-full w-full overflow-y-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {/* ריפוד עליון ותחתון, כדי שהשורה הראשונה והאחרונה יגיעו למרכז */}
              <div className="h-[38vh]" />
              {lyrics.lines.map((line, i) => (
                <p
                  key={`${line.at}-${i}`}
                  data-line={i}
                  dir="auto"
                  className={`font-display mx-auto w-full max-w-2xl origin-center py-3 text-center leading-snug transition duration-normal ${
                    !lyrics.synced
                      ? 'text-[24px] font-bold text-[#A9AFBA]'
                      : i === index
                        ? 'scale-[1.035] text-[28px] font-extrabold text-[#FFFFFF] drop-shadow-[0_6px_22px_rgba(0,0,0,0.55)] blur-0'
                        : 'text-[23px] font-bold text-[#6E7480] opacity-60 blur-[0.55px]'
                  }`}
                >
                  {line.text || '·'}
                </p>
              ))}
              <div className="h-[38vh]" />
            </div>
          ) : (
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid h-full place-items-center"
              >
                <p className="text-[14px] text-ink-3">{t('player.noLyrics')}</p>
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* התקדמות דקה בתחתית — הבקרות עצמן צפות מעל */}
      {duration > 0 && (
        <div className="absolute inset-x-0 bottom-0 h-[2px] bg-ink/10">
          <div
            className="h-full w-full origin-left bg-violet-bright transition-transform duration-500 ease-linear"
            style={{ transform: `scaleX(${Math.min(1, position / duration)})` }}
          />
        </div>
      )}
    </div>
  )
}
