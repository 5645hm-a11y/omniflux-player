import { expect, test } from '@playwright/test'
import { addToPlaylist, createPlaylist, deletePlaylist, playlists, removeFromPlaylist, renamePlaylist } from '../playlists'
import type { QueueItem } from '../../store/queue'

const store = new Map<string, string>()
test.beforeEach(() => {
  store.clear()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v)
  }
})

const song = (ref: string, source: QueueItem['source'] = 'local'): QueueItem => ({
  key: `k-${ref}`, source, ref, title: ref, artist: 'Band', cover: null
})

test('פלייליסט נשמר עם שירים ממקורות שונים, בלי המפתח החד-פעמי של התור', () => {
  const created = createPlaylist('  ערב  ', [song('a'), song('b', 'youtube'), song('c', 'drive')])
  expect(created?.name).toBe('ערב')
  const [stored] = playlists()
  expect(stored.items.map((i) => `${i.source}:${i.ref}`)).toEqual(['local:a', 'youtube:b', 'drive:c'])
  expect('key' in stored.items[0]).toBe(false)
})

test('שם ריק אינו יוצר פלייליסט', () => {
  expect(createPlaylist('   ')).toBeNull()
  expect(playlists()).toHaveLength(0)
})

test('הוספה בלי כפילויות, הסרה, שינוי שם ומחיקה', () => {
  const p = createPlaylist('Mix', [song('a')])!
  addToPlaylist(p.id, [song('a'), song('b')])
  expect(playlists()[0].items.map((i) => i.ref)).toEqual(['a', 'b'])
  removeFromPlaylist(p.id, 0)
  expect(playlists()[0].items.map((i) => i.ref)).toEqual(['b'])
  renamePlaylist(p.id, 'New name')
  expect(playlists()[0].name).toBe('New name')
  deletePlaylist(p.id)
  expect(playlists()).toHaveLength(0)
})

test('האחרון שעודכן — ראשון', () => {
  const a = createPlaylist('A', [], 1000)!
  createPlaylist('B', [], 2000)
  addToPlaylist(a.id, [song('x')], 3000)
  expect(playlists().map((p) => p.name)).toEqual(['A', 'B'])
})

test('אחסון חסום: אומרים שלא נשמר, לא מעמידים פנים', () => {
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceededError') }
  }
  expect(createPlaylist('X', [song('a')])).toBeNull()
})
