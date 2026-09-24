/**
 * טיפוסי הספרייה.
 *
 * שכבה טהורה: אין כאן ידיעה מאיפה הקובץ הגיע — מהדיסק, מהדרייב, או
 * מכל מקור שיתווסף. כל מקור מחזיר `RawMedia`, וכל השאר זהה.
 */

export type MediaKind = 'movie' | 'episode' | 'audio' | 'unknown'
export type SourceKind = 'local' | 'gdrive' | 'url'

/** מה שמתאם מקור מחזיר: קובץ, בלי שום פרשנות */
export interface RawMedia {
  /** מזהה יציב לאורך סריקות. מקומי: הנתיב. דרייב: מזהה הקובץ. */
  id: string
  source: SourceKind
  /** מה שמעבירים למנוע כדי לנגן */
  uri: string
  /** שם הקובץ כפי שהוא, בלי ניקוי */
  fileName: string
  sizeBytes?: number
  modifiedAt?: number
  /** התיקייה שממנה נסרק, לצורך ספירה והסרה */
  root: string
  /** נתיב התיקיות מתחת לשורש, לזיהוי סדרות */
  trail: string[]
}

/** פריט בספרייה, אחרי ניקוי שם וזיהוי */
export interface MediaItem extends RawMedia {
  kind: MediaKind
  /** השם הנקי, אחרי הסרת רעש */
  title: string
  year: number | null
  season: number | null
  episode: number | null
  /** מה שהמאגרים החיצוניים החזירו. null = עוד לא נבדק. */
  meta: MediaMeta | null
  /** תגיות מתוך קובץ שמע מקומי (ID3/Vorbis/MP4). חסר = עוד לא נקרא */
  audio?: AudioTags
}

/**
 * מה שקובץ השמע אומר על עצמו.
 *
 * ‏`stamp` הוא גודל ותאריך שינוי: כל עוד הם זהים, התגיות אינן נקראות
 * שוב. אוסף של עשרות אלפי שירים נסרק כך פעם אחת, ואחר כך רק מה שהשתנה.
 */
export interface AudioTags {
  stamp: string
  title: string | null
  artist: string | null
  album: string | null
  year: number | null
  genre: string | null
  track: number | null
  durationSec: number | null
  /** ‏art://… — העטיפה שהוטמעה בקובץ, אם יש */
  cover: string | null
}

export interface MediaMeta {
  /** הכותר כפי שיוצג — לרוב מהמאגר, ובהיעדר התאמה מהשם הנקי */
  title: string
  originalTitle: string
  overview: string
  year: number | null
  genres: string[]
  rating: number
  runtimeMinutes: number | null
  /** נתיב מקומי לכרזה שהורדה, או null */
  poster: string | null
  backdrop: string | null
  tmdbId: number | null
  tmdbType: 'movie' | 'tv' | null
  /** לא נמצאה התאמה. נשמר כדי לא לנסות שוב בכל סריקה. */
  notFound: boolean
  fetchedAt: number
  /**
   * השפה שבה נמשכה המטא-דאטה.
   *
   * בלעדיה החלפת שפה משאירה ספרייה שלמה בשפה הקודמת: הכותרים
   * נשמרים במטמון, והסריקה הבאה מדלגת עליהם כי כבר יש להם meta.
   */
  locale: string
}

export interface LibraryFolder {
  id: string
  source: SourceKind
  /** מקומי: נתיב. דרייב: מזהה תיקייה. */
  ref: string
  label: string
  addedAt: number
}

export interface Catalog {
  version: number
  scannedAt: number
  items: MediaItem[]
}

export const CATALOG_VERSION = 1

export interface ScanProgress {
  phase: 'listing' | 'identifying' | 'done' | 'error'
  message: string
  current: number
  total: number
}

/**
 * פלטפורמה שבה הכותר זמין.
 *
 * הלוגו מגיש מ-TMDB בכל פעם ואינו נשמר אצלנו: אלה סימנים מסחריים,
 * ו-TMDB הוא הצינור המורשה שמספק אותם יחד עם נתוני הזמינות.
 */
export interface Brand {
  name: string
  /** כתובת art:// ללוגו הרשמי, או null אם אין */
  logo: string | null
}

/** תג איכות שנגזר משם הקובץ */
export type Quality = '4K' | 'HDR' | '1080p' | '720p' | null

export type CardSource = 'local' | 'gdrive' | 'catalog' | 'music'

export interface HubCard {
  id: string
  title: string
  subtitle: string
  poster: string | null
  year: number | null
  rating: number
  quality: Quality
  source: CardSource
  brand: Brand | null
  playable: boolean
  itemId?: string
  playUri?: string
  externalUrl?: string
  progress?: number
  episodes?: number
}

export interface HeroSlide {
  id: string
  title: string
  overview: string
  backdrop: string | null
  logo: string | null
  year: number | null
  rating: number
  genres: string[]
  playable: boolean
  itemId?: string
  externalUrl?: string
  brand: Brand | null
}

export type HubRowKey = 'continue' | 'watchlist' | 'trending' | 'topRated' | 'popularTv' | 'recent' | 'music'

export interface HubRow {
  key: HubRowKey
  cards: HubCard[]
}

export interface HubData {
  hero: HeroSlide[]
  rows: HubRow[]
  loading: boolean
}

export interface PlayProgress {
  position: number
  duration: number
  updatedAt: number
}
