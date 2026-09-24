/**
 * צילומי מסך לדף ההורדה.
 *
 * הצילום נעשה דרך capturePage של Chromium — כלומר רק מה שהממשק שלנו
 * מצייר, בלי לקרוא פיקסלים מהמסך. מסך הספרייה אטום, ולכן הוא מצטלם
 * שלם.
 */
import { _electron as electron } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const engine = path.join(root, 'resources', 'engine', 'mpv.exe')
const out = path.join(root, 'site', 'assets')
fs.mkdirSync(out, { recursive: true })

// שם התיקייה מופיע בצילום שעל דף ההורדה — תיקייה זמנית עם שם אקראי
// נראית שם כמו תקלה
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-shot-'))
const media = path.join(sandbox, 'הסרטים שלי')
fs.mkdirSync(media, { recursive: true })
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-shotd-'))

// כותרים אמיתיים, כדי שהכרזות שיירדו יהיו אמיתיות
const titles = [
  'מטריקס 1999 1080p BluRay.mp4',
  'Inception.2010.1080p.BluRay.mp4',
  'האביר האפל 2008.mp4',
  'Interstellar 2014 2160p.mkv',
  'שר הטבעות אחוות הטבעת 2001.mp4',
  'Blade Runner 2049 2017 1080p.mkv',
  'Dune.2021.2160p.mkv',
  'הסנדק 1972.mp4',
  'Fight Club 1999 1080p.mp4',
  'Whiplash 2014.mkv',
  'Parasite 2019 1080p.mkv',
  'La La Land 2016.mp4'
]
for (const name of titles) {
  execFileSync(
    engine,
    ['av://lavfi:testsrc2=size=160x120:rate=10:duration=1', '--no-config', '--ovc=libx264',
     '--no-audio', `--o=${name}`],
    { cwd: media, stdio: 'ignore' }
  )
}

const env = {}
for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v
delete env.ELECTRON_RUN_AS_NODE

const app = await electron.launch({ args: [root, `--user-data-dir=${data}`], cwd: root, env, timeout: 60_000 })
const page = await app.firstWindow()
await page.setViewportSize({ width: 1400, height: 880 })
await page.waitForTimeout(3500)

await app.evaluate(async ({ app: a }, dir) => {
  await a.__library.addLocalFolder(dir)
}, media)
await page.evaluate(() => window.cinema.library.scan())
await page.waitForFunction(() => window.cinema.library.scanning().then((s) => !s), null, { timeout: 240_000 })
await page.waitForTimeout(1500)

const shot = async (name) => {
  const buf = await page.screenshot()
  fs.writeFileSync(path.join(out, name), buf)
  console.log(`✓ ${name}  ${(buf.length / 1024).toFixed(0)} KB`)
}

// מסך הספרייה
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'הספרייה')
  btn?.click()
})
await page.waitForTimeout(2500)
await shot('library.png')

// מסך החיפוש
await page.evaluate(() => {
  const close = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'סגירה')
  close?.click()
})
await page.waitForTimeout(600)
await page.evaluate(() => {
  const btn = document.querySelector('button[aria-label="חיפוש"]')
  if (btn instanceof HTMLElement) btn.click()
})
await page.waitForTimeout(600)
await page.keyboard.type('matrix', { delay: 60 })
await page.waitForTimeout(4000)
await shot('search.png')

const cat = await page.evaluate(() => window.cinema.library.catalog())
console.log(`  ${cat.items.length} פריטים · ${cat.items.filter((i) => i.meta && !i.meta.notFound).length} זוהו`)

await app.close().catch(() => undefined)
try {
  execFileSync('taskkill', ['/F', '/IM', 'mpv.exe'], { stdio: 'ignore' })
} catch {
  /* לא רץ */
}
for (const d of [sandbox, data]) fs.rmSync(d, { recursive: true, force: true })
