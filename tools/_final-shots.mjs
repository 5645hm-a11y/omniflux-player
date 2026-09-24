/**
 * צילומי אימות סופיים: כל מסך, בשלוש שפות.
 *
 * צרפתית היא ברירת המחדל, ועברית וערבית הן שתי השפות מימין לשמאל —
 * הן זו שבודקת שהפריסה באמת מתהפכת ולא רק שהטקסט מתחלף.
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

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-fin-'))
const media = path.join(sandbox, 'Films')
fs.mkdirSync(media, { recursive: true })
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-find-'))

const titles = [
  'Dune.2021.2160p.mkv',
  'Inception.2010.1080p.mp4',
  'Le Parrain 1972.mp4',
  'Interstellar 2014 2160p.mkv',
  'Blade Runner 2049 2017 1080p.mkv',
  'Whiplash 2014.mkv',
  'Parasite 2019 1080p.mkv',
  'La La Land 2016.mp4'
]
for (const n of titles) {
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
await page.waitForFunction(() => window.cinema.library.scanning().then((s) => !s), null, { timeout: 300_000 })

const shot = async (name) => {
  const buf = await page.screenshot()
  fs.writeFileSync(path.join(out, name), buf)
  return buf.length
}

/** לחיצה על כפתור לפי חלק מהשם הנגיש, בכל שפה */
const click = (parts) =>
  page.evaluate((list) => {
    const btns = [...document.querySelectorAll('button')]
    const el = btns.find((b) => list.some((p) => b.getAttribute('aria-label')?.includes(p)))
    if (el) el.click()
    return Boolean(el)
  }, parts)

const NAV = {
  library: ['Biblioth', 'Library', 'הספרייה', 'المكتبة'],
  music: ['Musique', 'Music', 'מוזיקה', 'الموسيقى'],
  settings: ['Param', 'Setting', 'הגדרות', 'الإعدادات'],
  search: ['Rechercher', 'Search', 'חיפוש', 'بحث']
}

for (const lang of ['fr', 'he', 'ar']) {
  await page.evaluate((c) => window.cinema.app.setLocale(c), lang)
  await page.reload()
  // המטא-דאטה נמשכת מחדש בשפה החדשה
  await page.evaluate(() => window.cinema.library.scan())
  await page.waitForFunction(() => window.cinema.library.scanning().then((s) => !s), null, { timeout: 300_000 })
  await page.evaluate(() => window.cinema.hub.refresh())
  // ‏6500 ולא 9000: מחזור השקופיות הוא 9 שניות, וצילום על הגבול
  // נתפס באמצע אנימציית הכניסה
  await page.waitForTimeout(6500)

  const dir = await page.evaluate(() => document.documentElement.dir)
  const sizes = []

  sizes.push(['בית', await shot(`${lang}-1-home.png`)])

  if (!(await click(NAV.music))) throw new Error(`Music navigation missing for ${lang}`)
  await page.waitForTimeout(1400)
  sizes.push(['מוזיקה', await shot(`${lang}-2-music.png`)])

  await click(NAV.library)
  await page.waitForTimeout(2000)
  sizes.push(['ספרייה', await shot(`${lang}-3-library.png`)])

  await click(NAV.settings)
  await page.waitForTimeout(1300)
  sizes.push(['הגדרות', await shot(`${lang}-4-settings.png`)])

  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(700)

  if (!(await click(NAV.search))) throw new Error(`Search navigation missing for ${lang}`)
  await page.waitForTimeout(700)
  await page.keyboard.type('matrix', { delay: 40 })
  await page.waitForTimeout(4200)
  sizes.push(['חיפוש', await shot(`${lang}-5-search.png`)])
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)

  console.log(`${lang} (${dir}): ` + sizes.map(([n, b]) => `${n} ${(b / 1024).toFixed(0)}KB`).join(' · '))
}

await page.evaluate(() => window.cinema.app.setLocale('fr'))
await app.close().catch(() => undefined)
try { execFileSync('taskkill', ['/F', '/IM', 'mpv.exe'], { stdio: 'ignore' }) } catch { /* לא רץ */ }
for (const d of [sandbox, data]) fs.rmSync(d, { recursive: true, force: true })
