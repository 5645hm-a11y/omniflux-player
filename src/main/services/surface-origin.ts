import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

/**
 * מקור אמיתי למשטחי הניגון הנסתרים.
 *
 * ‏Spotify ו-Deezer מנגנים בתוך דף שאנחנו מריצים, וה-SDK שלהם פונה
 * לשרתי המדיה של השירות. דף שנטען מ-`file://` הוא "מקור אפס": אין לו
 * שם, ולכן הבקשות של ה-SDK יוצאות עם מקור זר וה-API דוחה אותן
 * ב-CORS. התוצאה שנמדדה: כל שיר נכשל בטעינה, ה-SDK מדלג לבא אחריו,
 * והמשתמש רואה את השירים מתחלפים לבד בלי שום צליל.
 *
 * זה לא נראה בפיתוח, כי שם הדף מגיע משרת Vite — כלומר ממקור אמיתי.
 * הוא נשבר רק בתוכנה הארוזה, שבה הדף הוא קובץ על הדיסק.
 *
 * ‏127.0.0.1 הוא מקור אמיתי, וגם "הקשר מאובטח" לפי התקן — כלומר
 * מותר בו גם פענוח מוגן (EME), שבלעדיו אין ניגון מלא.
 *
 * מה שמוגש הוא תיקיית הממשק הבנויה בלבד, ורק סיומות קבועות. אסימון
 * אקראי בנתיב מונע מכל תהליך אחר במחשב לנחש את הכתובת.
 */

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2'
}

export class SurfaceOrigin {
  private server: http.Server | null = null
  private starting: Promise<string> | null = null
  private base = ''
  private readonly token = crypto.randomBytes(24).toString('base64url')

  constructor(private readonly rootDir: string) {}

  /** מחזיר את כתובת הבסיס, ומרים את השרת בפעם הראשונה */
  async url(): Promise<string> {
    if (this.base) return this.base
    if (this.starting) return this.starting
    this.starting = new Promise<string>((resolve, reject) => {
      const server = http.createServer((request, response) => this.handle(request, response))
      server.once('error', reject)
      // ‏127.0.0.1 בלבד: אף מחשב אחר ברשת אינו יכול לפנות לכאן
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        if (!address || typeof address === 'string') return reject(new Error('surface origin unavailable'))
        this.server = server
        this.base = `http://127.0.0.1:${address.port}/${this.token}/`
        resolve(this.base)
      })
    })
    try {
      return await this.starting
    } finally {
      this.starting = null
    }
  }

  private handle(request: http.IncomingMessage, response: http.ServerResponse): void {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const prefix = `/${this.token}/`
    if (!url.pathname.startsWith(prefix)) {
      response.writeHead(404).end()
      return
    }
    const relative = decodeURIComponent(url.pathname.slice(prefix.length))
    const file = path.join(this.rootDir, relative)
    const ext = path.extname(file).toLowerCase()
    // מחוץ לתיקייה, או סיומת שאינה ברשימה — אין תשובה
    const inside = path.resolve(file).startsWith(path.resolve(this.rootDir) + path.sep)
    if (!inside || !TYPES[ext]) {
      response.writeHead(404).end()
      return
    }
    fs.readFile(file, (error, data) => {
      if (error) {
        response.writeHead(404).end()
        return
      }
      response.writeHead(200, { 'Content-Type': TYPES[ext], 'Cache-Control': 'no-store' }).end(data)
    })
  }

  close(): void {
    this.server?.closeAllConnections()
    this.server?.close()
    this.server = null
    this.base = ''
  }
}
