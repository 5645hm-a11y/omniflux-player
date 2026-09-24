/**
 * צילומי המסכים לבדיקה ויזואלית.
 *
 * הצילום נעשה דרך capturePage של Chromium — רק מה שהממשק שלנו מצייר,
 * בלי לקרוא פיקסלים מהמסך.
 */
import { _electron as electron } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const engine = path.join(root, 'resources', 'engine', 'mpv.exe')
const out = process.env.SHOT_DIR ?? path.join(root, '.shots')
fs.mkdirSync(out, { recursive: true })

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-ui-'))
const media = path.join(sandbox, 'Mes films')
fs.mkdirSync(media, { recursive: true })
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-uid-'))

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

const shot = async (name) => {
  const buf = await page.screenshot()
  fs.writeFileSync(path.join(out, name), buf)
  console.log(`✓ ${name}  ${(buf.length / 1024).toFixed(0)} KB`)
}

const setLocale = async (code) => {
  await page.evaluate((c) => window.cinema.app.setLocale(c), code)
  await page.reload()
  await page.waitForTimeout(2500)
}

const click = async (label) =>
  page.evaluate((l) => {
    const el = document.querySelector(`button[aria-label="${l}"]`)
    if (el instanceof HTMLElement) el.click()
  }, label)

const lang = await page.evaluate(() => document.documentElement.lang)
const dir = await page.evaluate(() => document.documentElement.dir)
console.log(`שפת פתיחה: ${lang} · ${dir}`)

await shot('01-welcome.png')

// הספרייה
await app.evaluate(async ({ app: a }, dir) => { await a.__library.addLocalFolder(dir) }, media)
await page.evaluate(() => window.cinema.library.scan())
await page.waitForFunction(() => window.cinema.library.scanning().then((s) => !s), null, { timeout: 240_000 })
await page.waitForTimeout(1200)
await page.evaluate(() => {
  const el = document.querySelector('button[aria-label*="ibliothè"], button[aria-label*="ibrary"]')
  if (el instanceof HTMLElement) el.click()
})
await page.waitForTimeout(2200)
await shot('02-library.png')

// ההגדרות
await page.evaluate(() => {
  const el = document.querySelector('button[aria-label*="aramèt"], button[aria-label*="etting"]')
  if (el instanceof HTMLElement) el.click()
})
await page.waitForTimeout(1200)
await shot('03-settings.png')

// חיפוש — Escape סוגר את ההגדרות ואז את הספרייה
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
await page.keyboard.press('Escape')
await page.waitForTimeout(600)
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')]
  btns.find((b) => b.getAttribute('aria-label')?.includes('Ctrl+K'))?.click()
})
await page.waitForTimeout(700)
await page.keyboard.type('matrix', { delay: 55 })
await page.waitForTimeout(4200)
await shot('04-search.png')

// עברית — בדיקת RTL
await setLocale('he')
console.log(`אחרי מעבר: ${await page.evaluate(() => document.documentElement.dir)}`)
await shot('05-welcome-he.png')
await page.evaluate(() => {
  const el = document.querySelector('button[aria-label="הספרייה"]')
  if (el instanceof HTMLElement) el.click()
})
await page.waitForTimeout(2000)
await shot('06-library-he.png')

// ערבית
await setLocale('ar')
await shot('07-welcome-ar.png')

await setLocale('fr')
await app.close().catch(() => undefined)
try { execFileSync('taskkill', ['/F', '/IM', 'mpv.exe'], { stdio: 'ignore' }) } catch { /* לא רץ */ }
for (const d of [sandbox, data]) fs.rmSync(d, { recursive: true, force: true })
void click
