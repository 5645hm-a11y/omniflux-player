import { useEffect, useRef } from 'react'
import { create } from 'zustand'

/**
 * איפה המשתמש נמצא.
 *
 * קודם כל מסך היה דגל בוליאני בפני עצמו — `showLibrary`, `showSearch`,
 * `showSettings` — וכל אחד צויר בשכבה משלו מעל הקודם. זה עבד כל עוד
 * הממשק היה מעטפת דקה מעל נגן, אבל צבר שתי תקלות מובנות: שני מסכים
 * יכלו להיות פתוחים בו-זמנית בלי שאיש התכוון לכך, ולא היה שום מקום
 * אחד שיודע להגיד "איפה אנחנו".
 *
 * מסלול יחיד פותר את שניהם. סרגל הצד קורא ממנו ומסמן, מסך שנפתח
 * סוגר מאליו את קודמו, ומעבר בין מסכים הוא שינוי ערך אחד — מה
 * שמאפשר אנימציית מעבר אמיתית במקום הופעה והיעלמות.
 */

export type Route = 'home' | 'search' | 'watchlist' | 'music' | 'library' | 'drive' | 'settings'

interface UiState {
  route: Route
  /** מסך הצפייה — וידאו מלא או "מתנגן כעת" של מוזיקה */
  immersive: boolean
  /** כרטיס הכותר, שנפתח מעל כל מסך */
  detailsId: string | null
  /** לוח הכלים של הנגן: אקולייזר, סנכרון, תמונה */
  power: boolean

  go: (route: Route) => void
  setImmersive: (value: boolean) => void
  openDetails: (id: string) => void
  closeDetails: () => void
  togglePower: () => void
  /**
   * מקש הבריחה: סוגר שכבה אחת, מהעליונה למטה.
   *
   * מחזיר אם משהו באמת נסגר, כדי שהקורא ידע אם להעביר את המקש
   * הלאה. מקש שאינו בורח משום מקום מרגיש כמו תוכנה תקועה.
   */
  escape: () => boolean
}

/**
 * שכבות שנסגרות ב-Escape, מהעליונה למטה.
 *
 * קודם Escape בבוחר פלייליסט החזיר את כל המסך לדף הבית: המאזין הכללי
 * רואה את המקש לפני כל חלון, ולא ידע שיש חלון. כל חלון רושם כאן את
 * הסגירה שלו, ו-escape() סוגר קודם אותו.
 */
const layers: Array<() => void> = []

export function useEscapeLayer(close: () => void, active = true): void {
  const latest = useRef(close)
  latest.current = close
  useEffect(() => {
    if (!active) return
    const layer = (): void => latest.current()
    layers.push(layer)
    return () => {
      const at = layers.lastIndexOf(layer)
      if (at >= 0) layers.splice(at, 1)
    }
  }, [active])
}

export const useUi = create<UiState>((set, get) => ({
  route: 'home',
  immersive: false,
  detailsId: null,
  power: false,

  go: (route) => set({ route, immersive: false, detailsId: null }),
  setImmersive: (immersive) => set({ immersive, detailsId: null, power: false }),
  openDetails: (detailsId) => set({ detailsId }),
  closeDetails: () => set({ detailsId: null }),
  togglePower: () => set((s) => ({ power: !s.power })),

  escape: () => {
    const s = get()
    // חלון פתוח (פלייליסט, תור, בוחר) נסגר ראשון — Escape לא עוזב את המסך מתחתיו
    const top = layers[layers.length - 1]
    if (top) {
      top()
      return true
    }
    if (s.detailsId) {
      set({ detailsId: null })
      return true
    }
    if (s.power) {
      set({ power: false })
      return true
    }
    if (s.immersive) {
      set({ immersive: false })
      return true
    }
    if (s.route !== 'home') {
      set({ route: 'home' })
      return true
    }
    return false
  }
}))
