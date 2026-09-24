import type { Http } from '../ports'

/*
 * ה-HTTP מוזרק. במחשב זה net.fetch של Electron — הוא מכבד את הפרוקסי
 * ואת מאגר האישורים של Windows, ובלעדיו אנטי-וירוס ששובר HTTPS מפיל
 * כל בקשה. במובייל זה fetch רגיל. הלוגיקה כאן לא יודעת ולא צריכה.
 */
let http: Http = () => Promise.reject(new Error('לא הוזרק HTTP. יש לקרוא ל-configure תחילה.'))
export function configure(deps: { http: Http }): void {
  http = deps.http
}
const netFetch: Http = (url, init) => http(url, init)
/**
 * פותר כותרים בעברית מול TMDB.
 *
 * הבעיה: חיפוש "המפרץ של בארון" ב-TMDB לרוב לא מחזיר כלום, כי לא לכל סרט
 * רשומה כותרת חלופית בעברית. התוצאה: אין כרזה ואין תקציר, או גרוע מזה —
 * התאמה לסרט אחר לגמרי.
 *
 * הפתרון: ויקיפדיה בעברית מכירה כמעט כל סרט בשמו העברי, וכל ערך מקושר
 * לפריט בוויקינתונים שמחזיק את מזהי TMDB ו-IMDb הרשמיים. כך מגיעים להתאמה
 * מדויקת במקום לניחוש טקסטואלי.
 *
 *   "המפרץ של בארון" → ויקיפדיה עברית → Q… → P4947 (TMDb) → הסרט הנכון
 */

const HE_WIKI = 'https://he.wikipedia.org/w/api.php'
const WIKIDATA = 'https://www.wikidata.org/w/api.php'
// מדיניות ויקימדיה דורשת User-Agent מזהה עם דרך ליצור קשר
const UA = 'BeitHakolnoa/1.0 (https://github.com/5645hm-a11y/beit-hakolnoa-releases)'

/**
 * ויקימדיה חוסמת ב-429 כשמפציצים אותה. כל הבקשות עוברות דרך תור אחד
 * עם מרווח מינימלי, וכיבוד Retry-After כשהיא בכל זאת מבקשת להאט.
 */
const MIN_GAP_MS = 260
let queue: Promise<unknown> = Promise.resolve()
let nextSlot = 0
let cooldownUntil = 0

function schedule<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const now = Date.now()
    const waitUntil = Math.max(nextSlot, cooldownUntil, now)
    if (waitUntil > now) await new Promise((r) => setTimeout(r, waitUntil - now))
    nextSlot = Date.now() + MIN_GAP_MS
    return job()
  })
  // התור לא נשבר גם אם משימה בודדת נכשלה
  queue = run.catch(() => undefined)
  return run
}

/** סוגי פריטים שאנחנו מוכנים לקבל כסרט או כסדרה */
const FILM_TYPES = new Set([
  'Q11424', // סרט
  'Q24869', // סרט עלילתי
  'Q202866', // סרט אנימציה
  'Q506240', // סרט טלוויזיה
  'Q93204', // סרט תיעודי
  'Q226730', // סרט אילם
  'Q20650540', // סרט אנימציה ממוחשבת
  'Q29168811' // סרט אנימציה עלילתי
])
const TV_TYPES = new Set([
  'Q5398426', // סדרת טלוויזיה
  'Q581714', // סדרת דרמה
  'Q1366112', // סדרת קומדיה
  'Q1259759', // מיני-סדרה
  'Q117467246', // סדרת אנימציה
  'Q15416' // תוכנית טלוויזיה
])

export interface Resolved {
  tmdbId: number | null
  tmdbType: 'movie' | 'tv' | null
  imdbId: string | null
  englishTitle: string | null
  hebrewTitle: string | null
  /** תקציר מוויקיפדיה בעברית — משמש כשאין תקציר עברי ב-TMDB */
  hebrewExtract: string | null
  year: number | null
  /** מה ויקינתונים אומר שזה — לא מה שניחשנו לפי מיקום הקובץ */
  kind: 'movie' | 'tv'
  source: 'wikidata'
}

/**
 * כל פנייה לוויקימדיה חייבת לעבור דרך כאן. פנייה ישירה עוקפת את התור,
 * חוטפת 429 ומחזירה null — מה שנראה כמו "לא נמצא" ולא כמו תקלה.
 */
export async function wikiGetJson<T>(url: URL): Promise<T | null> {
  return getJson<T>(url)
}

async function getJson<T>(url: URL): Promise<T | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await schedule(() =>
      netFetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000)
      }).catch(() => null)
    )
    if (!res) return null

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after') ?? '0')
      const waitMs = (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 2 ** attempt) * 1000
      cooldownUntil = Date.now() + Math.min(waitMs, 30_000)
      continue
    }
    if (!res.ok) return null
    try {
      return (await res.json()) as T
    } catch {
      return null
    }
  }
  return null
}

interface WikiPage {
  index?: number
  title: string
  extract?: string
  pageprops?: { wikibase_item?: string; disambiguation?: string }
}

/** מחפש בוויקיפדיה העברית ומחזיר מועמדים עם מזהה ויקינתונים ותקציר */
async function searchHebrewWiki(title: string): Promise<WikiPage[]> {
  const url = new URL(HE_WIKI)
  url.searchParams.set('action', 'query')
  url.searchParams.set('format', 'json')
  url.searchParams.set('formatversion', '2')
  url.searchParams.set('origin', '*')
  url.searchParams.set('generator', 'search')
  url.searchParams.set('gsrsearch', title)
  url.searchParams.set('gsrlimit', '6')
  url.searchParams.set('gsrnamespace', '0')
  url.searchParams.set('prop', 'pageprops|extracts')
  url.searchParams.set('ppprop', 'wikibase_item|disambiguation')
  url.searchParams.set('exintro', '1')
  url.searchParams.set('explaintext', '1')
  url.searchParams.set('exlimit', '6')

  const json = await getJson<{ query?: { pages?: WikiPage[] } }>(url)
  const pages = json?.query?.pages ?? []
  return pages
    .filter((p) => p.pageprops?.wikibase_item && p.pageprops.disambiguation === undefined)
    .sort((a, b) => (a.index ?? 99) - (b.index ?? 99))
}

interface Claim {
  mainsnak?: {
    datavalue?: { value?: unknown }
  }
}
interface Entity {
  id: string
  labels?: Record<string, { value: string }>
  sitelinks?: Record<string, { title?: string }>
  claims?: Record<string, Claim[]>
}

/** "חליפות (סדרת טלוויזיה)" → "חליפות" — ויקיפדיה מוסיפה סוגריים מבהירים */
export function stripQualifier(title: string): string {
  return title.replace(/\s*\([^)]*\)\s*$/, '').trim()
}

/**
 * "בוראט 2" → 2. מספר הסרט בסדרה, כפי שהוא מופיע בסוף הכותרת.
 *
 * גם "1" נחשב: "מהיר ועצבני 1" הוא הסרט הראשון, ובלי לזהות זאת החיפוש
 * מחזיר את הפופולרי ביותר בסדרה — שהוא כמעט אף פעם לא הראשון.
 */
export function sequelNumber(s: string): number | null {
  const m = s.trim().match(/(?:^|\s)(\d{1,2})$/)
  if (!m) return null
  const n = Number(m[1])
  return n >= 1 && n <= 12 ? n : null
}

export function normalizeHe(s: string): string {
  return s
    .replace(/[֑-ׇ]/g, '')
    .replace(/["'׳״]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase()
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
    prev = cur
  }
  return prev[b.length]
}

/**
 * דמיון 0..1. תעתיקים לעברית נכתבים בכמה צורות ("דאונטון"/"דאונטאון"),
 * ולכן השוואת מחרוזות מדויקת לבדה מפספסת התאמות נכונות.
 */
export function similarity(a: string, b: string): number {
  const x = normalizeHe(a)
  const y = normalizeHe(b)
  if (!x || !y) return 0
  if (x === y) return 1
  const max = Math.max(x.length, y.length)
  return 1 - levenshtein(x, y) / max
}

function claimString(entity: Entity, prop: string): string | null {
  const v = entity.claims?.[prop]?.[0]?.mainsnak?.datavalue?.value
  return typeof v === 'string' ? v : null
}

function claimEntityIds(entity: Entity, prop: string): string[] {
  return (entity.claims?.[prop] ?? [])
    .map((c) => c.mainsnak?.datavalue?.value)
    .filter((v): v is { id: string } => typeof v === 'object' && v !== null && 'id' in v)
    .map((v) => v.id)
}

function claimYear(entity: Entity, prop: string): number | null {
  const v = entity.claims?.[prop]?.[0]?.mainsnak?.datavalue?.value
  if (typeof v === 'object' && v !== null && 'time' in v) {
    const t = (v as { time: string }).time
    const m = t.match(/(\d{4})/)
    if (m) return Number(m[1])
  }
  return null
}

async function loadEntities(ids: string[]): Promise<Record<string, Entity>> {
  if (ids.length === 0) return {}
  const url = new URL(WIKIDATA)
  url.searchParams.set('action', 'wbgetentities')
  url.searchParams.set('format', 'json')
  url.searchParams.set('origin', '*')
  url.searchParams.set('ids', ids.slice(0, 20).join('|'))
  url.searchParams.set('props', 'labels|claims|sitelinks')
  url.searchParams.set('languages', 'en|he')
  const json = await getJson<{ entities?: Record<string, Entity> }>(url)
  return json?.entities ?? {}
}

interface Scored {
  score: number
  resolved: Resolved
}

/**
 * כל מה שוויקיפדיה מחזירה על השאילתה, מדורג אבל בלי סף.
 *
 * `resolveHebrewTitle` לוקח מכאן את הראשון אם הוא עבר את הסף. הבחירה
 * בעזרת מודל שפה לוקחת את כל הרשימה — היא נדרשת דווקא כשהשם בדרייב
 * מבולגן, ואז הדמיון הטקסטואלי נמוך והסף חוסם התאמה נכונה.
 */
async function scoreCandidates(
  clean: string,
  year: number | null,
  preferred: 'movie' | 'tv'
): Promise<Scored[]> {
  const pages = await searchHebrewWiki(year ? `${clean} ${year}` : clean)
  const fallbackPages = pages.length ? pages : year ? await searchHebrewWiki(clean) : []
  const candidates = (pages.length ? pages : fallbackPages).slice(0, 6)
  if (candidates.length === 0) return []

  const qids = candidates.map((p) => p.pageprops!.wikibase_item!).filter(Boolean)
  const entities = await loadEntities(qids)

  const scored: Scored[] = []

  for (const page of candidates) {
    const qid = page.pageprops?.wikibase_item
    if (!qid) continue
    const entity = entities[qid]
    if (!entity) continue

    const types = claimEntityIds(entity, 'P31')
    const isFilm = types.some((t) => FILM_TYPES.has(t))
    const isTv = types.some((t) => TV_TYPES.has(t))
    if (!isFilm && !isTv) continue

    const tmdbMovie = claimString(entity, 'P4947')
    const tmdbTv = claimString(entity, 'P4983')
    const imdbId = claimString(entity, 'P345')
    const entityYear = claimYear(entity, 'P577') ?? claimYear(entity, 'P571')

    let tmdbType: 'movie' | 'tv' | null = null
    let tmdbId: number | null = null
    if (isFilm && tmdbMovie) {
      tmdbType = 'movie'
      tmdbId = Number(tmdbMovie)
    } else if (isTv && tmdbTv) {
      tmdbType = 'tv'
      tmdbId = Number(tmdbTv)
    } else if (tmdbMovie) {
      tmdbType = 'movie'
      tmdbId = Number(tmdbMovie)
    } else if (tmdbTv) {
      tmdbType = 'tv'
      tmdbId = Number(tmdbTv)
    }
    if (tmdbId !== null && !Number.isFinite(tmdbId)) tmdbId = null

    if (tmdbId === null && !imdbId) continue

    const bare = stripQualifier(page.title)
    const heLabel = entity.labels?.he?.value ? stripQualifier(entity.labels.he.value) : ''
    const sim = Math.max(similarity(bare, clean), heLabel ? similarity(heLabel, clean) : 0)
    const contains =
      normalizeHe(bare).includes(normalizeHe(clean)) || normalizeHe(clean).includes(normalizeHe(bare))

    let titleScore = 0
    if (sim === 1) titleScore = 60
    else if (sim >= 0.85) titleScore = 45
    else if (contains) titleScore = 30
    else if (sim >= 0.7) titleScore = 20

    const yearExact = Boolean(year && entityYear && entityYear === year)
    /*
     * בלי שום קרבה בשם זו לא התאמה, זו סתם תוצאת חיפוש.
     *
     * שנה תואמת אינה תחליף. ויקיפדיה מחזירה שישה ערכים לכל שאילתה,
     * ותמיד יימצא ביניהם אחד מאותה שנה: "שלי לעולמים 2018" קיבל כך
     * את "עולם היורה: נפילת הממלכה" — כרזה ותקציר של סרט אחר לגמרי,
     * רק כי שניהם יצאו ב-2018.
     */
    if (titleScore === 0) continue

    /*
     * "בוראט 2" מכיל את "בוראט", ולכן בלי בלימה הוא מקבל את הכרזה של הסרט
     * הראשון. אם המועמד לא נושא את אותו מספר — הוא כנראה הסרט הקודם בסדרה.
     * חריג: כשהשנה תואמת בדיוק, המספר הוא רק כינוי ("הארי פוטר 2" = "חדר הסודות").
     */
    const wantSequel = sequelNumber(clean)
    if (wantSequel !== null && !yearExact) {
      const candidateHasIt =
        sequelNumber(bare) === wantSequel ||
        (heLabel ? sequelNumber(heLabel) === wantSequel : false) ||
        new RegExp(`(^|\\s)${wantSequel}(\\s|$)`).test(bare)
      if (!candidateHasIt) continue
    }

    let score = titleScore
    score += Math.max(0, 12 - (page.index ?? 0) * 3)
    if (tmdbId !== null) score += 25
    if (imdbId) score += 10
    if ((preferred === 'movie' && isFilm) || (preferred === 'tv' && isTv)) score += 20
    else score -= 15
    if (year && entityYear) {
      if (entityYear === year) score += 35
      else if (Math.abs(entityYear - year) <= 1) score += 15
      else score -= 30
    }

    scored.push({
      score,
      resolved: {
        tmdbId,
        tmdbType,
        imdbId,
        englishTitle:
          entity.labels?.en?.value ?? (entity.sitelinks?.enwiki?.title
            ? stripQualifier(entity.sitelinks.enwiki.title)
            : null),
        hebrewTitle: entity.labels?.he?.value ?? page.title,
        hebrewExtract: page.extract?.trim() || null,
        year: entityYear,
        kind: isTv && !isFilm ? 'tv' : 'movie',
        source: 'wikidata'
      }
    })
  }

  scored.sort((a, b) => b.score - a.score)
  return scored
}

/**
 * מחזיר מזהה TMDB/IMDb מדויק לכותר בעברית, או null אם לא נמצא.
 * @param preferred הסוג שאנחנו מצפים לו לפי מיקום הקובץ בדרייב
 */
export async function resolveHebrewTitle(
  title: string,
  year: number | null,
  preferred: 'movie' | 'tv'
): Promise<Resolved | null> {
  const clean = title.trim()
  if (clean.length < 2) return null
  const scored = await scoreCandidates(clean, year, preferred)
  if (scored.length === 0) return null
  // סף מינימלי — עדיף בלי התאמה מאשר התאמה שגויה
  return scored[0].score >= 25 ? scored[0].resolved : null
}
