/**
 * מדידת ניגודיות על מה שבאמת מצויר.
 *
 * לא חישוב מהטוקנים: טקסט כאן יושב על זכוכית מטושטשת, על כרזות ועל
 * מדרגים, והרקע האפקטיבי אינו הצבע שכתוב בקוד. לכן המסך מצולם,
 * הפיקסלים נקראים, והרקע נלקח מהצבע השכיח שמאחורי כל טקסט.
 *
 * הסף הוא WCAG AA: 4.5:1 לטקסט רץ ו-3:1 לטקסט גדול (18.66px+ מודגש
 * או 24px+).
 */
import { _electron as electron } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const engine = path.join(root, 'resources', 'engine', 'mpv.exe')

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-ct-'))
const media = path.join(sandbox, 'Films')
fs.mkdirSync(media, { recursive: true })
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-ctd-'))

for (const n of ['Dune.2021.2160p.mkv', 'Inception.2010.1080p.mp4', 'Le Parrain 1972.mp4']) {
  execFileSync(engine, ['av://lavfi:testsrc2=size=160x120:rate=10:duration=1', '--no-config',
    '--ovc=libx264', '--no-audio', `--o=${n}`], { cwd: media, stdio: 'ignore' })
}

const env = {}
for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v
delete env.ELECTRON_RUN_AS_NODE

const app = await electron.launch({ args: [root, `--user-data-dir=${data}`], cwd: root, env, timeout: 60_000 })
const page = await app.firstWindow()
await page.setViewportSize({ width: 1440, height: 900 })
await page.waitForTimeout(3000)

await app.evaluate(async ({ app: a }, dir) => { await a.__library.addLocalFolder(dir) }, media)
await page.evaluate(() => window.cinema.library.scan())
await page.waitForFunction(() => window.cinema.library.scanning().then((s) => !s), null, { timeout: 240_000 })
await page.evaluate(() => window.cinema.hub.refresh())
await page.waitForTimeout(6500)

/**
 * הבדיקה עצמה רצה בתוך הדף.
 *
 * צילום המסך נטען לקנבס, וכל אלמנט טקסט נמדד מול הפיקסלים שמאחוריו
 * בפועל — כולל טשטוש, שכבות והצללות.
 */
const MEASURE = (b64) => new Promise((resolve) => {
  const img = new Image()
  img.onload = () => {
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    const ctx = c.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(img, 0, 0)
    const dpr = img.width / window.innerWidth

    const lum = ([r, g, b]) => {
      const f = (v) => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
      }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const ratio = (a, b) => {
      const [hi, lo] = lum(a) > lum(b) ? [lum(a), lum(b)] : [lum(b), lum(a)]
      return (hi + 0.05) / (lo + 0.05)
    }
    const parse = (s) => {
      const m = s.match(/rgba?\(([^)]+)\)/)
      if (!m) return null
      const p = m[1].split(',').map((x) => parseFloat(x))
      return [p[0], p[1], p[2], p[3] === undefined ? 1 : p[3]]
    }

    const out = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const seen = new Set()
    let node
    while ((node = walker.nextNode())) {
      const text = node.textContent.trim()
      if (text.length < 2) continue
      const el = node.parentElement
      if (!el || seen.has(el)) continue
      seen.add(el)

      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.display === 'none') continue
      const opacity = parseFloat(cs.opacity)
      if (opacity < 0.5) continue

      const r = el.getBoundingClientRect()
      if (r.width < 4 || r.height < 4 || r.top < 0 || r.left < 0) continue
      if (r.bottom > window.innerHeight || r.right > window.innerWidth) continue

      /*
       * טקסט שמוסתר אינו נמדד.
       *
       * מאחורי שכבת החיפוש יושב מסך הבית המטושטש, ובכרטיסים יש
       * שכבות ריחוף ב-opacity אפס. שתיהן נראות ל-DOM אבל אינן
       * נקראות, ומדידתן ייצרה כישלונות מדומים על טקסט שאיש אינו רואה.
       */
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const top = document.elementFromPoint(cx, cy)
      if (!top || (top !== el && !el.contains(top) && !top.contains(el))) continue

      const fg = parse(cs.color)
      if (!fg || fg[3] < 0.5) continue

      // דגימת האזור: הצבע השכיח הוא הרקע, ופיקסלים קרובים לצבע
      // הטקסט נזרקים כדי לא למדוד את הטקסט מול עצמו
      const x = Math.round(r.left * dpr)
      const y = Math.round(r.top * dpr)
      const w = Math.max(1, Math.round(r.width * dpr))
      const h = Math.max(1, Math.round(r.height * dpr))
      let px
      try {
        px = ctx.getImageData(x, y, w, h).data
      } catch {
        continue
      }

      const counts = new Map()
      for (let i = 0; i < px.length; i += 4) {
        const near = Math.abs(px[i] - fg[0]) + Math.abs(px[i + 1] - fg[1]) + Math.abs(px[i + 2] - fg[2])
        if (near < 140) continue
        const key = (px[i] >> 3) + ',' + (px[i + 1] >> 3) + ',' + (px[i + 2] >> 3)
        const entry = counts.get(key)
        if (entry) entry.n++
        else counts.set(key, { n: 1, c: [px[i], px[i + 1], px[i + 2]] })
      }
      if (counts.size === 0) continue
      let best = null
      for (const v of counts.values()) if (!best || v.n > best.n) best = v

      const size = parseFloat(cs.fontSize)
      const weight = parseInt(cs.fontWeight, 10) || 400
      const large = size >= 24 || (size >= 18.66 && weight >= 700)

      out.push({
        text: text.slice(0, 42),
        ratio: Math.round(ratio(fg, best.c) * 100) / 100,
        need: large ? 3 : 4.5,
        size,
        weight,
        fg: cs.color,
        bg: 'rgb(' + best.c.join(',') + ')'
      })
    }
    resolve(out)
  }
  img.src = 'data:image/png;base64,' + b64
})

const screens = []

async function measure(label) {
  await page.waitForTimeout(900)
  const b64 = (await page.screenshot()).toString('base64')
  const rows = await page.evaluate(MEASURE, b64)
  screens.push({ label, rows })
  const bad = rows.filter((r) => r.ratio < r.need)
  console.log(`\n${label}: ${rows.length} אלמנטים · ${bad.length} מתחת לסף`)
  for (const r of bad.slice(0, 8)) {
    console.log(`  ✕ ${r.ratio}:1 (דרוש ${r.need}) ${r.size}px/${r.weight}  "${r.text}"`)
    console.log(`      ${r.fg} על ${r.bg}`)
  }
}

// מסך הבית
await measure('בית')

// מוזיקה
await page.evaluate(() => {
  const labels = ['Musique', 'Music', 'מוזיקה', 'الموسيقى']
  const el = [...document.querySelectorAll('button')].find((button) =>
    labels.some((label) => button.getAttribute('aria-label')?.includes(label))
  )
  if (el instanceof HTMLElement) el.click()
})
await measure('מוזיקה')

// ספרייה
await page.evaluate(() => {
  const el = document.querySelector('button[aria-label*="ibliothè"], button[aria-label*="ibrary"], button[aria-label*="ספרי"], button[aria-label*="مكتب"]')
  if (el instanceof HTMLElement) el.click()
})
await measure('ספרייה')

// הגדרות
await page.evaluate(() => {
  const el = document.querySelector('button[aria-label*="aramèt"], button[aria-label*="etting"], button[aria-label*="הגדר"], button[aria-label*="إعداد"]')
  if (el instanceof HTMLElement) el.click()
})
await measure('הגדרות')

await page.keyboard.press('Escape')
await page.waitForTimeout(400)
await page.keyboard.press('Escape')
await page.waitForTimeout(600)

// חיפוש
await page.evaluate(() => {
  const labels = ['Rechercher', 'Search', 'חיפוש', 'بحث']
  const el = [...document.querySelectorAll('button')].find((button) =>
    labels.some((label) => button.getAttribute('aria-label')?.includes(label))
  )
  if (el instanceof HTMLElement) el.click()
})
await page.waitForTimeout(700)
await page.keyboard.type('matrix', { delay: 40 })
await page.waitForTimeout(4200)
await measure('חיפוש')

const all = screens.flatMap((s) => s.rows)
const failures = all.filter((r) => r.ratio < r.need)
console.log(`\n${'='.repeat(52)}`)
console.log(`סה"כ ${all.length} אלמנטים · ${failures.length} מתחת לסף WCAG AA`)
if (all.length > 0) {
  const worst = [...all].sort((a, b) => a.ratio - b.ratio)[0]
  console.log(`הנמוך ביותר: ${worst.ratio}:1 — "${worst.text}"`)
}

await app.close().catch(() => undefined)
try { execFileSync('taskkill', ['/F', '/IM', 'mpv.exe'], { stdio: 'ignore' }) } catch { /* לא רץ */ }
for (const d of [sandbox, data]) fs.rmSync(d, { recursive: true, force: true })
process.exit(failures.length > 0 ? 1 : 0)
