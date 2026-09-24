import { expect, test } from '@playwright/test'

/**
 * התאמת שם לכותר אמיתי מול TMDB.
 *
 * קיצוץ מילים מהסוף מוצא כותר שקבור בתוך שם ארוך — אבל בלי בלימה
 * הוא מחזיר תשובות בטוחות ושגויות: "6 ימים" מחזיר "שישה ימים לנצח".
 * שם שגוי גרוע מכרזה חסרה, ולכן נדרש סף דמיון.
 */

const norm = (s: string): string =>
  (s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

function wordSimilarity(a: string, b: string): number {
  const A = new Set(norm(a).split(' ').filter(Boolean))
  const B = new Set(norm(b).split(' ').filter(Boolean))
  if (!A.size || !B.size) return 0
  let hits = 0
  for (const w of B) if (A.has(w)) hits++
  return hits / Math.max(A.size, B.size)
}

const THRESHOLD = 0.7

// כל אלה תוצאות אמיתיות שהתקבלו מ-TMDB בבדיקה מול המאגר
const cases: Array<[query: string, result: string, shouldAccept: boolean]> = [
  ['אין כמו אבא', 'אין כמו אבא', true],
  ['בגן של דודו', 'בגן של דודו 1', true],
  ['גבעת חלפון אינה עונה', 'גבעת חלפון אינה עונה', true],
  ['6 ימים', 'שישה ימים לנצח', false],
  ['גבורה של', 'אקט של גבורה', false],
  ['בכיוון אחר', 'טעות בכיוון 6: מפלט אחרון', false],
  ['אוצר סיפורי', 'אגדות ברווזים הסרט: אוצר המנורה האבודה', false]
]

for (const [query, result, shouldAccept] of cases) {
  test(`התאמה: "${query}" ↔ "${result}"`, () => {
    const sim = wordSimilarity(query, result)
    expect(sim >= THRESHOLD, `דמיון ${sim.toFixed(2)}`).toBe(shouldAccept)
  })
}

test('אף התאמה שגויה לא עוברת את הסף', () => {
  const wrong = cases.filter(([, , ok]) => !ok)
  for (const [q, r] of wrong) {
    expect(wordSimilarity(q, r), `"${q}" → "${r}"`).toBeLessThan(THRESHOLD)
  }
})

/**
 * כלל הקבלה של התאמה שהגיעה בעזרת מודל שפה, כפי שהוא ב-withAiHelp.
 *
 * חפיפת מילים לבדה אינה מספיקה: שם עברי קצר מתאים במקרה לסרט אחר
 * לגמרי. נדרש אישור חיצוני — כותר לועזי שהמודל ידע, או שנה שהמאגר
 * מאשר — ובנוסף, כשהשם עברי, הכותר שבמאגר חייב להדהד אותו.
 */
const ECHO = 0.6

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

function similarity(a: string, b: string): number {
  const x = norm(a).replace(/["'׳״]/g, '')
  const y = norm(b).replace(/["'׳״]/g, '')
  if (!x || !y) return 0
  if (x === y) return 1
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length)
}

const isHebrew = (s: string): boolean => /[֐-׿]/.test(s)

interface AiCase {
  /** מה שהמודל החזיר */
  title: string
  en: string | null
  year: number | null
  /** מה ש-TMDB החזיר על השאילתה */
  tmdbTitle: string
  tmdbOriginal: string
  tmdbYear: number
  accept: boolean
}

function accepts(c: AiCase): boolean {
  const query = c.en ?? c.title
  if (
    wordSimilarity(query, c.tmdbTitle) < THRESHOLD &&
    wordSimilarity(query, c.tmdbOriginal) < THRESHOLD
  ) {
    return false
  }
  const byOriginal = Boolean(c.en) && wordSimilarity(c.en!, c.tmdbOriginal) >= THRESHOLD
  const byYear = c.year !== null && c.tmdbYear === c.year
  if (!byOriginal && !byYear) return false
  if (isHebrew(c.title) && similarity(c.title, c.tmdbTitle) < ECHO) return false
  return true
}

/** כל אלה תשובות אמיתיות שהתקבלו בבדיקה על 100 כותרים מהמאגר */
const aiCases: AiCase[] = [
  // נכונים — אישור מהכותר הלועזי
  { title: '6 ימים ו7 לילות', en: 'Six Days Seven Nights', year: 1998, tmdbTitle: '6 ימים 7 לילות', tmdbOriginal: 'Six Days Seven Nights', tmdbYear: 1998, accept: true },
  { title: "ג'וני אינגיש", en: 'Johnny English', year: null, tmdbTitle: "ג'וני אינגליש", tmdbOriginal: 'Johnny English', tmdbYear: 2003, accept: true },
  { title: 'חברים', en: 'Friends', year: null, tmdbTitle: 'חברים', tmdbOriginal: 'Friends', tmdbYear: 1994, accept: true },
  { title: 'שלדון הצעיר', en: 'Young Sheldon', year: null, tmdbTitle: 'שלדון הצעיר', tmdbOriginal: 'Young Sheldon', tmdbYear: 2017, accept: true },
  { title: '72 Hours', en: '72 Hours', year: null, tmdbTitle: '72 שעות', tmdbOriginal: '72 HOURS', tmdbYear: 2026, accept: true },
  { title: 'מיליון דולר בייבי', en: 'Million Dollar Baby', year: 2004, tmdbTitle: 'מיליון דולר בייבי', tmdbOriginal: 'Million Dollar Baby', tmdbYear: 2004, accept: true },
  // נכונים — אישור מהשנה
  { title: 'שלי לעולמים', en: null, year: 2018, tmdbTitle: 'שלי לעולמים', tmdbOriginal: 'Forever My Girl', tmdbYear: 2018, accept: true },
  { title: 'כוכבים על פני האדמה', en: null, year: 2007, tmdbTitle: 'כוכבים על פני האדמה', tmdbOriginal: 'तारे ज़मीन पर', tmdbYear: 2007, accept: true },
  // המודל המציא כותר לועזי, ו-TMDB אישר אותו מילה במילה — אבל
  // "Mr. Mom" אינו מזכיר "בוס בהסוואה", ולכן זה נדחה
  { title: 'בוס בהסוואה', en: 'Mr. Mom', year: null, tmdbTitle: 'Mr. Mom', tmdbOriginal: 'Mr. Mom', tmdbYear: 1983, accept: false },
  // שם עברי קצר שקיים במאגר במקרה, בלי שום אישור
  { title: 'המהפך', en: null, year: null, tmdbTitle: 'המהפך', tmdbOriginal: 'The Do-Over', tmdbYear: 2016, accept: false },
  { title: 'העיתון', en: null, year: null, tmdbTitle: 'העיתון', tmdbOriginal: 'The Post', tmdbYear: 2017, accept: false },
  { title: 'על גג העולם', en: null, year: null, tmdbTitle: 'על גג העולם', tmdbOriginal: 'मजा मा', tmdbYear: 2022, accept: false },
  { title: 'מי שעומד מאחורי', en: null, year: null, tmdbTitle: 'מי שעומד מאחורי...', tmdbOriginal: 'Ready or Not', tmdbYear: 2019, accept: false }
]

for (const c of aiCases) {
  test(`התאמה בעזרת AI: "${c.title}" ↔ "${c.tmdbTitle}"`, () => {
    expect(accepts(c)).toBe(c.accept)
  })
}

test('אף התאמה שגויה של AI לא מתקבלת', () => {
  for (const c of aiCases.filter((x) => !x.accept)) {
    expect(accepts(c), `"${c.title}" → "${c.tmdbTitle}"`).toBe(false)
  }
})
