import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { buildItems, carryMeta } from '../../core/library'
import { tagAudio } from './audio-tags'
import { CATALOG_VERSION, type Catalog, type LibraryFolder, type MediaItem, type RawMedia, type ScanProgress } from '../../core/library/types'
import { identifyAll } from '../../core/metadata'
import { scanLocalFolder, type FileSystemPort } from '../../adapters/source-local'
import { DriveSource, parseFolderId, setDriveMessages } from '../../adapters/source-gdrive'
import { TmdbProvider } from '../../adapters/provider-tmdb'
import { tmdbLanguage } from '../../shared/i18n'
import { currentLocale, localOnly, t, watchRegion } from './settings'
import { DeezerProvider } from '../../adapters/provider-deezer'
import { SpotifyProvider, setSpotifyMessages } from '../../adapters/provider-spotify'
import { unifiedSearch } from '../../core/search'
import type { SearchGroup } from '../../core/search/types'
import { cacheImage, dataDir, http, jsonStore } from './storage'
import * as hebrew from '../../legacy_services/hebrew'
import * as namesAi from '../../legacy_services/names-ai'
import * as posters from '../../legacy_services/posters'
import * as googleDriveAuth from './google-drive-auth'
import * as spotifyAuth from './spotify-auth'
import { DriveError, DriveStreamService } from './drive-stream'

/**
 * שירות הספרייה.
 *
 * כאן מתחברים כל החלקים: המקורות מביאים קבצים, הליבה בונה מהם
 * פריטים, ומנוע הזיהוי משלים כותרים וכרזות. כל אחד מהם טהור בפני
 * עצמו — החיווט הוא כאן.
 */

const CONFIG = {
  tmdbKey: import.meta.env.MAIN_VITE_TMDB_KEY ?? '',
  googleApiKey: import.meta.env.MAIN_VITE_GOOGLE_API_KEY ?? '',
  googleCseId: import.meta.env.MAIN_VITE_GOOGLE_CSE_ID ?? '',
  groqKey: import.meta.env.MAIN_VITE_GROQ_KEY ?? '',
  spotifyId: import.meta.env.MAIN_VITE_SPOTIFY_CLIENT_ID ?? ''
}

const nodeFs: FileSystemPort = {
  readDir: async (p) =>
    (await fs.readdir(p, { withFileTypes: true })).map((e) => ({
      name: e.name,
      isDirectory: e.isDirectory()
    })),
  stat: async (p) => {
    try {
      const s = await fs.stat(p)
      return { size: s.size, modifiedAt: s.mtimeMs }
    } catch {
      return null
    }
  },
  join: (...parts) => path.join(...parts)
}

export declare interface LibraryService {
  on(event: 'progress', listener: (p: ScanProgress) => void): this
  on(event: 'catalog', listener: (c: Catalog) => void): this
}

export class LibraryService extends EventEmitter {
  private readonly driveStream = new DriveStreamService(CONFIG.googleApiKey)
  private readonly foldersStore = jsonStore<LibraryFolder[]>('folders.json', [])
  private readonly catalogStore = jsonStore<Catalog>('catalog.json', {
    version: CATALOG_VERSION,
    scannedAt: 0,
    items: []
  })
  /** חשוף למסך הבית: אותו ספק, אותה מכסה, אותו מטמון */
  readonly tmdb = new TmdbProvider(http, CONFIG.tmdbKey, () => tmdbLanguage(currentLocale()))
  private readonly drive = new DriveSource({
    http,
    apiKey: CONFIG.googleApiKey,
    authHeader: async () => {
      const token = await googleDriveAuth.userToken()
      return token ? `Bearer ${token}` : null
    }
  })
  readonly deezer = new DeezerProvider(http)
  private readonly spotify = new SpotifyProvider(http, CONFIG.spotifyId, spotifyAuth.userToken)
  private signal = { canceled: false }
  private busy = false

  constructor() {
    super()
    // הזרקת התלויות למודולים הטהורים, פעם אחת
    hebrew.configure({ http })
    posters.configure({
      http,
      googleApiKey: CONFIG.googleApiKey,
      googleCseId: CONFIG.googleCseId
    })
    namesAi.configure({
      http,
      groqKey: CONFIG.groqKey,
      store: jsonStore('ai-titles.json', { titles: {} })
    })
    this.refreshMessages()
  }

  /**
   * מזרים למתאמים את הודעות השגיאה בשפת הממשק.
   *
   * נקרא גם בכל החלפת שפה: המתאמים מחזיקים את הטקסט במשתנה מודול,
   * ובלי רענון הודעת "אין הרשאה" הייתה נשארת בשפה הקודמת.
   */
  refreshMessages(): void {
    setDriveMessages({
      notFound: t('status.driveNotFound'),
      permission: t('status.drivePermission'),
      status: (code) => t('status.driveStatus', { status: code }),
      isFile: t('status.driveIsFile')
    })
    setSpotifyMessages({
      noKeys: t('status.spotifyNoKeys'),
      auth: t('status.spotifyAuth'),
      authStatus: (code) => t('status.spotifyAuthStatus', { status: code }),
      notPremium: t('status.spotifyNotPremium'),
      search: t('status.spotifySearch'),
      searchStatus: (code) => t('status.spotifySearchStatus', { status: code })
    })
  }

  folders(): LibraryFolder[] {
    return this.foldersStore.read()
  }

  catalog(): Catalog {
    const c = this.catalogStore.read()
    return c.version === CATALOG_VERSION ? c : { version: CATALOG_VERSION, scannedAt: 0, items: [] }
  }

  scanning(): boolean {
    return this.busy
  }

  /** תיקייה מקומית. מאמתים שהיא קיימת לפני שמוסיפים. */
  async addLocalFolder(dir: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const s = await fs.stat(dir)
      if (!s.isDirectory()) return { ok: false, error: t('status.notAFolder') }
    } catch {
      return { ok: false, error: t('status.folderMissing') }
    }
    const existing = this.folders()
    if (existing.some((f) => f.source === 'local' && f.ref === dir)) {
      return { ok: false, error: t('status.alreadyAdded') }
    }
    this.foldersStore.write([
      ...existing,
      { id: randomUUID(), source: 'local', ref: dir, label: path.basename(dir) || dir, addedAt: Date.now() }
    ])
    return { ok: true }
  }

  /** תיקיית דרייב. מקבל קישור בכל צורה, ומאמת נגישות. */
  async addDriveFolder(input: string): Promise<{ ok: boolean; error?: string }> {
    const id = parseFolderId(input)
    if (!id) return { ok: false, error: t('status.badDriveLink') }
    const existing = this.folders()
    if (existing.some((f) => f.source === 'gdrive' && f.ref === id)) {
      return { ok: false, error: t('status.alreadyAdded') }
    }
    let check = await this.drive.verify(id)
    if (!check.ok && check.authRequired && googleDriveAuth.enabled() && !googleDriveAuth.isConnected()) {
      const auth = await googleDriveAuth.connect()
      if (!auth.ok) return auth
      check = await this.drive.verify(id)
    }
    if (!check.ok) return { ok: false, error: check.error }
    this.foldersStore.write([
      ...existing,
      { id: randomUUID(), source: 'gdrive', ref: id, label: check.name ?? t('status.driveFolder'), addedAt: Date.now() }
    ])
    return { ok: true }
  }

  removeFolder(id: string): void {
    const gone = this.folders().find((f) => f.id === id)
    this.foldersStore.write(this.folders().filter((f) => f.id !== id))
    if (!gone) return
    // הפריטים של תיקייה שהוסרה יורדים מיד, בלי לחכות לסריקה
    const c = this.catalog()
    const items = c.items.filter((i) => i.root !== gone.ref)
    if (items.length !== c.items.length) {
      this.save({ ...c, items })
    }
  }

  cancel(): void {
    this.signal.canceled = true
  }

  private save(c: Catalog): void {
    this.catalogStore.write(c)
    this.emit('catalog', c)
  }

  private report(p: ScanProgress): void {
    this.emit('progress', p)
  }

  async scan(opts: { force?: boolean } = {}): Promise<{ ok: boolean; error?: string }> {
    if (this.busy) return { ok: false, error: t('status.scanRunning') }
    this.busy = true
    this.signal = { canceled: false }

    try {
      const folders = this.folders()
      if (folders.length === 0) {
        this.report({ phase: 'done', message: t('status.noFolders'), current: 0, total: 0 })
        return { ok: true }
      }

      // ---- שלב א: איסוף קבצים ----
      const raws: RawMedia[] = []
      for (const folder of folders) {
        if (this.signal.canceled) break
        this.report({ phase: 'listing', message: folder.label, current: raws.length, total: 0 })
        const onProgress = (name: string, found: number): void =>
          this.report({ phase: 'listing', message: name, current: raws.length + found, total: 0 })

        try {
          if (folder.source === 'local') {
            raws.push(...(await scanLocalFolder(nodeFs, folder.ref, { onProgress, signal: this.signal })))
          } else if (folder.source === 'gdrive') {
            raws.push(...(await this.drive.scan(folder.ref, { onProgress, signal: this.signal })))
          }
        } catch (err) {
          // תיקייה אחת שנפלה לא מפילה את כל הסריקה
          this.report({
            phase: 'listing',
            message: `${folder.label} — ${err instanceof Error ? err.message : t('status.unreachable')}`,
            current: raws.length,
            total: 0
          })
        }
      }

      if (this.signal.canceled) {
        this.report({ phase: 'done', message: t('library.stop'), current: 0, total: 0 })
        return { ok: false, error: t('library.stop') }
      }

      // ---- שלב ב: בנייה, תוך שמירת מה שכבר זוהה ----
      const built = carryMeta(buildItems(raws), this.catalog().items, tmdbLanguage(currentLocale()))
      this.save({ version: CATALOG_VERSION, scannedAt: Date.now(), items: built })

      // ---- שלב ב2: תגיות ועטיפות מקבצי שמע מקומיים — רק מה שחדש או השתנה ----
      const fresh = await tagAudio(built, dataDir('art'), {
        signal: this.signal,
        onProgress: (current, total) => this.report({ phase: 'identifying', message: t('library.scanning'), current, total })
      })
      if (fresh !== built) this.save({ version: CATALOG_VERSION, scannedAt: Date.now(), items: fresh })

      // ---- שלב ג: זיהוי ----
      if (!this.tmdb.enabled()) {
        this.report({
          phase: 'done',
          message: `${t('library.count', { titles: fresh.length, files: fresh.length })} · ${t('search.noKey')}`,
          current: fresh.length,
          total: fresh.length
        })
        return { ok: true }
      }

      this.report({ phase: 'identifying', message: t('library.scanning'), current: 0, total: fresh.length })
      let lastFlush = Date.now()
      const identified = await identifyAll(
        {
          tmdb: this.tmdb,
          locale: tmdbLanguage(currentLocale()),
          labels: {
            quotaSpent: t('status.quotaSpent'),
            identifying: (done: number, total: number) => t('status.identifyingRest', { done, total })
          },
          cachePoster: cacheImage,
          signal: this.signal,
          onProgress: (current, total, title) => {
            this.report({ phase: 'identifying', message: title, current, total })
            // שמירה תקופתית, כדי שכרזות יופיעו תוך כדי ולא רק בסוף
            if (Date.now() - lastFlush > 3000) {
              lastFlush = Date.now()
              this.save({ version: CATALOG_VERSION, scannedAt: Date.now(), items: [...this.catalog().items] })
            }
          }
        },
        fresh,
        { force: opts.force }
      )

      this.save({ version: CATALOG_VERSION, scannedAt: Date.now(), items: identified })
      const found = identified.filter((i) => i.meta && !i.meta.notFound).length
      this.report({
        phase: 'done',
        message: t('library.count', { titles: found, files: identified.length }),
        current: identified.length,
        total: identified.length
      })
      return { ok: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.report({ phase: 'error', message, current: 0, total: 0 })
      return { ok: false, error: message }
    } finally {
      this.busy = false
    }
  }

  /**
   * חיפוש מאוחד. השאילתה יוצאת במקביל לספרייה, ל-TMDB ולשירותי
   * המוזיקה, והתוצאות מדורגות לפי מה שאפשר לנגן עכשיו.
   */
  async search(query: string): Promise<SearchGroup[]> {
    return unifiedSearch(
      {
        tmdb: this.tmdb,
        deezer: this.deezer,
        spotify: this.spotify,
        region: watchRegion(),
        localLabel: t('library.computer'),
        episodesLabel: (n: number) => t('library.episodes', { n }),
        localOnly: localOnly()
      },
      this.catalog().items,
      query
    )
  }

  searchStatus(): { spotify: string | null; tmdb: boolean } {
    return { spotify: this.spotify.status(), tmdb: this.tmdb.enabled() }
  }

  /**
   * יעד הניגון והכותרות הפרטיות שלו.
   * אסימון Drive לעולם אינו נכנס ל-URL, ל-renderer או לקטלוג השמור.
   */
  async playbackRequest(item: MediaItem): Promise<{ target: string; httpHeaders?: string[] }> {
    if (item.source !== 'gdrive') return { target: item.uri }
    /*
     * חשבון Google אינו תנאי לניגון.
     *
     * הגרסה הקודמת זרקה "אין הרשאה" לכל ניגון בלי חשבון מחובר — אף
     * שהוספת תיקייה בקישור והסריקה שלה עובדות עם מפתח ה-API בלבד. כך
     * כל כותר מדרייב הופיע בספרייה ונכשל בלחיצה. המנוע מנסה קודם את
     * החשבון המחובר, ובלעדיו את המפתח.
     */
    try {
      return { target: await this.driveStream.open(item.uri) }
    } catch (error) {
      throw new Error(this.driveMessage(error))
    }
  }

  /** הודעה שאומרת מה בדיוק קרה ומה אפשר לעשות, בשפת הממשק */
  private driveMessage(error: unknown): string {
    if (!(error instanceof DriveError)) return t('status.driveUnavailable')
    switch (error.kind) {
      case 'quota':
        return t('status.driveQuota')
      case 'auth':
        // בלי חשבון מחובר, "אין גישה" לרוב פירושו קובץ פרטי
        return googleDriveAuth.isConnected() ? t('status.drivePermission') : t('status.driveConnect')
      case 'notFound':
        return t('status.driveFileMissing')
      case 'abuse':
        return t('status.driveAbuse')
      case 'rate':
      case 'blocked':
        return t('status.driveBusy')
      default:
        return t('status.driveUnavailable')
    }
  }

  driveCacheInfo(): Promise<{ bytes: number; limitBytes: number }> {
    return this.driveStream.cacheInfo()
  }

  clearDriveCache(): Promise<void> {
    return this.driveStream.clearCache()
  }

  close(): void {
    this.driveStream.close()
  }
}
