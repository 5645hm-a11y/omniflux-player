import { create } from 'zustand'
import type { YouTubeTrack } from '@shared/api'
import { usePlayer } from './player'
import { useYouTube } from './youtube'
import { recordListen } from '../lib/listening'

/**
 * תור ניגון אחד לכל המקורות.
 *
 * שיר מהמחשב, שיר מ-YouTube ותצוגה מקדימה של Deezer יושבים באותה
 * רשימה, וכשאחד נגמר — הבא מתחיל, בלי קשר למנוע שמנגן אותו. עד עכשיו
 * לא היה תור בכלל: "נגן הכול" ניגן את השיר הראשון ועצר.
 *
 * כל מקור מדווח "נגמר" בדרך שלו — mpv בסוף קובץ (eof), YouTube במצב 0
 * — והתור מקשיב לשניהם, אבל מתקדם רק כשהשיר שנגמר הוא השיר שלו.
 * הפעלה שהמשתמש יוזם מחוץ לתור (סרט, שיר של Spotify) מנתקת אותו:
 * סוף של סרט לא יקפיץ פתאום שיר מהתור.
 *
 * ‏Spotify אינו כאן בכוונה: לו יש תור משלו בחשבון, והערבוב בין שני
 * תורים הוא בדיוק מה ששבר את ניגון ה-Spotify בעבר.
 */

export type QueueSource = 'local' | 'drive' | 'youtube' | 'preview'

export interface QueueItem {
  /** מפתח יציב, גם כשאותו שיר מופיע פעמיים */
  key: string
  source: QueueSource
  /** מקומי: מזהה בקטלוג. YouTube: videoId. תצוגה מקדימה: כתובת הקובץ */
  ref: string
  title: string
  artist: string
  cover: string | null
  durationSec?: number
  youtube?: YouTubeTrack
}

export type RepeatMode = 'off' | 'all' | 'one'

interface Store {
  items: QueueItem[]
  index: number
  /** האם מה שמתנגן עכשיו הגיע מהתור */
  active: boolean
  repeat: RepeatMode
  playList: (items: QueueItem[], start?: number) => void
  enqueue: (items: QueueItem[]) => void
  playNext: (item: QueueItem) => void
  jump: (index: number) => void
  next: (auto?: boolean) => boolean
  previous: () => boolean
  remove: (index: number) => void
  clear: () => void
  shuffleUpcoming: () => void
  setRepeat: (mode: RepeatMode) => void
  /** הפעלה מחוץ לתור — התור מפסיק להוביל, אבל נשמר */
  detach: () => void
}

let uid = 0
export const queueKey = (): string => `q${Date.now().toString(36)}${(uid++).toString(36)}`

/** עוצר את מה שמתנגן במקורות האחרים, כדי ששני שירים לא יישמעו יחד */
async function silenceOthers(except: QueueSource): Promise<void> {
  if (except !== 'youtube' && useYouTube.getState().track) useYouTube.getState().stop()
  const spotify = await window.cinema.spotify.state().catch(() => null)
  if (spotify?.active && !spotify.paused) await window.cinema.spotify.pause().catch(() => false)
  if (except === 'youtube') {
    const local = await window.cinema.player.state().catch(() => null)
    if (local?.path && !local.paused) await window.cinema.player.playPause().catch(() => undefined)
  }
}

async function start(item: QueueItem): Promise<void> {
  recordListen(item)
  await silenceOthers(item.source)
  if (item.source === 'youtube' && item.youtube) {
    usePlayer.getState().preferYouTube(item.youtube)
    useYouTube.getState().play(item.youtube)
    return
  }
  usePlayer.getState().preferMpv()
  try {
    // מקומי ודרייב — אותו מנוע: playItem יודע להזרים מהדרייב
    if (item.source === 'local' || item.source === 'drive') await window.cinema.player.playItem(item.ref)
    else await window.cinema.player.load({
      target: item.ref, title: item.title, artist: item.artist, cover: item.cover,
      provider: 'Deezer', playbackMode: 'preview', mediaId: item.key
    })
  } catch (error) {
    usePlayer.getState().reportError(error)
  }
}

export const useQueue = create<Store>((set, get) => ({
  items: [],
  index: -1,
  active: false,
  repeat: 'off',

  playList: (items, startAt = 0) => {
    if (items.length === 0) return
    const index = Math.max(0, Math.min(items.length - 1, startAt))
    set({ items, index, active: true })
    void start(items[index])
  },
  enqueue: (items) => {
    if (items.length === 0) return
    const wasEmpty = get().items.length === 0
    set({ items: [...get().items, ...items] })
    if (wasEmpty) get().playList(get().items, 0)
  },
  playNext: (item) => {
    const { items, index } = get()
    if (items.length === 0) return get().playList([item], 0)
    set({ items: [...items.slice(0, index + 1), item, ...items.slice(index + 1)] })
  },
  jump: (index) => {
    const item = get().items[index]
    if (!item) return
    set({ index, active: true })
    void start(item)
  },
  next: (auto = false) => {
    const { items, index, repeat } = get()
    if (items.length === 0) return false
    // חזרה על שיר אחד חלה רק על מעבר אוטומטי; "הבא" שנלחץ תמיד מתקדם
    if (auto && repeat === 'one') {
      get().jump(index)
      return true
    }
    let target = index + 1
    if (target >= items.length) {
      if (repeat !== 'all') {
        set({ active: false })
        return false
      }
      target = 0
    }
    get().jump(target)
    return true
  },
  previous: () => {
    const { index } = get()
    // אחרי שלוש שניות "הקודם" חוזר לתחילת השיר, כמו בכל נגן
    if (usePlayer.getState().engine.position > 3 || index <= 0) {
      usePlayer.getState().seekTo(0)
      return true
    }
    get().jump(index - 1)
    return true
  },
  remove: (at) => {
    const { items, index } = get()
    if (at === index) return
    set({ items: items.filter((_, i) => i !== at), index: at < index ? index - 1 : index })
  },
  clear: () => set({ items: [], index: -1, active: false }),
  shuffleUpcoming: () => {
    const { items, index } = get()
    const head = items.slice(0, index + 1)
    const rest = items.slice(index + 1)
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[rest[i], rest[j]] = [rest[j], rest[i]]
    }
    set({ items: [...head, ...rest] })
  },
  setRepeat: (repeat) => set({ repeat }),
  detach: () => set({ active: false })
}))

let wired = false

/** האזנה ל"נגמר" של שני המנועים. נקרא פעם אחת בעליית הממשק */
export function wireQueue(): void {
  if (wired) return
  wired = true
  window.cinema.player.onEnded((reason) => {
    const { active, items, index } = useQueue.getState()
    const current = items[index]
    if (!active || !current || current.source === 'youtube') return
    if (reason === 'eof') useQueue.getState().next(true)
  })
  let lastEnded = useYouTube.getState().endedCount
  useYouTube.subscribe((state) => {
    const { active, items, index } = useQueue.getState()
    const current = items[index]
    if (state.endedCount !== lastEnded) {
      lastEnded = state.endedCount
      if (active && current?.source === 'youtube') useQueue.getState().next(true)
    }
  })
  /*
   * סרטון שבעליו חסם הטמעה (101/150) או שהוסר (100) אינו עוצר את התור:
   * מדלגים עליו. סרטונים כאלה מסוננים כבר בחיפוש, אבל פלייליסט יכול
   * להכיל סרטון שנחסם אחרי שנוסף.
   */
  let lastError: number | null = null
  useYouTube.subscribe((state) => {
    if (state.error === lastError) return
    lastError = state.error
    const { active, items, index } = useQueue.getState()
    if (state.error !== null && active && items[index]?.source === 'youtube') {
      window.setTimeout(() => useQueue.getState().next(true), 800)
    }
  })
}
