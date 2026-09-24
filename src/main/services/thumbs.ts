import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { artPath } from './storage'
import type { ThumbSprite } from '../../shared/api'

/**
 * תצוגה מקדימה בסרגל הזמן.
 *
 * כל התמונות יושבות בקובץ אחד — גיליון מוניות — ולא במאה קבצים
 * נפרדים. הממשק מזיז `background-position` ומקבל את המשבצת הנכונה
 * בלי ולו בקשה אחת נוספת.
 *
 * החילוץ נעשה עם `--sstep`, שמדלג בין הפריימים במקום לפענח את כל
 * הסרט. ההבדל נמדד: על סרטון של עשר דקות, פענוח מלא לקח 4.5 שניות
 * ודילוג לקח 0.28 — כלומר על סרט באורך מלא זה ההבדל בין דקה לרבע
 * שנייה, והזמן תלוי במספר המשבצות ולא באורך הסרט.
 */

/** 10 עמודות היא פשרה בין רוחב הקובץ למספר המשבצות */
const COLS = 10
const MAX_TILES = 100
const TILE_W = 160

/** מנוע הנגינה, מאותו מקום שממנו רץ הנגן עצמו */
function binary(): string {
  const dir = app.isPackaged
    ? path.join(process.resourcesPath, 'engine')
    : path.join(app.getAppPath(), 'resources', 'engine')
  return path.join(dir, 'mpv.exe')
}

/** מפתח יציב לקובץ: נתיב ואורך. שינוי באחד מהם מבטל את המטמון. */
function keyOf(target: string, duration: number): string {
  const hash = crypto.createHash('sha1').update(`${target}|${Math.round(duration)}`).digest('hex')
  return `tb${hash.slice(0, 16)}.jpg`
}

const inFlight = new Map<string, Promise<ThumbSprite | null>>()

/**
 * בונה גיליון, או מחזיר קיים.
 *
 * מוגן מפני בנייה כפולה: הממשק שואל על התצוגה המקדימה ברגע שהקובץ
 * נטען, ולפעמים גם מיד אחר כך, ושתי בניות במקביל היו כותבות לאותו
 * קובץ בו-זמנית.
 */
export function sprite(target: string, duration: number): Promise<ThumbSprite | null> {
  if (!Number.isFinite(duration) || duration < 30) return Promise.resolve(null)

  const name = keyOf(target, duration)
  const file = artPath(name)
  const tiles = Math.min(MAX_TILES, Math.max(10, Math.floor(duration / 10)))
  const rows = Math.ceil(tiles / COLS)
  const interval = duration / tiles

  const info: ThumbSprite = {
    url: `art://${name}`,
    cols: COLS,
    rows,
    count: tiles,
    interval,
    tileWidth: TILE_W
  }

  if (fs.existsSync(file)) return Promise.resolve(info)
  const running = inFlight.get(name)
  if (running) return running

  const job = new Promise<ThumbSprite | null>((resolve) => {
    const bin = binary()
    if (!fs.existsSync(bin)) return resolve(null)

    /*
     * מופע נפרד ולא הנגן שרץ.
     *
     * חילוץ דרך הנגן היה מזיז את המשתמש בתוך הסרט: כל דגימה היא
     * קפיצה. תהליך משלו קורא את אותו קובץ ולא נוגע בנגינה.
     */
    const child = spawn(
      bin,
      [
        target,
        '--no-config',
        '--no-audio',
        '--no-sub',
        `--sstep=${interval.toFixed(3)}`,
        `--frames=${tiles}`,
        `--vf=scale=${TILE_W}:-2,tile=${COLS}x${rows}`,
        '--ovc=mjpeg',
        // ‏MJPEG דורש טווח YUV מלא, ואחרת המקודד כלל אינו נפתח
        '--ovcopts=strict=unofficial',
        `--o=${file}`
      ],
      { windowsHide: true }
    )

    const timer = setTimeout(() => child.kill(), 60_000)
    child.on('exit', () => {
      clearTimeout(timer)
      inFlight.delete(name)
      resolve(fs.existsSync(file) ? info : null)
    })
    child.on('error', () => {
      clearTimeout(timer)
      inFlight.delete(name)
      resolve(null)
    })
  })

  inFlight.set(name, job)
  return job
}
