import type { MediaItem } from '../library/types'
import { collapseProviders } from '../../shared/providers'
import type { TmdbProvider } from '../../adapters/provider-tmdb'
import type { DeezerProvider } from '../../adapters/provider-deezer'
import type { SpotifyProvider } from '../../adapters/provider-spotify'
import { normalizeKey } from '../../legacy_services/titles'
import type { SearchGroup, SearchResult, WatchOption } from './types'

/**
 * חיפוש מאוחד.
 *
 * שאילתה אחת יוצאת במקביל לכל המקורות. הדירוג הוא לפי *מה אפשר לנגן
 * עכשיו*: קובץ שיש לך גובר על מנוי, ומנוי גובר על השכרה. מי שמחפש
 * סרט רוצה קודם כול לדעת אם הוא כבר אצלו.
 *
 * הערה על הפלטפורמות: אין API ציבורי לקטלוג של נטפליקס, דיסני או
 * פריים, ואין דרך חוקית לנגן מהן באפליקציה שלנו. מה שכן אפשר —
 * וזה מה שנעשה כאן — הוא לדעת דרך TMDB איפה כל כותר זמין, ולתת
 * קישור ישיר. חיפוש מלא, נגינה של מה שבאמת שלנו.
 */

export interface SearchDeps {
  tmdb: TmdbProvider
  deezer: DeezerProvider
  spotify: SpotifyProvider
  /** אזור לזמינות בפלטפורמות */
  region: string
  /**
   * שם המקור המקומי, בשפת הממשק.
   *
   * הליבה אינה יודעת לתרגם — היא מקבלת את הטקסט מוכן, וכך היא
   * נשארת נקייה מ-Electron ומ-i18n גם בגרסת המובייל.
   */
  localLabel: string
  /** "{n} פרקים" בשפת הממשק, עם {n} כמציין מקום */
  episodesLabel: (n: number) => string
  /**
   * ספרייה בלבד.
   *
   * כשהוא דלוק החיפוש אינו יוצא לרשת כלל, ומחזיר רק את מה שיש
   * למשתמש. ברירת המחדל היא `false` כדי שקורא קיים לא ישתנה בשקט.
   */
  localOnly?: boolean
}

/** כתובת מלאה ללוגו הפלטפורמה, או null כשאין */
function logoUrl(deps: SearchDeps, path: string | null): string | null {
  return path ? deps.tmdb.imageUrl(path, 'w500') : null
}

/** התאמה רופפת בין שאילתה לכותר, לסינון תוצאות ספרייה */
function matches(item: MediaItem, query: string): boolean {
  const q = normalizeKey(query)
  const meta = item.meta && !item.meta.notFound ? item.meta : null
  return [item.title, item.fileName, meta?.title, meta?.originalTitle]
    .filter((value): value is string => Boolean(value))
    .some((value) => fuzzyContains(normalizeKey(value), q))
}

function editDistance(a: string, b: string): number {
  if (!a) return b.length
  if (!b) return a.length
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + Number(a[i - 1] !== b[j - 1])
      )
    }
    previous = current
  }
  return previous[b.length]
}

function fuzzyContains(value: string, query: string): boolean {
  if (!query || value.includes(query)) return true
  const maxDistance = query.length >= 8 ? 2 : query.length >= 5 ? 1 : 0
  if (maxDistance === 0) return false
  const words = value.split(/\s+/).filter(Boolean)
  return words.some((word) => editDistance(word, query) <= maxDistance) || editDistance(value, query) <= maxDistance
}

/** תוויות שהליבה אינה יודעת לתרגם בעצמה */
export interface LibraryLabels {
  local: string
  episodes: (n: number) => string
}

/** מהספרייה: מה שכבר אצלנו ואפשר לנגן מיד */
export function searchLibrary(
  items: MediaItem[],
  query: string,
  labels: LibraryLabels,
  limit = 24
): SearchResult[] {
  const q = query.trim()
  if (!q) return []

  const groups = new Map<string, MediaItem[]>()
  for (const item of items) {
    if (!matches(item, q)) continue
    const key =
      item.kind === 'episode'
        ? `series|${normalizeKey(item.title)}`
        : `${item.kind}|${normalizeKey(item.title)}|${item.year ?? ''}`
    const arr = groups.get(key)
    if (arr) arr.push(item)
    else groups.set(key, [item])
  }

  const out: SearchResult[] = []
  for (const group of groups.values()) {
    const lead = group.find((i) => i.meta && !i.meta.notFound) ?? group[0]
    if (!lead) continue
    const meta = lead.meta && !lead.meta.notFound ? lead.meta : null
    const where = lead.source === 'gdrive' ? 'Google Drive' : labels.local
    out.push({
      id: `lib:${lead.id}`,
      origin: 'library',
      title: meta?.title ?? lead.title,
      subtitle:
        lead.kind === 'episode'
          ? `${labels.episodes(group.length)} · ${where}`
          : `${lead.year ?? ''}${lead.year ? ' · ' : ''}${where}`,
      poster: meta?.poster ?? null,
      year: meta?.year ?? lead.year,
      rating: meta?.rating ?? 0,
      playable: true,
      itemId: lead.id,
      sourceLabel: where
    })
  }
  return out.slice(0, limit)
}

/** מ-TMDB: כותרים שאינם אצלנו, עם מידע איפה אפשר לצפות בהם */
async function searchStreaming(
  deps: SearchDeps,
  query: string,
  exclude: Set<string>,
  limit = 10
): Promise<SearchResult[]> {
  if (!deps.tmdb.enabled()) return []

  const [movies, shows] = await Promise.all([
    deps.tmdb.search('movie', query, null),
    deps.tmdb.search('tv', query, null)
  ])
  const merged = [...movies.map((r) => ({ r, type: 'movie' as const })), ...shows.map((r) => ({ r, type: 'tv' as const }))]
    .filter(({ r }) => !exclude.has(normalizeKey(r.title)) && !exclude.has(normalizeKey(r.originalTitle)))
    .sort((a, b) => b.r.popularity - a.r.popularity)
    .slice(0, limit)

  // הזמינות נשלפת במקביל — סדרתית זה עשר הלוך-ושוב
  return Promise.all(
    merged.map(async ({ r, type }) => {
      // Availability is enrichment, not a prerequisite for showing the title. A slow
      // JustWatch lookup must never erase an otherwise valid TMDB movie/TV result.
      const providers = await withTimeout(
        deps.tmdb.watchProviders(type, r.id, deps.region),
        2500,
        null
      )
      const watch: WatchOption[] = collapseProviders([
        // הלוגו נמסר ככתובת מלאה: הממשק אינו יודע להרכיב נתיבי TMDB
        ...(providers?.flatrate ?? []).map((p) => ({ provider: p.name, logo: logoUrl(deps, p.logoPath), kind: 'flatrate' as const })),
        ...(providers?.rent ?? []).map((p) => ({ provider: p.name, logo: logoUrl(deps, p.logoPath), kind: 'rent' as const })),
        ...(providers?.buy ?? []).map((p) => ({ provider: p.name, logo: logoUrl(deps, p.logoPath), kind: 'buy' as const }))
      ], (w) => w.provider, (w) => w.kind)
      return {
        id: `tmdb:${type}:${r.id}`,
        origin: 'catalog' as const,
        title: r.title || r.originalTitle,
        subtitle: [r.year, r.originalTitle !== r.title ? r.originalTitle : null].filter(Boolean).join(' · '),
        poster: r.posterPath ? deps.tmdb.imageUrl(r.posterPath, 'w500') : null,
        year: r.year,
        rating: r.rating,
        // אי אפשר לנגן תוכן של פלטפורמות אצלנו, ולכן לעולם לא
        playable: false,
        watch,
        externalUrl: providers?.link ?? undefined,
        sourceLabel: watch[0]?.provider ?? 'TMDB'
      }
    })
  )
}

/**
 * דירוג בתוך קבוצת הסטרימינג: מנוי לפני השכרה, ופופולרי לפני נדיר.
 * כותר שאינו זמין בשום מקום יורד לתחתית — הוא מידע, לא אפשרות.
 */
function streamingRank(r: SearchResult): number {
  const w = r.watch ?? []
  if (w.some((x) => x.kind === 'flatrate')) return 0
  if (w.some((x) => x.kind === 'rent')) return 1
  if (w.length > 0) return 2
  return 3
}

/**
 * גבול זמן לכל מקור בנפרד.
 *
 * מקור אחד שנתקע לא ישאיר את החיפוש כולו תלוי — מוטב להחזיר את מה
 * שהספיק להגיע. בלי זה שירות חיצוני איטי מקפיא את שורת החיפוש.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))
  ])
}

const SOURCE_TIMEOUT_MS = 9000

function musicKey(result: SearchResult): { title: string; artist: string } {
  return {
    title: normalizeKey(result.title),
    artist: normalizeKey(result.subtitle.split(/\s*[·•]\s*/)[0] ?? '')
  }
}

/** Pair Spotify rows with the equivalent Deezer preview without exposing another click. */
export function attachMusicFallbacks(
  spotify: SearchResult[],
  deezer: SearchResult[]
): SearchResult[] {
  const previews = deezer.filter((result) => Boolean(result.playUri)).map((result) => ({ result, ...musicKey(result) }))
  return spotify.map((result) => {
    const key = musicKey(result)
    const fallback = previews.find(
      (candidate) => candidate.title === key.title && (
        !candidate.artist || !key.artist ||
        candidate.artist.includes(key.artist) || key.artist.includes(candidate.artist)
      )
    )
    return fallback?.result.playUri ? { ...result, fallbackPlayUri: fallback.result.playUri } : result
  })
}

export async function unifiedSearch(
  deps: SearchDeps,
  items: MediaItem[],
  query: string
): Promise<SearchGroup[]> {
  const q = query.trim()
  if (q.length < 2) return []

  const library = searchLibrary(items, q, { local: deps.localLabel, episodes: deps.episodesLabel })
  // כותר שכבר אצלנו לא יופיע שוב תחת "איפה לצפות"
  const owned = new Set(library.map((r) => normalizeKey(r.title)))

  /*
   * ספרייה בלבד: החיפוש נעצר כאן.
   *
   * היציאה מוקדמת ולא סינון של התוצאות בסוף, וזה ההבדל שחשוב: מצב
   * שמסנן בסוף עדיין שולח את השאילתה של המשתמש ל-TMDB, ל-Deezer
   * ול-Spotify. מי שמכבה תוכן רשת מצפה שגם החיפוש שלו לא ייצא החוצה.
   */
  if (deps.localOnly) return library.length > 0 ? [{ key: 'library', results: library }] : []

  const [streaming, deezer, spotify] = await Promise.all([
    withTimeout(searchStreaming(deps, q, owned), SOURCE_TIMEOUT_MS, [] as SearchResult[]),
    withTimeout(deps.deezer.search(q), SOURCE_TIMEOUT_MS, [] as SearchResult[]),
    withTimeout(deps.spotify.search(q), SOURCE_TIMEOUT_MS, [] as SearchResult[])
  ])

  const music = [...attachMusicFallbacks(spotify, deezer), ...deezer]
  const groups: SearchGroup[] = []

  if (library.length > 0) {
    groups.push({ key: 'library', results: library })
  }
  if (streaming.length > 0) {
    groups.push({
      key: 'streaming',
      results: streaming.sort((a, b) => streamingRank(a) - streamingRank(b) || b.rating - a.rating)
    })
  }
  if (music.length > 0) {
    groups.push({ key: 'music', results: music })
  }
  return groups
}
