import type { YouTubeTrack } from '@shared/api'
import { normalize } from '@shared/music-search'

/**
 * היסטוריית ההאזנה, ומנוע ההמלצות שנשען עליה.
 *
 * הכול נשאר במחשב: אין שרת, אין חשבון, ואין מה לדלוף. המודל פשוט
 * בכוונה — כזה שאפשר להסביר למשתמש במשפט ("כי שמעת את X"):
 *
 *   זיקה לאמן = Σ השמעות × דעיכה(כמה זמן עבר) − דילוגים × ½
 *
 * הדעיכה היא זמן מחצית של 21 יום: מה ששמעת החודש שוקל יותר ממה ששמעת
 * לפני חצי שנה, אבל לא מתאפס. דילוג נספר רק כשהשיר הוחלף בתוך 30 שניות
 * — אחרי זה זה "שמעתי מספיק", לא "לא אהבתי".
 *
 * השיר מזוהה לפי אמן ושם מנורמלים, ולא לפי המקור: אותו שיר מהמחשב
 * ומ-YouTube הוא אותו שיר, וההיסטוריה שלו אחת.
 */

export interface Listen {
  id: string
  title: string
  artist: string
  source: 'local' | 'drive' | 'youtube' | 'preview'
  ref: string
  cover: string | null
  plays: number
  skips: number
  firstAt: number
  lastAt: number
  youtube?: YouTubeTrack
}

const KEY = 'omniflux.listening.v1'
const MAX = 2000
const HALF_LIFE_MS = 21 * 24 * 60 * 60 * 1000

/** אותה נרמול כמו בחיפוש האחוד — שיר שנמצא בחיפוש והיסטוריית ההאזנה שלו חייבים להסכים מי הוא */
export const norm = normalize

export function listenId(artist: string, title: string): string {
  return `${norm(artist)}|${norm(title)}`
}

function load(): Record<string, Listen> {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Record<string, Listen>) : {}
  } catch {
    return {}
  }
}

function save(all: Record<string, Listen>): void {
  const entries = Object.values(all)
  if (entries.length > MAX) {
    entries.sort((a, b) => b.lastAt - a.lastAt)
    all = Object.fromEntries(entries.slice(0, MAX).map((e) => [e.id, e]))
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* אחסון מלא או חסום — ההיסטוריה פשוט לא נשמרת הפעם */
  }
  for (const fn of listeners) fn()
}

const listeners = new Set<() => void>()
export function onListeningChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

let current: { id: string; startedAt: number } | null = null

/** שיר התחיל. אם הקודם הוחלף תוך 30 שניות — זה דילוג */
export function recordListen(item: {
  title: string
  artist: string
  source: Listen['source']
  ref: string
  cover: string | null
  youtube?: YouTubeTrack
}, now = Date.now()): void {
  const all = load()
  if (current && now - current.startedAt < 30_000 && all[current.id]) {
    all[current.id] = { ...all[current.id], skips: all[current.id].skips + 1 }
  }
  const id = listenId(item.artist, item.title)
  const prev = all[id]
  all[id] = {
    id,
    title: item.title,
    artist: item.artist,
    source: item.source,
    ref: item.ref,
    cover: item.cover ?? prev?.cover ?? null,
    youtube: item.youtube ?? prev?.youtube,
    plays: (prev?.plays ?? 0) + 1,
    skips: prev?.skips ?? 0,
    firstAt: prev?.firstAt ?? now,
    lastAt: now
  }
  current = { id, startedAt: now }
  save(all)
}

export function history(): Listen[] {
  return Object.values(load())
}

export function recentlyPlayed(limit = 20): Listen[] {
  return history().sort((a, b) => b.lastAt - a.lastAt).slice(0, limit)
}

/** זיקה לכל אמן, לפי הנוסחה שבראש הקובץ */
export function artistAffinity(list: Listen[] = history(), now = Date.now()): Map<string, number> {
  const out = new Map<string, number>()
  for (const listen of list) {
    if (!listen.artist) continue
    const decay = Math.pow(0.5, (now - listen.lastAt) / HALF_LIFE_MS)
    const key = norm(listen.artist)
    out.set(key, (out.get(key) ?? 0) + listen.plays * decay - listen.skips * 0.5)
  }
  return out
}

export function topArtists(limit = 12, list: Listen[] = history()): Array<{ name: string; score: number; cover: string | null }> {
  const affinity = artistAffinity(list)
  const display = new Map<string, { name: string; cover: string | null }>()
  for (const listen of list.sort((a, b) => b.lastAt - a.lastAt)) {
    const key = norm(listen.artist)
    if (listen.artist && !display.has(key)) display.set(key, { name: listen.artist, cover: listen.cover })
  }
  return [...affinity.entries()]
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, score]) => ({ name: display.get(key)?.name ?? key, cover: display.get(key)?.cover ?? null, score }))
}

/**
 * "בשבילך": מדרג מועמדים לפי הזיקה לאמן שלהם.
 *
 * שיר ששמעת בשעתיים האחרונות יורד למטה — "בשבילך" אמור להציע, לא לחזור
 * על מה שהרגע נגמר. מועמד בלי זיקה בכלל נשאר ברשימה בציון אפס, כדי שגם
 * משתמש חדש יראה מדף מלא ולא ריק.
 */
export function rankForYou<T extends { title: string; artist: string }>(
  candidates: T[],
  list: Listen[] = history(),
  now = Date.now()
): Array<T & { reason: string | null }> {
  const affinity = artistAffinity(list, now)
  const recent = new Map(list.map((l) => [l.id, l.lastAt]))
  const seen = new Set<string>()
  return candidates
    .map((candidate, order) => {
      const id = listenId(candidate.artist, candidate.title)
      const artistScore = affinity.get(norm(candidate.artist)) ?? 0
      const playedAt = recent.get(id)
      const penalty = playedAt && now - playedAt < 2 * 60 * 60 * 1000 ? 5 : 0
      // הסדר המקורי שובר שוויון: אצל משתמש חדש המדף נשאר בסדר שבו הגיע
      return { candidate, id, score: artistScore - penalty - order * 0.001, artistScore }
    })
    .filter(({ id }) => (seen.has(id) ? false : (seen.add(id), true)))
    .sort((a, b) => b.score - a.score)
    .map(({ candidate, artistScore }) => ({ ...candidate, reason: artistScore > 0.5 ? candidate.artist : null }))
}
