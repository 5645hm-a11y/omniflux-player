import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

/**
 * מכין את סימן המפתח מקובץ הקונספט.
 *
 * שני דברים שהמקור אינו נותן: הרקע שלו שחור אטום, והסימן צף בתוך
 * שוליים ריקים עצומים. סימן שיושב על זכוכית כהה חייב רקע שקוף —
 * ריבוע שחור על זכוכית נראה כמו חור — ושוליים ריקים הופכים אותו
 * לזעיר בכל מקום שבו הוא מוצג.
 *
 * לכן: הרקע מוסר לפי בהירות, והתמונה נחתכת אל גבולות הדיו בפועל.
 */

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(root, 'docs', 'brand', 'developer-mark-concept-v1.png')
const target = path.join(root, 'src', 'renderer', 'src', 'assets', 'developer-mark.png')

fs.mkdirSync(path.dirname(target), { recursive: true })

const dataUri = `data:image/png;base64,${fs.readFileSync(source).toString('base64')}`
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent('<!doctype html><html><body></body></html>')

const out = await page.evaluate(async (src) => {
  const img = new Image()
  img.src = src
  await img.decode()
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  const ctx = c.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const data = ctx.getImageData(0, 0, c.width, c.height)
  const p = data.data

  // הסרת רקע לפי בהירות, ומדידת גבולות הדיו באותו מעבר
  let minX = c.width
  let minY = c.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4
      const lum = (0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2]) / 255
      const a = Math.max(0, Math.min(1, (lum - 0.14) / 0.12))
      p[i + 3] = Math.round(a * 255)
      if (a > 0.35) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  ctx.putImageData(data, 0, 0)
  if (maxX < 0) throw new Error('לא נמצא דיו בתמונה')

  // שוליים קטנים סביב הדיו, כדי שהסימן לא ייגע בקצה
  const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.06)
  const sx = Math.max(0, minX - pad)
  const sy = Math.max(0, minY - pad)
  const sw = Math.min(c.width - sx, maxX - minX + 1 + pad * 2)
  const sh = Math.min(c.height - sy, maxY - minY + 1 + pad * 2)

  const cropped = document.createElement('canvas')
  cropped.width = sw
  cropped.height = sh
  cropped.getContext('2d').drawImage(c, sx, sy, sw, sh, 0, 0, sw, sh)
  return { uri: cropped.toDataURL('image/png'), w: sw, h: sh }
}, dataUri)

fs.writeFileSync(target, Buffer.from(out.uri.split(',')[1], 'base64'))
await browser.close()
console.log(`נוצר ${path.relative(root, target)} · ${out.w}x${out.h}`)
