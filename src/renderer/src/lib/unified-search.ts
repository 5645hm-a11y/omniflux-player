import { useEffect, useMemo, useRef, useState } from 'react'
import type { SearchResult, YouTubeResult, YouTubeTrack } from '@shared/api'
import { aggregate, type MusicHit, type SourceHit } from '@shared/music-search'
import { parseTrackTitle } from '@shared/track'
import type { Card } from '../store/library'
import { queueKey, useQueue, type QueueItem } from '../store/queue'
import { activate } from './activate'

/**
 * החיפוש האחוד במתחם המוזיקה.
 *
 * ארבעה ערוצים רצים במקביל, ואף אחד אינו מחכה לאחר:
 *
 *   · האוסף — המחשב והדרייב — מסונן כאן, מיד, בלי רשת.
 *   · הקטלוג — Spotify (כשמחובר) ו-Deezer — אחרי השהיה קצרה בהקלדה.
 *   · YouTube מהמטמון — כל מה שכבר נמצא בחיפושים קודמים, בלי מכסה.
 *   · YouTube חי — רק ב-Enter: חיפוש עולה 100 יחידות ממכסה שכל
 *     המשתמשים חולקים, ולכן הוא לעולם אינו יוצא בכל הקשה.
 *
 * כל ערוץ מוסיף שורות, ו-aggregate מאחד אותן לתוצאה אחת לכל שיר.
 */

export interface UnifiedSearch {
  hits: MusicHit[]
  busy: boolean
  youtube: YouTubeResult | null
  /** שולח חיפוש חי ב-YouTube לשאילתה הנוכחית */
  submitYouTube: () => void
}

/** השירים מהאוסף — מהמחשב ומהדרייב — כשורות חיפוש */
export function libraryHits(cards: Card[]): SourceHit[] {
  return cards
    .filter((card) => card.kind === 'audio')
    .map((card) => {
      const item = card.items[0]
      const tags = item?.audio
      const parsed = parseTrackTitle(item?.fileName ?? card.title)
      return {
        kind: card.source === 'gdrive' ? 'drive' : 'local',
        ref: card.id,
        title: tags?.title || parsed.track || card.title,
        artist: tags?.artist || parsed.artist,
        album: tags?.album ?? null,
        cover: tags?.cover ?? card.poster,
        durationSec: tags?.durationSec ?? null,
        quality: 'full'
      } satisfies SourceHit
    })
}

/** "Artist · Album" — כך הקטלוג כותב את השורה השנייה */
function splitSubtitle(subtitle: string): { artist: string; album: string | null } {
  const [artist, album] = subtitle.split(/\s*[·•]\s*/)
  return { artist: artist?.trim() ?? '', album: album?.trim() || null }
}

export function catalogHits(results: SearchResult[], deezerPremium: boolean): SourceHit[] {
  return results.flatMap((result): SourceHit[] => {
    const { artist, album } = splitSubtitle(result.subtitle)
    if (result.playUri?.startsWith('spotify:')) {
      return [{ kind: 'spotify', ref: result.playUri, title: result.title, artist, album, cover: result.poster, quality: 'full', payload: result }]
    }
    if (result.sourceLabel === 'Deezer' && (result.providerTrackId || result.playUri)) {
      return [{
        kind: 'deezer', ref: result.providerTrackId ?? result.id, title: result.title, artist, album, cover: result.poster,
        quality: deezerPremium ? 'full' : 'preview', previewUrl: result.playUri ?? null, payload: result
      }]
    }
    return []
  })
}

export function youTubeHits(tracks: YouTubeTrack[]): SourceHit[] {
  return tracks.map((track) => ({
    kind: 'youtube', ref: track.videoId, title: track.title, artist: track.artist,
    cover: track.thumbnail, durationSec: track.durationSec, quality: 'full', payload: track
  }))
}

/** מקור שאפשר להכניס לתור — מקומי, דרייב, YouTube, וקטע של Deezer */
export function queueItemFor(hit: MusicHit, source: SourceHit): QueueItem | null {
  const base = { key: queueKey(), title: hit.title, artist: hit.artist, cover: hit.cover }
  switch (source.kind) {
    case 'local':
    case 'drive':
      return { ...base, source: source.kind, ref: source.ref, cover: source.cover ?? hit.cover }
    case 'youtube': {
      const track = source.payload as YouTubeTrack
      return { ...base, source: 'youtube', ref: track.videoId, cover: track.thumbnail, durationSec: track.durationSec, youtube: track }
    }
    case 'deezer':
      return source.quality === 'preview' && source.previewUrl
        ? { ...base, source: 'preview', ref: source.previewUrl }
        : null
    default:
      return null
  }
}

/**
 * ניגון ממקור שנבחר.
 *
 * מקור שנכנס לתור (מקומי, דרייב, YouTube, קטע) מתחיל תור: השיר שנבחר,
 * ואחריו התוצאות שאחריו — כל אחת מהמקור המועדף שלה שנכנס לתור. כך
 * לחיצה על תוצאה ממשיכה לנגן את הבאות, כמו ב-Spotify.
 * ‏Spotify ו-Deezer מלא מתנגנים בנגנים שלהם, מחוץ לתור.
 */
export async function playSource(
  hit: MusicHit,
  source: SourceHit,
  following: MusicHit[] = [],
  opts: { deezerPremium?: boolean } = {}
): Promise<{ ok: boolean; reason?: string }> {
  const item = queueItemFor(hit, source)
  if (item) {
    const rest = following
      .map((next) => {
        const queueable = next.sources.find((s) => queueItemFor(next, s))
        return queueable ? queueItemFor(next, queueable) : null
      })
      .filter((next): next is QueueItem => next !== null)
    useQueue.getState().playList([item, ...rest], 0)
    return { ok: true }
  }
  useQueue.getState().detach()
  const result = source.payload as SearchResult
  return activate({ ...result, origin: 'music', deezerPremium: opts.deezerPremium })
}

export function useUnifiedSearch(query: string, cards: Card[], deezerPremium: boolean): UnifiedSearch {
  const q = query.trim()
  const [catalog, setCatalog] = useState<SearchResult[]>([])
  const [cached, setCached] = useState<YouTubeTrack[]>([])
  const [youtube, setYouTube] = useState<(YouTubeResult & { query: string }) | null>(null)
  const [busy, setBusy] = useState(false)
  const run = useRef(0)

  const library = useMemo(() => libraryHits(cards), [cards])

  useEffect(() => {
    if (q.length < 2) {
      setCatalog([])
      setCached([])
      setBusy(false)
      return
    }
    const id = ++run.current
    setBusy(true)
    void window.cinema.youtube.cached(q).then((tracks) => id === run.current && setCached(tracks)).catch(() => undefined)
    const timer = window.setTimeout(() => {
      void window.cinema.search.run(q)
        .then((groups) => {
          if (id === run.current) setCatalog(groups.find((g) => g.key === 'music')?.results ?? [])
        })
        .catch(() => id === run.current && setCatalog([]))
        .finally(() => id === run.current && setBusy(false))
    }, 280)
    return () => window.clearTimeout(timer)
  }, [q])

  const submitYouTube = (): void => {
    if (q.length < 2) return
    const query = q
    setBusy(true)
    void window.cinema.youtube.search(query)
      .then((res) => setYouTube({ ...res, query }))
      .finally(() => setBusy(false))
  }

  const hits = useMemo(() => {
    if (q.length < 2) return []
    const live = youtube?.query === q ? youtube.tracks : []
    return aggregate(q, [
      ...library,
      ...catalogHits(catalog, deezerPremium),
      ...youTubeHits([...live, ...cached])
    ])
  }, [q, library, catalog, cached, youtube, deezerPremium])

  return { hits, busy, youtube: youtube?.query === q ? youtube : null, submitYouTube }
}
