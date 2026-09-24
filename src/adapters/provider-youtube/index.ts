import type { Http, Kv } from '../../legacy_services/ports'
import { parseTrackTitle } from '../../shared/track'
import type { YouTubeResult, YouTubeTrack } from '../../shared/api'

/**
 * YouTube — חיפוש מוזיקה, "פופולרי עכשיו", ופלייליסטים ציבוריים.
 *
 * ל-YouTube Music אין API רשמי; זה YouTube Data API v3, מסונן לקטגוריה
 * 10 (Music). הניגון עצמו אינו כאן: הוא עובר בנגן המוטמע הרשמי, גלוי,
 * כפי שתנאי YouTube דורשים — בלי חילוץ זרם ובלי שמע בלבד.
 *
 * המכסה היא העניין. כל משתמשי התוכנה חולקים פרויקט אחד — מפתח אחד
 * שצרוב בתוכנה — ולכן 10,000 יחידות ביום לכולם יחד. חיפוש עולה 100,
 * כל השאר עולה 1. מכאן שלושה כללים:
 *
 *   · חיפוש רק בלחיצה מפורשת, ולעולם לא בכל הקשה.
 *   · כל תשובה נשמרת על הדיסק: חיפוש חוזר, פלייליסט שנפתח שוב, ורשימת
 *     הפופולריים — אינם עולים דבר.
 *   · תקרה אישית לחיפושים ביום, כדי שמשתמש אחד לא ירוקן את המכסה של
 *     כולם; ו-quotaExceeded מהשרת עוצר הכול עד האיפוס (חצות בקליפורניה).
 */

const API = 'https://www.googleapis.com/youtube/v3'
const MUSIC_CATEGORY = '10'
/** חיפושים ביום למשתמש אחד. חיפוש עולה 100 יחידות ועוד אחת לפרטים: 15 × 101 ≈ 15% מהמכסה של כולם */
export const DAILY_SEARCHES = 15
const DAY_MS = 24 * 60 * 60 * 1000
const TTL = { search: 7 * DAY_MS, trending: 6 * 60 * 60 * 1000, playlist: 60 * 60 * 1000 }
const MAX_PLAYLIST_ITEMS = 200

export interface CacheEntry {
  at: number
  tracks: YouTubeTrack[]
  title?: string
}
export type YouTubeCache = Record<string, CacheEntry>
export interface QuotaState {
  /** יום המכסה, לפי שעון האוקיינוס השקט — שם היא מתאפסת */
  day: string
  searches: number
  exhausted: boolean
}

export interface YouTubeOptions {
  http: Http
  apiKey: string
  cache: Kv<YouTubeCache>
  quota: Kv<QuotaState>
  now?: () => number
}

/** היום שבו המכסה נספרת. YouTube מאפס אותה בחצות, שעון פסיפיק */
export function quotaDay(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date(ms))
}

/** ‏PT1H2M3S → שניות */
export function isoDuration(value: string | undefined): number {
  const match = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value ?? '')
  if (!match) return 0
  const [, d, h, m, s] = match.map((part) => Number(part ?? 0))
  return d * 86400 + h * 3600 + m * 60 + s
}

/**
 * הרעש שערוצים מוסיפים לשם השיר.
 *
 * "(Official Video)", "[Lyrics]", "| 4K Remaster" — כל אלה אינם שם השיר,
 * ובלי הניקוי הזה אותו שיר מקומי ומ-YouTube לא נראו כאותו שיר, והמילים
 * המסונכרנות לא נמצאו.
 */
const NOISE = /\s*[([][^)\]]*\b(official|video|audio|lyrics?|lyric video|visuali[sz]er|clip|remaster(ed)?|4k|hd|hq|mv|m\/v|live|video ?clip)\b[^)\]]*[)\]]/gi
// ‏\b אינו עובד מול עברית ב-JavaScript, ולכן המילים העבריות בתבנית נפרדת בלי גבולות מילה
const NOISE_HE = /\s*[([][^)\]]*(קליפ|רשמי|מילים|הופעה חיה)[^)\]]*[)\]]/g

export function cleanTitle(raw: string, channel: string): { title: string; artist: string } {
  const decoded = raw.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  const base = decoded
    .replace(NOISE, '')
    .replace(NOISE_HE, '')
    .replace(/\s*\|.*$/, '')
    // רעש בלי סוגריים בסוף השם: "Yellow Lyrics", "Hello Official Video"
    .replace(/\s+[-–]?\s*(official\s+(music\s+)?(video|audio)|lyric\s+video|lyrics?|audio|visuali[sz]er)\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  const parsed = parseTrackTitle(base)
  // ערוץ אוטומטי של YouTube Music ("Artist - Topic") וערוצי VEVO נושאים את שם האמן
  const channelArtist = channel.replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim()
  const same = (a: string, b: string): boolean => a.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '') === b.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
  /*
   * "Yellow - Coldplay": שם ואמן בסדר הפוך. כשהחלק השני הוא שם הערוץ,
   * הוא האמן — אחרת "Coldplay" הופיע כשם השיר ו-"Yellow" כאמן, ולא התאחד
   * עם אותו שיר ממקורות אחרים.
   */
  if (parsed.artist && channelArtist && same(parsed.track, channelArtist) && !same(parsed.artist, channelArtist)) {
    return { artist: parsed.track, title: parsed.artist }
  }
  return {
    artist: (parsed.artist || channelArtist).replace(/^@/, ''),
    title: parsed.track || base
  }
}

/** מזהה פלייליסט מקישור או מהמזהה עצמו */
export function playlistId(input: string): string | null {
  const text = input.trim()
  try {
    const list = new URL(text).searchParams.get('list')
    if (list && /^[\w-]{10,64}$/.test(list)) return list
  } catch {
    /* לא כתובת */
  }
  return /^(PL|OL|RD|UU|FL|LL)[\w-]{8,62}$/.test(text) ? text : null
}

interface VideoItem {
  id: string
  snippet?: { title?: string; channelTitle?: string; thumbnails?: Record<string, { url?: string }> }
  contentDetails?: { duration?: string }
  status?: { embeddable?: boolean }
}

export class YouTubeProvider {
  private readonly now: () => number

  constructor(private readonly opts: YouTubeOptions) {
    this.now = opts.now ?? Date.now
  }

  enabled(): boolean {
    return this.opts.apiKey.length > 0
  }

  /** כמה חיפושים נשארו היום, ואם השרת כבר אמר שהמכסה נגמרה */
  status(): { enabled: boolean; searchesLeft: number; exhausted: boolean } {
    const quota = this.todayQuota()
    return { enabled: this.enabled(), searchesLeft: Math.max(0, DAILY_SEARCHES - quota.searches), exhausted: quota.exhausted }
  }

  /**
   * חיפוש מוזיקה. שפה ואזור משפיעים על הדירוג — "מוזיקה רגועה" אצל
   * משתמש בעברית מחזירה גם מוזיקה ישראלית — ולכן הם חלק ממפתח המטמון.
   */
  async search(query: string, context: { language?: string; region?: string } = {}): Promise<YouTubeResult> {
    const q = query.trim().replace(/\s+/g, ' ').slice(0, 120)
    if (q.length < 2) return { tracks: [] }
    const language = /^[a-z]{2}$/.test(context.language ?? '') ? context.language! : ''
    const region = /^[A-Z]{2}$/.test(context.region ?? '') ? context.region! : ''
    const key = `search:${language}:${region}:${q.toLocaleLowerCase()}`
    const cached = this.cached(key, TTL.search)
    if (cached) return { tracks: cached.tracks, reason: 'cached' }
    if (!this.enabled()) return { tracks: [], reason: 'no-key' }
    const quota = this.todayQuota()
    if (quota.exhausted) return { tracks: [], reason: 'quota' }
    if (quota.searches >= DAILY_SEARCHES) return { tracks: [], reason: 'daily-limit' }

    this.opts.quota.write({ ...quota, searches: quota.searches + 1 })
    const found = await this.get('search', {
      part: 'snippet', type: 'video', videoCategoryId: MUSIC_CATEGORY, videoEmbeddable: 'true',
      maxResults: '20', q,
      ...(language ? { relevanceLanguage: language } : {}),
      ...(region ? { regionCode: region } : {})
    })
    if (!found.ok) return { tracks: [], reason: found.reason }
    const ids = (found.json.items as Array<{ id?: { videoId?: string } }> | undefined ?? [])
      .map((item) => item.id?.videoId)
      .filter((id): id is string => Boolean(id))
    const tracks = await this.videos(ids)
    this.store(key, { at: this.now(), tracks })
    return { tracks }
  }

  /**
   * מה שכבר נשמר מחיפושים קודמים — בלי בקשה ובלי מכסה.
   *
   * החיפוש האחוד רץ בכל הקשה על המקורות החינמיים; YouTube מצטרף אליו
   * כך — מהמטמון — ורק Enter שולח חיפוש חדש שעולה 100 יחידות. מחפשים
   * גם בשאילתות קודמות שהשאילתה הנוכחית היא התחלה שלהן ("coldpl" מוצא
   * את מה שנשמר ל-"coldplay").
   */
  cachedSearch(query: string): YouTubeTrack[] {
    const q = query.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
    if (q.length < 2) return []
    const all = this.opts.cache.read()
    const out: YouTubeTrack[] = []
    const seen = new Set<string>()
    for (const [key, entry] of Object.entries(all)) {
      if (!key.startsWith('search:') || this.now() - entry.at > TTL.search) continue
      const cachedQuery = key.split(':').slice(3).join(':')
      if (!cachedQuery.startsWith(q) && !q.startsWith(cachedQuery)) continue
      for (const track of entry.tracks) {
        if (!seen.has(track.videoId)) {
          seen.add(track.videoId)
          out.push(track)
        }
      }
    }
    return out.slice(0, 40)
  }

  /** המוזיקה הפופולרית עכשיו באזור — יחידה אחת, ונשמרת לשש שעות */
  async trending(region: string): Promise<YouTubeResult> {
    const regionCode = /^[A-Z]{2}$/.test(region) ? region : 'US'
    const key = `trending:${regionCode}`
    const cached = this.cached(key, TTL.trending)
    if (cached) return { tracks: cached.tracks, reason: 'cached' }
    if (!this.enabled()) return { tracks: [], reason: 'no-key' }
    if (this.todayQuota().exhausted) return { tracks: this.stale(key), reason: 'quota' }
    const res = await this.get('videos', {
      part: 'snippet,contentDetails,status', chart: 'mostPopular', videoCategoryId: MUSIC_CATEGORY,
      regionCode, maxResults: '50'
    })
    if (!res.ok) return { tracks: this.stale(key), reason: res.reason }
    const tracks = this.toTracks(res.json.items as VideoItem[] | undefined)
    this.store(key, { at: this.now(), tracks })
    return { tracks }
  }

  /** פלייליסט ציבורי או לא-רשום, לפי קישור — יחידה לכל חמישים שירים */
  async playlist(input: string): Promise<YouTubeResult & { title?: string }> {
    const id = playlistId(input)
    if (!id) return { tracks: [], reason: 'invalid' }
    const key = `playlist:${id}`
    const cached = this.cached(key, TTL.playlist)
    if (cached) return { tracks: cached.tracks, title: cached.title, reason: 'cached' }
    if (!this.enabled()) return { tracks: [], reason: 'no-key' }
    if (this.todayQuota().exhausted) return { tracks: this.stale(key), reason: 'quota' }

    const meta = await this.get('playlists', { part: 'snippet', id })
    if (!meta.ok) return { tracks: [], reason: meta.reason }
    const first = (meta.json.items as Array<{ snippet?: { title?: string } }> | undefined)?.[0]
    if (!first) return { tracks: [], reason: 'not-found' }

    const ids: string[] = []
    let pageToken = ''
    while (ids.length < MAX_PLAYLIST_ITEMS) {
      const page = await this.get('playlistItems', {
        part: 'contentDetails', playlistId: id, maxResults: '50', ...(pageToken ? { pageToken } : {})
      })
      if (!page.ok) break
      for (const item of (page.json.items as Array<{ contentDetails?: { videoId?: string } }> | undefined) ?? []) {
        if (item.contentDetails?.videoId) ids.push(item.contentDetails.videoId)
      }
      pageToken = typeof page.json.nextPageToken === 'string' ? page.json.nextPageToken : ''
      if (!pageToken) break
    }
    const tracks = await this.videos(ids.slice(0, MAX_PLAYLIST_ITEMS))
    const title = first.snippet?.title?.slice(0, 200)
    this.store(key, { at: this.now(), tracks, title })
    return { tracks, title }
  }

  // ---------- פנימי ----------

  /** פרטים מלאים — משך, ואם מותר להטמיע — בקבוצות של חמישים, יחידה לכל קבוצה */
  private async videos(ids: string[]): Promise<YouTubeTrack[]> {
    const out: YouTubeTrack[] = []
    for (let i = 0; i < ids.length; i += 50) {
      const res = await this.get('videos', { part: 'snippet,contentDetails,status', id: ids.slice(i, i + 50).join(',') })
      if (!res.ok) break
      out.push(...this.toTracks(res.json.items as VideoItem[] | undefined))
    }
    // הסדר של החיפוש או של הפלייליסט, ולא הסדר שבו videos החזיר
    const order = new Map(ids.map((id, index) => [id, index]))
    return out.sort((a, b) => (order.get(a.videoId) ?? 0) - (order.get(b.videoId) ?? 0))
  }

  private toTracks(items: VideoItem[] | undefined): YouTubeTrack[] {
    return (items ?? [])
      // סרטון שבעליו חסם הטמעה לא יתנגן בנגן שלנו; עדיף לא להציג אותו
      .filter((item) => item.status?.embeddable !== false && /^[\w-]{11}$/.test(item.id))
      .map((item) => {
        const channel = item.snippet?.channelTitle ?? ''
        const { title, artist } = cleanTitle(item.snippet?.title ?? '', channel)
        const thumbs = item.snippet?.thumbnails ?? {}
        return {
          videoId: item.id,
          title: title.slice(0, 200),
          artist: artist.slice(0, 160),
          channel: channel.slice(0, 160),
          thumbnail: thumbs.maxres?.url ?? thumbs.high?.url ?? thumbs.medium?.url ?? thumbs.default?.url ?? null,
          durationSec: isoDuration(item.contentDetails?.duration)
        }
      })
  }

  private async get(
    resource: string,
    params: Record<string, string>
  ): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; reason: 'quota' | 'error' }> {
    const url = new URL(`${API}/${resource}`)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    url.searchParams.set('key', this.opts.apiKey)
    try {
      const res = await this.opts.http(url, { signal: AbortSignal.timeout(10_000) })
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (res.ok) return { ok: true, json }
      const reasons = ((json.error as { errors?: Array<{ reason?: string }> } | undefined)?.errors ?? []).map((e) => e.reason)
      if (res.status === 403 && reasons.some((r) => r === 'quotaExceeded' || r === 'dailyLimitExceeded')) {
        this.opts.quota.write({ ...this.todayQuota(), exhausted: true })
        return { ok: false, reason: 'quota' }
      }
      return { ok: false, reason: 'error' }
    } catch {
      return { ok: false, reason: 'error' }
    }
  }

  private todayQuota(): QuotaState {
    const day = quotaDay(this.now())
    const stored = this.opts.quota.read()
    return stored.day === day ? stored : { day, searches: 0, exhausted: false }
  }

  private cached(key: string, ttl: number): CacheEntry | null {
    const entry = this.opts.cache.read()[key]
    return entry && this.now() - entry.at < ttl ? entry : null
  }

  /** מה שנשמר, גם אם ישן — עדיף רשימה מאתמול מאשר מסך ריק כשהמכסה נגמרה */
  private stale(key: string): YouTubeTrack[] {
    return this.opts.cache.read()[key]?.tracks ?? []
  }

  private store(key: string, entry: CacheEntry): void {
    const all = { ...this.opts.cache.read(), [key]: entry }
    // תקרה: 300 רשומות, הישנות יוצאות ראשונות
    const keys = Object.keys(all).sort((a, b) => all[b].at - all[a].at)
    for (const old of keys.slice(300)) delete all[old]
    this.opts.cache.write(all)
  }
}
