import { expect, test } from '@playwright/test'
import { aggregate, coreTitle, mainArtist, relevance, type SourceHit } from '../music-search'

const hit = (kind: SourceHit['kind'], title: string, artist: string, extra: Partial<SourceHit> = {}): SourceHit => ({
  kind, ref: `${kind}:${title}`, title, artist, quality: 'full', ...extra
})

test('אותה הקלטה מכל המקורות היא תוצאה אחת', () => {
  const results = aggregate('yellow', [
    hit('youtube', 'Yellow', 'Coldplay', { cover: 'yt.jpg' }),
    hit('spotify', 'Yellow', 'Coldplay', { cover: 'sp.jpg', album: 'Parachutes', durationSec: 269 }),
    hit('local', 'Yellow', 'Coldplay', { cover: 'art://c.jpg' }),
    hit('deezer', 'Yellow', 'Coldplay', { quality: 'preview', cover: 'dz.jpg' })
  ])
  expect(results).toHaveLength(1)
  const [song] = results
  // מה שכבר שלך מתנגן ראשון; קטע של 30 שניות תמיד אחרון
  expect(song.sources.map((s) => s.kind)).toEqual(['local', 'spotify', 'youtube', 'deezer'])
  // העטיפה והמטא-דאטה הטובים ביותר מבין כולם
  expect(song.cover).toBe('sp.jpg')
  expect(song.album).toBe('Parachutes')
  expect(song.durationSec).toBe(269)
})

test('גרסאות של אותו שיר מתאחדות: remaster, feat., ושם אמן חלקי', () => {
  expect(coreTitle('Yellow - Remastered 2021')).toBe('yellow')
  expect(coreTitle('Umbrella (feat. JAY-Z)')).toBe('umbrella')
  expect(coreTitle('Hello (Radio Edit)')).toBe('hello')
  expect(mainArtist('Rihanna, JAY-Z')).toBe('rihanna')
  expect(mainArtist('Simon & Garfunkel')).toBe('simon')
  const results = aggregate('umbrella', [
    hit('spotify', 'Umbrella', 'Rihanna, JAY-Z'),
    hit('youtube', 'Umbrella (feat. JAY-Z)', 'Rihanna')
  ])
  expect(results).toHaveLength(1)
  expect(results[0].sources).toHaveLength(2)
})

test('קובץ בלי אמן מצטרף לתוצאה עם אותו שם — ולא נשאר בודד', () => {
  const results = aggregate('yellow', [
    hit('youtube', 'Yellow', 'Coldplay'),
    hit('drive', 'Yellow', '')
  ])
  expect(results).toHaveLength(1)
  expect(results[0].sources[0].kind).toBe('drive')
  expect(results[0].artist).toBe('Coldplay')
})

test('שני שירים שונים באותו שם נשארים נפרדים', () => {
  const results = aggregate('hello', [hit('spotify', 'Hello', 'Adele'), hit('spotify', 'Hello', 'Lionel Richie')])
  expect(results).toHaveLength(2)
})

test('עברית, ניקוד וסימנים אינם שוברים את ההתאמה', () => {
  const results = aggregate('תגידי', [
    hit('youtube', 'תגידי', 'עומר אדם'),
    hit('local', 'תגידי', 'עומר אדם'),
    hit('spotify', 'Beyoncé Song', 'Beyoncé')
  ])
  expect(results).toHaveLength(1)
  expect(results[0].sources.map((s) => s.kind)).toEqual(['local', 'youtube'])
  expect(relevance('beyonce', 'Song', 'Beyoncé')).toBe(1)
})

test('מדורג לפי התאמה לשאילתה, ושורות שלא עונות עליה אינן מוצגות', () => {
  const results = aggregate('coldplay yellow', [
    hit('youtube', 'Fix You', 'Coldplay'),
    hit('youtube', 'Yellow', 'Coldplay'),
    hit('youtube', 'Unrelated', 'Someone')
  ])
  expect(results.map((r) => r.title)).toEqual(['Yellow', 'Fix You'])
})

test('אותו מקור פעמיים — נשאר רק הראשון מכל סוג', () => {
  const results = aggregate('yellow', [
    hit('youtube', 'Yellow', 'Coldplay', { ref: 'a' }),
    hit('youtube', 'Yellow (Official Video)', 'Coldplay', { ref: 'b' })
  ])
  expect(results[0].sources).toHaveLength(1)
  expect(results[0].sources[0].ref).toBe('a')
})
