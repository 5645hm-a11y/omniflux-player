import type { MediaItem, MediaMeta } from '../library/types'
import type { TmdbProvider, TmdbResult } from '../../adapters/provider-tmdb'
import { resolveHebrewTitle, similarity, normalizeHe } from '../../legacy_services/hebrew'
import { isHebrewText, normalizeKey } from '../../legacy_services/titles'
import { startCleaning, aiEnabled, aiQuotaExhausted, type AiTitle } from '../../legacy_services/names-ai'

/**
 * זיהוי כותרים.
 *
 * הסדר נקבע לפי מה שנמדד בגרסה הקודמת על מאות כותרים אמיתיים:
 *
 *   1. כותר עברי → ויקיפדיה → ויקינתונים → מזהה TMDB מדויק.
 *      חיפוש טקסטואלי של שם עברי ב-TMDB כמעט תמיד נכשל או מתאים
 *      סרט אחר.
 *   2. כותר לועזי → חיפוש ישיר ב-TMDB, שם הוא עובד היטב.
 *   3. מה שנשאר → מודל שפה מנקה את השם, ואז שוב TMDB — אבל רק עם
 *      אישור חיצוני, כי שם עברי קצר מתאים במקרה לסרט אחר לגמרי.
 */

/** כמה חפיפת מילים נדרשת כדי לקבל התאמה */
const WORD_MATCH = 0.7
/** כמה הכותר במאגר צריך להזכיר את השם שבקובץ */
const ECHO = 0.6

export interface IdentifyDeps {
  tmdb: TmdbProvider
  /** שפת המטא-דאטה הנוכחית — נשמרת בכל פריט כדי לזהות מטמון ישן */
  locale: string
  /** טקסטים שהליבה מציגה, מוכנים בשפת הממשק */
  labels: { quotaSpent: string; identifying: (done: number, total: number) => string }
  /** מוריד כרזה ומחזיר נתיב מקומי, או null */
  cachePoster: (url: string, key: string) => Promise<string | null>
  onProgress?: (done: number, total: number, title: string) => void
  signal?: { canceled: boolean }
}

function wordSimilarity(a: string, b: string): number {
  const A = new Set(normalizeKey(a).split(' ').filter(Boolean))
  const B = new Set(normalizeKey(b).split(' ').filter(Boolean))
  if (A.size === 0 || B.size === 0) return 0
  let hits = 0
  for (const w of B) if (A.has(w)) hits++
  return hits / Math.max(A.size, B.size)
}

/**
 * האם הכותר שבמאגר מהדהד את השם שבקובץ.
 * הכלה נחשבת התאמה: "חברים (פרנס')" מכיל את "חברים".
 */
function echoes(fileName: string, dbTitle: string): boolean {
  const a = normalizeHe(fileName)
  const b = normalizeHe(dbTitle)
  if (!a || !b) return false
  const short = a.length <= b.length ? a : b
  const long = a.length <= b.length ? b : a
  if (short.length >= 4 && short.length / long.length >= 0.4 && long.includes(short)) return true
  return similarity(a, b) >= ECHO
}

function emptyMeta(item: MediaItem, locale: string): MediaMeta {
  return {
    title: item.title,
    originalTitle: '',
    overview: '',
    year: item.year,
    genres: [],
    rating: 0,
    runtimeMinutes: null,
    poster: null,
    backdrop: null,
    tmdbId: null,
    tmdbType: null,
    notFound: true,
    fetchedAt: Date.now(),
    locale
  }
}

async function toMeta(
  deps: IdentifyDeps,
  item: MediaItem,
  type: 'movie' | 'tv',
  result: TmdbResult
): Promise<MediaMeta> {
  // תוצאת חיפוש חסרה ז'אנרים ואורך — הפרטים המלאים יושבים בנתיב אחר
  const full = (await deps.tmdb.details(type, result.id)) ?? result

  let posterPath = full.posterPath
  let backdropPath = full.backdropPath
  if (!posterPath || !backdropPath) {
    const extra = await deps.tmdb.anyImage(type, result.id)
    posterPath = posterPath ?? extra.poster
    backdropPath = backdropPath ?? extra.backdrop
  }

  const [poster, backdrop] = await Promise.all([
    posterPath ? deps.cachePoster(deps.tmdb.imageUrl(posterPath, 'w500'), `p${result.id}-${deps.locale}`) : null,
    backdropPath ? deps.cachePoster(deps.tmdb.imageUrl(backdropPath, 'w1280'), `b${result.id}-${deps.locale}`) : null
  ])

  return {
    title: full.title || item.title,
    originalTitle: full.originalTitle,
    overview: full.overview,
    year: full.year,
    genres: full.genres,
    rating: full.rating,
    runtimeMinutes: full.runtimeMinutes,
    poster,
    backdrop,
    tmdbId: result.id,
    tmdbType: type,
    notFound: false,
    fetchedAt: Date.now(),
    locale: deps.locale
  }
}

/** בוחר את ההתאמה הטובה: שם מדויק גובר על פופולריות */
function pickBest(results: TmdbResult[], query: string, year: number | null): TmdbResult | null {
  if (results.length === 0) return null
  const key = normalizeKey(query)
  const scored = results.map((r) => {
    let score = 0
    const t = normalizeKey(r.title)
    const o = normalizeKey(r.originalTitle)
    if (t === key || o === key) score += 100
    else if (t.startsWith(key) || key.startsWith(t)) score += 50
    else if (t.includes(key) || key.includes(t)) score += 25
    if (year && r.year) {
      if (r.year === year) score += 40
      else if (Math.abs(r.year - year) <= 1) score += 20
      else score -= 10
    }
    score += Math.min(r.popularity / 10, 15)
    if (r.posterPath) score += 5
    return { r, score }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored[0]?.r ?? null
}

/** זיהוי של פריט אחד, בלי עזרת המודל */
async function identifyOne(deps: IdentifyDeps, item: MediaItem): Promise<MediaMeta> {
  const title = item.title.trim()
  if (!title || item.kind === 'audio') return emptyMeta(item, deps.locale)

  const primary: 'movie' | 'tv' = item.kind === 'episode' ? 'tv' : 'movie'
  const secondary: 'movie' | 'tv' = primary === 'tv' ? 'movie' : 'tv'

  // ---- 1. עברית דרך ויקינתונים ----
  let englishTitle: string | null = null
  if (isHebrewText(title)) {
    const resolved = await resolveHebrewTitle(title, item.year, primary)
    if (resolved) {
      englishTitle = resolved.englishTitle
      if (resolved.tmdbId !== null && resolved.tmdbType) {
        const direct = await deps.tmdb.details(resolved.tmdbType, resolved.tmdbId)
        if (direct) return toMeta(deps, item, resolved.tmdbType, direct)
      }
      if (resolved.imdbId) {
        const found = await deps.tmdb.findByImdb(resolved.imdbId)
        if (found) return toMeta(deps, item, found.type, found.result)
      }
    }
  }

  // ---- 2. חיפוש ישיר ----
  const queries = [englishTitle, title].filter((q): q is string => Boolean(q?.trim()))
  for (const query of queries) {
    for (const type of [primary, secondary]) {
      for (const year of [item.year, null]) {
        const results = await deps.tmdb.search(type, query, year)
        const best = pickBest(results, query, item.year)
        if (!best) continue
        if (
          wordSimilarity(query, best.title) >= WORD_MATCH ||
          wordSimilarity(query, best.originalTitle) >= WORD_MATCH
        ) {
          return toMeta(deps, item, type, best)
        }
      }
    }
  }

  return emptyMeta(item, deps.locale)
}

/**
 * ניסיון שני, אחרי שהמודל קרא את שם הקובץ.
 *
 * שני דברים יכולים לצאת מכאן ושניהם שווים משהו: התאמה במאגר, או
 * לפחות שם נקי. רוב הכותרים שלא נמצאו הם הפקות שאינן בשום מאגר, ושם
 * התיקון היחיד האפשרי הוא הכותר עצמו.
 *
 * התאמה מתקבלת רק עם אישור חיצוני — כותר לועזי שהמודל ידע, או שנה
 * שהמאגר מאשר — ובנוסף, כשהשם בקובץ עברי, הכותר שבמאגר חייב להדהד
 * אותו. נמדד: בלי זה "המהפך" קיבל את The Do-Over ו"העיתון" את The Post.
 */
async function withAiHelp(deps: IdentifyDeps, item: MediaItem, ai: AiTitle): Promise<MediaMeta> {
  const better = ai.title.trim()
  const current = emptyMeta(item, deps.locale)
  if (!better) return current

  const nameChanged = normalizeKey(better) !== normalizeKey(item.title)
  const withName = nameChanged ? { ...current, title: better } : current

  const queries = [...new Set([ai.en, nameChanged ? better : null].filter(Boolean))] as string[]
  if (queries.length === 0) return withName
  const wantYear = ai.year ?? item.year
  const inFile = isHebrewText(item.title) ? item.title : isHebrewText(better) ? better : null

  const primary: 'movie' | 'tv' = item.kind === 'episode' ? 'tv' : 'movie'
  for (const query of queries) {
    for (const type of [primary, primary === 'tv' ? 'movie' : 'tv'] as const) {
      const results = await deps.tmdb.search(type, query, wantYear)
      const best = pickBest(results, query, wantYear)
      if (!best) continue
      if (
        wordSimilarity(query, best.title) < WORD_MATCH &&
        wordSimilarity(query, best.originalTitle) < WORD_MATCH
      ) {
        continue
      }
      const byOriginal = Boolean(ai.en) && wordSimilarity(ai.en!, best.originalTitle) >= WORD_MATCH
      const byYear = wantYear !== null && best.year === wantYear
      if (!byOriginal && !byYear) continue
      if (inFile && !echoes(inFile, best.title)) continue
      return toMeta(deps, item, type, best)
    }
  }
  return withName
}

/**
 * מזהה את כל מה שעוד לא זוהה.
 *
 * מחזיר את הפריטים עם המטא-דאטה. מה שכבר יש לו מטא-דאטה לא נבדק
 * שוב, חוץ מכותרים שלא נמצאו — אותם מנסים שוב פעם בשבוע.
 */
export async function identifyAll(
  deps: IdentifyDeps,
  items: MediaItem[],
  opts: { force?: boolean } = {}
): Promise<MediaItem[]> {
  const WEEK = 7 * 24 * 3600e3
  // TMDB permits API-content caching for at most six months. Refresh older
  // matches during the next scan instead of retaining stale metadata forever.
  const MAX_METADATA_AGE = 180 * 24 * 3600e3
  const pending = items.filter((i) => {
    if (opts.force) return true
    if (!i.meta) return true
    if (Date.now() - i.meta.fetchedAt > MAX_METADATA_AGE) return true
    return i.meta.notFound && Date.now() - i.meta.fetchedAt > WEEK
  })

  const result = new Map(items.map((i) => [i.id, i]))
  let done = 0
  const total = pending.length
  let cursor = 0
  const LIMIT = 6

  const worker = async (): Promise<void> => {
    for (;;) {
      if (deps.signal?.canceled) return
      const i = cursor++
      const item = pending[i]
      if (!item) return
      try {
        result.set(item.id, { ...item, meta: await identifyOne(deps, item) })
      } catch {
        result.set(item.id, { ...item, meta: emptyMeta(item, deps.locale) })
      }
      done++
      deps.onProgress?.(done, total, item.title)
    }
  }
  await Promise.all(Array.from({ length: Math.min(LIMIT, pending.length) }, worker))

  /*
   * המשך הסריקה, לא שלב נפרד. רק מה שנכשל נשלח למודל: המכסה החינמית
   * היא מאה אלף אסימונים ליממה, ושליחת הספרייה כולה הייתה מבזבזת את
   * רובה על שמות שכבר זוהו.
   */
  if (aiEnabled() && !deps.signal?.canceled) {
    const stuck = [...result.values()].filter((i) => i.meta?.notFound && i.fileName)
    if (stuck.length > 0) {
      const cleaner = startCleaning(stuck.map((i) => i.fileName))
      let checked = 0
      for (const item of stuck) {
        if (deps.signal?.canceled) break
        const ai = await cleaner.get(item.fileName)
        try {
          result.set(item.id, { ...item, meta: await withAiHelp(deps, item, ai) })
        } catch {
          /* ממשיכים לבא בתור */
        }
        deps.onProgress?.(
          total,
          total,
          aiQuotaExhausted()
            ? deps.labels.quotaSpent
            : deps.labels.identifying(++checked, stuck.length)
        )
      }
      await cleaner.done
    }
  }

  return [...result.values()]
}
