import { useEffect } from 'react'
import type { VideoViewport } from '@shared/api'

/**
 * מודד לאן הווידאו הולך, ומדווח.
 *
 * חלון המנוע נפרד מחלון הממשק ויושב מתחתיו, ולכן "וידאו קטן בפינה"
 * אינו אלמנט בעמוד אלא חלון שצריך להזיז. הממשק הוא היחיד שיודע
 * איפה נשאר מקום פנוי, ולכן המדידה כאן והביצוע שם.
 *
 * מה שמופיע במסך במקום הווידאו הוא חור: אזור שקוף לגמרי בחלון
 * הממשק. אין כאן חיתוך, אין מסכה, ואין העתקת פריימים — רואים את
 * חלון הווידאו עצמו דרך הזכוכית.
 */

/** נשלח רק כשהמלבן באמת השתנה — geometry בכל פריים מציף את הצינור */
function same(a: VideoViewport, b: VideoViewport): boolean {
  return (
    a.mode === b.mode &&
    Math.round(a.x) === Math.round(b.x) &&
    Math.round(a.y) === Math.round(b.y) &&
    Math.round(a.width) === Math.round(b.width) &&
    Math.round(a.height) === Math.round(b.height)
  )
}

const HIDDEN: VideoViewport = { mode: 'hidden', x: 0, y: 0, width: 0, height: 0 }

export function useVideoViewport(mode: 'full' | 'slot' | 'hidden'): void {
  useEffect(() => {
    let last: VideoViewport | null = null
    let raf = 0
    let until = 0

    const measure = (): VideoViewport => {
      if (mode === 'hidden') return HIDDEN
      if (mode === 'full') {
        return { mode: 'full', x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }
      }
      const el = document.querySelector('[data-video-slot]')
      if (!el) return HIDDEN
      const r = el.getBoundingClientRect()
      // מלבן באפס רוחב מופיע בפריים שבין הסרת אלמנט להוספת הבא
      if (r.width < 2 || r.height < 2) return HIDDEN
      return { mode: 'rect', x: r.left, y: r.top, width: r.width, height: r.height }
    }

    const push = (): void => {
      const next = measure()
      if (last && same(last, next)) return
      last = next
      window.cinema.window.setVideoViewport(next)
    }

    /*
     * מדידה אחת אינה מספיקה: הסרגל נכנס בהנפשה, והמלבן שלו נע במשך
     * כשליש שנייה. במקום לנחש מתי הוא נח, נמדד כל פריים בחלון קצר
     * אחרי כל שינוי — ומה שלא זז ממילא אינו נשלח.
     */
    const pump = (): void => {
      push()
      if (performance.now() < until) raf = requestAnimationFrame(pump)
      else raf = 0
    }

    const kick = (): void => {
      until = performance.now() + 700
      if (!raf) raf = requestAnimationFrame(pump)
    }

    kick()
    window.addEventListener('resize', kick)

    const el = document.querySelector('[data-video-slot]')
    const ro = el ? new ResizeObserver(kick) : null
    if (el && ro) ro.observe(el)

    return () => {
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('resize', kick)
      ro?.disconnect()
    }
  }, [mode])
}
