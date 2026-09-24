import { useEffect, useRef, useState } from 'react'
import { NEUTRAL, paletteFromBlob, type Palette } from '../lib/palette'

/**
 * תאורת האווירה של הנגן.
 *
 * המנוע שולח פריים כל שנייה וחצי, ומכאן יוצא לוח צבעים. המעבר בין
 * לוחות נעשה ב-CSS ולא כאן — קפיצת צבע חדה בכל דגימה הייתה מרצדת.
 */
export function useAmbientFromVideo(active: boolean): Palette {
  const [palette, setPalette] = useState<Palette>(NEUTRAL)
  // דגימה אחת בכל רגע: פענוח חופף בזבוז, והתוצאה שלו כבר לא רלוונטית
  const working = useRef(false)

  useEffect(() => {
    if (!active) {
      setPalette(NEUTRAL)
      return
    }
    const off = window.cinema.player.onFrame((bytes) => {
      if (working.current) return
      working.current = true
      const blob = new Blob([bytes as BlobPart], { type: 'image/jpeg' })
      paletteFromBlob(blob)
        .then(setPalette)
        .catch(() => undefined)
        .finally(() => {
          working.current = false
        })
    })
    return off
  }, [active])

  return palette
}

/** אותו דבר מכרזה: התמונה כבר בממשק, ואין צורך במנוע */
export function useAmbientFromImage(src: string | null): Palette {
  const [palette, setPalette] = useState<Palette>(NEUTRAL)

  useEffect(() => {
    if (!src) {
      setPalette(NEUTRAL)
      return
    }
    let alive = true
    fetch(src)
      .then((r) => r.blob())
      .then(paletteFromBlob)
      .then((p) => {
        if (alive) setPalette(p)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [src])

  return palette
}
