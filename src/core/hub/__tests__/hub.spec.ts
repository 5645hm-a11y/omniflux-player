import { expect, test } from '@playwright/test'
import { buildRows, cardOf, continueRow, isResumable, qualityOf, recentRow } from '../index'
import type { MediaItem, PlayProgress } from '../../library/types'

/**
 * ההיגיון של מסך הבית.
 *
 * כל הכללים כאן נראים למשתמש ישירות: מה נכנס ל"המשך צפייה", מה
 * נחשב "נגמר", ואיזה תג איכות מופיע על הכרזה. טעות באחד מהם היא
 * שורה שמציעה לחזור לסרט שכבר נגמר.
 */

function item(over: Partial<MediaItem> = {}): MediaItem {
  return {
    id: over.id ?? 'i1',
    source: 'local',
    uri: 'C:/x.mp4',
    fileName: over.fileName ?? 'Film 2020 1080p.mp4',
    root: 'C:/',
    trail: [],
    kind: 'movie',
    title: 'Film',
    year: 2020,
    season: null,
    episode: null,
    meta: null,
    ...over
  }
}

const prog = (position: number, duration: number, updatedAt = Date.now()): PlayProgress => ({
  position,
  duration,
  updatedAt
})

test('תג האיכות נגזר משם הקובץ', () => {
  expect(qualityOf('Dune.2021.2160p.mkv')).toBe('4K')
  expect(qualityOf('Movie 4K HDR.mkv')).toBe('4K')
  expect(qualityOf('Film.1080p.BluRay.mp4')).toBe('1080p')
  expect(qualityOf('Old 720p.avi')).toBe('720p')
  expect(qualityOf('סרט בעברית.mp4')).toBeNull()
})

test('HDR מזוהה גם בלי רזולוציה', () => {
  expect(qualityOf('Show S01E01 HDR.mkv')).toBe('HDR')
})

test('"1080" בתוך מילה אינו תג איכות', () => {
  // שם כמו "Apollo 1080x" אינו הצהרת רזולוציה
  expect(qualityOf('film2160pextra.mkv')).toBeNull()
})

test('פריט שנפתח לרגע אינו "המשך צפייה"', () => {
  expect(isResumable(prog(10, 5400))).toBe(false)
})

test('פריט שכמעט נגמר אינו "המשך צפייה"', () => {
  // 96% — הכותרות רצות, אין למה לחזור
  expect(isResumable(prog(5184, 5400))).toBe(false)
})

test('פריט באמצע כן נכנס', () => {
  expect(isResumable(prog(2700, 5400))).toBe(true)
})

test('קליפ קצר מדי אינו נספר', () => {
  expect(isResumable(prog(20, 40))).toBe(false)
})

test('"המשך צפייה" ממוין מהאחרון שנצפה', () => {
  const items = [item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })]
  const cards = continueRow(items, {
    a: prog(1000, 5400, 100),
    b: prog(1000, 5400, 300),
    c: prog(1000, 5400, 200)
  })
  expect(cards.map((c) => c.itemId)).toEqual(['b', 'c', 'a'])
})

test('"המשך צפייה" מדלג על מה שלא נפתח', () => {
  const items = [item({ id: 'a' }), item({ id: 'b' })]
  expect(continueRow(items, { a: prog(1000, 5400) }).map((c) => c.itemId)).toEqual(['a'])
})

test('פריט שכבר באמצע צפייה אינו חוזר גם בשורת האחרונים', () => {
  // אחרת אותה כרזה מופיעה פעמיים במסך אחד
  const items = [item({ id: 'a', modifiedAt: 2 }), item({ id: 'b', modifiedAt: 1 })]
  const cards = recentRow(items, { a: prog(1000, 5400) })
  expect(cards.map((c) => c.itemId)).toEqual(['b'])
})

test('שורת האחרונים מקבצת פרקים לכותר אחד', () => {
  const eps = [1, 2, 3].map((n) =>
    item({ id: `e${n}`, kind: 'episode', title: 'Série', episode: n, modifiedAt: n })
  )
  const cards = recentRow(eps, {})
  expect(cards.length, 'סדרה אחת ולא שלושה פרקים').toBe(1)
  expect(cards[0].episodes).toBe(3)
})

test('ההתקדמות מחושבת כיחס', () => {
  const card = cardOf(item(), prog(1350, 5400))
  expect(card.progress).toBeCloseTo(0.25, 3)
})

test('כרטיס בלי התקדמות אינו מקבל פס', () => {
  expect(cardOf(item()).progress).toBeUndefined()
})

test('מקור הכרטיס משקף את מקור הקובץ', () => {
  expect(cardOf(item({ source: 'gdrive' })).source).toBe('gdrive')
  expect(cardOf(item({ source: 'local' })).source).toBe('local')
})

test('שורה ריקה אינה נכנסת למסך', () => {
  // כותרת בלי תוכן מתחתיה נראית כמו תקלה בטעינה
  const rows = buildRows([
    { key: 'continue', cards: [] },
    { key: 'recent', cards: [cardOf(item())] }
  ])
  expect(rows.map((r) => r.key)).toEqual(['recent'])
})
