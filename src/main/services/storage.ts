import { app, net } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { Http, Kv } from '../../legacy_services/ports'

/**
 * המימושים הקונקרטיים של הפורטים.
 *
 * כאן, ורק כאן, יושבת הידיעה איפה נשמרים קבצים ואיך פונים לרשת.
 * כל שכבות הליבה מקבלות את אלה בהזרקה, ולכן הן נשארות טהורות.
 */

export function dataDir(...parts: string[]): string {
  const dir = path.join(app.getPath('userData'), ...parts)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function dataFile(name: string): string {
  return path.join(dataDir(), name)
}

/**
 * ‏net.fetch של Electron ולא fetch של Node.
 *
 * undici מתעלם מהגדרות הפרוקסי של Windows וממאגר האישורים של המערכת.
 * אנטי-וירוס שסורק HTTPS מחליף את האישור, ואז כל בקשה נכשלת ב-"fetch
 * failed" בלי שום הסבר. זה קרה למשתמשים אמיתיים בגרסה הקודמת.
 */
export const http: Http = (url, init) => net.fetch(typeof url === 'string' ? url : url.toString(), init)

/** קובץ JSON כאחסון מפתח-ערך, עם כתיבה אטומית */
export function jsonStore<T>(fileName: string, fallback: T): Kv<T> {
  const file = dataFile(fileName)
  let cache: T | null = null
  return {
    read: () => {
      if (cache !== null) return cache
      try {
        cache = JSON.parse(fs.readFileSync(file, 'utf8')) as T
      } catch {
        cache = fallback
      }
      return cache
    },
    write: (value) => {
      cache = value
      const tmp = `${file}.tmp`
      // כתיבה זמנית ואז שינוי שם: קריסה באמצע לא משאירה קובץ קטוע
      fs.writeFileSync(tmp, JSON.stringify(value), 'utf8')
      fs.renameSync(tmp, file)
    }
  }
}

/**
 * שומר כרזה בדיסק ומחזיר כתובת מקומית.
 *
 * התיקייה היא `art/` ולא `cache/`: ב-Windows שמות תיקיות אינם רגישים
 * לרישיות, ו-`cache/` נופל לתוך `Cache/` של Chromium — ניקוי מטמון
 * דפדפן שגרתי היה מוחק את כל הכרזות.
 */
export async function cacheImage(url: string, key: string): Promise<string | null> {
  const dir = dataDir('art')
  const file = path.join(dir, `${key.replace(/[^\w-]/g, '_')}.jpg`)
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return `art://${path.basename(file)}`
  try {
    const res = await http(url, { signal: AbortSignal.timeout(20_000) })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    // קטן מדי אינו תמונה; גדול מדי אינו כרזה
    if (buf.length < 512 || buf.length > 8 * 1024 * 1024) return null
    fs.writeFileSync(file, buf)
    return `art://${path.basename(file)}`
  } catch {
    return null
  }
}

export function artPath(fileName: string): string {
  return path.join(dataDir('art'), fileName)
}
