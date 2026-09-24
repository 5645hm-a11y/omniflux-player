import { useEffect, useRef, useState } from 'react'
import type { OnlineSubtitle, ThumbSprite } from '@shared/api'
import { useQueue } from '../store/queue'
import { usePlayer, useTracks } from '../store/player'
import { useI18n, useT } from '../i18n'
import { Icon, IconButton } from './ui'
import { PlayGlyph } from './Motion'

/** 3725 → "1:02:05". שעות מוצגות רק כשיש. */
export function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const s = Math.floor(seconds % 60)
  const m = Math.floor((seconds / 60) % 60)
  const h = Math.floor(seconds / 3600)
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`
}

/** סרגל הזמן. בזמן גרירה הוא מקומי, כדי שלא יילחם בדיווחי המנוע. */
function Scrubber(): React.JSX.Element {
  const t = useT()
  const [sprite, setSprite] = useState<ThumbSprite | null>(null)
  const path = usePlayer((s) => s.engine.path)
  const duration = usePlayer((s) => s.engine.duration)
  const position = usePlayer((s) => s.engine.position)
  const scrubbing = usePlayer((s) => s.scrubbing)
  const setScrubbing = usePlayer((s) => s.setScrubbing)
  // לסרטון YouTube ולשיר Spotify אין גיליון תמונות מ-mpv
  const isSpotify = usePlayer((s) => s.engine.provider === 'Spotify' || s.engine.provider === 'YouTube')
  const seekTo = usePlayer((s) => s.seekTo)
  const seekRelative = usePlayer((s) => s.seekRelative)
  const bar = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  const shown = scrubbing ?? position
  const pct = duration > 0 ? Math.min(100, (shown / duration) * 100) : 0

  /*
   * הגיליון נבנה ברקע ומגיע כשהוא מוכן.
   *
   * הבנייה לוקחת פחות משנייה גם על סרט ארוך, כי היא מדלגת ולא
   * מפענחת — אבל היא עדיין אינה חוסמת: עד שהיא חוזרת מוצג הזמן
   * בלבד, וזה כבר שימושי.
   */
  useEffect(() => {
    setSprite(null)
    if (!path || isSpotify) return
    let alive = true
    void window.cinema.player.thumbs().then((s) => {
      if (alive) setSprite(s)
    })
    return () => {
      alive = false
    }
  }, [path, duration, isSpotify])

  /** המשבצת שמתאימה לזמן, כמיקום רקע בגיליון */
  const tileAt = (seconds: number): React.CSSProperties | null => {
    if (!sprite) return null
    const index = Math.min(sprite.count - 1, Math.max(0, Math.floor(seconds / sprite.interval)))
    const col = index % sprite.cols
    const row = Math.floor(index / sprite.cols)
    const w = sprite.tileWidth
    const h = Math.round((w * 9) / 16)
    return {
      width: w,
      height: h,
      backgroundImage: `url(${sprite.url})`,
      backgroundSize: `${sprite.cols * w}px ${sprite.rows * h}px`,
      backgroundPosition: `-${col * w}px -${row * h}px`
    }
  }

  const at = (clientX: number): number => {
    const el = bar.current
    if (!el || duration <= 0) return 0
    const r = el.getBoundingClientRect()
    // ‏RTL: הזמן מתקדם משמאל לימין כמו בכל נגן, גם בממשק ימין-שמאל
    const ratio = (clientX - r.left) / r.width
    return Math.max(0, Math.min(duration, ratio * duration))
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
    <div className="no-drag flex items-center gap-3.5" dir="ltr">
      <span className="w-14 text-center text-[12.5px] text-ink/75 tabular-nums">{clock(shown)}</span>
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
        onPointerMove={(e) => setHover(at(e.clientX))}
        onPointerLeave={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            seekRelative(-5)
          }
          if (e.key === 'ArrowRight') {
            seekRelative(5)
          }
        }}
        className="group relative h-6 flex-1 cursor-pointer"
      >
        {/* הפס מתעבה במעבר עכבר — משוב שהאזור חי, בלי להוסיף אלמנט */}
        <div className="absolute inset-x-0 top-1/2 h-[7px] scale-y-[0.571] -translate-y-1/2 overflow-hidden rounded-full bg-ink/18 transition-transform duration-fast group-hover:scale-y-100">
          <div
            className="h-full w-full origin-left bg-gradient-to-r from-violet to-arctic transition-transform duration-100 ease-linear"
            style={{ transform: `scaleX(${pct / 100})` }}
          />
        </div>
        <div
          className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-arctic opacity-0 shadow-e1 transition-opacity group-hover:opacity-100"
          style={{ left: `calc(${pct}% - 7px)`, opacity: scrubbing !== null ? 1 : undefined }}
        />
        {hover !== null && duration > 0 && (
          <span
            className="pointer-events-none absolute bottom-8 flex -translate-x-1/2 flex-col items-center gap-1.5"
            style={{ left: `${(hover / duration) * 100}%` }}
          >
            {tileAt(hover) && (
              <span
                className="block overflow-hidden rounded-o-md border border-ink/15 bg-canvas shadow-e3"
                style={tileAt(hover)!}
              />
            )}
            <span className="glass-thin rounded-o-sm px-2 py-0.5 text-[11.5px] tabular-nums">
              {clock(hover)}
            </span>
          </span>
        )}
      </div>
      <span className="w-14 text-center text-[12.5px] text-ink/55 tabular-nums">{clock(duration)}</span>
    </div>
  )
}

function OnlineSubtitleMenu({
  open,
  onToggle
}: {
  open: boolean
  onToggle: () => void
}): React.JSX.Element {
  const t = useT()
  const locale = useI18n((state) => state.locale)
  const mediaPath = usePlayer((state) => state.engine.path)
  const [results, setResults] = useState<OnlineSubtitle[]>([])
  const [busy, setBusy] = useState(false)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let alive = true
    const languages = locale === 'en' ? ['en'] : [locale, 'en']
    setBusy(true)
    setResults([])
    setMessage(null)
    void window.cinema.player
      .subtitleProvider()
      .then((provider) => {
        if (!provider.enabled) throw new Error('SUBDL_NOT_CONFIGURED')
        return window.cinema.player.searchSubtitles(languages)
      })
      .then((found) => {
        if (!alive) return
        setResults(found)
        if (found.length === 0) setMessage(t('player.onlineSubtitlesEmpty'))
      })
      .catch((error: unknown) => {
        if (!alive) return
        const reason = error instanceof Error ? error.message : String(error)
        setMessage(
          reason.includes('SUBDL_NOT_CONFIGURED')
            ? t('player.onlineSubtitlesNotConfigured')
            : t('player.onlineSubtitlesError')
        )
      })
      .finally(() => {
        if (alive) setBusy(false)
      })
    return () => {
      alive = false
    }
  }, [open, locale, mediaPath])

  const load = async (result: OnlineSubtitle): Promise<void> => {
    setLoadingId(result.id)
    setMessage(null)
    try {
      await window.cinema.player.loadOnlineSubtitle(result.id)
      onToggle()
    } catch {
      setMessage(t('player.onlineSubtitlesDownloadError'))
    } finally {
      setLoadingId(null)
    }
  }

  return (
    <div className="relative">
      <IconButton
        icon="captions"
        label={t('player.onlineSubtitles')}
        active={open}
        onClick={onToggle}
      />
      {open && (
        <div className="glass-thin absolute bottom-full end-0 mb-2 w-[min(430px,calc(100vw-48px))] overflow-hidden rounded-o-xl p-2 shadow-e3 rise-in">
          <div className="flex items-center justify-between px-3 py-2">
            <div>
              <div className="font-display text-[14px] font-bold">{t('player.onlineSubtitles')}</div>
              <div className="mt-0.5 text-[11.5px] text-ink-3">{t('player.onlineSubtitlesProvider')}</div>
            </div>
            {busy && <Icon name="refresh" size={15} className="animate-spin text-violet" />}
          </div>

          <div className="max-h-72 overflow-y-auto">
            {results.map((result) => (
              <button
                key={result.id}
                className="no-drag flex w-full items-center gap-3 rounded-o-md px-3 py-2.5 text-start transition-colors duration-fast hover:bg-ink/10 disabled:opacity-45"
                disabled={loadingId !== null}
                onClick={() => void load(result)}
              >
                <span className="grid h-8 w-10 shrink-0 place-items-center rounded-o-sm bg-violet/12 text-[11px] font-bold text-violet">
                  {result.language.slice(0, 3).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{result.release}</span>
                  <span className="mt-0.5 flex gap-2 text-[11px] text-ink-3">
                    {result.matchScore !== null && (
                      <span>{t('player.onlineSubtitlesMatch', { n: Math.round(result.matchScore * 100) })}</span>
                    )}
                    {result.fps !== null && <span>{result.fps.toFixed(3)} FPS</span>}
                    {result.hearingImpaired && <span>{t('player.onlineSubtitlesHi')}</span>}
                  </span>
                </span>
                {loadingId === result.id && <Icon name="refresh" size={14} className="animate-spin" />}
              </button>
            ))}
          </div>

          {message && (
            <div className="px-3 py-4 text-center text-[12.5px] text-ink-2" aria-live="polite">
              {message}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function Controls({
  onPower,
  powerOpen,
  onFullscreen,
  onPictureInPicture
}: {
  onPower: () => void
  powerOpen: boolean
  onFullscreen: () => void
  onPictureInPicture: () => void
}): React.JSX.Element {
  const t = useT()
  // ערכים בודדים ולא האובייקט כולו — אחרת כל דיווח זמן מרנדר הכול
  const paused = usePlayer((s) => s.engine.paused)
  const muted = usePlayer((s) => s.engine.muted)
  const volume = usePlayer((s) => s.engine.volume)
  const speed = usePlayer((s) => s.engine.speed)
  const idle = usePlayer((s) => s.engine.idle)
  const provider = usePlayer((s) => s.engine.provider)
  const spotify = usePlayer((s) => s.spotify)
  // "מתחיל" שייך לספוטיפיי בלבד, ואינו משתיק את הכפתור בסרט
  const starting = usePlayer((s) => s.engine.provider === 'Spotify' && Boolean(s.spotify?.starting))
  const togglePlayback = usePlayer((s) => s.togglePlayback)
  const skip = usePlayer((s) => s.skip)
  const isSpotify = provider === 'Spotify'
  const setVolume = usePlayer((s) => s.setVolume)
  const queued = useQueue((s) => s.active && s.items.length > 0)
  const trackNav = isSpotify || queued
  const audioTracks = useTracks('audio')
  const subTracks = useTracks('sub')
  const [menu, setMenu] = useState<'audio' | 'sub' | 'onlineSub' | 'speed' | null>(null)

  return (
    <div className="glass-thin no-drag pointer-events-auto rounded-o-2xl px-6 py-4">
      <Scrubber />

      <div className="mt-3 flex items-center gap-1.5">
        {/*
          לבן מלא, בלי מדרג ובלי גוון.
          כאן שרד עד עכשיו הצל של הזהב הישן — ‎rgb(240 184 98)‎ כתוב
          במפורש — ששרד את מעבר הצבעים כי הוא ישב בתוך ערך שרירותי
          ולא בשם של אסימון. הפעולה הראשית לבנה, והסגול שמור למצב.
        */}
        <button
          className="no-drag me-2 grid place-items-center rounded-full bg-arctic text-canvas shadow-[0_10px_30px_-10px_rgb(0_0_0/0.8)] transition duration-fast ease-spring hover:scale-105 hover:bg-white active:scale-95 disabled:opacity-40"
          style={{ height: 52, width: 52 }}
          onClick={togglePlayback}
          aria-label={starting ? t('player.starting') : paused ? t('player.play') : t('player.pause')}
          disabled={starting || (idle && paused)}
        >
          {/*
            כשהניגון התבקש ועדיין לא נשמע, הכפתור אומר את זה.
            קודם הוא הציג סמל השהיה מעל 0:00 שאינו זז — כלומר הבטיח
            שמשהו מתנגן בזמן שלא נשמע דבר.
          */}
          {starting
            ? <Icon name="refresh" size={19} className="animate-spin" />
            : <PlayGlyph glyph={paused ? 'play' : 'pause'} size={19} />}
        </button>

        {isSpotify && <IconButton icon="shuffle" label={t('music.shuffle')} active={Boolean(spotify?.shuffle)} onClick={() => void window.cinema.spotify.shuffle(!spotify?.shuffle)} />}
        <IconButton
          icon={trackNav ? 'prev' : 'back'}
          label={trackNav ? t('music.previous') : t('player.back10')}
          onClick={() => skip('previous')}
        />
        <IconButton
          icon={trackNav ? 'next' : 'forward'}
          label={trackNav ? t('music.next') : t('player.forward10')}
          onClick={() => skip('next')}
        />
        {isSpotify && <IconButton icon="repeat" label={t(`music.repeat${spotify?.repeat === 'track' ? 'One' : spotify?.repeat === 'context' ? 'All' : 'Off'}`)} active={spotify?.repeat !== 'off'} onClick={() => { const next = spotify?.repeat === 'off' ? 'context' : spotify?.repeat === 'context' ? 'track' : 'off'; void window.cinema.spotify.repeat(next) }} />}

        <div className="group ms-1 flex items-center">
          <IconButton
            icon={muted || volume === 0 ? 'mute' : 'sound'}
            label={muted || volume === 0 ? t('player.unmute') : t('player.mute')}
            onClick={() => setVolume(muted || volume === 0 ? 100 : 0)}
          />
          <input
            type="range"
            min={0}
            max={isSpotify || provider === 'YouTube' ? 100 : 130}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            aria-label={t('player.volume')}
            dir="ltr"
            className="no-drag h-1 w-0 cursor-pointer appearance-none rounded-full bg-ink/25 accent-violet opacity-0 transition duration-normal ease-out group-hover:w-24 group-hover:opacity-100 focus:w-24 focus:opacity-100"
          />
        </div>

        <div className="flex-1" />

        {!isSpotify && <>
        {audioTracks.length > 1 && (
          <Menu
            label={t('player.audioTrack')}
            open={menu === 'audio'}
            onToggle={() => setMenu(menu === 'audio' ? null : 'audio')}
            items={audioTracks.map((tr) => ({
              id: tr.id,
              label: tr.title ?? tr.lang ?? t('player.track', { n: tr.id }),
              hint: tr.codec,
              selected: tr.selected,
              onSelect: () => void window.cinema.player.selectTrack('audio', tr.id)
            }))}
          />
        )}

        <Menu
          label={t('player.subtitles')}
          open={menu === 'sub'}
          onToggle={() => setMenu(menu === 'sub' ? null : 'sub')}
          items={[
            {
              id: -1,
              label: t('player.subtitlesOff'),
              selected: !subTracks.some((tr) => tr.selected),
              onSelect: () => void window.cinema.player.selectTrack('sub', 'no')
            },
            ...subTracks.map((tr) => ({
              id: tr.id,
              label: tr.title ?? tr.lang ?? t('player.subtitle', { n: tr.id }),
              hint: tr.external ? t('player.external') : undefined,
              selected: tr.selected,
              onSelect: () => void window.cinema.player.selectTrack('sub', tr.id)
            })),
            {
              id: -2,
              label: t('player.subtitleFromFile'),
              selected: false,
              onSelect: () => void window.cinema.player.addSubtitle()
            }
          ]}
        />

        <Menu
          label={`${speed}×`}
          open={menu === 'speed'}
          onToggle={() => setMenu(menu === 'speed' ? null : 'speed')}
          items={[0.5, 0.75, 1, 1.25, 1.5, 2].map((v) => ({
            id: v,
            label: `${v}×`,
            selected: Math.abs(speed - v) < 0.01,
            onSelect: () => void window.cinema.player.setSpeed(v)
          }))}
        />

        <IconButton
          icon="sliders"
          label={t('player.toolsHint')}
          size={19}
          active={powerOpen}
          onClick={onPower}
        />

        <OnlineSubtitleMenu
          open={menu === 'onlineSub'}
          onToggle={() => setMenu(menu === 'onlineSub' ? null : 'onlineSub')}
        />
        <IconButton icon="pip" label={t('player.pictureInPicture')} size={18} onClick={onPictureInPicture} />
        </>}
        <IconButton icon="expand" label={t('player.fullscreen')} size={18} onClick={onFullscreen} />
      </div>
    </div>
  )
}

interface Item {
  id: number
  label: string
  hint?: string
  selected: boolean
  onSelect: () => void
}

function Menu({
  label,
  open,
  onToggle,
  items
}: {
  label: string
  open: boolean
  onToggle: () => void
  items: Item[]
}): React.JSX.Element {
  return (
    <div className="relative">
      <button
        className={`no-drag rounded-o-md px-3 py-2 text-[13px] font-medium transition-colors duration-fast ${
          open ? 'bg-ink/12 text-ink' : 'text-ink/80 hover:bg-ink/10 hover:text-ink'
        }`}
        onClick={onToggle}
        aria-expanded={open}
      >
        {label}
      </button>
      {open && (
        <div className="glass-thin absolute bottom-full end-0 mb-2 min-w-56 overflow-hidden rounded-o-lg py-1.5 rise-in">
          {items.map((item) => (
            <button
              key={item.id}
              className="no-drag flex w-full items-center gap-2.5 px-4 py-2 text-start text-[13.5px] transition-colors duration-fast hover:bg-ink/10"
              onClick={() => {
                item.onSelect()
                onToggle()
              }}
            >
              <span className={`grid w-4 place-items-center ${item.selected ? 'text-violet' : 'text-transparent'}`}>
                <Icon name="check" size={13} />
              </span>
              <span className="flex-1 truncate">{item.label}</span>
              {item.hint && <span className="text-[11.5px] text-ink-3">{item.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
