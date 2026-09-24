import type { Http } from '../ports'
import { normalizeHe, similarity, stripQualifier, wikiGetJson } from '../hebrew'

/*
 * ה-HTTP והמפתחות מוזרקים — המודול אינו יודע מאיפה הם מגיעים.
 */
let http: Http = () => Promise.reject(new Error('לא הוזרק HTTP. יש לקרוא ל-configure תחילה.'))
let keys = { googleApiKey: '', googleCseId: '' }
export function configure(deps: { http: Http; googleApiKey: string; googleCseId: string }): void {
  http = deps.http
  keys = { googleApiKey: deps.googleApiKey, googleCseId: deps.googleCseId }
}
const netFetch: Http = (url, init) => http(url, init)
const effectiveGoogleKey = (): string => keys.googleApiKey
const APP_CONFIG = {
  get googleCseId(): string {
    return keys.googleCseId
  }
}

/**
 * כרזות לכותרים שאינם במאגרי הסרטים — סדרות ישראליות, תקצירי מונדיאל,
 * הפקות מקומיות. שני מקורות, לפי סדר:
 *
 *   1. ויקיפדיה/ויקינתונים — חינם, בלי מפתח, מדויק כשיש ערך
 *   2. Google Programmable Search — חיפוש תמונות אמיתי, דורש מפתח
 */

const UA = 'BeitHakolnoa/1.0 (https://github.com/5645hm-a11y/beit-hakolnoa-releases)'
const CSE = 'https://www.googleapis.com/customsearch/v1'
const COMMONS = 'https://commons.wikimedia.org/wiki/Special:FilePath/'

/** פניות לוויקימדיה עוברות דרך התור המשותף כדי לא לחטוף 429 */
const wikiJson = wikiGetJson

export interface FoundImage {
  url: string
  source: 'wikipedia' | 'google'
}

async function getJson<T>(url: URL): Promise<T | null> {
  try {
    const res = await netFetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000)
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

/**
 * תמונה ראשית מוויקיפדיה בעברית.
 *
 * חיפוש בוויקיפדיה תמיד מחזיר משהו, גם כשאין ערך מתאים — ולכן חובה לוודא
 * ששם הערך שנמצא באמת קרוב לשם שחיפשנו. בלי הבדיקה הזו כותר כמו "עונה 9"
 * מקבל תמונה אקראית לגמרי, וכרזה שגויה גרועה מכרזה חסרה.
 */
export async function wikipediaImage(
  title: string,
  expected: string
): Promise<FoundImage | null> {
  const url = new URL('https://he.wikipedia.org/w/api.php')
  url.searchParams.set('action', 'query')
  url.searchParams.set('format', 'json')
  url.searchParams.set('formatversion', '2')
  url.searchParams.set('generator', 'search')
  url.searchParams.set('gsrsearch', title)
  url.searchParams.set('gsrlimit', '4')
  url.searchParams.set('gsrnamespace', '0')
  url.searchParams.set('prop', 'pageimages|pageprops')
  url.searchParams.set('ppprop', 'wikibase_item')
  // תמונה ממוזערת ולא המקור — ויקיפדיה מחזירה קבצים של עשרות מגה-בייט
  url.searchParams.set('piprop', 'thumbnail')
  url.searchParams.set('pithumbsize', '600')

  const json = await wikiJson<{
    query?: {
      pages?: Array<{
        index?: number
        title?: string
        thumbnail?: { source?: string }
        pageprops?: { wikibase_item?: string }
      }>
    }
  }>(url)

  const pages = (json?.query?.pages ?? [])
    .filter((p) => p.thumbnail?.source && p.title)
    .sort((a, b) => (a.index ?? 9) - (b.index ?? 9))

  const want = normalizeHe(expected)
  for (const p of pages) {
    const bare = normalizeHe(stripQualifier(p.title!))
    const close = similarity(bare, want) >= 0.8 || bare.includes(want) || want.includes(bare)
    if (!close) continue
    // שם דומה לא מספיק — הערך חייב להיות סרט או סדרה, לא מקצוע או מדינה
    const qid = p.pageprops?.wikibase_item
    if (!qid || !(await isWork(qid))) continue
    return { url: p.thumbnail!.source!, source: 'wikipedia' }
  }
  return null
}

/**
 * סוגי פריטים שמותר לקחת מהם תמונה. בלי הבדיקה הזו "שחקן כדורגל" מקבל
 * את התמונה מהערך על המקצוע, ו"ארגנטינה מצרים" את זו שביחסי החוץ.
 */
const WORK_TYPES = new Set([
  'Q11424', 'Q24869', 'Q202866', 'Q506240', 'Q93204', 'Q226730', // סרטים
  'Q20650540', 'Q29168811', 'Q842256', 'Q319221',
  'Q5398426', 'Q581714', 'Q1366112', 'Q1259759', 'Q117467246', // סדרות
  'Q15416', 'Q1254874', 'Q23596208', 'Q1983062', // תוכניות טלוויזיה
  'Q7725310', 'Q63952888', 'Q3464665' // עונות וסדרות המשך
])

/**
 * תכונות שרק ליצירת מסך יש: ערוץ שידור, במאי, תסריטאי, שחקנים,
 * מספר פרקים או עונות. אדם, מקום או מוסך לא יישאו אף אחת מהן.
 *
 * הבדיקה הזו עדיפה על רשימת סוגים סגורה, כי ויקינתונים משתמשת בעשרות
 * סיווגים שונים לסדרות — "פרופיל מזויף" ו"קדם אירוויזיון" נדחו בגללה.
 */
const WORK_SIGNALS = [
  'P449', // ערוץ שידור מקורי
  'P57', // במאי
  'P58', // תסריטאי
  'P161', // שחקנים
  'P162', // מפיק
  'P1113', // מספר פרקים
  'P2437', // מספר עונות
  'P344', // צלם
  'P272' // חברת הפקה
]

/** האם הערך בוויקינתונים הוא יצירה קולנועית או טלוויזיונית */
async function isWork(qid: string): Promise<boolean> {
  const url = new URL('https://www.wikidata.org/w/api.php')
  url.searchParams.set('action', 'wbgetclaims')
  url.searchParams.set('format', 'json')
  url.searchParams.set('entity', qid)
  const json = await wikiJson<{
    claims?: Record<string, Array<{ mainsnak?: { datavalue?: { value?: { id?: string } } } }>>
  }>(url)
  const claims = json?.claims
  if (!claims) return false

  const types = (claims.P31 ?? [])
    .map((c) => c.mainsnak?.datavalue?.value?.id)
    .filter((v): v is string => Boolean(v))
  if (types.some((t) => WORK_TYPES.has(t))) return true

  return WORK_SIGNALS.some((p) => Array.isArray(claims[p]) && claims[p].length > 0)
}

/** תמונה מוויקינתונים לפי מזהה פריט (P18) */
export async function wikidataImage(qid: string): Promise<FoundImage | null> {
  const url = new URL('https://www.wikidata.org/w/api.php')
  url.searchParams.set('action', 'wbgetclaims')
  url.searchParams.set('format', 'json')
  url.searchParams.set('entity', qid)
  url.searchParams.set('property', 'P18')
  const json = await wikiJson<{
    claims?: { P18?: Array<{ mainsnak?: { datavalue?: { value?: string } } }> }
  }>(url)
  const file = json?.claims?.P18?.[0]?.mainsnak?.datavalue?.value
  if (!file) return null
  return { url: `${COMMONS}${encodeURIComponent(file)}?width=600`, source: 'wikipedia' }
}

/**
 * חיפוש תמונות של Google. דורש Custom Search API מופעל ומזהה מנוע חיפוש
 * (CX). המכסה החינמית היא 100 שאילתות ביום — מספיק בהחלט, כי כל כותר
 * נשאל פעם אחת והתוצאה נשמרת במטמון לתמיד.
 */
export async function googleImage(query: string): Promise<FoundImage | null> {
  const cx = APP_CONFIG.googleCseId
  const key = effectiveGoogleKey()
  if (!cx || !key) return null

  const url = new URL(CSE)
  url.searchParams.set('key', key)
  url.searchParams.set('cx', cx)
  url.searchParams.set('q', query)
  url.searchParams.set('searchType', 'image')
  url.searchParams.set('num', '3')
  url.searchParams.set('imgSize', 'large')
  url.searchParams.set('safe', 'active')

  const json = await getJson<{ items?: Array<{ link?: string; mime?: string }> }>(url)
  const hit = json?.items?.find((i) => i.link && /^https:/.test(i.link))
  return hit?.link ? { url: hit.link, source: 'google' } : null
}

/** שמות שאין בהם מספיק מידע כדי לחפש עליהם כרזה */
function tooVagueToSearch(title: string): boolean {
  const t = title.trim()
  if (t.length < 3) return true
  if (/^סרטון ·/.test(t)) return true
  // "עונה 9", "פרק 4", "Default Name" — לא שם של יצירה
  if (/^(עונה|פרק|חלק)\s*\d+$/.test(t)) return true
  if (/^default\s*name$/i.test(t)) return true
  // רק ספרות וסימנים
  if (!/[\p{L}]{2,}/u.test(t)) return true
  return false
}

/** מנסה את כל המקורות לפי סדר ומחזיר את הראשון שנמצא */
export async function findPoster(
  title: string,
  year: number | null,
  kind: 'movie' | 'series'
): Promise<FoundImage | null> {
  if (tooVagueToSearch(title)) return null

  const fromWikipedia = await wikipediaImage(year ? `${title} ${year}` : title, title)
  if (fromWikipedia) return fromWikipedia

  const what = kind === 'series' ? 'סדרה' : 'סרט'
  const q = `${title} ${year ?? ''} ${what} פוסטר`.replace(/\s+/g, ' ').trim()
  return googleImage(q)
}
