import { app, shell } from 'electron'
import { jsonStore } from './storage'
import { defaultRegion, resolveLocale, translator, type Key, type LocaleCode, type Vars } from '../../shared/i18n'

/**
 * העדפות שמלוות את המשתמש בין הפעלות.
 *
 * השפה יושבת כאן ולא רק בממשק, כי גם התהליך הראשי מציג טקסט:
 * כותרות של דיאלוגי קבצים ושמות מסננים. דיאלוג באנגלית בתוך ממשק
 * צרפתי הוא בדיוק הסדק שמסגיר תרגום חלקי.
 */

interface Settings {
  locale: LocaleCode | null
  /**
   * ספרייה בלבד: בלי שום תוכן שמגיע מהרשת.
   *
   * כשהמצב פעיל התוכנה מציגה אך ורק את מה שהמשתמש הוסיף בעצמו —
   * תיקיות במחשב ותיקיות Drive. אין באנר של כותרים חדשים, אין שורת
   * טרנדים, אין תוצאות סטרימינג בחיפוש ואין קטלוג מוזיקה.
   *
   * מה שכן נשאר: כרזות ותקצירים לקבצים של המשתמש עצמו. אלה אינם
   * תוכן נוסף אלא תיאור של מה שכבר אצלו, ובלעדיהם הספרייה שלו
   * נראית כמו רשימת שמות קבצים.
   */
  localOnly: boolean
}

const store = jsonStore<Settings>('settings.json', { locale: null, localOnly: false })

/**
 * השפה הפעילה.
 *
 * בהפעלה הראשונה אין העדפה שמורה, ואז נגזרת שפת המערכת. שפה שאינה
 * נתמכת נופלת לצרפתית — ברירת המחדל של המוצר.
 */
export function currentLocale(): LocaleCode {
  const saved = store.read().locale
  if (saved) return saved
  return resolveLocale(app.getLocale())
}

export function setLocale(code: LocaleCode): void {
  store.write({ ...store.read(), locale: code })
}

/** האם התוכנה מוגבלת לספרייה של המשתמש בלבד. */
export function localOnly(): boolean {
  return store.read().localOnly === true
}

export function setLocalOnly(value: boolean): void {
  store.write({ ...store.read(), localOnly: value })
}

/**
 * המדינה שלפיה נבדקת זמינות בפלטפורמות.
 *
 * המדינה של המערכת גוברת על זו שנגזרת מהשפה: משתמש שקורא צרפתית
 * בבלגיה אינו מקבל את קטלוג צרפת, וזה בדיוק ההבדל שקובע אם כותר
 * מסומן "כלול במנוי" או לא.
 */
export function watchRegion(): string {
  const fromSystem = app.getLocaleCountryCode?.()
  if (fromSystem && /^[A-Z]{2}$/.test(fromSystem)) return fromSystem
  return defaultRegion(currentLocale())
}

/** מתרגם בשפה הפעילה. נקרא בכל שימוש — השפה משתנה בזמן ריצה. */
export function t(key: Key, vars?: Vars): string {
  return translator(currentLocale())(key, vars)
}

/**
 * פותח את מסך "אפליקציות ברירת מחדל" של Windows.
 *
 * אין דרך אחרת. מאז Windows 8 ערך UserChoice חתום בגיבוב שהמערכת
 * מאמתת, ותוכנה שכותבת אותו ישירות נפסלת. אומת בהתקנה אמיתית:
 * המתקין רשם את כל 20 הסיומות תחת Software\Classes, והמעטפת המשיכה
 * לפתוח את הנגן שנבחר ב-UserChoice.
 *
 * הכתובת מכוונת ישירות ל-OmniFlux כדי שהמשתמש לא יחפש אותה ברשימה.
 */
export async function openDefaultAppsSettings(): Promise<void> {
  if (process.platform !== 'win32') return
  const target = `ms-settings:defaultapps?registeredAppName=${encodeURIComponent('OmniFlux Player')}`
  try {
    await shell.openExternal(target)
  } catch {
    // גרסאות ישנות אינן מכירות את הפרמטר; המסך הכללי עדיף על כלום
    await shell.openExternal('ms-settings:defaultapps')
  }
}
