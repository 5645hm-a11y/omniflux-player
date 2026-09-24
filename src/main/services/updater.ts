import { app } from 'electron'
import electronUpdater from 'electron-updater'
import { EventEmitter } from 'node:events'

/**
 * עדכונים אוטומטיים.
 *
 * העדכון יורד ברקע ומותקן בהפעלה הבאה, ולא באמצע סרט. הורדה שקופצת
 * למשתמש באמצע צפייה היא בדיוק מה שגורם לאנשים לכבות עדכונים.
 */

const { autoUpdater } = electronUpdater

export type UpdateStatus =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'none' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; version: string; percent: number }
  | { status: 'ready'; version: string }
  | { status: 'error'; message: string }

export declare interface UpdaterService {
  on(event: 'state', listener: (s: UpdateStatus) => void): this
}

export class UpdaterService extends EventEmitter {
  private current: UpdateStatus = { status: 'idle' }

  constructor() {
    super()
    /*
     * גרסת אלפא מסומנת ב-GitHub כ-prerelease, ו-electron-updater
     * מדלג על אלה כברירת מחדל. בלי זה המשתמש לא היה מקבל אף עדכון
     * עד הגרסה היציבה הראשונה.
     */
    autoUpdater.allowPrerelease = true
    autoUpdater.autoDownload = true
    // ההתקנה נעשית ביציאה, ולא כופה הפעלה מחדש באמצע צפייה
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.logger = null

    autoUpdater.on('checking-for-update', () => this.set({ status: 'checking' }))
    autoUpdater.on('update-not-available', () => this.set({ status: 'none' }))
    autoUpdater.on('update-available', (info) => this.set({ status: 'available', version: info.version }))
    autoUpdater.on('download-progress', (p) =>
      this.set({
        status: 'downloading',
        version: this.versionOf(),
        percent: Math.round(p.percent)
      })
    )
    autoUpdater.on('update-downloaded', (info) => this.set({ status: 'ready', version: info.version }))
    autoUpdater.on('error', (err) => this.set({ status: 'error', message: err.message }))
  }

  private versionOf(): string {
    return 'version' in this.current ? this.current.version : ''
  }

  private set(next: UpdateStatus): void {
    this.current = next
    this.emit('state', next)
  }

  state(): UpdateStatus {
    return this.current
  }

  /**
   * בדיקה. בפיתוח אין מה לבדוק — הבנייה אינה ארוזה ואין לה גרסה
   * שפורסמה, ו-electron-updater זורק על זה.
   */
  async check(): Promise<UpdateStatus> {
    if (!app.isPackaged) {
      this.set({ status: 'none' })
      return this.current
    }
    try {
      await autoUpdater.checkForUpdates()
    } catch (err) {
      this.set({ status: 'error', message: err instanceof Error ? err.message : String(err) })
    }
    return this.current
  }

  install(): void {
    if (this.current.status !== 'ready') return
    autoUpdater.quitAndInstall(false, true)
  }

  /** בדיקה שקטה זמן קצר אחרי העלייה, ואז אחת ליום */
  schedule(): void {
    if (!app.isPackaged) return
    setTimeout(() => void this.check(), 10_000)
    setInterval(() => void this.check(), 24 * 3600 * 1000)
  }
}
