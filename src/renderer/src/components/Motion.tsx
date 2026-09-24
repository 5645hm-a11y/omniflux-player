import { motion, useReducedMotion } from 'motion/react'
import { usePlayer } from '../store/player'

/**
 * שתי התנועות שנושאות את הנגן.
 *
 * שתיהן מתארות את אותו דבר — האם הצליל רץ — ולכן שתיהן נגזרות
 * מאותו מצב ולא מטיימר משלהן. אנימציה שרצה כשהמוזיקה עצורה היא
 * שקר קטן שהעין תופסת מיד.
 */

/**
 * הסמל שמתחלף בין נגינה להשהיה בלי לקפוץ.
 *
 * שני האייקונים של Lucide הם נתיבים שונים, ומעבר ביניהם הוא החלפה
 * חדה. כאן שניהם מצוירים כשני מלבנים: בהשהיה הם שני פסים, ובנגינה
 * הם נסגרים למשולש. אותם שני צלעות, שני מצבים — ולכן אפשר להניע
 * ביניהם ברצף אחד.
 *
 * הצורות נבנות מ-`clip-path`, כי הוא היחיד שיודע לעוות מצולע
 * בלי לצייר מחדש ובלי לגעת בפריסה.
 */
const PAUSE_LEFT = 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)'
const PLAY_LEFT = 'polygon(0% 0%, 100% 22%, 100% 78%, 0% 100%)'
const PAUSE_RIGHT = 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)'
const PLAY_RIGHT = 'polygon(0% 22%, 100% 50%, 100% 50%, 0% 78%)'

export function PlayGlyph({
  glyph,
  size = 18,
  className = ''
}: {
  /**
   * מה מצויר, לא מה קורה בנגן.
   *
   * כפתור מראה את הפעולה הבאה ולא את המצב הנוכחי — בזמן נגינה
   * מצויר סמל השהיה. הפרמטר נקרא על שם הצורה בדיוק כדי שלא ייקשר
   * בטעות ל-`paused` ההפוך.
   */
  glyph: 'play' | 'pause'
  size?: number
  className?: string
}): React.JSX.Element {
  const playing = glyph === 'play'
  const still = useReducedMotion()
  const bar = { width: size * 0.3, height: size, background: 'currentColor' }
  const spring = still
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 420, damping: 32, mass: 0.7 }

  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center ${className}`}
      style={{ gap: playing ? 0 : size * 0.16, transition: 'gap 220ms var(--ease-out)' }}
    >
      <motion.span
        style={bar}
        animate={{ clipPath: playing ? PLAY_LEFT : PAUSE_LEFT }}
        transition={spring}
      />
      <motion.span
        style={bar}
        animate={{ clipPath: playing ? PLAY_RIGHT : PAUSE_RIGHT }}
        transition={spring}
      />
    </span>
  )
}

/**
 * גלי הקול.
 *
 * ארבעה פסים בקצבים שונים. הקצבים אינם כפולות זה של זה בכוונה —
 * ‏1.0‏ ,1.3‏ ,0.9‏ ,1.15 שניות — כי מחזורים שמתיישרים נראים כמו
 * מטרונום, והאוזן מצפה לתנועה שאינה חוזרת על עצמה.
 *
 * הצבע הוא סגול-בהיר ולא לבן: זהו מצב ("משהו מתנגן"), ובשפה הזאת
 * מצב הוא תמיד סגול.
 */
const BARS = [
  { delay: '0s', duration: '1s' },
  { delay: '0.18s', duration: '1.3s' },
  { delay: '0.06s', duration: '0.9s' },
  { delay: '0.24s', duration: '1.15s' }
]

export function Equalizer({
  active,
  className = ''
}: {
  active: boolean
  className?: string
}): React.JSX.Element {
  return (
    <span className={`flex h-3.5 items-end gap-[2px] ${className}`} aria-hidden="true">
      {BARS.map((b, i) => (
        <span
          key={i}
          className={`eq-bar ${active ? 'eq-bar-on' : ''}`}
          style={{ '--eq-delay': b.delay, '--eq-duration': b.duration } as React.CSSProperties}
        />
      ))}
    </span>
  )
}

/** גלי קול שמחוברים ישירות למנוע — לשימוש בסרגל הנגן */
export function LiveEqualizer({ className = '' }: { className?: string }): React.JSX.Element {
  const paused = usePlayer((s) => s.engine.paused)
  const path = usePlayer((s) => s.engine.path)
  return <Equalizer active={Boolean(path) && !paused} className={className} />
}
