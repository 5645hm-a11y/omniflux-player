import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import type { YouTubeResult, YouTubeTrack } from '@shared/api'
import { useT } from '../i18n'
import type { Key } from '@shared/i18n'
import { usePlayer } from '../store/player'
import { queueKey, useQueue, type QueueItem } from '../store/queue'
import { onListeningChange, rankForYou, recentlyPlayed, topArtists, type Listen } from '../lib/listening'
import { Button, Icon, IconButton } from './ui'
import { Equalizer } from './Motion'
import { MusicProviderBadge } from './MusicProviderBadge'
import { Carousel } from './music/Carousel'
import { pickPlaylist } from './music/Playlists'
import { useEscapeLayer } from '../store/ui'
import placeholder from '../assets/placeholder-v2.png'

/**
 * המדפים של מתחם המוזיקה.
 *
 * כל מדף הוא רשימת QueueItem, ולחיצה על שיר מנגנת את המדף כולו כתור
 * מהשיר הזה והלאה — כמו ב-Spotify: לוחצים על שיר ב"בשבילך", והבאים
 * אחריו ממשיכים לבד. מדף מעורב (מקומי + YouTube) מתנגן ברצף, והמעבר
 * בין המנועים שקוף.
 */

// ---------- המרות ----------

export function youTubeItem(track: YouTubeTrack): QueueItem {
  return {
    key: queueKey(), source: 'youtube', ref: track.videoId, title: track.title, artist: track.artist,
    cover: track.thumbnail, durationSec: track.durationSec, youtube: track
  }
}

export function listenItem(listen: Listen): QueueItem {
  return {
    key: queueKey(), source: listen.source, ref: listen.ref, title: listen.title, artist: listen.artist,
    cover: listen.cover, youtube: listen.youtube
  }
}

/** ההודעה למשתמש לכל סיבה ש-YouTube החזיר רשימה ריקה */
export function youTubeReason(reason: YouTubeResult['reason']): Key | null {
  switch (reason) {
    case 'quota': return 'youtube.quota'
    case 'daily-limit': return 'youtube.dailyLimit'
    case 'no-key': return 'youtube.noKey'
    case 'error': return 'youtube.error'
    case 'invalid': return 'youtube.invalid'
    case 'not-found': return 'youtube.notFound'
    default: return null
  }
}

// ---------- כרטיס ----------

export function TrackCard({
  item,
  index,
  reason,
  onPlay
}: {
  item: QueueItem
  index: number
  reason?: string | null
  onPlay: () => void
}): React.JSX.Element {
  const t = useT()
  const [failed, setFailed] = useState(false)
  const current = useQueue((s) => (s.active ? s.items[s.index] : null))
  const paused = usePlayer((s) => s.engine.paused)
  const active = current?.ref === item.ref && current.source === item.source
  const badge = item.source === 'youtube' ? 'YouTube' : item.source === 'preview' ? 'Deezer' : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: Math.min(index, 10) * 0.03, ease: [0.16, 1, 0.3, 1] }}
      className={`group relative min-w-0 rounded-o-xl p-2 ${active ? 'bg-violet/12 ring-1 ring-violet/45' : ''}`}
    >
      <button onClick={onPlay} className="block w-full text-start" title={item.title}>
        <span className="card-lift group-hover:card-lift-on relative block aspect-square overflow-hidden rounded-o-lg bg-surf-2">
          {item.cover && !failed ? (
            <img src={item.cover} alt="" loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" />
          ) : (
            /* שיר בלי עטיפה מקבל צבע משלו, לפי השם — לא ריבוע אפור זהה לכולם */
            <span
              className="grid h-full w-full place-items-center text-ink/70"
              style={{ background: `linear-gradient(135deg, hsl(${hue(item.artist || item.title)} 55% 32%), hsl(${hue(item.title)} 60% 18%))` }}
            >
              <Icon name="music" size={30} strokeWidth={1.4} />
            </span>
          )}
          <span className="absolute inset-0 grid place-items-center bg-canvas/28 opacity-0 backdrop-blur-[2px] transition-opacity duration-fast group-hover:opacity-100">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-arctic text-canvas shadow-e3">
              <Icon name="play" size={16} fill />
            </span>
          </span>
          {badge && <span className="absolute end-2 top-2"><MusicProviderBadge provider={badge} compact /></span>}
        </span>
        <span className="mt-2.5 block min-w-0 px-0.5">
          <span dir="auto" className="flex items-center gap-2 truncate text-[13.5px] font-semibold">
            {active && <Equalizer active={!paused} />}
            <span className="truncate">{item.title}</span>
          </span>
          <span dir="auto" className="mt-0.5 block truncate text-[11.5px] text-ink-3">
            {item.artist || t('search.music')}
          </span>
          {reason && (
            <span dir="auto" className="mt-1 block truncate text-[10.5px] font-medium text-violet-bright">
              {t('music.because', { artist: reason })}
            </span>
          )}
        </span>
      </button>
      {/* פעולות משניות: לא מסתירות את השיר, מופיעות רק בריחוף או במקלדת */}
      <span className="absolute start-3 top-3 flex gap-1 opacity-0 transition-opacity duration-fast group-hover:opacity-100 focus-within:opacity-100">
        <IconButton icon="queue" label={t('music.playNext')} size={14} className="h-8 w-8 bg-canvas/80"
          onClick={() => useQueue.getState().playNext({ ...item, key: queueKey() })} />
        <IconButton icon="plus" label={t('music.addQueue')} size={14} className="h-8 w-8 bg-canvas/80"
          onClick={() => useQueue.getState().enqueue([{ ...item, key: queueKey() }])} />
        <IconButton icon="listPlus" label={t('music.addToPlaylist')} size={14} className="h-8 w-8 bg-canvas/80"
          onClick={() => pickPlaylist([item])} />
      </span>
    </motion.div>
  )
}

function hue(text: string): number {
  let h = 0
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}

// ---------- מדף ----------

export function TrackShelf({
  title,
  items,
  reasons,
  note,
  action,
  loading
}: {
  title: string
  items: QueueItem[]
  reasons?: Array<string | null>
  note?: string | null
  action?: React.ReactNode
  loading?: boolean
}): React.JSX.Element | null {
  if (items.length === 0 && !note && !loading) return null
  if (items.length === 0) {
    return (
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-[20px] font-bold tracking-tight">{title}</h2>
          {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink/20 border-t-violet" />}
        </div>
        {note && <p className="text-[12.5px] text-ink-3">{note}</p>}
      </section>
    )
  }
  return (
    <Carousel title={title} subtitle={note} action={action}>
      {items.map((item, index) => (
        <TrackCard
          key={item.key}
          item={item}
          index={index}
          reason={reasons?.[index]}
          onPlay={() => useQueue.getState().playList(items.map((i) => ({ ...i, key: queueKey() })), index)}
        />
      ))}
    </Carousel>
  )
}

function PlayAllButton({ items }: { items: QueueItem[] }): React.JSX.Element | null {
  const t = useT()
  if (items.length < 2) return null
  return (
    <Button variant="outline" onClick={() => useQueue.getState().playList(items.map((i) => ({ ...i, key: queueKey() })), 0)}>
      <Icon name="play" size={13} fill />
      {t('music.playAll')}
    </Button>
  )
}

// ---------- "האזנה אחרונה" ו"בשבילך" ----------

function useHistory(): Listen[] {
  const [list, setList] = useState(() => recentlyPlayed(200))
  useEffect(() => onListeningChange(() => setList(recentlyPlayed(200))), [])
  return list
}

export function RecentShelf(): React.JSX.Element | null {
  const t = useT()
  const list = useHistory()
  const items = useMemo(() => list.slice(0, 12).map(listenItem), [list])
  return <TrackShelf title={t('music.jumpBackIn')} items={items} />
}

/**
 * "בשבילך": מהאוסף שלך, מהפופולריים עכשיו, ומההיסטוריה — מדורג לפי
 * האמנים שאתה שומע. משתמש חדש, בלי היסטוריה, מקבל מדף מלא בכל זאת:
 * השירים שלו והפופולריים, בסדר שבו הגיעו.
 */
export function ForYouShelf({ local, trending }: { local: QueueItem[]; trending: YouTubeTrack[] }): React.JSX.Element | null {
  const t = useT()
  const list = useHistory()
  const ranked = useMemo(() => {
    // שיר ששמעת הרבה פעמים וכבר לא לאחרונה — "לחזור אליו"
    const rediscover = list.filter((l) => l.plays >= 2).slice(12, 40).map(listenItem)
    const pool = [...local.slice(0, 60), ...trending.map(youTubeItem), ...rediscover]
    return rankForYou(pool, list).slice(0, 18)
  }, [list, local, trending])
  return (
    <TrackShelf
      title={t('music.forYou')}
      items={ranked}
      reasons={ranked.map((r) => r.reason)}
      note={list.length === 0 ? t('music.forYouEmpty') : null}
      action={<PlayAllButton items={ranked} />}
    />
  )
}

// ---------- YouTube: פופולרי, מצבי רוח, אמנים, פלייליסט ----------

export function TrendingShelf({ onTracks }: { onTracks?: (tracks: YouTubeTrack[]) => void }): React.JSX.Element | null {
  const t = useT()
  const [result, setResult] = useState<YouTubeResult | null>(null)
  useEffect(() => {
    void window.cinema.youtube.trending().then((res) => {
      setResult(res)
      onTracks?.(res.tracks)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const items = useMemo(() => (result?.tracks ?? []).slice(0, 24).map(youTubeItem), [result])
  if (result?.reason === 'local-only' || result?.reason === 'no-key') return null
  const why = youTubeReason(result?.reason)
  return (
    <TrackShelf
      title={t('youtube.trending')}
      items={items}
      loading={!result}
      note={why && items.length === 0 ? t(why) : null}
      action={<PlayAllButton items={items} />}
    />
  )
}

/**
 * מצבי רוח וז'אנרים: כל כפתור הוא חיפוש ב-YouTube.
 *
 * חיפוש עולה 100 יחידות ממכסה משותפת, ולכן הוא יוצא רק בלחיצה, ונשמר
 * שבוע: הלחיצה השנייה על "רגוע" מגיעה מהדיסק ולא עולה דבר. השאילתות
 * באנגלית, והשפה והאזור של המשתמש משפיעים על הדירוג בצד של YouTube.
 */
/** האמנות של כל קטגוריה — סדרה אחת, באותה שפה צילומית, בלי טקסט: השם מגיע מהממשק ובשפת המשתמש */
const ART = import.meta.glob('../assets/music-tiles/*.webp', { eager: true, import: 'default' }) as Record<string, string>
const art = (name: string): string | undefined => ART[`../assets/music-tiles/${name}.webp`]

interface Category {
  id: string
  label: Key
  query: string
  /** צבע האור של התמונה — הטבעת של כרטיס נבחר נצבעת בו */
  accent: string
}

const MOODS: Category[] = [
  { id: 'focus', label: 'music.mixFocus', query: 'focus music', accent: '#a78bfa' },
  { id: 'chill', label: 'music.mixChill', query: 'chill music', accent: '#5eead4' },
  { id: 'energy', label: 'music.mixEnergy', query: 'upbeat hits', accent: '#f472b6' },
  { id: 'workout', label: 'music.mixWorkout', query: 'workout music', accent: '#a3e635' },
  { id: 'cinema', label: 'music.mixCinema', query: 'epic movie soundtrack', accent: '#fbbf24' },
  { id: 'sleep', label: 'music.mixSleep', query: 'calm sleep music', accent: '#93c5fd' }
]
const GENRES: Category[] = [
  { id: 'pop', label: 'music.genrePop', query: 'pop music', accent: '#f9a8d4' },
  { id: 'rock', label: 'music.genreRock', query: 'rock music', accent: '#ef4444' },
  { id: 'hiphop', label: 'music.genreHipHop', query: 'hip hop music', accent: '#c084fc' },
  { id: 'electronic', label: 'music.genreElectronic', query: 'electronic music', accent: '#22d3ee' },
  { id: 'rnb', label: 'music.genreRnb', query: 'r&b music', accent: '#fb7185' },
  { id: 'jazz', label: 'music.genreJazz', query: 'jazz music', accent: '#f59e0b' },
  { id: 'classical', label: 'music.genreClassical', query: 'classical music', accent: '#fde68a' },
  { id: 'latin', label: 'music.genreLatin', query: 'latin music', accent: '#fb923c' },
  { id: 'reggaeton', label: 'music.genreReggaeton', query: 'reggaeton', accent: '#e879f9' },
  { id: 'mizrahi', label: 'music.genreMizrahi', query: 'mizrahi israeli music', accent: '#fcd34d' }
]

/**
 * כרטיס קטגוריה: תמונת אווירה, השם גדול בתחתית, והטבעת בצבע של התמונה.
 *
 * זה מה שהפלטפורמות המובילות עושות, ולא בכדי: "רגוע" כמילה על כפתור
 * אפור אומר מעט; גג בשעת דמדומים אומר מיד איזו מוזיקה תבוא. התמונות
 * נוצרו במיוחד (OpenArt), כסדרה אחת — אותו אור, אותה כהות בשליש התחתון
 * כדי שהכותרת תמיד תהיה קריאה — ונארזות עם התוכנה: בלי רשת ובלי תלות
 * בשירות חיצוני כדי שהמסך ייראה טוב.
 */
function CategoryTile({
  category,
  label,
  selected,
  index,
  onPick
}: {
  category: Category
  label: string
  selected: boolean
  index: number
  onPick: () => void
}): React.JSX.Element {
  const image = art(category.id)
  return (
    <motion.button
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.34, delay: Math.min(index, 10) * 0.03, ease: [0.16, 1, 0.3, 1] }}
      onClick={onPick}
      aria-pressed={selected}
      style={selected ? { boxShadow: `0 0 0 2px ${category.accent}, 0 16px 40px -16px ${category.accent}` } : undefined}
      className="group relative block aspect-[4/3] w-full overflow-hidden rounded-o-xl bg-surf-2 text-start transition-transform duration-fast ease-spring hover:-translate-y-0.5 active:scale-[0.98]"
    >
      {image && (
        <img
          src={image}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-[600ms] ease-out group-hover:scale-[1.06]"
        />
      )}
      {/* הצללה בתחתית — הכותרת קריאה מעל כל תמונה, גם בהירה */}
      <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
      <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3.5">
        <span dir="auto" className="font-display text-[19px] leading-tight font-extrabold text-white drop-shadow-[0_2px_8px_rgb(0_0_0/0.6)]">
          {label}
        </span>
        <span className="grid h-9 w-9 shrink-0 translate-y-1 place-items-center rounded-full bg-white text-black opacity-0 shadow-e3 transition duration-fast group-hover:translate-y-0 group-hover:opacity-100">
          <Icon name="play" size={14} fill />
        </span>
      </span>
    </motion.button>
  )
}

export function MoodsAndGenres({ localGenres }: { localGenres: string[] }): React.JSX.Element {
  const t = useT()
  const [selected, setSelected] = useState<{ label: string; query: string } | null>(null)
  const [result, setResult] = useState<YouTubeResult | null>(null)
  const [busy, setBusy] = useState(false)
  // ז'אנרים מהתגיות של האוסף שאין להם כרטיס — כפתורים קטנים, כי אין להם תמונה
  const extraGenres = useMemo(() => {
    const known = new Set(['pop', 'rock', 'hip-hop', 'hip hop', 'electronic', 'r&b', 'jazz', 'classical', 'latin', 'reggaeton'])
    return localGenres.filter((g) => !known.has(g.toLowerCase())).slice(0, 8)
  }, [localGenres])

  const run = (label: string, query: string): void => {
    setSelected({ label, query })
    setBusy(true)
    void window.cinema.youtube.search(query).then(setResult).finally(() => setBusy(false))
  }
  const items = useMemo(() => (result?.tracks ?? []).map(youTubeItem), [result])
  const why = youTubeReason(result?.reason)
  const isMood = selected ? MOODS.some((m) => m.query === selected.query) : false

  // כל קבוצה — שורה אחת שנגללת לצד, כמו "עיון לפי קטגוריות" בנגנים המובילים
  const row = (title: string, list: Category[]): React.JSX.Element => (
    <Carousel title={title} itemWidth={236}>
      {list.map((category, index) => (
        <CategoryTile
          key={category.id}
          category={category}
          label={t(category.label)}
          index={index}
          selected={selected?.query === category.query}
          onPick={() => run(t(category.label), category.query)}
        />
      ))}
    </Carousel>
  )
  // התוצאות נפתחות מתחת לקבוצה שנלחצה, לא בתחתית העמוד
  const results = selected && (
    <TrackShelf title={selected.label} items={items} loading={busy}
      note={why && items.length === 0 ? t(why) : null} action={<PlayAllButton items={items} />} />
  )

  return (
    <section className="flex flex-col gap-8">
      {row(t('music.moods'), MOODS)}
      {isMood && results}
      {row(t('music.genres'), GENRES)}
      {extraGenres.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="me-1 text-[12.5px] text-ink-3">{t('music.fromCollection')}</span>
          {extraGenres.map((genre) => (
            <button key={genre} onClick={() => run(genre, `${genre} music`)} aria-pressed={selected?.label === genre}
              className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors duration-fast active:scale-95 ${
                selected?.label === genre ? 'bg-violet text-white' : 'bg-ink/8 hover:bg-ink/14'}`}>
              {genre}
            </button>
          ))}
        </div>
      )}
      {!isMood && results}
    </section>
  )
}

export function TopArtists({ onArtist }: { onArtist: (name: string) => void }): React.JSX.Element | null {
  const t = useT()
  const list = useHistory()
  const artists = useMemo(() => topArtists(12, list), [list])
  return (
    <Carousel title={t('music.topArtists')} itemWidth={132}>
      {artists.map((artist) => (
        <button key={artist.name} onClick={() => onArtist(artist.name)} className="group w-full text-center">
          <span className="card-lift group-hover:card-lift-on mx-auto block aspect-square w-full overflow-hidden rounded-full bg-surf-2">
            {artist.cover
              ? <img src={artist.cover} alt="" className="h-full w-full object-cover" />
              : <span className="grid h-full w-full place-items-center text-[30px] font-bold text-ink-3">{artist.name.slice(0, 1)}</span>}
          </span>
          <span dir="auto" className="mt-2.5 block truncate text-[13px] font-semibold">{artist.name}</span>
        </button>
      ))}
    </Carousel>
  )
}

export function PlaylistImport(): React.JSX.Element {
  const t = useT()
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<(YouTubeResult & { title?: string }) | null>(null)
  const items = useMemo(() => (result?.tracks ?? []).map(youTubeItem), [result])
  const why = youTubeReason(result?.reason)

  const load = (): void => {
    if (!link.trim()) return
    setBusy(true)
    void window.cinema.youtube.playlist(link.trim()).then(setResult).finally(() => setBusy(false))
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="glass-ultrathin flex flex-wrap items-center gap-3 rounded-o-xl p-4">
        <MusicProviderBadge provider="YouTube" />
        <span className="text-[13.5px] font-semibold">{t('youtube.importTitle')}</span>
        <input
          value={link}
          onChange={(event) => setLink(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && load()}
          placeholder={t('youtube.importPlaceholder')}
          aria-label={t('youtube.importPlaceholder')}
          dir="ltr"
          className="h-10 min-w-[240px] flex-1 rounded-o-md border border-ink/10 bg-ink/5 px-3 text-[13px] outline-none focus:border-violet/55"
        />
        <Button variant="outline" disabled={!link.trim() || busy} onClick={load}>{t('youtube.import')}</Button>
      </div>
      {result && (
        <TrackShelf
          title={result.title ?? t('youtube.importTitle')}
          items={items}
          note={why && items.length === 0 ? t(why) : null}
          action={<PlayAllButton items={items} />}
        />
      )}
    </section>
  )
}

// ---------- התור ----------

export function QueueDrawer({ onClose }: { onClose: () => void }): React.JSX.Element {
  const t = useT()
  useEscapeLayer(onClose)
  const items = useQueue((s) => s.items)
  const index = useQueue((s) => s.index)
  const active = useQueue((s) => s.active)
  const repeat = useQueue((s) => s.repeat)
  const paused = usePlayer((s) => s.engine.paused)
  const upcoming = items.slice(index + 1)

  return (
    <div className="fixed inset-0 z-[121] flex justify-end bg-canvas/65 backdrop-blur-md" onClick={onClose}>
      <aside className="glass-thick flex h-full w-[min(440px,92vw)] flex-col gap-4 overflow-y-auto p-6" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-2">
          <h2 className="font-display flex-1 text-[22px] font-extrabold">{t('music.queue')}</h2>
          <IconButton icon="shuffle" label={t('music.shuffle')} size={16} onClick={() => useQueue.getState().shuffleUpcoming()} />
          <IconButton
            icon="repeat"
            label={t(repeat === 'one' ? 'music.repeatOne' : repeat === 'all' ? 'music.repeatAll' : 'music.repeatOff')}
            active={repeat !== 'off'}
            size={16}
            onClick={() => useQueue.getState().setRepeat(repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off')}
          />
          <IconButton icon="close" label={t('nav.close')} onClick={onClose} />
        </div>
        {items.length === 0 ? (
          <p className="py-12 text-center text-[13px] text-ink-3">{t('music.queueEmpty')}</p>
        ) : (
          <>
            {items[index] && (
              <QueueRow item={items[index]} current playing={active && !paused} onPlay={() => useQueue.getState().jump(index)} />
            )}
            <h3 className="mt-2 text-[12px] font-semibold tracking-[0.06em] text-ink-3 uppercase">{t('music.upNext')}</h3>
            {upcoming.map((item, i) => (
              <QueueRow
                key={item.key}
                item={item}
                onPlay={() => useQueue.getState().jump(index + 1 + i)}
                onRemove={() => useQueue.getState().remove(index + 1 + i)}
              />
            ))}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => pickPlaylist(items)}><Icon name="listPlus" size={14} />{t('music.savePlaylist')}</Button>
              <Button variant="outline" onClick={() => useQueue.getState().clear()}>{t('music.clearQueue')}</Button>
            </div>
          </>
        )}
      </aside>
    </div>
  )
}

function QueueRow({
  item,
  current,
  playing,
  onPlay,
  onRemove
}: {
  item: QueueItem
  current?: boolean
  playing?: boolean
  onPlay: () => void
  onRemove?: () => void
}): React.JSX.Element {
  const t = useT()
  return (
    <div className={`grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 rounded-o-lg px-2 py-1.5 ${current ? 'bg-violet/12 ring-1 ring-violet/35' : 'hover:bg-ink/6'}`}>
      <button onClick={onPlay} className="relative h-11 w-11 overflow-hidden rounded-o-md bg-surf-2" aria-label={`${t('player.play')} · ${item.title}`}>
        <img src={item.cover ?? placeholder} alt="" className="h-full w-full object-cover" />
        {current && <span className="absolute inset-0 grid place-items-center bg-canvas/50"><Equalizer active={Boolean(playing)} /></span>}
      </button>
      <button onClick={onPlay} className="min-w-0 text-start">
        <span dir="auto" className="block truncate text-[13px] font-semibold">{item.title}</span>
        <span className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
          {item.source === 'youtube' && <MusicProviderBadge provider="YouTube" compact />}
          <span dir="auto" className="truncate">{item.artist}</span>
        </span>
      </button>
      {onRemove && <IconButton icon="close" label={t('music.removeFromQueue')} size={14} className="h-8 w-8" onClick={onRemove} />}
    </div>
  )
}
