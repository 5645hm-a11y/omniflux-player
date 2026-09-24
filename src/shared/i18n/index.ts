import fr from './locales/fr'
import en from './locales/en'
import he from './locales/he'
import es from './locales/es'
import de from './locales/de'
import ar from './locales/ar'
import it from './locales/it'
import pt from './locales/pt'
import { DEFAULT_LOCALE, type Dict, type LocaleCode } from './types'

export * from './types'

export const DICTS: Record<LocaleCode, Dict> = { fr, en, he, es, de, ar, it, pt }

/**
 * מסלול נקודות אל תוך המילון: 'library.empty'.
 *
 * הטיפוס נבנה מהמילון עצמו, ולכן מפתח שגוי נופל בהידור ולא מציג
 * למשתמש את שם המפתח במקום טקסט.
 */
type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : Leaves<T[K], `${P}${K}.`>
}[keyof T & string]

export type Key = Leaves<Dict>

/** ערכי החלפה ל-{name} שבתוך המחרוזת. */
export type Vars = Record<string, string | number>

function lookup(dict: Dict, key: string): string | undefined {
  let node: unknown = dict
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === 'string' ? node : undefined
}

/**
 * מתרגם מפתח.
 *
 * שפה שחסר בה מפתח נופלת לצרפתית ולא למפתח עצמו: משתמש שרואה
 * "library.empty" על המסך מקבל תקלה גלויה, ומשתמש שרואה את הטקסט
 * הצרפתי מקבל לכל היותר שפה לא נכונה.
 */
export function translate(locale: LocaleCode, key: Key, vars?: Vars): string {
  const text = lookup(DICTS[locale] ?? DICTS[DEFAULT_LOCALE], key) ?? lookup(DICTS[DEFAULT_LOCALE], key) ?? key
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.hasOwn(vars, name) ? String(vars[name]) : whole
  )
}

/** יוצר `t` קשור לשפה אחת. */
export function translator(locale: LocaleCode) {
  return (key: Key, vars?: Vars): string => translate(locale, key, vars)
}
