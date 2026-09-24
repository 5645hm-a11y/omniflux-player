/**
 * צילומי המסך של ה-README ושל אתר המוצר.
 *
 * פרופיל נקי, ספרייה לדוגמה ובלי אף חשבון מחובר — כך שבצילום אין
 * מייל, תמונת פרופיל או תוכן אישי. אחרי build:
 *
 *   node tools/readme-shots.mjs            → docs/screenshots/*.png
 */
import { _electron as electron } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const engine = path.join(root, 'resources', 'engine', 'mpv.exe')
const out = process.env.SHOT_DIR ?? path.join(root, 'docs', 'screenshots')
fs.mkdirSync(out, { recursive: true })

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-readme-'))
const films = path.join(sandbox, 'Movies')
const music = path.join(sandbox, 'Music')
fs.mkdirSync(films, { recursive: true })
fs.mkdirSync(music, { recursive: true })
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-readme-data-'))

const titles = [
  'Dune.Part.Two.2024.2160p.mkv', 'Dune.2021.2160p.mkv', 'Inception.2010.1080p.mp4', 'Interstellar 2014 2160p.mkv',
  'Blade Runner 2049 2017 1080p.mkv', 'Whiplash 2014.mkv', 'Parasite 2019 1080p.mkv', 'La La Land 2016.mp4',
  'Oppenheimer 2023 2160p.mkv', 'Everything Everywhere All at Once 2022.mkv', 'Arrival 2016 1080p.mkv', 'The Grand Budapest Hotel 2014.mkv',
  'Spider-Man Across the Spider-Verse 2023.mkv', 'Mad Max Fury Road 2015 1080p.mkv', 'Past Lives 2023.mkv', 'The Batman 2022 2160p.mkv'
]
for (const n of titles) {
  execFileSync(engine, ['av://lavfi:testsrc2=size=160x120:rate=10:duration=1', '--no-config', '--ovc=libx264', '--no-audio', `--o=${n}`], { cwd: films, stdio: 'ignore' })
}
const songs = [['Nova Lights', 'Midnight Drive'], ['Nova Lights', 'Afterglow'], ['Harbor Echo', 'Paper Boats'], ['Harbor Echo', 'Low Tide'], ['Sela', 'Golden Hour'], ['Sela', 'Stone & Light']]
songs.forEach(([artist, title], i) => {
  execFileSync(engine, ['--no-config', `av://lavfi:sine=frequency=${300 + i * 60}:duration=4`, `--o=${path.join(music, `${artist} - ${title}.mp3`)}`,
    `--oset-metadata=title="${title}",artist="${artist}",album="Sample",genre="Indie"`], { stdio: 'ignore' })
})

const env = {}
for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v
delete env.ELECTRON_RUN_AS_NODE

const app = await electron.launch({ args: [root, `--user-data-dir=${data}`], cwd: root, env, timeout: 60_000 })
const page = await app.firstWindow()
await page.setViewportSize({ width: 1440, height: 900 })
await page.waitForTimeout(3000)

for (const dir of [films, music]) await app.evaluate(async ({ app: a }, d) => { await a.__library.addLocalFolder(d) }, dir)

const shot = async (name) => { fs.writeFileSync(path.join(out, name), await page.screenshot()); console.log('·', name) }
const click = (parts) =>
  page.evaluate((list) => {
    const el = [...document.querySelectorAll('button')].find((b) => list.some((p) => b.getAttribute('aria-label')?.includes(p)))
    if (el) el.click()
    return Boolean(el)
  }, parts)
const NAV = {
  home: ['Home', 'בית'],
  library: ['Library', 'הספרייה'],
  music: ['Music', 'מוזיקה'],
  settings: ['Setting', 'הגדרות']
}

for (const lang of ['en', 'he']) {
  await page.evaluate((c) => window.cinema.app.setLocale(c), lang)
  await page.reload()
  await page.evaluate(() => window.cinema.library.scan())
  await page.waitForFunction(() => window.cinema.library.scanning().then((s) => !s), null, { timeout: 300_000 })
  await page.evaluate(() => window.cinema.hub.refresh())
  await page.waitForTimeout(12000)
  await shot(`${lang}-home.png`)

  await click(NAV.music)
  await page.waitForTimeout(5000)
  await shot(`${lang}-music.png`)
  await page.locator('h2', { hasText: /Moods|מצבי רוח/ }).first().evaluate((el) => el.scrollIntoView({ block: 'start' }))
  await page.waitForTimeout(1500)
  await shot(`${lang}-music-moods.png`)
  await page.locator('header input').first().evaluate((el) => el.scrollIntoView({ block: 'start' }))
  await page.waitForTimeout(600)

  // חיפוש אחוד: המחשב + Deezer (בלי Enter — לא נוגעים במכסת YouTube)
  const box = page.locator('header input').first()
  await box.fill(lang === 'he' ? 'Coldplay' : 'Daft Punk')
  await page.waitForTimeout(4000)
  await shot(`${lang}-music-search.png`)
  await box.fill('')
  await page.waitForTimeout(500)

  await click(NAV.library)
  await page.waitForTimeout(2500)
  await shot(`${lang}-library.png`)

  await click(NAV.settings)
  await page.waitForTimeout(1500)
  await shot(`${lang}-settings.png`)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)
}

await page.evaluate(() => window.cinema.app.setLocale(null))
await app.close().catch(() => undefined)
try { execFileSync('taskkill', ['/F', '/IM', 'mpv.exe'], { stdio: 'ignore' }) } catch { /* לא רץ */ }
for (const d of [sandbox, data]) fs.rmSync(d, { recursive: true, force: true })
