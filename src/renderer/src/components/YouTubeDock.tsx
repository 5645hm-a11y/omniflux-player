import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { create } from 'zustand'
import { motion } from 'motion/react'
import { attachYouTubeFrame, embedUrl, useYouTube } from '../store/youtube'
import { useQueue } from '../store/queue'
import { useI18n, useT } from '../i18n'
import { IconButton } from './ui'

/**
 * הנגן של YouTube — תמיד גלוי, תמיד אותו iframe.
 *
 * תנאי YouTube: הנגן המוטמע חייב להיראות (לפחות 200×200), ואסור לחלץ
 * ממנו שמע בלבד. לכן אין כאן משטח נסתר כמו ב-Spotify: בכל מסך הנגן
 * צף בפינה, ובמסך "מתנגן עכשיו" הוא מתיישב במקום העטיפה ומתרחב.
 *
 * ה-iframe לעולם אינו נבנה מחדש כשהוא זז — רק המסגרת שלו משנה מקום
 * וגודל. בנייה מחדש הייתה טוענת את הנגן מאפס: שנייה של שחור, ופרסומת
 * פתיחה נוספת.
 */

/** המקום במסך "מתנגן עכשיו" שבו הנגן מתיישב, כשהמסך פתוח */
const useSlot = create<{ element: HTMLElement | null; set: (el: HTMLElement | null) => void }>((set) => ({
  element: null,
  set: (element) => set({ element })
}))

export function YouTubeSlot({ className }: { className?: string }): React.JSX.Element {
  const register = useSlot((s) => s.set)
  return <div ref={(el) => register(el)} className={className} />
}

/** 16:9, ועם מרווח מעל 200×200 — המינימום של YouTube חל על ה-iframe, בלי המסגרת */
const FLOAT = { width: 400, height: 225 }

export function YouTubeDock(): React.JSX.Element | null {
  const t = useT()
  const locale = useI18n((s) => s.locale)
  const track = useYouTube((s) => s.track)
  const error = useYouTube((s) => s.error)
  const stop = useYouTube((s) => s.stop)
  const slot = useSlot((s) => s.element)
  const [rect, setRect] = useState<DOMRect | null>(null)
  // הכתובת נקבעת פעם אחת, לשיר הראשון; השאר נטענים בפקודה לאותו נגן
  const firstVideo = useRef<string | null>(null)
  if (track && !firstVideo.current) firstVideo.current = track.videoId
  if (!track) firstVideo.current = null

  useEffect(() => {
    if (!slot) {
      setRect(null)
      return
    }
    const measure = (): void => setRect(slot.getBoundingClientRect())
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(slot)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [slot])

  if (!track || !firstVideo.current) return null

  // במסך "מתנגן עכשיו" — במקום העטיפה; בכל מקום אחר — צף מעל סרגל הנגן
  const docked = rect && rect.width >= 200 && rect.height >= 200
  const style: React.CSSProperties = docked
    ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    : { insetInlineEnd: 20, bottom: 112, width: FLOAT.width, height: FLOAT.height }

  const blocked = error === 101 || error === 150 || error === 100

  return createPortal(
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 34 }}
      style={style}
      className="no-drag pointer-events-auto fixed z-[60] overflow-hidden rounded-o-xl border border-white/10 bg-black shadow-e4"
    >
      <iframe
        key={firstVideo.current}
        ref={attachYouTubeFrame}
        src={embedUrl(firstVideo.current, locale)}
        title={`YouTube — ${track.title}`}
        className="h-full w-full border-0"
        allow="autoplay; encrypted-media; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
      />
      {blocked && (
        <div className="absolute inset-0 grid place-items-center bg-canvas/85 p-4 text-center text-[13px] text-ink-2">
          {t('youtube.blocked')}
        </div>
      )}
      {!docked && (
        <div className="absolute end-2 top-2 flex gap-1 opacity-0 transition-opacity duration-fast hover:opacity-100 focus-within:opacity-100">
          <IconButton
            icon="close"
            label={t('youtube.close')}
            size={15}
            className="h-8 w-8 bg-canvas/80"
            onClick={() => {
              stop()
              useQueue.getState().detach()
            }}
          />
        </div>
      )}
    </motion.div>,
    document.body
  )
}
