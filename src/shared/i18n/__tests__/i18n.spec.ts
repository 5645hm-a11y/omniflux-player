import { expect, test } from '@playwright/test'
import { DICTS, LOCALES, DEFAULT_LOCALE, dirOf, resolveLocale, translate, type Key } from '../index'
import type { Dict, LocaleCode } from '../types'

/**
 * שפה חסרה נראית למשתמש, לא למפתח.
 *
 * הטיפוסים כבר מוודאים שהמפתחות קיימים. מה שהם אינם תופסים הוא
 * מחרוזת שנשארה בשפת המקור, או משתנה החלפה שנשמט בתרגום — ואז
 * המשתמש רואה "גרסה {v}" במקום מספר.
 */

/** כל מסלולי המפתחות במילון. */
function keysOf(node: unknown, prefix = ''): string[] {
  if (typeof node === 'string') return [prefix]
  if (typeof node !== 'object' || node === null) return []
  return Object.entries(node).flatMap(([k, v]) => keysOf(v, prefix ? `${prefix}.${k}` : k))
}

/** {v}, {pct} … מתוך מחרוזת. */
function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
}

function valueAt(dict: Dict, key: string): string {
  let node: unknown = dict
  for (const part of key.split('.')) node = (node as Record<string, unknown>)[part]
  return node as string
}

const base = keysOf(DICTS[DEFAULT_LOCALE]).sort()
const codes = LOCALES.map((l) => l.code)

test('ברירת המחדל היא צרפתית', () => {
  expect(DEFAULT_LOCALE).toBe('fr')
})

test('לכל שפה ברשימה יש מילון, ולהפך', () => {
  expect(codes.sort()).toEqual(Object.keys(DICTS).sort())
})

for (const code of codes) {
  test(`[${code}] אותם מפתחות בדיוק כמו בצרפתית`, () => {
    expect(keysOf(DICTS[code]).sort()).toEqual(base)
  })

  test(`[${code}] משתני ההחלפה נשמרו בתרגום`, () => {
    for (const key of base) {
      const expected = placeholders(valueAt(DICTS[DEFAULT_LOCALE], key))
      if (expected.length === 0) continue
      expect(placeholders(valueAt(DICTS[code], key)), `${code} · ${key}`).toEqual(expected)
    }
  })

  test(`[${code}] אין מחרוזת ריקה`, () => {
    for (const key of base) {
      expect(valueAt(DICTS[code], key).trim(), `${code} · ${key}`).not.toBe('')
    }
  })
}

/*
 * מילון שהועתק ולא תורגם.
 *
 * השוואה מפתח-מפתח אינה עובדת כאן: "Drive" ו-"Audio" זהים בצרפתית
 * ובגרמנית בצדק, ורשימת חריגים ידנית הייתה גדלה עם כל שפה חדשה עד
 * שתפסיק לתפוס משהו. במקום זה נמדד השיעור — שפה שרובה זהה למקור
 * היא העתק, וקוגנטים בודדים אינם.
 */
test('אף מילון אינו העתק של הצרפתית', () => {
  const url = new Set(['library.drivePlaceholder'])
  for (const code of codes.filter((c) => c !== DEFAULT_LOCALE)) {
    const checked = base.filter((k) => !url.has(k))
    const same = checked.filter((k) => valueAt(DICTS[code], k) === valueAt(DICTS[DEFAULT_LOCALE], k))
    const share = same.length / checked.length
    expect(share, `${code}: ${same.length}/${checked.length} זהות למקור — ${same.slice(0, 8).join(', ')}`).toBeLessThan(0.2)
  }
})

test('השפות שאינן לטיניות תורגמו במלואן', () => {
  // בעברית ובערבית אין קוגנטים עם צרפתית, ולכן כאן ההשוואה מוחלטת
  // שמות מותג זהים בכל שפה בכוונה, ואינם עדות לתרגום חסר
  // ‏"R&B" הוא שם הז'אנר גם בעברית, כמו שם מותג — אין לו תרגום
  const skip = new Set(['library.drivePlaceholder', 'library.drive', 'spotify.title', 'music.genreRnb', 'music.sourceDeezer', 'music.sourceSpotify', 'music.sourceYouTube', 'music.sourceDrive', 'legal.youtubeTitle'])
  for (const code of ['he', 'ar'] as LocaleCode[]) {
    const same = base.filter(
      (k) => !skip.has(k) && valueAt(DICTS[code], k) === valueAt(DICTS[DEFAULT_LOCALE], k)
    )
    expect(same, `${code}: מחרוזות שנשארו בצרפתית`).toEqual([])
  }
})

test('החלפת משתנים עובדת', () => {
  expect(translate('fr', 'settings.version', { v: '2.0.0' })).toBe('Version 2.0.0')
  expect(translate('he', 'library.episodes', { n: 12 })).toBe('12 פרקים')
  expect(translate('ar', 'library.count', { titles: 4, files: 9 })).toContain('4')
})

test('משתנה חסר נשאר גלוי ואינו הופך ל-undefined', () => {
  // "undefined" על המסך נראה כמו טקסט; סוגריים נראים כמו תקלה שמדווחים עליה
  expect(translate('fr', 'settings.version', {})).toBe('Version {v}')
})

test('שפה לא מוכרת נופלת לצרפתית', () => {
  expect(resolveLocale('ja-JP')).toBe('fr')
  expect(resolveLocale(null)).toBe('fr')
  expect(resolveLocale('')).toBe('fr')
})

test('תג שפה עם אזור ממופה נכון', () => {
  expect(resolveLocale('fr-CA')).toBe('fr')
  expect(resolveLocale('en-GB')).toBe('en')
  expect(resolveLocale('he-IL')).toBe('he')
  // "iw" הוא התג הישן של עברית ועדיין מוחזר במערכות מסוימות
  expect(resolveLocale('iw')).toBe('he')
  expect(resolveLocale('ar-EG')).toBe('ar')
})

test('כיוון הכתיבה נכון לכל שפה', () => {
  expect(dirOf('he')).toBe('rtl')
  expect(dirOf('ar')).toBe('rtl')
  for (const c of codes.filter((c) => c !== 'he' && c !== 'ar')) expect(dirOf(c), c).toBe('ltr')
})

test('מפתח שאינו קיים מחזיר את עצמו ולא קורס', () => {
  expect(translate('fr', 'nope.not.here' as Key)).toBe('nope.not.here')
})
