import { app, BrowserWindow, screen, type Rectangle } from 'electron'
import path from 'node:path'
import { MpvEngine } from '../engine/mpv'

/**
 * זוג החלונות המודבק.
 *
 *   למטה — החלון של mpv, שהוא יוצר בעצמו. שם מצויר הווידאו.
 *   למעלה — חלון Electron שקוף, ובו כל הממשק.
 *
 * המשתמש מזיז ומשנה גודל של החלון העליון בלבד; התחתון נגרר אחריו
 * דרך הצינור. נמדד: הזזה ושינוי גודל בזמן ריצה נוחתים בדיוק, ולכן
 * כל ההדבקה כאן היא JavaScript ולא קוד מקורי.
 *
 * למה שני חלונות ולא אחד: כשנותנים ל-mpv את ה-HWND של חלון Electron
 * הוא יוצר בתוכו חלון-בן שמכסה את כל מה ש-Chromium מצייר, והממשק
 * נעלם מתחת לווידאו. זה נבדק במדידת פיקסלים.
 */

const MIN = { width: 900, height: 560 }

/** מחוץ למסך — חלון קיים שאינו נראה, בלי לעצור את הנגינה */
const OFFSCREEN = { x: -32000, y: -32000, width: 1, height: 1 }

/**
 * החלל שהממשק משאיר לווידאו.
 *
 *   full   — צפייה: הווידאו ממלא את החלון והממשק צף מעליו
 *   rect   — שיטוט: מלבן קטן בסרגל הנגן, וידאו חי בתוך הממשק
 *   hidden — אודיו בלבד, או שאין מה להראות
 */
export interface Viewport {
  mode: 'full' | 'rect' | 'hidden'
  x: number
  y: number
  width: number
  height: number
}

export class PlayerWindow {
  readonly overlay: BrowserWindow
  readonly engine = new MpvEngine()
  private syncing = false
  private pendingSync: NodeJS.Timeout | null = null
  private viewport: Viewport = { mode: 'full', x: 0, y: 0, width: 0, height: 0 }
  private pictureInPicture = false
  private restoreBounds: Rectangle | null = null
  private fullscreenActive = false
  private fullscreenRestoreBounds: Rectangle | null = null
  private pipFreeze: NodeJS.Timeout | null = null

  constructor() {
    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
    const width = Math.min(1440, Math.round(sw * 0.86))
    const height = Math.min(900, Math.round(sh * 0.86))

    const icon = app.isPackaged
      ? path.join(process.resourcesPath, 'app-icon.png')
      : path.join(app.getAppPath(), 'build', 'icon.png')

    this.overlay = new BrowserWindow({
      width,
      height,
      x: Math.round((sw - width) / 2),
      y: Math.round((sh - height) / 2),
      minWidth: MIN.width,
      minHeight: MIN.height,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      title: 'OmniFlux Player',
      icon,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.mjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false
      }
    })

    /*
     * החלון העליון חייב להישאר מעל חלון הווידאו. 'floating' מספיק כדי
     * לעבור את mpv בלי לצוף מעל כל שאר המערכת כמו 'screen-saver'.
     */
    this.overlay.setAlwaysOnTop(true, 'floating')

    this.overlay.on('move', () => this.scheduleSync())
    this.overlay.on('resize', () => this.scheduleSync())
    this.overlay.on('maximize', () => this.scheduleSync())
    this.overlay.on('unmaximize', () => this.scheduleSync())
    this.overlay.on('enter-full-screen', () => this.scheduleSync())
    this.overlay.on('leave-full-screen', () => this.scheduleSync())
    this.overlay.on('minimize', () => void this.engine.setBounds(OFFSCREEN))
    this.overlay.on('restore', () => this.scheduleSync())
    this.overlay.on('closed', () => void this.engine.stop())
  }

  /**
   * הזזה של חלון נשלחת עשרות פעמים בשנייה. שולחים למנוע רק את המצב
   * האחרון, אחרת התור מתמלא בפקודות שכבר לא רלוונטיות.
   */
  private scheduleSync(): void {
    if (this.pendingSync) clearTimeout(this.pendingSync)
    this.pendingSync = setTimeout(() => {
      this.pendingSync = null
      void this.syncBounds()
    }, 16)
  }

  private async syncBounds(): Promise<void> {
    if (this.syncing) return
    this.syncing = true
    try {
      await this.engine.setBounds(this.videoBounds())
    } catch {
      /* המנוע עוד לא עלה, או נסגר */
    } finally {
      this.syncing = false
    }
  }

  /**
   * איפה הווידאו יושב בתוך החלון.
   *
   * הממשק הוא שקובע. הוא מודד את החלל שהוא משאיר פנוי — מסך מלא
   * בצפייה, מלבן קטן בסרגל הנגן בזמן שיטוט — ושולח אותו לכאן.
   *
   * זה מה שמאפשר סרגל צד קבוע מעל חלון וידאו נפרד: אין כאן חיתוך
   * ואין מסכה, אלא חלון וידאו שבאמת יושב במקום אחר.
   */
  private videoBounds(): { x: number; y: number; width: number; height: number } {
    // בעת מזעור אין מה להראות, וגם אין קואורדינטות אמינות
    if (this.overlay.isMinimized()) return OFFSCREEN

    const b = this.overlay.getContentBounds()
    const v = this.viewport
    if (v.mode === 'hidden') return OFFSCREEN
    if (v.mode === 'full') return { x: b.x, y: b.y, width: b.width, height: b.height }

    /*
     * המלבן מגיע בפיקסלי CSS יחסית לפינת התוכן, וזו אותה יחידה
     * ש-`getContentBounds` מדבר בה. ההצמדה לגבולות החלון היא הגנה
     * מפני מלבן שנמדד רגע לפני שינוי גודל.
     */
    const width = Math.max(1, Math.min(Math.round(v.width), b.width))
    const height = Math.max(1, Math.min(Math.round(v.height), b.height))
    const x = b.x + Math.max(0, Math.min(Math.round(v.x), b.width - width))
    const y = b.y + Math.max(0, Math.min(Math.round(v.y), b.height - height))
    return { x, y, width, height }
  }

  /**
   * הממשק מדווח לאן הווידאו הולך.
   *
   * נקרא בכל החלפת מסך ובכל שינוי גודל, ולכן הוא מתעלם ממלבן זהה:
   * פקודת geometry ל-mpv בכל פריים של אנימציה מציפה את הצינור.
   */
  setVideoViewport(v: Viewport): void {
    const same =
      v.mode === this.viewport.mode &&
      Math.round(v.x) === Math.round(this.viewport.x) &&
      Math.round(v.y) === Math.round(this.viewport.y) &&
      Math.round(v.width) === Math.round(this.viewport.width) &&
      Math.round(v.height) === Math.round(this.viewport.height)
    if (same) return
    this.viewport = v
    this.scheduleSync()
  }

  setFullscreen(enabled: boolean): boolean {
    if (enabled === this.fullscreenActive) return this.fullscreenActive
    if (enabled && this.pictureInPicture) this.setPictureInPicture(false)
    // Transparent frameless windows ignore Electron's native fullscreen flags on
    // Windows. Borderless display bounds are the reliable native equivalent there.
    if (process.platform === 'win32') {
      if (enabled) {
        this.fullscreenRestoreBounds = this.overlay.getBounds()
        const display = screen.getDisplayMatching(this.fullscreenRestoreBounds)
        this.overlay.setAlwaysOnTop(true, 'screen-saver')
        this.overlay.setBounds(display.bounds, true)
      } else {
        this.overlay.setAlwaysOnTop(true, 'floating')
        if (this.fullscreenRestoreBounds) this.overlay.setBounds(this.fullscreenRestoreBounds, true)
        this.fullscreenRestoreBounds = null
      }
    } else {
      this.overlay.setFullScreen(enabled)
    }
    this.fullscreenActive = enabled
    this.scheduleSync()
    return this.fullscreenActive
  }

  isFullscreen(): boolean {
    return this.fullscreenActive
  }

  setPictureInPicture(enabled: boolean): boolean {
    if (enabled === this.pictureInPicture) return this.pictureInPicture

    if (enabled) {
      if (this.fullscreenActive) this.setFullscreen(false)
      this.restoreBounds = this.overlay.getBounds()
      const display = screen.getDisplayMatching(this.restoreBounds)
      const { x, y, width, height } = display.workArea
      const pipWidth = Math.min(480, Math.max(360, Math.round(width * 0.27)))
      const pipHeight = Math.round((pipWidth * 9) / 16)
      // PiP is intentionally smaller than the normal application's minimum
      // dimensions, so relax the constraint before applying its bounds.
      this.overlay.setMinimumSize(320, 180)
      const pipX = x + width - pipWidth - 24
      const pipY = y + height - pipHeight - 24
      // One atomic native bounds update is reliable for transparent frameless
      // windows on Windows; separate size/position calls can be coalesced and
      // leave the window at its previous full size.
      const target = { x: pipX, y: pipY, width: pipWidth, height: pipHeight }
      this.overlay.setBounds(target, false)
      this.overlay.setSkipTaskbar(true)
      this.overlay.setAlwaysOnTop(true, 'screen-saver')
      this.freezePip(target)
    } else {
      if (this.pipFreeze) clearTimeout(this.pipFreeze)
      this.pipFreeze = null
      this.overlay.setResizable(true)
      this.overlay.setSkipTaskbar(false)
      this.overlay.setAlwaysOnTop(true, 'floating')
      if (this.restoreBounds) this.overlay.setBounds(this.restoreBounds, false)
      this.overlay.setMinimumSize(MIN.width, MIN.height)
      this.restoreBounds = null
    }

    this.pictureInPicture = enabled
    this.scheduleSync()
    return this.pictureInPicture
  }

  /**
   * מקפיא את גודל חלון ה-PiP — אבל רק אחרי שהגודל באמת הוחל.
   *
   * ב-Windows, ‎setResizable(false)‎ מקפיא את הגבולות שקיימים באותו רגע,
   * ו-setBounds חוזר לפני שמנהל החלונות סיים את שינוי הגודל. כשהמחשב
   * עמוס, ההקפאה הקדימה את השינוי והחלון נשאר בגודלו המלא — כלומר
   * "תמונה בתוך תמונה" פשוט לא קרה. לכן ההקפאה ממתינה שהגודל יוחל.
   *
   * ההמתנה בודקת ואינה דוחפת: קריאה חוזרת ל-setBounds בזמן ששינוי
   * גודל כבר בדרך מבטלת אותו ומתחילה מחדש, וברצף מהיר החלון נשאר
   * לתמיד בגודלו הישן — כך נראה הכישלון כשהניסיון הראשון היה לנסות
   * שוב כל 50 מילישניות. לכן: בדיקה כל 100, יישום חוזר אחד בלבד אחרי
   * חצי שנייה, וּויתור על ההקפאה אחרי שנייה וחצי — להקפיא גודל שגוי
   * גרוע מלא להקפיא כלל.
   */
  private freezePip(target: Rectangle, attempt = 0): void {
    this.pipFreeze = null
    if (this.overlay.isDestroyed()) return
    if (attempt > 0 && !this.pictureInPicture) return
    const bounds = this.overlay.getBounds()
    if (bounds.width <= target.width + 2 && bounds.height <= target.height + 2) {
      this.overlay.setResizable(false)
      return
    }
    if (attempt >= 15) return
    if (attempt === 5) this.overlay.setBounds(target, false)
    this.pipFreeze = setTimeout(() => this.freezePip(target, attempt + 1), 100)
  }

  /**
   * מחזיר את הממשק מעל הווידאו.
   *
   * חלון הווידאו נוצר אחרי שלנו — ו-mpv יוצר אותו שוב בכל פעם
   * שמנוע התצוגה עולה מחדש — ולכן הוא תופס את המקום העליון. נמדד:
   * בלי ההחזרה הזאת הווידאו רץ והממשק פשוט לא נראה.
   *
   * ביטול והפעלה מחדש של always-on-top ולא רק moveTop, כי Windows
   * מעריך מחדש את סדר החלונות רק כשהמאפיין משתנה.
   */
  private raise(): void {
    if (this.overlay.isDestroyed()) return
    this.overlay.setAlwaysOnTop(false)
    this.overlay.setAlwaysOnTop(true, 'floating')
    this.overlay.moveTop()
  }

  async start(): Promise<void> {
    await this.engine.start(this.videoBounds())
    /*
     * חלון הווידאו נוצר באיחור קטן אחרי התהליך, ולכן החזרה אחת אינה
     * מספיקה — חוזרים כמה פעמים על פני שנייה וחצי.
     */
    for (const delay of [0, 150, 400, 800, 1500]) {
      setTimeout(() => this.raise(), delay)
    }
    // וגם בכל החלפת קובץ, כי מנוע התצוגה עולה מחדש ויוצר חלון חדש
    let lastPath: string | null = null
    this.engine.on('state', (s) => {
      if (s.path === lastPath) return
      lastPath = s.path
      for (const delay of [0, 250, 700]) setTimeout(() => this.raise(), delay)
    })

    /*
     * מנוע שנפל קם מחדש.
     *
     * בלי זה, נפילה אחת של תהליך mpv הופכת את התוכנה לקישוט: הכפתורים
     * ממשיכים להיראות תקינים, כל לחיצה נשלחת לצינור שכבר אין בצדו
     * איש, ושום דבר לא קורה עד הפעלה מחדש. כך נראה מבחוץ בדיוק
     * הדיווח "לוחץ המשך ולא קורה כלום".
     *
     * שלושה ניסיונות עם המתנה גדלה, ואז מוותרים — מנוע שאינו עולה
     * שוב ושוב הוא תקלה אמיתית, ולולאה אינסופית רק תסתיר אותה.
     */
    this.engine.on('exit', (code) => {
      void (async () => {
        console.log(`[engine] unexpected exit (code ${code ?? 'none'}); restarting`)
        for (const wait of [300, 1200, 3000]) {
          await new Promise((resolve) => setTimeout(resolve, wait))
          if (this.overlay.isDestroyed()) return
          const ok = await this.engine.restart(this.videoBounds()).catch(() => false)
          console.log(`[engine] restart ${ok ? 'succeeded' : 'failed'}`)
          if (ok) {
            for (const delay of [0, 250, 700]) setTimeout(() => this.raise(), delay)
            return
          }
        }
        console.error('[engine] could not be restarted')
      })()
    })
  }

  show(): void {
    this.overlay.show()
    this.raise()
    void this.syncBounds()
  }
}
