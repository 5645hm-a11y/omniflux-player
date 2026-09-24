import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import type { Card } from '../store/library'
import { usePlayer } from '../store/player'
import { queueKey, useQueue, type QueueItem } from '../store/queue'
import { useUi } from '../store/ui'
import { useT } from '../i18n'
import { Icon } from './ui'
import { Equalizer } from './Motion'
import { parseTrackTitle } from '@shared/track'

/**
 * המוזיקה של המשתמש עצמו.
 *
 * זה החלק היחיד במתחם שתמיד עובד: הקבצים על המחשב, בלי חשבון, בלי
 * רשת, ובלי מכסה. עד עכשיו הוא היה השורה האחרונה בעמוד, מוגבל
 * לשנים-עשר פריטים, ובאותו גודל כרטיס כמו "אלבומים פופולריים" —
 * כלומר מה ששייך למשתמש נראה כמו פרסומת.
 *
 * הצורה היא רשימה ולא כרטיסים. שיר נבחר לפי שם, והעין קוראת שמות
 * מהר יותר בשורות מאשר בריבועים; כרטיס ריבועי מתאים לאלבום, שיש לו
 * עטיפה. לקבצים מקומיים אין עטיפה, ולכן ריבוע הוא מסגרת ריקה.
 */

interface Track {
  id: string
  title: string
  artist: string
  album: string | null
  genre: string | null
  poster: string | null
}

/**
 * התגיות שבקובץ קודמות לשם הקובץ.
 *
 * כשהקובץ נושא שם, אמן ועטיפה (ID3 וחבריו), הם מה שמוצג. שם הקובץ
 * ("Artist - Title") הוא רק גיבוי לקבצים בלי תגיות — וזה מה שהיה כאן
 * לבד עד עכשיו.
 */
function toTracks(cards: Card[]): Track[] {
  return cards
    .filter((card) => card.kind === 'audio')
    .map((card) => {
      const item = card.items[0]
      const tags = item?.audio
      const parsed = parseTrackTitle(item?.fileName ?? card.title)
      return {
        id: card.id,
        title: tags?.title || parsed.track || card.title,
        artist: tags?.artist || parsed.artist,
        album: tags?.album ?? null,
        genre: tags?.genre ?? null,
        poster: tags?.cover ?? card.poster
      }
    })
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
}

function toItem(track: Track): QueueItem & { genre: string | null } {
  return {
    key: queueKey(), source: 'local', ref: track.id, title: track.title, artist: track.artist,
    cover: track.poster, genre: track.genre
  }
}

/** השירים המקומיים כפריטי תור — ל"בשבילך", לז'אנרים, ולכל מקום אחר במתחם */
export function localQueueItems(cards: Card[]): Array<QueueItem & { genre: string | null }> {
  return toTracks(cards).map(toItem)
}

function TrackRow({ track, index, onPlay }: { track: Track; index: number; onPlay: () => void }): React.JSX.Element {
  const t = useT()
  // ‏playItem אינו נושא מזהה — מה שמתנגן מהאוסף ידוע מהתור
  const active = useQueue((s) => s.active && s.items[s.index]?.source === 'local' && s.items[s.index]?.ref === track.id)
  const paused = usePlayer((state) => state.engine.paused)

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      /* השהיה מדורגת קצרה, ועד עשרה פריטים — אחריהם הרשימה כבר נקראת */
      transition={{ duration: 0.22, delay: Math.min(index, 10) * 0.03, ease: [0.16, 1, 0.3, 1] }}
      className={`group grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-3 rounded-o-lg px-3 py-2 transition-colors duration-fast ${
        active ? 'bg-violet/12 ring-1 ring-violet/35' : 'hover:bg-ink/6'
      }`}
    >
      {/*
        המספר הוא גם הכפתור.
        קודם ישב כאן טור של ריבועים אפורים זהים — מסגרת עטיפה לקבצים
        שאין להם עטיפה, כלומר טור שלם של כלום. המספר אומר מיקום, ובריחוף
        הוא הופך למשולש נגינה: אותו מקום, שני תפקידים, בלי קישוט ריק.
      */}
      <button
        onClick={onPlay}
        aria-label={`${t('player.play')} · ${track.title}`}
        className="grid h-9 w-9 place-items-center rounded-o-md text-[12px] tabular-nums text-ink-3 transition-colors duration-fast hover:bg-ink/10 hover:text-ink active:scale-95"
      >
        {active ? (
          <Equalizer active={!paused} />
        ) : (
          <>
            <span className="group-hover:hidden">{index + 1}</span>
            <span className="hidden group-hover:block"><Icon name="play" size={13} fill /></span>
          </>
        )}
      </button>

      <button onClick={onPlay} className="flex min-w-0 items-center gap-3 text-start">
        {track.poster && (
          <img src={track.poster} alt="" className="h-9 w-9 shrink-0 rounded-o-md object-cover" />
        )}
        <span className="min-w-0">
          <span dir="auto" className="block truncate text-[13.5px] font-medium">{track.title}</span>
          {(track.artist || track.album) && (
            <span dir="auto" className="mt-0.5 block truncate text-[11.5px] text-ink-3">
              {[track.artist, track.album].filter(Boolean).join(' · ')}
            </span>
          )}
        </span>
      </button>

    </motion.div>
  )
}

export function LocalMusic({ cards }: { cards: Card[] }): React.JSX.Element {
  const t = useT()
  const go = useUi((s) => s.go)
  const [filter, setFilter] = useState('')
  const [artist, setArtist] = useState<string | null>(null)

  const tracks = useMemo(() => toTracks(cards), [cards])
  const artists = useMemo(() => {
    const seen = new Map<string, number>()
    for (const track of tracks) {
      if (!track.artist) continue
      seen.set(track.artist, (seen.get(track.artist) ?? 0) + 1)
    }
    return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name)
  }, [tracks])

  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    return tracks.filter((track) => {
      if (artist && track.artist !== artist) return false
      if (!needle) return true
      return `${track.title} ${track.artist}`.toLowerCase().includes(needle)
    })
  }, [tracks, filter, artist])

  /*
   * הכול עובר בתור: לחיצה על שיר מנגנת את הרשימה המוצגת ממנו והלאה,
   * "נגן הכול" מנגן את כולה, וערבוב מנגן אותה בסדר אקראי. קודם "נגן
   * הכול" ניגן את השיר הראשון ועצר — לא היה תור בכלל.
   */
  const play = (id: string): void => {
    const index = shown.findIndex((track) => track.id === id)
    useQueue.getState().playList(shown.map(toItem), Math.max(0, index))
  }
  const playFrom = (list: Track[]): void => {
    if (list.length > 0) useQueue.getState().playList(list.map(toItem), 0)
  }
  const shuffle = (): void => {
    const list = [...shown]
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[list[i], list[j]] = [list[j], list[i]]
    }
    playFrom(list)
  }

  if (tracks.length === 0) {
    /*
     * ריק שאומר מה לעשות, ולא "אין שירים".
     * המוזיקה המקומית מגיעה מאותן תיקיות של הסרטים, ולכן הדרך קדימה
     * היא הוספת תיקייה — וזה בדיוק הכפתור.
     */
    return (
      <section>
        <h2 className="font-display mb-4 text-[18px] font-bold">{t('music.local')}</h2>
        <div className="glass-ultrathin flex flex-col items-center gap-4 rounded-o-xl px-6 py-10 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-ink/6 text-ink-3">
            <Icon name="music" size={24} />
          </span>
          <p className="max-w-sm text-[13.5px] leading-relaxed text-ink-2">{t('music.localEmpty')}</p>
          <button
            onClick={() => go('library')}
            className="no-drag rounded-o-md bg-arctic px-4 py-2 text-[12.5px] font-semibold text-canvas transition-transform duration-fast hover:scale-[1.03] active:scale-95"
          >
            {t('library.addLocal')}
          </button>
        </div>
      </section>
    )
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        <h2 className="font-display text-[18px] font-bold">{t('music.local')}</h2>
        <span className="rounded-full bg-ink/8 px-2.5 py-1 text-[11.5px] font-medium text-ink-2 tabular-nums">
          {t('music.trackCount', { n: tracks.length })}
        </span>

        <div className="ms-auto flex flex-wrap items-center gap-2">
          <button
            onClick={() => playFrom(shown)}
            className="no-drag flex items-center gap-2 rounded-o-md bg-arctic px-3.5 py-2 text-[12.5px] font-semibold text-canvas transition-transform duration-fast hover:scale-[1.03] active:scale-95"
          >
            <Icon name="play" size={14} fill />
            {t('music.playAll')}
          </button>
          <button
            onClick={shuffle}
            className="no-drag flex items-center gap-2 rounded-o-md bg-ink/8 px-3.5 py-2 text-[12.5px] font-medium transition-colors duration-fast hover:bg-ink/14 active:scale-95"
          >
            <Icon name="shuffle" size={14} />
            {t('music.shuffle')}
          </button>
          <div className="glass-ultrathin flex items-center gap-2 rounded-o-md px-3">
            <Icon name="search" size={14} className="text-ink-3" />
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={t('music.filterPlaceholder')}
              aria-label={t('music.filterPlaceholder')}
              className="h-9 w-40 bg-transparent text-[12.5px] outline-none placeholder:text-ink-3"
            />
          </div>
        </div>
      </div>

      {/*
        שורת האמנים מופיעה רק כשיש ממה לבחור. בקבצים בלי "אמן - שיר"
        בשם אין אמן כלל, ושורה של כפתור אחד היא רעש ולא ניווט.
      */}
      {artists.length >= 3 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => setArtist(null)}
            className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors duration-fast ${
              artist === null ? 'bg-ink text-canvas' : 'bg-ink/8 text-ink-2 hover:bg-ink/14'
            }`}
          >
            {t('music.allArtists')}
          </button>
          {artists.slice(0, 12).map((name) => (
            <button
              key={name}
              onClick={() => setArtist(name === artist ? null : name)}
              className={`max-w-[12rem] truncate rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors duration-fast ${
                artist === name ? 'bg-ink text-canvas' : 'bg-ink/8 text-ink-2 hover:bg-ink/14'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-ink-3">{t('music.empty')}</p>
      ) : (
        /* שני טורים על מסך רחב: שורת שיר היא טקסט קצר, ועל רוחב מלא
           נשאר לצדה שדה ריק ארוך בזמן שהרשימה נמשכת מתחת לקיפול */
        <div className="glass-ultrathin grid grid-cols-1 gap-x-4 rounded-o-xl p-2 xl:grid-cols-2">
          {shown.map((track, index) => (
            <TrackRow key={track.id} track={track} index={index} onPlay={() => play(track.id)} />
          ))}
        </div>
      )}
    </section>
  )
}
