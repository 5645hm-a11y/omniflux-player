/**
 * תוצאת חיפוש מאוחדת.
 *
 * כל מקור מחזיר את אותו טיפוס, ולכן מסך התוצאות אינו יודע — ואינו
 * צריך לדעת — מאיפה כל שורה הגיעה.
 */

export type ResultOrigin = 'library' | 'catalog' | 'music'

export interface WatchOption {
  /** שם הפלטפורמה, כפי שיוצג */
  provider: string
  /** במנוי, בהשכרה, או בקנייה */
  kind: 'flatrate' | 'rent' | 'buy'
}

export interface SearchResult {
  id: string
  origin: ResultOrigin
  title: string
  /** שורה שנייה: שנה, אמן, או שם הקובץ */
  subtitle: string
  poster: string | null
  year: number | null
  rating: number

  /**
   * אפשר לנגן עכשיו, בלחיצה אחת.
   *
   * זה הדירוג העיקרי: קובץ שיש לך גובר על מנוי, ומנוי גובר על
   * השכרה. משתמש שמחפש סרט רוצה קודם כול לדעת אם הוא כבר אצלו.
   */
  playable: boolean
  /** מזהה פריט בספרייה, כשאפשר לנגן */
  itemId?: string
  /** כתובת לנגינה ישירה — תצוגה מקדימה של מוזיקה, למשל */
  playUri?: string
  /** Opaque provider id used by an authenticated SDK, never an audio URL. */
  providerTrackId?: string
  /** Preview from another licensed provider when Spotify Connect is unavailable. */
  fallbackPlayUri?: string

  /** איפה אפשר לצפות, כשזה לא אצלנו */
  watch?: WatchOption[]
  /** קישור חיצוני: לדף הכותר, לאלבום, או לפלטפורמה */
  externalUrl?: string
  /** מאיזה שירות הגיעה השורה, לתווית */
  sourceLabel: string
}

export interface SearchGroup {
  /**
   * הכותרת נגזרת מהמפתח בממשק ואינה נשלחת מכאן.
   *
   * כשהיא הייתה שדה, היא נשארה בעברית בממשק צרפתי — הליבה אינה
   * יודעת באיזו שפה המשתמש קורא, ולכן אין לה מה לומר על תצוגה.
   */
  key: 'library' | 'streaming' | 'music'
  results: SearchResult[]
}
