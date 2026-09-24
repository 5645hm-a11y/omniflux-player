import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { MpvEngine } from '../engine/mpv'

/**
 * תאורת אווירה: דגימת פריים מהסרט, כדי שהממשק יקבל את הצבע שלו.
 *
 * חלון הווידאו אינו שלנו ואי אפשר לקרוא ממנו פיקסלים מהממשק. לכן
 * המנוע מצלם פריים לקובץ, ואנחנו שולחים את הבתים לממשק — שם יש
 * קנבס שיודע לפענח ולחלץ את הצבעים.
 *
 * נמדד: צילום עולה כ-48 מילישניות ו-45 קילובייט ב-JPEG באיכות 20.
 * פעם ב-1.6 שניות זה כלום, וזה מספיק — תאורת אווירה אמורה לנוע לאט.
 */

const INTERVAL_MS = 1600

export class AmbientService {
  private timer: NodeJS.Timeout | null = null
  private busy = false
  readonly stats = { ticks: 0, grabs: 0, sent: 0, skipped: 0, errors: [] as string[] }
  private readonly file = path.join(os.tmpdir(), `omniflux-frame-${process.pid}.jpg`)

  constructor(
    private readonly engine: MpvEngine,
    private readonly send: (bytes: Uint8Array) => void
  ) {}

  start(): void {
    if (this.timer) return
    /*
     * ההגדרה נעשית כאן ולא בבנייה. קריאה למנוע לפני שהצינור קיים
     * נכשלת בשקט, והצילומים נשארים PNG — פי שניים וחצי בנפח, והרבה
     * יותר יקר לקודד. נמדד: 116 קילובייט מול 45.
     */
    void this.configure().then(() => void this.grab())
    this.timer = setInterval(() => void this.grab(), INTERVAL_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    try {
      fs.rmSync(this.file, { force: true })
    } catch {
      /* אין קובץ */
    }
  }

  private async grab(): Promise<void> {
    this.stats.ticks++
    // דגימה חופפת מבזבזת זמן על פריים שכבר לא רלוונטי
    if (this.busy) {
      this.stats.skipped++
      return
    }
    const state = this.engine.state
    if (!state.path || state.paused || state.idle) {
      this.stats.skipped++
      return
    }
    this.stats.grabs++

    this.busy = true
    try {
      // 'video' ולא 'window': בלי כתוביות ובלי OSD, רק התמונה עצמה
      await this.engine.send(['screenshot-to-file', this.file, 'video'], 4000)
      const bytes = await fs.promises.readFile(this.file)
      this.send(new Uint8Array(bytes))
      this.stats.sent++
    } catch (err) {
      // נשמר לאבחון: פריים שלא נתפס אינו שגיאה למשתמש
      if (this.stats.errors.length < 5) {
        this.stats.errors.push(err instanceof Error ? err.message : String(err))
      }
    } finally {
      this.busy = false
    }
  }

  /** פורמט הצילום. נקרא בכל הפעלה, כי המנוע עלול לעלות מחדש. */
  private async configure(): Promise<void> {
    try {
      await this.engine.set('screenshot-format', 'jpg')
      await this.engine.set('screenshot-jpeg-quality', 20)
    } catch {
      /* המנוע עוד לא מוכן */
    }
  }
}
