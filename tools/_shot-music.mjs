/** צילום מסך המוזיקה, על הפרופיל האמיתי (חשבון Spotify מחובר) */
import { _electron as electron } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = process.env.SHOT_DIR
const profile = process.env.PROFILE_DIR
fs.mkdirSync(out, { recursive: true })

const env = {}
for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v
delete env.ELECTRON_RUN_AS_NODE

// תיקיית מוזיקה מקומית, עם שמות בפורמט "אמן - שיר"
const { execFileSync } = await import('node:child_process')
const os = await import('node:os')
const mpv = path.join(root, 'resources', 'engine', 'mpv.exe')
const songs = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-songs-'))
const names = [
  'Zusha - Aleph Beis', 'Yonatan Razel - Vehi Sheamda', 'Ishay Ribo - Seder Haavoda',
  'Adele - Set Fire to the Rain', 'Coldplay - Fix You', 'Hanan Ben Ari - Shiva',
  'Mosh Ben Ari - Shir Ahava', 'Idan Raichel - Mimaamakim'
]
for (const n of names) {
  execFileSync(mpv, ['av://lavfi:sine=frequency=330:duration=6', '--no-config', '--oac=aac', `--o=${n}.m4a`], { cwd: songs, stdio: 'ignore' })
}

const app = await electron.launch({ args: [root, `--user-data-dir=${profile}`], cwd: root, env, timeout: 60000 })
const page = await app.firstWindow()
await page.setViewportSize({ width: 1440, height: 900 })
await page.evaluate((lang) => window.cinema.app.setLocale(lang), process.env.SHOT_LANG ?? 'he')
await page.reload()
await page.waitForTimeout(6000)
await app.evaluate(async ({ app: a }, folder) => {
  const lib = a.__library
  await lib.addLocalFolder(folder)
}, songs)
await page.evaluate(() => window.cinema.library.scan())
await page.waitForFunction(() => window.cinema.library.scanning().then((s) => !s), null, { timeout: 120000 })
await page.waitForTimeout(1500)
await page.getByRole('button', { name: /Musique|Music|מוזיקה/ }).click()
await page.waitForTimeout(5000)
await page.screenshot({ path: path.join(out, `music-${process.env.SHOT_LANG ?? 'he'}-top.png`) })
await page.mouse.wheel(0, 1400)
await page.waitForTimeout(1200)
await page.screenshot({ path: path.join(out, `music-${process.env.SHOT_LANG ?? 'he'}-mid.png`) })
await page.mouse.wheel(0, 1600)
await page.waitForTimeout(1200)
await page.screenshot({ path: path.join(out, `music-${process.env.SHOT_LANG ?? 'he'}-low.png`) })
await app.close().catch(() => {})
console.log('צולם')
