import { expect, test } from '@playwright/test'
import { artistAffinity, listenId, rankForYou, recordListen, recentlyPlayed, topArtists, type Listen } from '../listening'

const DAY = 24 * 60 * 60 * 1000
const now = Date.UTC(2026, 8, 23, 12)

function listen(artist: string, title: string, plays: number, daysAgo: number, skips = 0): Listen {
  return {
    id: listenId(artist, title), title, artist, source: 'local', ref: title, cover: null,
    plays, skips, firstAt: now - 90 * DAY, lastAt: now - daysAgo * DAY
  }
}

test('אותו שיר מכל מקור הוא אותו שיר: שם ואמן מנורמלים', () => {
  expect(listenId('Coldplay ', 'Yellow')).toBe(listenId('COLDPLAY', 'yellow!'))
  expect(listenId('Beyoncé', 'Halo')).toBe(listenId('Beyonce', 'Halo'))
})

test('זיקה דועכת עם הזמן, ודילוג מוריד', () => {
  const affinity = artistAffinity([
    listen('A', 'a1', 10, 0),
    listen('B', 'b1', 10, 42), // שני זמני מחצית — רבע
    listen('C', 'c1', 2, 0, 6)
  ], now)
  expect(affinity.get('a')).toBeCloseTo(10, 5)
  expect(affinity.get('b')).toBeCloseTo(2.5, 5)
  expect(affinity.get('c')).toBeLessThan(0)
})

test('"בשבילך" מקדים את האמנים שאתה שומע, ומוריד את מה שהרגע נשמע', () => {
  const history = [listen('Adele', 'Hello', 8, 1), listen('Queen', 'Bohemian', 1, 0)]
  const ranked = rankForYou([
    { title: 'Random', artist: 'Nobody' },
    { title: 'Skyfall', artist: 'Adele' },
    { title: 'Bohemian', artist: 'Queen' }
  ], history, now)
  expect(ranked[0].title).toBe('Skyfall')
  expect(ranked[0].reason).toBe('Adele')
  // נשמע לפני פחות משעתיים — יורד לסוף, גם עם זיקה
  expect(ranked[ranked.length - 1].title).toBe('Bohemian')
})

test('משתמש חדש מקבל מדף מלא בסדר המקורי, בלי כפילויות', () => {
  const ranked = rankForYou([
    { title: 'One', artist: 'X' }, { title: 'Two', artist: 'Y' }, { title: 'one', artist: 'x' }
  ], [], now)
  expect(ranked.map((r) => r.title)).toEqual(['One', 'Two'])
  expect(ranked.every((r) => r.reason === null)).toBe(true)
})

test('האמנים המובילים: לפי זיקה, ובלי אמנים שדילגת עליהם', () => {
  const top = topArtists(5, [listen('Adele', 'a', 5, 1), listen('Queen', 'q', 9, 1), listen('Skip', 's', 1, 1, 5)])
  expect(top.map((a) => a.name)).toEqual(['Queen', 'Adele'])
})

test('החלפת שיר תוך 30 שניות נספרת כדילוג; אחרי זה — לא', () => {
  const store = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v)
  }
  const song = (title: string) => ({ title, artist: 'Band', source: 'local' as const, ref: title, cover: null })
  recordListen(song('First'), now)
  recordListen(song('Second'), now + 10_000) // First דולג
  recordListen(song('Third'), now + 200_000) // Second נשמע מספיק
  const byTitle = new Map(recentlyPlayed(10).map((l) => [l.title, l]))
  expect(byTitle.get('First')?.skips).toBe(1)
  expect(byTitle.get('Second')?.skips).toBe(0)
  expect(recentlyPlayed(1)[0].title).toBe('Third')
})
