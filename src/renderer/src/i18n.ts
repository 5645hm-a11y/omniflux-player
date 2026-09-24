import { create } from 'zustand'
import { DEFAULT_LOCALE, dirOf, translate, type Key, type LocaleCode, type Vars } from '@shared/i18n'

/**
 * השפה בממשק.
 *
 * הבחירה נשמרת בתהליך הראשי ולא ב-localStorage, כי גם הוא מציג
 * טקסט — כותרות של דיאלוגי קבצים. שני מקומות שמירה היו נותנים ממשק
 * בשפה אחת ודיאלוגים בשפה אחרת.
 */

interface I18nState {
  locale: LocaleCode
  /** עד שהשפה השמורה נטענת אין לצייר טקסט: החלפה נראית כמו הבהוב */
  ready: boolean
  init: () => Promise<void>
  setLocale: (code: LocaleCode) => Promise<void>
}

/**
 * מחיל את השפה על המסמך.
 *
 * `dir` הוא מה שהופך את כל הפריסה לימין-שמאל, ו-`lang` הוא מה
 * שגורם לדפדפן לבחור גופן ולחתוך מילים נכון לשפה.
 */
function applyToDocument(code: LocaleCode): void {
  const el = document.documentElement
  el.lang = code
  el.dir = dirOf(code)
}

export const useI18n = create<I18nState>((set) => ({
  locale: DEFAULT_LOCALE,
  ready: false,

  init: async () => {
    let code = DEFAULT_LOCALE
    try {
      code = await window.cinema.app.locale()
    } catch {
      // אין גשר — נשארים בברירת המחדל במקום לקרוס
    }
    applyToDocument(code)
    set({ locale: code, ready: true })
  },

  setLocale: async (code) => {
    applyToDocument(code)
    set({ locale: code })
    await window.cinema.app.setLocale(code)
  }
}))

/**
 * `t` של השפה הפעילה.
 *
 * מוחזרת פונקציה חדשה בכל שינוי שפה — וזה הרצוי: רכיב שקורא ל-`t`
 * מתרנדר מחדש כשהשפה משתנה, בלי שיצטרך לדעת על כך.
 */
export function useT(): (key: Key, vars?: Vars) => string {
  const locale = useI18n((s) => s.locale)
  return (key, vars) => translate(locale, key, vars)
}

/** כיוון הכתיבה הפעיל, לרכיבים שצריכים להיערך לפיו בעצמם. */
export function useDir(): 'ltr' | 'rtl' {
  return dirOf(useI18n((s) => s.locale))
}
