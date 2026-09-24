import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { usePlayer } from '../store/player'
import { useQueue } from '../store/queue'
import { inAd, useYouTube } from '../store/youtube'
import { useUi } from '../store/ui'
import { useT } from '../i18n'
import { Icon, IconButton } from './ui'
import { MusicProviderBadge } from './MusicProviderBadge'
import { PlayGlyph, Equalizer } from './Motion'
import { clock } from './Controls'
import { useLastFrame } from '../hooks/useLastFrame'

/**
 * סרגל הנגן הקבוע.
 *
 * הוא הסיבה שאפשר לשוטט בלי לעצור את מה שמתנגן. עד עכשיו כל מסך
 * שנפתח כיסה את הנגן, ולכן "לחפש משהו אחר" פירושו היה לצאת ממה
 * שאתה שומע.
 *
 * שלוש עמודות, כמו בכל נגן שאנשים כבר יודעים לקרוא: מה מתנגן
 * מימין או משמאל לפי כיוון השפה, השליטה במרכז, והפקדים המשניים
 * בקצה השני.
 *
 * המרובע בקצה אינו תמונה של הווידאו — הוא חור. חלון המנוע מוזז אל
 * מאחוריו, ולכן מה שרואים שם הוא הווידאו החי עצמו.
 */

/** סרגל זמן דק. בלי תצוגה מקדימה — זו שמורה למסך הצפייה. */
function MiniScrubber(): React.JSX.Element {
  const t = useT()
  const duration = usePlayer((s) => s.engine.duration)
  const position = usePlayer((s) => s.engine.position)
  const scrubbing = usePlayer((s) => s.scrubbing)
  const setScrubbing = usePlayer((s) => s.setScrubbing)
  const seekTo = usePlayer((s) => s.seekTo)
  const seekRelative = usePlayer((s) => s.seekRelative)
  const bar = useRef<HTMLDivElement>(null)

  const shown = scrubbing ?? position
  const pct = duration > 0 ? Math.min(100, (shown / duration) * 100) : 0

  const at = (clientX: number): number => {
    const el = bar.current
    if (!el || duration <= 0) return 0
    const r = el.getBoundingClientRect()
    return Math.max(0, Math.min(duration, ((clientX - r.left) / r.width) * duration))
  }

  useEffect(() => {
    if (scrubbing === null) return
    const move = (e: PointerEvent): void => setScrubbing(at(e.clientX))
    const up = (e: PointerEvent): void => {
      const target = at(e.clientX)
      seekTo(target)
      setScrubbing(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrubbing, duration, seekTo])

  return (
    // הזמן מתקדם משמאל לימין בכל שפה — כך זה בכל נגן בעולם
    <div className="no-drag flex w-full items-center gap-2.5" dir="ltr">
      <span className="w-11 text-end text-[11.5px] text-ink-3 tabular-nums">{clock(shown)}</span>
      <div
        ref={bar}
        role="slider"
        tabIndex={0}
        aria-label={t('player.position')}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(shown)}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setScrubbing(at(e.clientX))
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            seekRelative(-5)
          }
          if (e.key === 'ArrowRight') {
            seekRelative(5)
          }
        }}
        className="group relative h-4 flex-1 cursor-pointer"
      >
        <div className="absolute inset-x-0 top-1/2 h-[5px] scale-y-[0.600] -translate-y-1/2 overflow-hidden rounded-full bg-ink/16 transition-transform duration-fast group-hover:scale-y-100">
          <div
            className="h-full w-full origin-left bg-gradient-to-r from-violet to-arctic transition-transform duration-100 ease-linear"
            style={{ transform: `scaleX(${pct / 100})` }}
          />
        </div>
        {/* הידית מופיעה רק בריחוף: נקודה קבועה על פס דק נראית כמו לכלוך */}
        <span
          className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-arctic opacity-0 shadow-e1 transition-opacity duration-fast group-hover:opacity-100"
          style={{ left: `calc(${pct}% - 5px)` }}
        />
      </div>
      <span className="w-11 text-[11.5px] text-ink-3 tabular-nums">{clock(duration)}</span>
    </div>
  )
}

/** הכפתור העגול הגדול — הפעולה היחידה שנלחצת בלי להסתכל */
function PlayButton(): React.JSX.Element {
  const t = useT()
  const paused = usePlayer((s) => s.engine.paused)
  const togglePlayback = usePlayer((s) => s.togglePlayback)
  return (
    <button
      onClick={togglePlayback}
      aria-label={paused ? t('player.play') : t('player.pause')}
      title={paused ? t('player.play') : t('player.pause')}
      className="no-drag grid h-11 w-11 shrink-0 place-items-center rounded-full bg-arctic text-canvas shadow-e2 transition-transform duration-fast ease-spring hover:scale-105 active:scale-95"
    >
      <PlayGlyph glyph={paused ? 'play' : 'pause'} size={15} />
    </button>
  )
}

function Volume(): React.JSX.Element {
  const t = useT()
  const volume = usePlayer((s) => s.engine.volume)
  const muted = usePlayer((s) => s.engine.muted)
  const setVolume = usePlayer((s) => s.setVolume)
  return (
    <div className="no-drag flex items-center gap-2">
      <IconButton
        icon={muted || volume === 0 ? 'mute' : 'sound'}
        label={muted ? t('player.unmute') : t('player.mute')}
        size={17}
        className="h-9 w-9"
        onClick={() => setVolume(muted || volume === 0 ? 100 : 0)}
      />
      <input
        type="range"
        min={0}
        max={100}
        value={muted ? 0 : volume}
        aria-label={t('player.volume')}
        onChange={(e) => setVolume(Number(e.target.value))}
        className="no-drag h-1 w-24 cursor-pointer appearance-none rounded-full bg-ink/25 accent-violet"
      />
    </div>
  )
}

export function MiniPlayer({
  cover,
  audioOnly,
  onFullscreen
}: {
  cover: string | null
  audioOnly: boolean
  onFullscreen: () => void
}): React.JSX.Element {
  const t = useT()
  const title = usePlayer((s) => s.engine.title)
  const path = usePlayer((s) => s.engine.path)
  const artist = usePlayer((s) => s.engine.artist)
  const streamCover = usePlayer((s) => s.engine.cover)
  const provider = usePlayer((s) => s.engine.provider)
  const playbackMode = usePlayer((s) => s.engine.playbackMode)
  const paused = usePlayer((s) => s.engine.paused)
  const spotify = usePlayer((s) => s.spotify)
  const skip = usePlayer((s) => s.skip)
  // פרסומת של YouTube לפני השיר — אומרים את זה, במקום סרגל שזז בזמן של מישהו אחר
  const ad = useYouTube((s) => provider === 'YouTube' && inAd(s))
  const isSpotify = provider === 'Spotify'
  // בתור פעיל "הקודם"/"הבא" הם שירים, כמו בספוטיפיי; בסרט — עשר שניות
  const queued = useQueue((s) => s.active && s.items.length > 0)
  const trackNav = isSpotify || queued
  const setImmersive = useUi((s) => s.setImmersive)
  const [hover, setHover] = useState(false)
  // בווידאו התמונה היא הפריים החי; במוזיקה חלון הווידאו ריק, ולכן העטיפה
  const frame = useLastFrame(!audioOnly)

  const name = title ?? path?.split(/[/\\]/).pop() ?? ''
  const art = audioOnly ? (streamCover ?? cover) : (frame ?? cover)

  return (
    <motion.div
      initial={{ y: 96, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 96, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 34, mass: 0.9 }}
      className="drag glass-thin pointer-events-auto relative flex h-20 items-center gap-6 rounded-o-xl px-5"
    >
      {/* ---------- מה מתנגן ---------- */}
      <button
        onClick={() => (audioOnly ? setImmersive(true) : onFullscreen())}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        title={t('player.fullscreen')}
        className="no-drag group flex min-w-0 flex-1 items-center gap-3.5 text-start"
      >
        <span
          className={`relative shrink-0 overflow-hidden rounded-o-md transition-transform duration-normal ease-spring ${
            hover ? 'scale-105' : ''
          } ${audioOnly ? 'h-14 w-14' : 'h-[54px] w-24'}`}
        >
          {art ? (
            /*
              הפריים מתחלף בדהייה רכה ולא בקפיצה.
              המפתח הוא הכתובת עצמה, ולכן React מחליף אלמנט בכל
              פריים חדש — וזו בדיוק הסיבה שהדהייה נראית.
            */
            <motion.img
              key={art}
              src={art}
              alt=""
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.45, ease: 'linear' }}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <span className="grid h-full w-full place-items-center bg-surf-2 text-ink-3">
              <Icon name={audioOnly ? 'audio' : 'screen'} size={20} />
            </span>
          )}

          {/* כיסוי ההגדלה: מופיע רק בריחוף, ואומר מה תעשה לחיצה */}
          <span
            className={`pointer-events-none absolute inset-0 grid place-items-center bg-canvas/55 backdrop-blur-[2px] transition-opacity duration-fast ${
              hover ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <Icon name="expand" size={17} />
          </span>
        </span>

        <span className="flex min-w-0 flex-col gap-0.5">
          <span dir="auto" className="truncate text-[13.5px] font-semibold">
            {name}
          </span>
          <span className="flex items-center gap-2 text-[11.5px] text-ink-3">
            <Equalizer active={!paused} />
            {audioOnly ? (artist || t('search.music')) : t('hub.play')}
            {audioOnly && playbackMode === 'preview' && <span>· {t('music.preview')} · 30 s</span>}
            {ad && <span className="rounded-full bg-violet/18 px-2 py-0.5 text-[10.5px] font-semibold text-violet-bright">{t('youtube.ad')}</span>}
            {audioOnly && provider && <MusicProviderBadge provider={provider} compact />}
          </span>
        </span>
      </button>

      {/* ---------- שליטה ---------- */}
      <div className="flex w-[46%] max-w-2xl shrink-0 flex-col items-center gap-1.5">
        <div className="flex items-center gap-2">
          {isSpotify && (
            <IconButton
              icon="shuffle"
              label={t('music.shuffle')}
              active={Boolean(spotify?.shuffle)}
              size={16}
              className="h-9 w-9"
              onClick={() => void window.cinema.spotify.shuffle(!spotify?.shuffle)}
            />
          )}
          <IconButton
            icon={trackNav ? 'prev' : 'back'}
            label={trackNav ? t('music.previous') : t('player.back10')}
            size={18}
            className="h-9 w-9"
            onClick={() => skip('previous')}
          />
          <PlayButton />
          <IconButton
            icon={trackNav ? 'next' : 'forward'}
            label={trackNav ? t('music.next') : t('player.forward10')}
            size={18}
            className="h-9 w-9"
            onClick={() => skip('next')}
          />
          {isSpotify && (
            <IconButton
              icon="repeat"
              label={t(`music.repeat${spotify?.repeat === 'track' ? 'One' : spotify?.repeat === 'context' ? 'All' : 'Off'}`)}
              active={spotify?.repeat !== 'off'}
              size={16}
              className="h-9 w-9"
              onClick={() => {
                const next = spotify?.repeat === 'off' ? 'context' : spotify?.repeat === 'context' ? 'track' : 'off'
                void window.cinema.spotify.repeat(next)
              }}
            />
          )}
        </div>
        <MiniScrubber />
      </div>

      {/* ---------- פקדים משניים ---------- */}
      <div className="flex flex-1 items-center justify-end gap-1">
        <Volume />
        <IconButton
          icon="expand"
          label={t('player.fullscreen')}
          size={17}
          className="h-9 w-9"
          onClick={() => (audioOnly ? setImmersive(true) : onFullscreen())}
        />
      </div>
    </motion.div>
  )
}
