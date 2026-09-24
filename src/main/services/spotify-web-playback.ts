import { BrowserWindow } from 'electron'
import path from 'node:path'
import { userToken } from './spotify-auth'
import { SurfaceOrigin } from './surface-origin'

/** Isolated, invisible browser playback surface for Spotify Premium accounts. */
export class SpotifyWebPlaybackService {
  private window: BrowserWindow | null = null
  private deviceId: string | null = null
  private pending: Promise<string | null> | null = null
  private ready: Promise<void> | null = null
  private tokenTimer: NodeJS.Timeout | null = null
  private drmReady: () => Promise<unknown> = () => Promise.resolve()
  private failureReason: string | null = null
  /** תשובות שרת הרישיונות מאז הניגון האחרון: דחיות רצופות, והסטטוס האחרון */
  private license = { rejected: 0, lastStatus: 0 }

  setDrmReady(ready: () => Promise<unknown>): void {
    this.drmReady = ready
  }

  async ensureDevice(): Promise<string | null> {
    if (this.deviceId) return this.deviceId
    if (this.failureReason === 'premium-required' || this.failureReason === 'drm-license') return null
    if (this.pending) return this.pending
    this.pending = this.createDevice().finally(() => {
      this.pending = null
    })
    return this.pending
  }

  private async createDevice(): Promise<string | null> {
    await this.drmReady()
    const token = await userToken()
    if (!token) return null
    const win = this.window && !this.window.isDestroyed() ? this.window : this.createWindow()
    this.window = win
    try {
      await this.ready
      const result = await win.webContents.executeJavaScript(
        `window.omnifluxSpotify.connect(${JSON.stringify(token)})`,
        true
      ) as { deviceId?: unknown; reason?: unknown } | null
      this.deviceId = typeof result?.deviceId === 'string' && result.deviceId.length < 200 ? result.deviceId : null
      this.failureReason = typeof result?.reason === 'string' && result.reason.length < 80 ? result.reason : null
      if (this.deviceId) this.scheduleTokenRefresh()
      return this.deviceId
    } catch {
      this.failureReason = 'embedded-unavailable'
      this.resetWindow(win)
      return null
    }
  }

  /*
   * הדף מוגש מ-127.0.0.1 ולא מ-file://.
   *
   * דף מקובץ הוא "מקור אפס", ובקשות הניגון של ה-SDK נדחות אז ב-CORS:
   * כל שיר נכשל, ה-SDK מדלג לבא אחריו, ושומעים שקט. נמדד מול חשבון
   * אמיתי — וזה בדיוק מה שהמשתמש דיווח עליו.
   */
  private readonly origin = new SurfaceOrigin(path.join(__dirname, '../renderer'))

  private createWindow(): BrowserWindow {
    const win = new BrowserWindow({
      show: false,
      skipTaskbar: true,
      title: 'OmniFlux Spotify Playback Surface',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false,
        plugins: true,
        /*
         * שמע מתחיל בלי מגע של המשתמש.
         *
         * המשטח הזה נסתר, ואיש אינו לוחץ בתוכו: הלחיצה היא על הכפתור
         * בממשק, בחלון אחר. בלי זה, Chromium חוסם את ההפעלה, ה-SDK
         * מנסה לעקוף את החסימה ב-activateElement — וזה בדיוק המסלול
         * שהרג את הנגן. הדגל מסיר את הצורך בעקיפה מלכתחילה.
         */
        autoplayPolicy: 'no-user-gesture-required'
      }
    })
    /*
     * המשטח נסתר, ולכן מה שנכתב בקונסולה שלו אינו נראה לאיש.
     * ‏OMNIFLUX_SPOTIFY_DEBUG=1 מוציא אותו החוצה: זו הדרך היחידה
     * לראות מה ה-SDK אומר כשניגון נכשל אצל משתמש.
     */
    if (process.env.OMNIFLUX_SPOTIFY_DEBUG === '1') {
      win.webContents.on('console-message', (_e, level, message) => {
        console.log(`[spotify-surface:${level}]`, message.slice(0, 700))
      })
    }
    /*
     * שרת הרישיונות הוא הסימן היחיד שאינו משקר.
     *
     * כשספוטיפיי דוחה את ה-CDM, ה-SDK אומר רק "Playback error", טוען
     * שוב ושוב את אותו שיר ומשהה אותו על 0:00. נמדד מול חשבון אמיתי:
     * ‏widevine-license החזיר 500 בבנייה לא חתומה ו-403 בבנייה שחתימתה
     * נשברה, בכל בקשה — וההתאוששות בזבזה עשרים שניות על השהיה והמשך
     * של שיר שלא יכול להישמע. הבקשה יוצאת מה-iframe של ה-SDK, ולכן
     * נתפסת כאן, ברמת הסשן, ולא בדף.
     *
     * ‏webRequest מחזיק מאזין אחד לכל אירוע בסשן. אין כרגע מאזין אחר
     * בסשן ברירת המחדל; מי שיוסיף אחד צריך לאחד אותו עם זה.
     */
    win.webContents.session.webRequest.onCompleted(
      { urls: ['https://api.spotify.com/v1/widevine-license/*'] },
      (details) => {
        if (details.method !== 'POST') return
        this.license.lastStatus = details.statusCode
        this.license.rejected = details.statusCode >= 400 ? this.license.rejected + 1 : 0
        if (this.license.rejected === 2) console.warn(`[spotify] widevine licence rejected (${details.statusCode})`)
      }
    )
    const rendererUrl = process.env.ELECTRON_RENDERER_URL
    this.ready = rendererUrl
      ? win.loadURL(`${rendererUrl}/spotify-player.html`)
      : this.origin.url().then((base) => win.loadURL(`${base}spotify-player.html`))
    return win
  }

  disconnect(): void {
    this.deviceId = null
    this.failureReason = null
    if (this.window) this.resetWindow(this.window)
  }

  /** מתחיל ספירה חדשה של דחיות לפני כל ניגון */
  resetLicenseWatch(): void {
    this.license = { rejected: 0, lastStatus: 0 }
  }

  /**
   * ספוטיפיי דחתה את הרישיון, ולא בגלל תקלה רגעית.
   *
   * שתי דחיות רצופות ולא אחת: בקשה בודדת יכולה ליפול גם בגלל רשת.
   * ה-SDK שולח כמה בקשות בשנייה כשהוא נדחה, כך שההכרעה מגיעה תוך
   * פחות משתי שניות.
   */
  licenseRejected(): boolean {
    return this.license.rejected >= 2
  }

  status(): { ready: boolean; deviceId: string | null; reason: string | null } {
    return { ready: Boolean(this.deviceId), deviceId: this.deviceId, reason: this.failureReason }
  }

  /** המצב החי של הנגן, כולל המיקום — הסימן היחיד שהניגון באמת מתקדם */
  async playbackHealth(): Promise<{ error: string | null; trackUri: string | null; linkedFromUri: string | null; paused: boolean | null; positionMs: number }> {
    const win = this.window
    if (!win || win.isDestroyed()) return { error: null, trackUri: null, linkedFromUri: null, paused: null, positionMs: 0 }
    try {
      const value = await win.webContents.executeJavaScript('window.omnifluxSpotify.health()', true) as Record<string, unknown>
      return {
        error: typeof value.error === 'string' ? value.error : null,
        trackUri: typeof value.trackUri === 'string' ? value.trackUri : null,
        linkedFromUri: typeof value.linkedFromUri === 'string' ? value.linkedFromUri : null,
        paused: typeof value.paused === 'boolean' ? value.paused : null,
        positionMs: typeof value.positionMs === 'number' ? value.positionMs : 0
      }
    } catch {
      return { error: 'embedded-unavailable', trackUri: null, linkedFromUri: null, paused: null, positionMs: 0 }
    }
  }

  /**
   * ויתור על המשטח — רק כשהוא באמת אינו מנגן.
   *
   * סגירת החלון עוצרת את הקול באותו רגע. כשהיא נעשתה על סמך מדידה
   * שגויה, שיר שהתנגן יפה נאלם באמצע והמשתמש נשאר עם סרגל נגן שממשיך
   * לזוז בלי צליל.
   */
  async markPlaybackFailed(licenseRejected = false): Promise<void> {
    const health = await this.playbackHealth()
    // אחרי דחיית רישיון "מנגן" של ה-SDK אינו אמת: אין מפתח, ולכן אין צליל
    if (!licenseRejected && health.paused === false && health.positionMs > 0) return
    this.failureReason = 'drm-license'
    const win = this.window
    if (win) this.resetWindow(win)
  }

  async control(command: 'pause' | 'resume' | 'seek' | 'previous' | 'next' | 'volume', value?: number): Promise<boolean> {
    const id = await this.ensureDevice()
    const win = this.window
    if (!id || !win || win.isDestroyed()) return false
    try {
      return Boolean(await win.webContents.executeJavaScript(
        `window.omnifluxSpotify.control(${JSON.stringify(command)}, ${Number.isFinite(value) ? Number(value) : 'undefined'})`,
        true
      ))
    } catch {
      return false
    }
  }

  private resetWindow(win: BrowserWindow): void {
    if (this.tokenTimer) clearInterval(this.tokenTimer)
    this.tokenTimer = null
    if (!win.isDestroyed()) win.destroy()
    this.window = null
    this.ready = null
    this.deviceId = null
  }

  private scheduleTokenRefresh(): void {
    if (this.tokenTimer) return
    this.tokenTimer = setInterval(() => {
      void userToken().then((token) => {
        const win = this.window
        if (!token || !win || win.isDestroyed()) return
        void win.webContents.executeJavaScript(
          `window.omnifluxSpotify.updateToken(${JSON.stringify(token)})`,
          true
        )
      })
    }, 30 * 60 * 1000)
  }
}
