/**
 * חילוץ צבעים מתמונה, לתאורת האווירה.
 *
 * הכלל: תאורה טובה לוקחת את הצבע ה*מאפיין* ולא את הממוצע. ממוצע של
 * פריים צבעוני הוא תמיד אפור בוצי, ולכן דוגמים לתאים לפי גוון,
 * מוותרים על מה שכהה או חיוור מדי, ובוחרים את הכי חי.
 */

export interface Palette {
  /** הצבע המאפיין, לזוהר המרכזי */
  primary: string
  /** צבע משני מאזור אחר במסך, לעומק */
  secondary: string
  /** האם התמונה כהה — משפיע על עוצמת הזוהר */
  dark: boolean
}

export const NEUTRAL: Palette = {
  primary: 'rgb(229 181 103)',
  secondary: 'rgb(208 140 60)',
  dark: true
}

interface Bucket {
  r: number
  g: number
  b: number
  n: number
  score: number
}

function toHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const R = r / 255
  const G = g / 255
  const B = b / 255
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === R) h = ((G - B) / d + (G < B ? 6 : 0)) / 6
  else if (max === G) h = ((B - R) / d + 2) / 6
  else h = ((R - G) / d + 4) / 6
  return { h: h * 360, s, l }
}

/**
 * מקבל פיקסלים ומחזיר שני צבעים.
 *
 * הניקוד מעדיף רוויה גבוהה ובהירות אמצעית — בדיוק מה שהעין קוראת
 * כ"הצבע של התמונה". פיקסל כמעט שחור או כמעט לבן אינו נושא גוון,
 * ולכן אינו משתתף.
 */
export function paletteFrom(data: Uint8ClampedArray, width: number, height: number): Palette {
  const buckets = new Map<number, Bucket>()
  let sumL = 0
  let counted = 0

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const r = data[i] ?? 0
      const g = data[i + 1] ?? 0
      const b = data[i + 2] ?? 0
      const { h, s, l } = toHsl(r, g, b)
      sumL += l
      counted++
      if (l < 0.12 || l > 0.93 || s < 0.12) continue

      // תא לכל 24 מעלות גוון — מספיק גס כדי לאחד גוונים קרובים
      const key = Math.round(h / 24)
      const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0, score: 0 }
      bucket.r += r
      bucket.g += g
      bucket.b += b
      bucket.n++
      // רוויה גבוהה ובהירות סביב האמצע מנצחות
      bucket.score += s * (1 - Math.abs(l - 0.5) * 1.4)
      buckets.set(key, bucket)
    }
  }

  const dark = counted > 0 && sumL / counted < 0.32
  const ranked = [...buckets.values()].filter((b) => b.n > 2).sort((a, b) => b.score - a.score)

  if (ranked.length === 0) return { ...NEUTRAL, dark }

  const rgb = (b: Bucket): string =>
    `rgb(${Math.round(b.r / b.n)} ${Math.round(b.g / b.n)} ${Math.round(b.b / b.n)})`

  return {
    primary: rgb(ranked[0]!),
    secondary: rgb(ranked[1] ?? ranked[0]!),
    dark
  }
}

/** מפענח תמונה ומחזיר ממנה לוח. הקנבס קטן בכוונה — זו דגימה, לא תצוגה. */
export async function paletteFromBlob(blob: Blob, size = 40): Promise<Palette> {
  const bitmap = await createImageBitmap(blob)
  try {
    const canvas = document.createElement('canvas')
    const ratio = bitmap.height / bitmap.width || 0.56
    canvas.width = size
    canvas.height = Math.max(1, Math.round(size * ratio))
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return NEUTRAL
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    return paletteFrom(data, canvas.width, canvas.height)
  } finally {
    bitmap.close()
  }
}
