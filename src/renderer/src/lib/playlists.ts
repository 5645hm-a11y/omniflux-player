import type { QueueItem } from '../store/queue'

/**
 * פלייליסטים של המשתמש, מכל המקורות יחד.
 *
 * עד עכשיו לא היה דבר כזה: התור נעלם בסגירת התוכנה, ופלייליסט מ-YouTube
 * היה תצוגה בלבד. כאן נשמר מה שאפשר לנגן — שיר מקומי, מהדרייב או
 * מ-YouTube — עם השם והעטיפה, כדי שהרשימה תוצג גם בלי רשת.
 *
 * האחסון מקומי, כמו היסטוריית ההאזנה. אם הוא חסום או מלא — הפעולה
 * מחזירה false, והממשק אומר שלא נשמר, במקום להעמיד פנים שכן.
 */

export type StoredItem = Omit<QueueItem, 'key'>

export interface Playlist {
  id: string
  name: string
  items: StoredItem[]
  createdAt: number
  updatedAt: number
}

const KEY = 'omniflux.playlists.v1'
const MAX_ITEMS = 1000
const listeners = new Set<() => void>()

export function onPlaylistsChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function playlists(): Playlist[] {
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw ? (JSON.parse(raw) as Playlist[]) : []
    return Array.isArray(list) ? list.sort((a, b) => b.updatedAt - a.updatedAt) : []
  } catch {
    return []
  }
}

function save(list: Playlist[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    return false
  }
  for (const fn of listeners) fn()
  return true
}

/** בלי המפתח של התור: הוא חד-פעמי, ונוצר מחדש בכל ניגון */
function strip(item: QueueItem | StoredItem): StoredItem {
  const { key: _key, ...rest } = item as QueueItem
  return rest
}

export function createPlaylist(name: string, items: Array<QueueItem | StoredItem> = [], now = Date.now()): Playlist | null {
  const clean = name.trim().slice(0, 120)
  if (!clean) return null
  const playlist: Playlist = {
    id: `pl${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: clean,
    items: items.slice(0, MAX_ITEMS).map(strip),
    createdAt: now,
    updatedAt: now
  }
  return save([playlist, ...playlists()]) ? playlist : null
}

function update(id: string, change: (p: Playlist) => Playlist, now = Date.now()): boolean {
  const list = playlists()
  const index = list.findIndex((p) => p.id === id)
  if (index < 0) return false
  list[index] = { ...change(list[index]), updatedAt: now }
  return save(list)
}

/** הוספה בלי כפילות: אותו שיר מאותו מקור לא ייכנס פעמיים */
export function addToPlaylist(id: string, items: Array<QueueItem | StoredItem>, now = Date.now()): boolean {
  return update(id, (p) => {
    const have = new Set(p.items.map((i) => `${i.source}:${i.ref}`))
    const fresh = items.map(strip).filter((i) => !have.has(`${i.source}:${i.ref}`))
    return { ...p, items: [...p.items, ...fresh].slice(0, MAX_ITEMS) }
  }, now)
}

export function removeFromPlaylist(id: string, index: number): boolean {
  return update(id, (p) => ({ ...p, items: p.items.filter((_, i) => i !== index) }))
}

export function renamePlaylist(id: string, name: string): boolean {
  const clean = name.trim().slice(0, 120)
  return clean ? update(id, (p) => ({ ...p, name: clean })) : false
}

export function deletePlaylist(id: string): boolean {
  return save(playlists().filter((p) => p.id !== id))
}
