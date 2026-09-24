/**
 * מה שהשירותים כאן מקבלים מבחוץ.
 *
 * אף מודול בתיקייה הזאת אינו מייבא את Electron, אינו יודע איפה
 * נשמרים קבצים, ואינו מחזיק מפתחות. כל אלה מוזרקים — וזו כל הסיבה
 * שהם יעברו למובייל בלי שכתוב: מחליפים את המימושים, לא את הלוגיקה.
 */

/** תואם fetch. במחשב זה net.fetch של Electron, במובייל fetch רגיל. */
export type Http = (url: string | URL, init?: RequestInit) => Promise<Response>

/** אחסון מפתח-ערך פשוט. במחשב זה קובץ JSON, במובייל אחסון מקומי. */
export interface Kv<T> {
  read: () => T
  write: (value: T) => void
}

/**
 * מימוש זיכרון של Kv. שימושי בבדיקות ובריצה ראשונה לפני שיש דיסק.
 */
export function memoryKv<T>(initial: T): Kv<T> {
  let value = initial
  return {
    read: () => value,
    write: (next) => {
      value = next
    }
  }
}
