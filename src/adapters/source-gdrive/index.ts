import type { Http } from '../../legacy_services/ports'
import type { RawMedia } from '../../core/library/types'
import { isMedia } from '../../core/library'

/**
 * הודעות השגיאה שהמתאם מציג.
 *
 * המתאם נשאר טהור ואינו יודע לתרגם — הטקסטים מוזרקים אליו כמו
 * שמוזרקים לו http ומפתחות.
 */
export interface DriveMessages {
  notFound: string
  permission: string
  status: (code: number) => string
  isFile: string
}

let MSG: DriveMessages = {
  notFound: 'Folder not found, or not shared',
  permission: 'Access denied',
  status: (c) => 'Google Drive returned ' + c,
  isFile: 'The link points to a file, not a folder'
}

/** מגדיר את נוסח ההודעות. נקרא מהתהליך הראשי בשפת הממשק. */
export function setDriveMessages(messages: DriveMessages): void {
  MSG = messages
}


/**
 * סריקת תיקיית Google Drive.
 *
 * קריאה בלבד, עם מפתח API — כלומר כל תיקייה שמשותפת כ"כל מי שיש לו
 * הקישור". לתיקיות פרטיות יידרש אסימון של המשתמש, וזה נכנס דרך אותו
 * `authHeader` בלי לגעת בשאר.
 */

const API = 'https://www.googleapis.com/drive/v3'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const PAGE_FIELDS = 'nextPageToken,files(id,name,mimeType,size,modifiedTime)'

export interface DriveConfig {
  http: Http
  apiKey: string
  /** כשיש חשבון מחובר — כותרת Authorization. אחרת ריק. */
  authHeader?: () => string | null | Promise<string | null>
}

interface DriveFile {
  id: string
  name: string
  mimeType: string
  size?: string
  modifiedTime?: string
}

export interface DriveScanOptions {
  maxDepth?: number
  onProgress?: (folder: string, found: number) => void
  signal?: { canceled: boolean }
}

export class DriveSource {
  constructor(private readonly cfg: DriveConfig) {}

  private async headers(): Promise<Record<string, string>> {
    const auth = await this.cfg.authHeader?.()
    return auth ? { Authorization: auth, Accept: 'application/json' } : { Accept: 'application/json' }
  }

  /** מאמת שהתיקייה נגישה, ומחזיר את שמה */
  async verify(folderId: string): Promise<{ ok: boolean; name?: string; error?: string; authRequired?: boolean }> {
    const url = new URL(`${API}/files/${encodeURIComponent(folderId)}`)
    url.searchParams.set('fields', 'id,name,mimeType')
    url.searchParams.set('key', this.cfg.apiKey)
    url.searchParams.set('supportsAllDrives', 'true')
    try {
      const res = await this.cfg.http(url, { headers: await this.headers() })
      // Drive deliberately returns 404 for some private resources to avoid
      // leaking their existence. One OAuth attempt can distinguish that case.
      if (res.status === 404) return { ok: false, error: MSG.notFound, authRequired: true }
      if (res.status === 401 || res.status === 403) return { ok: false, error: MSG.permission, authRequired: true }
      if (!res.ok) return { ok: false, error: MSG.status(res.status) }
      const json = (await res.json()) as DriveFile
      if (json.mimeType !== FOLDER_MIME) return { ok: false, error: MSG.isFile }
      return { ok: true, name: json.name }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  private async list(folderId: string): Promise<DriveFile[]> {
    const out: DriveFile[] = []
    let pageToken: string | undefined
    do {
      const url = new URL(`${API}/files`)
      url.searchParams.set('q', `'${folderId}' in parents and trashed=false`)
      url.searchParams.set('fields', PAGE_FIELDS)
      url.searchParams.set('pageSize', '1000')
      url.searchParams.set('key', this.cfg.apiKey)
      url.searchParams.set('supportsAllDrives', 'true')
      url.searchParams.set('includeItemsFromAllDrives', 'true')
      if (pageToken) url.searchParams.set('pageToken', pageToken)

      const res = await this.cfg.http(url, { headers: await this.headers() })
      if (!res.ok) throw new Error(MSG.status(res.status))
      const json = (await res.json()) as { files?: DriveFile[]; nextPageToken?: string }
      out.push(...(json.files ?? []))
      pageToken = json.nextPageToken
    } while (pageToken)
    return out
  }

  /** מה שמעבירים למנוע כדי לנגן ישירות מהדרייב */
  streamUrl(fileId: string): string {
    const url = new URL(`${API}/files/${encodeURIComponent(fileId)}`)
    url.searchParams.set('alt', 'media')
    url.searchParams.set('key', this.cfg.apiKey)
    return url.toString()
  }

  async scan(folderId: string, opts: DriveScanOptions = {}): Promise<RawMedia[]> {
    const maxDepth = opts.maxDepth ?? 6
    const out: RawMedia[] = []

    const walk = async (id: string, trail: string[], depth: number): Promise<void> => {
      if (opts.signal?.canceled || depth > maxDepth) return
      let files: DriveFile[]
      try {
        files = await this.list(id)
      } catch {
        // תיקייה שהשיתוף שלה בוטל לא מפילה את כל הסריקה
        return
      }
      opts.onProgress?.(trail.at(-1) ?? folderId, out.length)

      const folders = files.filter((f) => f.mimeType === FOLDER_MIME)
      for (const f of files) {
        if (f.mimeType === FOLDER_MIME || !isMedia(f.name)) continue
        out.push({
          id: `gdrive:${f.id}`,
          source: 'gdrive',
          uri: this.streamUrl(f.id),
          fileName: f.name,
          sizeBytes: f.size ? Number(f.size) : undefined,
          modifiedAt: f.modifiedTime ? Date.parse(f.modifiedTime) : undefined,
          root: folderId,
          trail
        })
      }
      for (const folder of folders) {
        if (opts.signal?.canceled) return
        await walk(folder.id, [...trail, folder.name], depth + 1)
      }
    }

    await walk(folderId, [], 0)
    return out
  }
}

/** מוציא מזהה תיקייה מכל צורה של קישור דרייב */
export function parseFolderId(input: string): string | null {
  const s = input.trim()
  const patterns = [/\/folders\/([\w-]{10,})/, /[?&]id=([\w-]{10,})/, /^([\w-]{20,})$/]
  for (const re of patterns) {
    const m = re.exec(s)
    if (m?.[1]) return m[1]
  }
  return null
}
