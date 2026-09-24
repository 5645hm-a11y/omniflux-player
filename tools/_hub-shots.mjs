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

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-hub-'))
const media = path.join(sandbox, 'Mes films')
fs.mkdirSync(media, { recursive: true })
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-hubd-'))

const titles = [
  'מטריקס 1999 1080p BluRay.mp4', 'Inception.2010.2160p.BluRay.mp4', 'האביר האפל 2008.mp4',
  'Interstellar 2014 2160p.mkv', 'שר הטבעות אחוות הטבעת 2001.mp4', 'Blade Runner 2049 2017 1080p.mkv',
  'Dune.2021.2160p.mkv', 'הסנדק 1972.mp4', 'Fight Club 1999 1080p.mp4', 'Whiplash 2014.mkv',
  'Parasite 2019 1080p.mkv', 'La La Land 2016.mp4'
]
for (const name of titles) {
  execFileSync(engine, ['av://lavfi:testsrc2=size=160x120:rate=10:duration=1','--no-config',
    '--ovc=libx264','--no-audio',`--o=${name}`], { cwd: media, stdio: 'ignore' })
}

const env = {}
for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v
delete env.ELECTRON_RUN_AS_NODE

const app = await electron.launch({ args: [root, `--user-data-dir=${data}`], cwd: root, env, timeout: 60_000 })
const page = await app.firstWindow()
await page.setViewportSize({ width: 1440, height: 900 })
await page.waitForTimeout(3500)

const shot = async (name) => {
  const buf = await page.screenshot()
  fs.writeFileSync(path.join(out, name), buf)
  console.log(`✓ ${name}  ${(buf.length / 1024).toFixed(0)} KB`)
}

await app.evaluate(async ({ app: a }, dir) => { await a.__library.addLocalFolder(dir) }, media)
await page.evaluate(() => window.cinema.library.scan())
await page.waitForFunction(() => window.cinema.library.scanning().then((s) => !s), null, { timeout: 240_000 })

// התקדמות מלאכותית, כדי ששורת "המשך צפייה" תהיה מלאה בצילום
await app.evaluate(async ({ app: a }) => {
  const items = a.__library.catalog().items.slice(0, 4)
  const hub = a.__hub
  for (const [i, it] of items.entries()) {
    hub.markPlaying(it.id)
    hub.forceProgress(it.id, 1800 * (0.2 + i * 0.18), 5400)
  }
  hub.markPlaying(null)
})
await page.evaluate(() => window.cinema.hub.refresh())
await page.waitForTimeout(6500)

const info = await page.evaluate(() => window.cinema.hub.data())
console.log(`  באנר: ${info.hero.length} · שורות: ${info.rows.map((r) => `${r.key}=${r.cards.length}`).join(' ')}`)

// מדידה במקום השערה: צבע הכפתור הראשי וגופן הכותרת
const style = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => b.className.includes('bg-arctic'))
  const wm = document.querySelector('.font-display')
  return {
    btnBg: btn ? getComputedStyle(btn).backgroundColor : 'לא נמצא',
    btnColor: btn ? getComputedStyle(btn).color : '-',
    displayFont: wm ? getComputedStyle(wm).fontFamily.split(',')[0] : 'לא נמצא'
  }
})
console.log('  כפתור ראשי:', style.btnBg, '· טקסט', style.btnColor)
console.log('  גופן תצוגה:', style.displayFont)

await shot('10-hub.png')

// מצב מעבר עכבר על כרטיס — ההרמה והזוהר
await page.evaluate(() => document.querySelector('.overflow-y-auto')?.scrollTo({ top: 430 }))
await page.waitForTimeout(700)
const box = await page.evaluate(() => {
  const card = document.querySelectorAll('.card-lift')[2]
  const r = card?.getBoundingClientRect()
  return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null
})
if (box) {
  await page.mouse.move(box.x, box.y)
  await page.waitForTimeout(600)
  await shot('12-hub-hover.png')
}
await page.evaluate(() => document.querySelector('.overflow-y-auto')?.scrollTo({ top: 420 }))
await page.waitForTimeout(900)
await shot('11-hub-rows.png')

await app.close().catch(() => undefined)
try { execFileSync('taskkill', ['/F','/IM','mpv.exe'], { stdio: 'ignore' }) } catch { /* לא רץ */ }
for (const d of [sandbox, data]) fs.rmSync(d, { recursive: true, force: true })
