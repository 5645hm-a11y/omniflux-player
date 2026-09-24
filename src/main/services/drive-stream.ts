import { net } from 'electron'
import * as googleDriveAuth from './google-drive-auth'
import { dataDir } from './storage'
import { DriveEngine, DriveError } from './drive-engine'

export { DriveError }

/**
 * העטיפה של Electron סביב מנוע ההזרמה.
 *
 * כל הלוגיקה ב-drive-engine.ts, שאינו מכיר את Electron. כאן רק
 * מחברים לו את net.fetch (שמכבד את הפרוקסי ואת מאגר האישורים של
 * Windows), את אסימון החשבון המחובר, ואת תיקיית המטמון.
 */
export class DriveStreamService {
  private readonly engine: DriveEngine

  constructor(apiKey: string) {
    this.engine = new DriveEngine({
      fetch: (url, init) => net.fetch(url, init),
      token: () => googleDriveAuth.userToken(),
      apiKey,
      cacheDir: dataDir('cache', 'drive')
    })
  }

  /** מכין קובץ לניגון ומחזיר כתובת loopback; זורק DriveError עם סוג מדויק */
  open(source: string): Promise<string> {
    return this.engine.open(source)
  }

  cacheInfo(): Promise<{ bytes: number; limitBytes: number }> {
    return this.engine.cacheInfo()
  }

  clearCache(): Promise<void> {
    return this.engine.clearCache()
  }

  close(): void {
    this.engine.close()
  }
}
