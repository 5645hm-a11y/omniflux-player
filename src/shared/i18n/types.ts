/**
 * חוזה התרגום.
 *
 * הצרפתית היא המקור: `Dict` נגזר ממנה, ולכן כל שפה אחרת חייבת לספק
 * בדיוק את אותם מפתחות — מפתח חסר או מיותר נופל בבדיקת הטיפוסים ולא
 * בזמן ריצה מול משתמש.
 */

import type fr from './locales/fr'

export type Dict = typeof fr

export type LocaleCode = 'fr' | 'en' | 'he' | 'es' | 'de' | 'ar' | 'it' | 'pt'

export interface LocaleMeta {
  code: LocaleCode
  /** השם בשפה עצמה — משתמש מזהה את שפתו גם כשהממשק בשפה שאינו קורא */
  native: string
  dir: 'ltr' | 'rtl'
  /** תגי BCP-47 שממופים לשפה הזאת בזיהוי אוטומטי */
  matches: string[]
  /**
   * שפת המטא-דאטה מ-TMDB.
   *
   * בלי זה הכרזות והתקצירים חוזרים תמיד באותה שפה, ומשתמש צרפתי
   * מקבל ספרייה בעברית. נצפה בפועל בצילום המסך.
   */
  tmdb: string
  /**
   * מדינה לזמינות בפלטפורמות.
   *
   * נטפליקס בצרפת אינה נטפליקס בישראל, ולכן "זמין במנוי" תלוי
   * במדינה. זו ברירת מחדל בלבד — אם למערכת יש מדינה, היא גוברת.
   */
  region: string
}

export const LOCALES: readonly LocaleMeta[] = [
  { code: 'fr', native: 'Français', dir: 'ltr', matches: ['fr'], tmdb: 'fr-FR', region: 'FR' },
  { code: 'en', native: 'English', dir: 'ltr', matches: ['en'], tmdb: 'en-US', region: 'US' },
  { code: 'he', native: 'עברית', dir: 'rtl', matches: ['he', 'iw'], tmdb: 'he-IL', region: 'IL' },
  { code: 'es', native: 'Español', dir: 'ltr', matches: ['es'], tmdb: 'es-ES', region: 'ES' },
  { code: 'de', native: 'Deutsch', dir: 'ltr', matches: ['de'], tmdb: 'de-DE', region: 'DE' },
  { code: 'it', native: 'Italiano', dir: 'ltr', matches: ['it'], tmdb: 'it-IT', region: 'IT' },
  /*
   * המילון נכתב בפורטוגזית אירופית, ולכן גם המטא-דאטה מבוקשת כך.
   * גרסה ברזילאית תהיה קובץ נפרד — לא תערובת של השתיים.
   */
  { code: 'pt', native: 'Português', dir: 'ltr', matches: ['pt'], tmdb: 'pt-PT', region: 'PT' },
  { code: 'ar', native: 'العربية', dir: 'rtl', matches: ['ar'], tmdb: 'ar-SA', region: 'AE' }
]

export const DEFAULT_LOCALE: LocaleCode = 'fr'

/** האם השפה נכתבת מימין לשמאל. */
export function dirOf(code: LocaleCode): 'ltr' | 'rtl' {
  return LOCALES.find((l) => l.code === code)?.dir ?? 'ltr'
}

/**
 * ממפה שפת מערכת לשפה נתמכת.
 *
 * `navigator.language` ו-`app.getLocale()` מחזירים תגים כמו "fr-CA"
 * או "he-IL", ולכן ההשוואה היא על החלק הראשון בלבד. שפה שאינה
 * נתמכת נופלת לצרפתית — ברירת המחדל של המוצר.
 */
export function resolveLocale(tag: string | null | undefined): LocaleCode {
  if (!tag) return DEFAULT_LOCALE
  const base = tag.toLowerCase().split(/[-_]/)[0]
  return LOCALES.find((l) => l.matches.includes(base))?.code ?? DEFAULT_LOCALE
}

/** תג השפה שנשלח ל-TMDB עבור שפת ממשק נתונה. */
export function tmdbLanguage(code: LocaleCode): string {
  return LOCALES.find((l) => l.code === code)?.tmdb ?? 'en-US'
}

/** מדינת ברירת המחדל לבדיקת זמינות בפלטפורמות. */
export function defaultRegion(code: LocaleCode): string {
  return LOCALES.find((l) => l.code === code)?.region ?? 'US'
}
