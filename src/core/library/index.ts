import { parseName, parseSeasonFolder, normalizeKey } from '../../legacy_services/titles'
import type { MediaItem, MediaKind, RawMedia } from './types'

/**
 * בניית הספרייה מקבצים גולמיים.
 *
 * שכבה טהורה. ניקוי השמות נעשה במודול שעבר מהגרסה הקודמת — הוא נמדד
 * מול אלפי שמות אמיתיים מהדרייב, ואין סיבה לכתוב אותו מחדש.
 */

const VIDEO = /\.(mp4|mkv|avi|mov|webm|m4v|ts|m2ts|flv|wmv|mpg|mpeg|3gp|ogv)$/i
const AUDIO = /\.(mp3|flac|m4a|opus|ogg|wav|aac|wma|aiff)$/i

export function isMedia(fileName: string): boolean {
  return VIDEO.test(fileName) || AUDIO.test(fileName)
}

export function isVideo(fileName: string): boolean {
  return VIDEO.test(fileName)
}

/**
 * שם התיקייה נושא מידע שהקובץ לא תמיד נושא.
 *
 * "עונה 2/פרק 05.mkv" — הפרק בקובץ, העונה בתיקייה. בלי לקרוא את
 * המסלול, כל הפרקים של כל העונות נראים אותו דבר.
 */
function seasonFromTrail(trail: string[]): number | null {
  for (let i = trail.length - 1; i >= 0; i--) {
    const parsed = parseSeasonFolder(trail[i] ?? '')
    if (parsed.number !== null) return parsed.number
  }
  return null
}

/**
 * כשהשם הנקי ריק — שם אוטומטי, מספרים בלבד — נופלים לשם הקובץ בלי
 * הסיומת. עדיף שם מכוער מכרטיס בלי שם.
 */
function fallbackTitle(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim() || fileName
}

export function toItem(raw: RawMedia): MediaItem {
  const parsed = parseName(raw.fileName)
  const season = parsed.season ?? seasonFromTrail(raw.trail)
  const episode = parsed.episode

  let kind: MediaKind = 'unknown'
  if (AUDIO.test(raw.fileName)) kind = 'audio'
  else if (episode !== null) kind = 'episode'
  else if (VIDEO.test(raw.fileName)) kind = 'movie'

  /*
   * לפרק, שם הקובץ הוא שם הפרק ולא שם הסדרה. שם הסדרה יושב בתיקייה
   * שמעל — ובלעדיו כל פרק היה כרטיס נפרד בספרייה.
   */
  const seriesName = kind === 'episode' ? seriesFromTrail(raw.trail) : null
  const title = seriesName ?? parsed.title

  return {
    ...raw,
    kind,
    title: title.trim() || fallbackTitle(raw.fileName),
    year: parsed.year,
    season,
    episode,
    meta: null
  }
}

/** התיקייה הראשונה מלמעלה שאינה תיקיית עונה היא שם הסדרה */
function seriesFromTrail(trail: string[]): string | null {
  for (let i = trail.length - 1; i >= 0; i--) {
    const name = trail[i] ?? ''
    if (parseSeasonFolder(name).number !== null) continue
    const clean = parseName(name).title
    if (clean) return clean
  }
  return null
}

/**
 * מפתח לקיבוץ. פרקים של אותה סדרה מתקבצים לכרטיס אחד, וסרט זהה
 * שיושב בשתי תיקיות מוצג פעם אחת.
 */
export function groupKey(item: MediaItem): string {
  if (item.kind === 'episode') return `series|${normalizeKey(item.title)}`
  return `${item.kind}|${normalizeKey(item.title)}|${item.year ?? ''}`
}

/** קבצים גולמיים → פריטים, ממוינים לפי שם */
export function buildItems(raws: RawMedia[]): MediaItem[] {
  const seen = new Set<string>()
  const items: MediaItem[] = []
  for (const raw of raws) {
    if (seen.has(raw.id)) continue
    seen.add(raw.id)
    if (!isMedia(raw.fileName)) continue
    items.push(toItem(raw))
  }
  items.sort((a, b) => a.title.localeCompare(b.title, 'he'))
  return items
}

/**
 * שומר את מה שכבר זוהה.
 *
 * סריקה חוזרת לא אמורה למחוק מטא-דאטה שכבר הושגה — היא יקרה, היא
 * דורשת רשת, וברוב הסריקות שום דבר לא השתנה.
 */
/** חותמת הקובץ לתגיות השמע: גודל ותאריך שינוי */
export function audioStamp(item: { sizeBytes?: number; modifiedAt?: number }): string {
  return `${item.sizeBytes ?? 0}-${item.modifiedAt ?? 0}`
}

export function carryMeta(fresh: MediaItem[], previous: MediaItem[], locale: string): MediaItem[] {
  const byId = new Map(previous.map((i) => [i.id, i]))
  return fresh.map((item) => {
    const old = byId.get(item.id)
    // תגיות שמע עוברות רק כשהקובץ לא השתנה — אחרת הן נקראות מחדש
    const audio = old?.audio && old.audio.stamp === audioStamp(item) ? old.audio : undefined
    const withAudio = audio ? { ...item, audio } : item
    // מטא-דאטה בשפה אחרת נזרקת: המשתמש החליף שפה, והזיהוי הבא
    // ימשוך כותר ותקציר בשפה החדשה במקום להשאיר את הישנה
    if (!old?.meta || old.meta.locale !== locale) return withAudio
    return { ...withAudio, meta: old.meta }
  })
}
