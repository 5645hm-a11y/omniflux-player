import { create } from 'zustand'
import type { YouTubeTrack } from '@shared/api'

/**
 * הנגן המוטמע של YouTube, ומה שהוא מדווח.
 *
 * ‏YouTube מתיר ניגון רק בנגן הרשמי, גלוי — בלי חילוץ זרם ובלי שמע
 * בלבד. לכן יש iframe אחד, שנשאר חי לאורך כל הניווט, ושיר חדש נטען
 * לתוכו (loadVideoById) ולא ב-iframe חדש: טעינה מחדש של הנגן עולה
 * שנייה-שתיים ומשמיעה פרסומת פתיחה מחדש.
 *
 * השליטה היא דרך postMessage — אותו פרוטוקול שה-iframe_api הרשמי
 * משתמש בו — בלי לטעון סקריפט חיצוני לממשק. הנגן מדווח
 * `infoDelivery` עם זמן, משך ומצב כמה פעמים בשנייה.
 */

/** מצבי הנגן של YouTube: ‎-1 לא התחיל, 0 נגמר, 1 מנגן, 2 מושהה, 3 טוען, 5 מוכן */
export type YouTubeState = -1 | 0 | 1 | 2 | 3 | 5

interface Store {
  track: YouTubeTrack | null
  state: YouTubeState
  time: number
  duration: number
  volume: number
  muted: boolean
  /** קוד שגיאה של הנגן: 2 מזהה לא תקין, 5 HTML5, 100 לא נמצא, 101/150 בעלים חסם הטמעה */
  error: number | null
  /** עולה בכל פעם שסרטון נגמר — התור מאזין לזה */
  endedCount: number

  play: (track: YouTubeTrack) => void
  pause: () => void
  resume: () => void
  seek: (seconds: number) => void
  setVolume: (value: number) => void
  stop: () => void
}

let frame: HTMLIFrameElement | null = null
let pendingSeek: number | null = null

/** פרסומת לפני השיר: הנגן "לא התחיל" (‎-1) אבל הזמן זז — זה הזמן של הפרסומת */
export function inAd(state: { track: YouTubeTrack | null; state: number; time: number }): boolean {
  return Boolean(state.track) && state.state === -1 && state.time > 0.5
}
let ready = false
let queued: Array<{ func: string; args: unknown[] }> = []

function command(func: string, args: unknown[] = []): void {
  if (!frame?.contentWindow || !ready) {
    queued.push({ func, args })
    return
  }
  frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args, id: 'omniflux', channel: 'widget' }), '*')
}

/** כתובת ה-embed לשיר הראשון. השירים הבאים נטענים בפקודה, לא בכתובת */
export function embedUrl(videoId: string, locale: string): string {
  const params = new URLSearchParams({
    enablejsapi: '1', autoplay: '1', playsinline: '1', rel: '0', modestbranding: '1',
    hl: locale.split('-')[0], iv_load_policy: '3'
  })
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`
}

export const useYouTube = create<Store>((set, get) => ({
  track: null,
  state: -1,
  time: 0,
  duration: 0,
  volume: 100,
  muted: false,
  error: null,
  endedCount: 0,

  play: (track) => {
    pendingSeek = null
    const same = get().track?.videoId === track.videoId
    set({ track, error: null, time: same ? get().time : 0, duration: track.durationSec, state: same ? get().state : 3 })
    // ה-iframe הראשון נטען מהכתובת; אחריו — פקודה לאותו נגן
    if (frame && ready) command('loadVideoById', [{ videoId: track.videoId, startSeconds: 0 }])
  },
  pause: () => {
    set({ state: 2 })
    command('pauseVideo')
  },
  resume: () => {
    set({ state: 1 })
    command('playVideo')
  },
  seek: (seconds) => {
    /*
     * דילוג בזמן פרסומת נשמר ומבוצע כשהשיר מתחיל.
     *
     * ‏YouTube מתעלם מ-seekTo בזמן פרסומת (המצב אז הוא ‎-1 והזמן הוא של
     * הפרסומת). נמדד: חץ ימינה ולחיצה על הסרגל לא הזיזו כלום — המשתמש
     * לחץ, ושום דבר לא קרה. עכשיו הבקשה מחכה לשיר.
     */
    if (inAd(get())) {
      pendingSeek = Math.max(0, seconds)
      return
    }
    set({ time: seconds })
    command('seekTo', [Math.max(0, seconds), true])
  },
  setVolume: (value) => {
    const volume = Math.max(0, Math.min(100, Math.round(value)))
    set({ volume, muted: volume === 0 })
    command('setVolume', [volume])
    command(volume === 0 ? 'mute' : 'unMute')
  },
  stop: () => {
    command('stopVideo')
    set({ track: null, state: -1, time: 0, duration: 0, error: null })
  }
}))

/**
 * חיבור ה-iframe שהרכיב יצר.
 *
 * ‏"listening" מבקש מהנגן להתחיל לדווח; בלי זה אין infoDelivery בכלל.
 * פקודות שנשלחו לפני שהנגן מוכן נשמרות ונשלחות ברגע שהוא מוכן —
 * אחרת "השהה" שנלחץ בשנייה הראשונה נבלע.
 */
export function attachYouTubeFrame(element: HTMLIFrameElement | null): void {
  frame = element
  ready = false
  if (!element) {
    queued = []
    return
  }
  element.addEventListener('load', () => {
    element.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 'omniflux', channel: 'widget' }), '*')
  })
}

function applyVolume(volume: number): void {
  command('setVolume', [volume])
  command(volume === 0 ? 'mute' : 'unMute')
}

let listening = false

/** מאזין אחד לכל התוכנה, להודעות של הנגן */
export function listenToYouTube(): void {
  if (listening) return
  listening = true
  window.addEventListener('message', (event) => {
    if (!frame || event.source !== frame.contentWindow) return
    if (!/^https:\/\/www\.youtube(-nocookie)?\.com$/.test(event.origin)) return
    let message: { event?: string; info?: unknown }
    try {
      message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
    } catch {
      return
    }
    const store = useYouTube.getState()
    if (message.event === 'onReady' || message.event === 'initialDelivery') {
      if (!ready) {
        ready = true
        const pending = queued
        queued = []
        for (const { func, args } of pending) command(func, args)
        applyVolume(store.volume)
      }
      return
    }
    if (message.event === 'onError') {
      useYouTube.setState({ error: Number(message.info) || 5 })
      return
    }
    if (message.event === 'onStateChange' || message.event === 'infoDelivery') {
      const info = (message.event === 'onStateChange' ? { playerState: message.info } : message.info) as {
        playerState?: number
        currentTime?: number
        duration?: number
        volume?: number
        muted?: boolean
      }
      const patch: Partial<Store> = {}
      if (typeof info.currentTime === 'number') patch.time = info.currentTime
      if (typeof info.duration === 'number' && info.duration > 0) patch.duration = info.duration
      /*
       * העוצמה של המשתמש היא האמת, לא הדיווח של הנגן.
       *
       * נמדד: בזמן פרסומת הנגן מדווח volume=0, muted=true — בזמן
       * שהרמקולים משמיעים. אמון בדיווח הזה הציג סרגל עוצמה על אפס
       * והשתקה, ולחיצה על "בטל השתקה" הייתה עושה את ההפך ממה שנראה.
       * לכן הדיווח אינו נכתב לחנות, ובכל מעבר לניגון העוצמה שלנו
       * מוחלת מחדש — מה שגם מבטל השתקה אוטומטית של הפעלה ראשונה.
       */
      if (typeof info.playerState === 'number') {
        const next = info.playerState as YouTubeState
        // "נגמר" נספר פעם אחת לכל סרטון, גם כשהנגן מדווח אותו כמה פעמים
        if (next === 0 && store.state !== 0) patch.endedCount = store.endedCount + 1
        if (next === 1 && store.state !== 1) {
          applyVolume(store.volume)
          // הפרסומת נגמרה והשיר התחיל — עכשיו מבצעים את הדילוג שחיכה
          if (pendingSeek !== null) {
            command('seekTo', [pendingSeek, true])
            patch.time = pendingSeek
            pendingSeek = null
          }
        }
        patch.state = next
      }
      useYouTube.setState(patch)
    }
  })
}
