/**
 * חיפוש מוזיקה אחוד: אותו שיר מכל המקורות, כתוצאה אחת.
 *
 * כל מקור מחזיר שורות משלו — קובץ במחשב, קובץ בדרייב, רצועה ב-Spotify
 * או ב-Deezer, סרטון ב-YouTube — ובלי איחוד המשתמש רואה את "Yellow"
 * חמש פעמים, בחמישה עיצובים. כאן הן מתקבצות לפי אמן ושם מנורמלים:
 * תוצאה אחת, עם המטא-דאטה העשיר ביותר מכל המקורות (העטיפה הטובה
 * ביותר, האלבום, המשך), ורשימת מקורות שאפשר לבחור ביניהם.
 *
 * המודול טהור: אין בו רשת, אין Electron ואין React. כך הוא נבדק בלי
 * שום שירות, ויעבור כמו שהוא לאפליקציית המובייל.
 */

export type MusicSourceKind = 'local' | 'drive' | 'spotify' | 'deezer' | 'youtube'

/** שורה אחת ממקור אחד, לפני האיחוד */
export interface SourceHit {
  kind: MusicSourceKind
  /** מזהה לניגון: מזהה בקטלוג, URI של Spotify, מזהה Deezer, videoId */
  ref: string
  title: string
  artist: string
  album?: string | null
  cover?: string | null
  durationSec?: number | null
  /** שיר מלא, או קטע של 30 שניות */
  quality: 'full' | 'preview'
  /** כתובת ישירה לקטע (Deezer), כשאין ניגון מלא */
  previewUrl?: string | null
  /** המטען המקורי של המקור, לניגון — לא נקרא כאן */
  payload?: unknown
}

export interface MusicHit {
  key: string
  title: string
  artist: string
  album: string | null
  cover: string | null
  durationSec: number | null
  /** מסודרים לפי העדפה — הראשון הוא מה שלחיצה על השיר מנגנת */
  sources: SourceHit[]
  /** התאמה לשאילתה, 0–1 */
  relevance: number
}

/**
 * סדר ההעדפה בין מקורות לאותו שיר.
 *
 * מה שכבר שלך קודם: קובץ במחשב מתנגן מיד, בלי רשת ובאיכות המקורית;
 * אחריו הדרייב שלך. אחר כך שירות שמנגן שיר מלא, ו-YouTube — מלא אבל
 * עם פרסומות ובנגן גלוי. קטע של 30 שניות תמיד אחרון, גם אם הוא מהיר.
 */
const PRIORITY: Record<MusicSourceKind, number> = { local: 0, drive: 1, spotify: 2, deezer: 3, youtube: 4 }

function rank(hit: SourceHit): number {
  return (hit.quality === 'preview' ? 10 : 0) + PRIORITY[hit.kind]
}

/**
 * איכות העטיפה לפי מקור: הקטלוגים מחזירים 1000px (cover_xl, Spotify
 * 640), YouTube מחזיר תמונת סרטון (לפעמים עם פסים שחורים), וקובץ מקומי
 * — מה שהוטמע בו, לרוב קטן. העטיפה של התוצאה היא הטובה מבין מה שיש.
 */
const COVER_RANK: Record<MusicSourceKind, number> = { spotify: 0, deezer: 1, local: 2, drive: 3, youtube: 4 }

/** "Coldplay", "coldplay " ו-"COLDPLAY" הם אותו אמן; "Beyoncé" ו-"Beyonce" אותו שם */
export function normalize(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/**
 * השם בלי מה שמשתנה בין מקורות לאותה הקלטה: "feat.", "Remastered 2011",
 * "(Radio Edit)", "- Live". ‏"Yellow" ו-"Yellow - Remastered 2021" הם
 * אותו שיר לבחירת מקור; מי שרוצה גרסה מסוימת יבחר אותה ברשימה.
 */
export function coreTitle(title: string): string {
  return normalize(
    title
      .replace(/\s*[([][^)\]]*\b(feat|ft|with|remaster(ed)?|radio edit|edit|version|mono|stereo|live)\b[^)\]]*[)\]]/gi, '')
      .replace(/\s+-\s+(\d{4}\s+)?(remaster(ed)?|live|radio edit|mono|stereo).*$/i, '')
      .replace(/\s+(feat|ft)\.?\s.*$/i, '')
  )
}

/** האמן הראשי: "Coldplay, Rihanna" ו-"Coldplay & Rihanna" → "coldplay" */
export function mainArtist(artist: string): string {
  return normalize(artist.split(/\s*(?:,|&|\bx\b|\bfeat\.?|\bft\.?|\band\b|ו-)\s*/i)[0] ?? '')
}

/** כמה השורה עונה על השאילתה: כל מילה בשאילתה שנמצאת בשם או באמן */
export function relevance(query: string, title: string, artist: string): number {
  const words = normalize(query).split(' ').filter(Boolean)
  if (words.length === 0) return 0
  const hay = ` ${normalize(title)} ${normalize(artist)} `
  const found = words.filter((word) => hay.includes(` ${word}`)).length
  const exactTitle = normalize(title) === normalize(query) ? 0.25 : 0
  return Math.min(1, found / words.length + exactTitle)
}

/**
 * האיחוד עצמו.
 *
 * מפתח = אמן ראשי + שם בסיסי. שורה בלי אמן (קובץ שנקרא "Yellow.mp3")
 * מצטרפת לתוצאה קיימת עם אותו שם, אם יש אחת כזו בדיוק — עדיף מאשר
 * להשאיר את הקובץ של המשתמש בודד מתחת לתוצאה הזהה מהרשת.
 */
export function aggregate(query: string, hits: SourceHit[], limit = 40): MusicHit[] {
  const groups = new Map<string, SourceHit[]>()
  const byTitle = new Map<string, string[]>()

  const add = (key: string, hit: SourceHit): void => {
    const list = groups.get(key)
    if (list) list.push(hit)
    else groups.set(key, [hit])
  }

  const withArtist = hits.filter((hit) => mainArtist(hit.artist))
  const withoutArtist = hits.filter((hit) => !mainArtist(hit.artist))

  for (const hit of withArtist) {
    const title = coreTitle(hit.title)
    if (!title) continue
    const key = `${mainArtist(hit.artist)}|${title}`
    add(key, hit)
    const keys = byTitle.get(title) ?? []
    if (!keys.includes(key)) byTitle.set(title, [...keys, key])
  }
  for (const hit of withoutArtist) {
    const title = coreTitle(hit.title)
    if (!title) continue
    const same = byTitle.get(title)
    add(same?.length === 1 ? same[0] : `|${title}`, hit)
  }

  const out: MusicHit[] = []
  for (const [key, list] of groups) {
    const sources = [...list].sort((a, b) => rank(a) - rank(b))
    // אותו מקור פעמיים (שתי גרסאות ב-YouTube) — נשאר הראשון בכל סוג
    const seen = new Set<MusicSourceKind>()
    const unique = sources.filter((hit) => (seen.has(hit.kind) ? false : (seen.add(hit.kind), true)))
    const lead = unique[0]
    const named = unique.find((hit) => hit.artist) ?? lead
    const cover = [...unique]
      .filter((hit) => hit.cover)
      .sort((a, b) => COVER_RANK[a.kind] - COVER_RANK[b.kind])[0]?.cover ?? null
    out.push({
      key,
      // השם והאמן מהמקור המתועד ביותר: קטלוג לפני שם קובץ
      title: ([...unique].sort((a, b) => COVER_RANK[a.kind] - COVER_RANK[b.kind]).find((h) => h.artist) ?? lead).title,
      artist: named.artist,
      album: unique.find((hit) => hit.album)?.album ?? null,
      cover,
      durationSec: unique.find((hit) => hit.durationSec)?.durationSec ?? null,
      sources: unique,
      relevance: Math.max(...unique.map((hit) => relevance(query, hit.title, hit.artist)))
    })
  }

  return out
    .filter((hit) => hit.relevance > 0)
    .sort((a, b) =>
      b.relevance - a.relevance ||
      // בשוויון: יותר מקורות = שיר מוכר יותר; ואחר כך מה שכבר שלך
      b.sources.length - a.sources.length ||
      rank(a.sources[0]) - rank(b.sources[0])
    )
    .slice(0, limit)
}
