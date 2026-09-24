import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

/**
 * מנוע ההזרמה מ-Google Drive.
 *
 * mpv מנגן מכתובת loopback, והמנוע הזה עומד מאחוריה: הוא מתרגם כל
 * בקשת Range של mpv לבלוקים קבועים של הקובץ, מביא כל בלוק פעם אחת,
 * ושומר אותו על הדיסק.
 *
 * למה בלוקים ולא העברה ישירה של הבקשות:
 *
 *   · כמות הבקשות. כל משתמשי OmniFlux חולקים פרויקט Google Cloud
 *     אחד — מפתח API אחד ולקוח OAuth אחד שצרובים בתוכנה — ולכן גם
 *     מכסה אחת. הגרסה הקודמת ביקשה 64 קילובייט בכל פעם: סרט של 2
 *     ג'יגה היה כ-32,000 קריאות API. בבלוקים של 8 מגה אותו סרט הוא
 *     כ-256 קריאות — פי 125 פחות.
 *   · קצב. קריאה של 64 קילובייט עם השהיה של כ-100 מילישניות מגבילה
 *     את הקצב לכ-5 מגה-ביט — פחות ממה ש-1080p צריך. זו הייתה הסיבה
 *     לגמגום גם כשהניגון כן התחיל.
 *   · מטמון. דילוג אחורה, צפייה חוזרת, והקריאה שקוראת את סוף הקובץ
 *     (אינדקס ה-moov של MP4) אינם מורידים שוב דבר. כל בייט יורד
 *     לכל היותר פעם אחת לכל משתמש.
 *
 * הקובץ אינו מייבא דבר מ-Electron. ה-fetch, האסימון, המפתח ותיקיית
 * המטמון מוזרקים — וכך אפשר להריץ אותו מול שרת Google מזויף בבדיקות.
 */

export const BLOCK_BYTES = 8 * 1024 * 1024
/** בלוקים קדימה שמובאים ברקע בזמן ניגון רציף */
const READ_AHEAD = 2
/**
 * בקשות במקביל לגוגל, לכל המנוע — שתיים ולא יותר.
 *
 * נמדד מול דרייב אמיתי: שתי בקשות במקביל לאותו קובץ עברו נקי —
 * שלוש בקשות לקובץ של 21 מגה, אפס ניסיונות חוזרים. שמונה בקשות
 * במקביל (ניסיון להאיץ את הפריים הראשון בחלקים) הפכו את אותו קובץ
 * ל-48 בקשות ו-11 שניות במקום 4: גוגל הגיב על המקביליות כעל חריגה
 * ממכסת הורדות, והמנוע נפל למסלול של טווחים קטנים. לכן גם קריאה
 * קדימה ממתינה בתור ולא יוצאת במקביל.
 */
const MAX_PARALLEL = 2
const SESSION_TTL_MS = 6 * 60 * 60 * 1000
const BLOCK_TIMEOUT_MS = 30_000
const MAX_ATTEMPTS = 5
const DEFAULT_CACHE_LIMIT = 4 * 1024 * 1024 * 1024
/** טווחי משנה כשגוגל מסרב לבלוק שלם בגלל מכסת הורדות */
const QUOTA_FALLBACK_BYTES = [1024 * 1024, 256 * 1024]

export type DriveErrorKind = 'auth' | 'notFound' | 'quota' | 'rate' | 'blocked' | 'abuse' | 'network' | 'unavailable'

export class DriveError extends Error {
  constructor(
    readonly kind: DriveErrorKind,
    message: string,
    /** שניות להמתנה לפי Retry-After, אם השרת שלח */
    readonly retryAfter?: number
  ) {
    super(message)
  }
}

export interface DriveMeta {
  id: string
  size: number
  mimeType: string
  /** מזהה גרסה: קובץ ששונה בדרייב לא יוגש מהמטמון הישן */
  version: string
}

export interface DriveEngineOptions {
  fetch: (url: string, init?: RequestInit) => Promise<Response>
  /** אסימון OAuth של המשתמש, או null כשאין חשבון מחובר */
  token: () => Promise<string | null>
  apiKey: string
  cacheDir: string
  cacheLimitBytes?: number
  apiBase?: string
  /** לבדיקות: השהיה בין ניסיונות. ברירת המחדל היא המתנה אמיתית */
  sleep?: (ms: number) => Promise<void>
}

/**
 * בלוק בדרך: חוצץ באורך הבלוק שמתמלא ככל שהבייטים מגיעים מגוגל.
 *
 * mpv מקבל כל בייט ברגע שהגיע, ולא אחרי שכל 8 המגה ירדו. בלי זה
 * הפריים הראשון חיכה לבלוק שלם — שש שניות בקובץ אמיתי — גם כשמה
 * ש-mpv צריך כדי להתחיל הוא כמה עשרות קילובייט.
 */
interface Filling {
  data: Buffer
  filled: number
  failed: boolean
  wake: Set<() => void>
}

interface Session {
  fileId: string
  expiresAt: number
}

/** מזהה הקובץ מתוך הכתובת שנשמרה בקטלוג (`…/files/<id>?alt=media&key=…`) */
export function fileIdFrom(source: string): string | null {
  const match = /\/files\/([A-Za-z0-9_-]+)/.exec(source)
  return match?.[1] ?? null
}

/** הבלוקים שמכסים את הטווח [start, end], כולל שני הקצוות */
export function blocksFor(start: number, end: number): number[] {
  const first = Math.floor(start / BLOCK_BYTES)
  const last = Math.floor(end / BLOCK_BYTES)
  const out: number[] = []
  for (let i = first; i <= last; i++) out.push(i)
  return out
}

/** אורך הבלוק: כל הבלוקים מלאים, חוץ מהאחרון */
export function blockLength(index: number, size: number): number {
  return Math.max(0, Math.min(BLOCK_BYTES, size - index * BLOCK_BYTES))
}

/**
 * פענוח כותרת Range מול גודל הקובץ.
 *
 * שלוש צורות: `bytes=a-b`, `bytes=a-` ו-`bytes=-n` (סיומת). מחזיר
 * null כשהטווח אינו ניתן לספק — ואז התשובה היא 416.
 */
export function parseRange(header: string | undefined, size: number): { start: number; end: number } | 'none' | null {
  if (!header) return 'none'
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim())
  if (!match || (match[1] === '' && match[2] === '')) return null
  if (match[1] === '') {
    const suffix = Number(match[2])
    if (suffix <= 0) return null
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }
  const start = Number(match[1])
  const end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1)
  if (start >= size || end < start) return null
  return { start, end }
}

/** סיווג תשובת שגיאה של Drive לפי הסיבה שבגוף ה-JSON */
export async function classify(response: Response, authenticated: boolean): Promise<DriveError> {
  const body = await response.text().catch(() => '')
  let reason = ''
  try {
    const json = JSON.parse(body) as { error?: { errors?: Array<{ reason?: string }> } }
    reason = json.error?.errors?.[0]?.reason ?? ''
  } catch {
    reason = /downloadQuotaExceeded|rateLimitExceeded|userRateLimitExceeded/.exec(body)?.[0] ?? ''
  }
  const retryAfter = Number(response.headers.get('retry-after'))
  const after = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined
  const status = response.status

  /*
   * דף ה-"Sorry..." של גוגל.
   *
   * זו אינה שגיאת Drive אלא ההגנה של שער הכניסה של גוגל מפני תעבורה
   * אוטומטית: דף HTML ולא JSON, ובלי שום סיבה במבנה המוכר. נצפה בפועל
   * אחרי פרץ של בקשות מקבילות לאותו קובץ. זה זמני — דקות, לכל היותר
   * שעה — ולכן "עמוס, נסו שוב", ולא "אין הרשאה": קודם הוא סווג כחסימת
   * גישה, והמשתמש היה מקבל עצה לחבר חשבון לבעיה שנפתרת מעצמה.
   */
  const html = (response.headers.get('content-type') ?? '').includes('text/html')
  if (html && (status === 403 || status === 429) && /Sorry|automated queries|unusual traffic/i.test(body)) {
    return new DriveError('blocked', 'Google anti-automation page')
  }

  if (reason === 'downloadQuotaExceeded') return new DriveError('quota', 'download quota exceeded')
  if (reason === 'cannotDownloadAbusiveFile') return new DriveError('abuse', 'file flagged by Google')
  if (
    status === 429 ||
    status >= 500 ||
    ['rateLimitExceeded', 'userRateLimitExceeded', 'backendError', 'sharingRateLimitExceeded'].includes(reason)
  ) {
    return new DriveError('rate', `rate limited (${status})`, after)
  }
  // ‏Drive מחזיר 404 על קבצים פרטיים כדי לא לחשוף את קיומם, ולכן 404
  // בלי חשבון מחובר פירושו "צריך חשבון" ולא "לא קיים"
  if (status === 404) return new DriveError(authenticated ? 'notFound' : 'auth', 'not found')
  if (status === 401 || status === 403) return new DriveError('auth', `access denied (${status})`)
  return new DriveError('unavailable', `unexpected status ${status}`)
}

export class DriveEngine {
  private server: http.Server | null = null
  private port = 0
  private starting: Promise<void> | null = null
  private readonly sessions = new Map<string, Session>()
  private readonly meta = new Map<string, Promise<DriveMeta>>()
  private readonly inflight = new Map<string, Promise<Buffer>>()
  private readonly filling = new Map<string, Filling>()
  private active = 0
  private readonly queue: Array<() => void> = []
  private lastEviction = 0
  private readonly apiBase: string
  private readonly limit: number
  private readonly sleep: (ms: number) => Promise<void>
  /** לבדיקות ולאבחון: כמה בקשות נתונים יצאו בפועל לגוגל */
  readonly stats = { dataRequests: 0, metaRequests: 0, cacheHits: 0, retries: 0, quotaFallbacks: 0 }

  constructor(private readonly opts: DriveEngineOptions) {
    this.apiBase = opts.apiBase ?? 'https://www.googleapis.com/drive/v3'
    this.limit = opts.cacheLimitBytes ?? DEFAULT_CACHE_LIMIT
    this.sleep = opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  }

  // ---------- כתובת לנגן ----------

  /**
   * מכין קובץ לניגון ומחזיר כתובת loopback.
   *
   * ההכנה מביאה את המטא-דאטה, ממתינה לבייטים הראשונים של הבלוק
   * הראשון, ומתחילה להביא ברקע את הבלוק האחרון. זו בדיקת הזמינות —
   * אבל היא אינה נזרקת: הבלוק ממשיך לרדת, ו-mpv מתחבר לאותה הורדה.
   *
   * כשל כאן נזרק כ-DriveError עם סוג מדויק, כדי שהממשק יאמר למשתמש
   * מה בדיוק לא בסדר במקום "שגיאה".
   */
  async open(source: string): Promise<string> {
    const fileId = fileIdFrom(source)
    if (!fileId) throw new DriveError('notFound', 'no Drive file id in source')
    const meta = await this.metadata(fileId)
    if (meta.size > 0) {
      const last = Math.floor((meta.size - 1) / BLOCK_BYTES)
      // אינדקס MP4 יושב לפעמים בסוף הקובץ, ו-mpv קורא אותו לפני הכול
      if (last > 0) void this.block(meta, last).catch(() => undefined)
      // הבייטים הראשונים מספיקים כבדיקת זמינות; השאר ממשיך לרדת ברקע
      await this.firstBytes(meta, 0)
    }
    await this.start()
    const token = crypto.randomBytes(24).toString('base64url')
    this.sessions.set(token, { fileId, expiresAt: Date.now() + SESSION_TTL_MS })
    return `http://127.0.0.1:${this.port}/drive/${token}`
  }

  // ---------- גוגל ----------

  /** כתובת עם מפתח ה-API, לגישה בלי חשבון */
  private url(fileId: string, params: Record<string, string>): string {
    const url = new URL(`${this.apiBase}/files/${encodeURIComponent(fileId)}`)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    url.searchParams.set('supportsAllDrives', 'true')
    if (this.opts.apiKey) url.searchParams.set('key', this.opts.apiKey)
    return url.toString()
  }

  /**
   * בקשה אחת לגוגל, עם ניסיונות חוזרים על תקלות חולפות.
   *
   * האסימון קודם: בקשה מזוהה נזקפת למשתמש, והיא מגיעה גם לקבצים
   * פרטיים. בלי חשבון מחובר — מפתח ה-API בלבד, וזה מספיק לכל תיקייה
   * שמשותפת "לכל מי שיש לו את הקישור". הגרסה הקודמת דרשה חשבון
   * מחובר לכל ניגון, ולכן תיקייה שנוספה בקישור — הדרך הראשית להוסיף
   * דרייב — הופיעה בספרייה ולא ניגנה.
   */
  private async request(url: string, headers: Record<string, string>): Promise<Response> {
    let last: DriveError | null = null
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const token = await this.opts.token().catch(() => null)
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), BLOCK_TIMEOUT_MS)
      try {
        const response = await this.opts.fetch(url, {
          headers: token ? { ...headers, Authorization: `Bearer ${token}` } : headers,
          signal: controller.signal
        })
        if (response.ok) return response
        const error = await classify(response, Boolean(token))
        // רק מגבלת קצב ותקלות שרת שוות ניסיון נוסף; השאר קבועים
        if (error.kind !== 'rate') throw error
        last = error
      } catch (error) {
        if (error instanceof DriveError && error.kind !== 'rate') throw error
        last = error instanceof DriveError ? error : new DriveError('network', String(error))
      } finally {
        clearTimeout(timer)
      }
      if (attempt < MAX_ATTEMPTS - 1) {
        this.stats.retries++
        // המתנה מעריכית עם ג'יטר מלא, ו-Retry-After גובר כשנשלח
        const backoff = Math.min(8000, 400 * 2 ** attempt)
        const wait = last?.retryAfter ? Math.min(10_000, last.retryAfter * 1000) : Math.random() * backoff
        await this.sleep(wait)
      }
    }
    throw last ?? new DriveError('unavailable', 'no response')
  }

  /** גודל, סוג וגרסה — פעם אחת לכל קובץ, לא בכל בקשה של mpv */
  metadata(fileId: string): Promise<DriveMeta> {
    const existing = this.meta.get(fileId)
    if (existing) return existing
    const pending = (async () => {
      this.stats.metaRequests++
      const response = await this.request(
        this.url(fileId, { fields: 'id,size,mimeType,md5Checksum,modifiedTime' }),
        { Accept: 'application/json' }
      )
      const json = (await response.json()) as {
        id: string
        size?: string
        mimeType?: string
        md5Checksum?: string
        modifiedTime?: string
      }
      return {
        id: json.id ?? fileId,
        size: Number(json.size ?? 0),
        mimeType: json.mimeType || 'application/octet-stream',
        version: json.md5Checksum ?? `${json.size ?? 0}-${json.modifiedTime ?? ''}`
      }
    })()
    this.meta.set(fileId, pending)
    // מטא-דאטה שנכשלה אינה נשמרת: הניסיון הבא צריך לשאול שוב
    pending.catch(() => this.meta.delete(fileId))
    return pending
  }

  /**
   * טווח אחד מגוגל, נכתב אל תוך החוצץ של הבלוק תוך כדי ההגעה.
   *
   * הזמן הקצוב חל על כל הפסקה בזרימה ולא על הבקשה כולה: בלוק שיורד
   * לאט אבל ברציפות אינו נקטע, וחיבור שנתקע באמצע — כן.
   */
  private async fetchRange(meta: DriveMeta, start: number, end: number, into: Filling, offset: number): Promise<void> {
    this.stats.dataRequests++
    const response = await this.request(this.url(meta.id, { alt: 'media' }), {
      Range: `bytes=${start}-${end}`,
      Accept: '*/*'
    })
    const expected = end - start + 1
    const reader = response.body?.getReader()
    if (!reader) throw new DriveError('unavailable', 'empty body')
    let received = 0
    let stalled: ReturnType<typeof setTimeout> | undefined
    const arm = (): void => {
      clearTimeout(stalled)
      stalled = setTimeout(() => void reader.cancel().catch(() => undefined), BLOCK_TIMEOUT_MS)
    }
    try {
      arm()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        arm()
        const take = Math.min(value.length, expected - received)
        if (take <= 0) continue
        into.data.set(value.subarray(0, take), offset + received)
        received += take
        into.filled = Math.max(into.filled, offset + received)
        this.wake(into)
      }
    } catch (error) {
      throw new DriveError('network', String(error))
    } finally {
      clearTimeout(stalled)
    }
    if (received !== expected) {
      throw new DriveError('network', `short read ${received}/${expected}`)
    }
  }

  private wake(into: Filling): void {
    for (const resolve of into.wake) resolve()
    into.wake.clear()
  }

  /**
   * הבאת בלוק שלם מגוגל.
   *
   * בקשה אחת לבלוק. רק אם גוגל מסרב בגלל מכסת הורדות, הבלוק מורכב
   * מטווחי משנה קטנים יותר: קבצים שהגיעו למכסה ממשיכים לפעמים לענות
   * על טווחים קטנים. זה המסלול החריג ולא הרגיל — הגרסה הקודמת עבדה
   * כך תמיד, וזה מה שהפך כל סרט לעשרות אלפי בקשות.
   */
  private async download(meta: DriveMeta, index: number, into: Filling): Promise<Buffer> {
    const start = index * BLOCK_BYTES
    const end = start + into.data.length - 1
    try {
      /*
       * חיבור שנפל באמצע ממשיך מהבייט האחרון שהגיע, ולא מתחילת הבלוק:
       * מה שכבר ירד כבר נשלח ל-mpv, וגם אין סיבה להוריד אותו פעמיים.
       */
      for (let attempt = 0; ; attempt++) {
        try {
          await this.fetchRange(meta, start + into.filled, end, into, into.filled)
          return into.data
        } catch (error) {
          if (!(error instanceof DriveError) || error.kind !== 'network' || attempt >= 2) throw error
          this.stats.retries++
        }
      }
    } catch (error) {
      if (!(error instanceof DriveError) || error.kind !== 'quota') throw error
      this.stats.quotaFallbacks++
      for (const step of QUOTA_FALLBACK_BYTES) {
        try {
          for (let from = start; from <= end; from += step) {
            await this.fetchRange(meta, from, Math.min(end, from + step - 1), into, from - start)
          }
          return into.data
        } catch (inner) {
          if (!(inner instanceof DriveError) || inner.kind !== 'quota') throw inner
        }
      }
      throw error
    }
  }

  // ---------- מטמון ----------

  private dirFor(meta: DriveMeta): string {
    const key = crypto.createHash('sha1').update(`${meta.id}|${meta.version}`).digest('hex')
    return path.join(this.opts.cacheDir, key)
  }

  private fileFor(meta: DriveMeta, index: number): string {
    return path.join(this.dirFor(meta), `${index}.blk`)
  }

  /** בלוק מהמטמון, או null. בלוק באורך שגוי נמחק ואינו מוגש */
  private async readCached(meta: DriveMeta, index: number): Promise<Buffer | null> {
    const file = this.fileFor(meta, index)
    try {
      const data = await fs.promises.readFile(file)
      if (data.length !== blockLength(index, meta.size)) {
        await fs.promises.rm(file, { force: true })
        return null
      }
      // נגיעה בזמן הגישה, כדי שהפינוי יזרוק את מה שלא נצפה זמן רב
      const now = new Date()
      void fs.promises.utimes(file, now, now).catch(() => undefined)
      return data
    } catch {
      return null
    }
  }

  /** כתיבה אטומית: קובץ זמני ואז שינוי שם, כדי שקריסה לא תשאיר בלוק חצוי */
  private async writeCached(meta: DriveMeta, index: number, data: Buffer): Promise<void> {
    const dir = this.dirFor(meta)
    await fs.promises.mkdir(dir, { recursive: true })
    const file = this.fileFor(meta, index)
    const temp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`
    await fs.promises.writeFile(temp, data)
    await fs.promises.rename(temp, file).catch(async () => {
      await fs.promises.rm(temp, { force: true })
    })
    void this.evict()
  }

  /** מגביל את מספר ההורדות שרצות במקביל */
  private async slot<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= MAX_PARALLEL) await new Promise<void>((resolve) => this.queue.push(resolve))
    this.active++
    try {
      return await work()
    } finally {
      this.active--
      this.queue.shift()?.()
    }
  }

  /**
   * בלוק — מהמטמון, או מגוגל.
   *
   * שתי בקשות לאותו בלוק באותו זמן חולקות הורדה אחת. mpv פותח לעתים
   * כמה חיבורים במקביל לאותו קובץ, ובלי זה כל אחד היה מוריד בנפרד.
   */
  block(meta: DriveMeta, index: number): Promise<Buffer> {
    const key = `${meta.id}|${meta.version}|${index}`
    const existing = this.inflight.get(key)
    if (existing) return existing
    const pending = (async () => {
      const cached = await this.readCached(meta, index)
      if (cached) {
        this.stats.cacheHits++
        return cached
      }
      const into: Filling = { data: Buffer.alloc(blockLength(index, meta.size)), filled: 0, failed: false, wake: new Set() }
      this.filling.set(key, into)
      try {
        const data = await this.slot(() => this.download(meta, index, into))
        await this.writeCached(meta, index, data).catch(() => undefined)
        return data
      } catch (error) {
        into.failed = true
        throw error
      } finally {
        this.filling.delete(key)
        this.wake(into)
      }
    })()
    this.inflight.set(key, pending)
    void pending.finally(() => this.inflight.delete(key)).catch(() => undefined)
    return pending
  }

  /**
   * החוצץ של בלוק בדרך, או null כשהבלוק הגיע מהמטמון.
   *
   * ‏block() קורא את המטמון לפני שהוא פותח חוצץ, ולכן החוצץ נוצר רק
   * אחרי קריאת דיסק אחת — ממתינים לרגע הזה, או לסיום הבלוק.
   */
  private async fillingFor(key: string, pending: Promise<Buffer>): Promise<Filling | null> {
    let done = false
    void pending.then(
      () => (done = true),
      () => (done = true)
    )
    for (;;) {
      const into = this.filling.get(key)
      if (into) return into
      if (done) return null
      await new Promise<void>((resolve) => setImmediate(resolve))
    }
  }

  /**
   * מזרים את הטווח [from, to] של בלוק אל write, ברגע שהבייטים זמינים.
   *
   * בלוק שבמטמון נשלח בבת אחת. בלוק שבדרך נשלח בחלקים, כל חלק ברגע
   * שהגיע מגוגל — והורדה אחת משרתת כמה חיבורים במקביל.
   */
  private async stream(
    meta: DriveMeta,
    index: number,
    from: number,
    to: number,
    write: (chunk: Buffer) => Promise<boolean>
  ): Promise<void> {
    const key = `${meta.id}|${meta.version}|${index}`
    const pending = this.block(meta, index)
    const into = await this.fillingFor(key, pending)
    let cursor = from
    while (into && cursor <= to && !into.failed) {
      if (into.filled > cursor) {
        const until = Math.min(into.filled, to + 1)
        if (!(await write(into.data.subarray(cursor, until)))) return
        cursor = until
        continue
      }
      if (this.filling.get(key) !== into) break
      await new Promise<void>((resolve) => into.wake.add(resolve))
    }
    if (cursor > to) return
    const data = await pending
    await write(data.subarray(cursor, to + 1))
  }

  /** מתחיל להביא בלוק, וחוזר כשהבייטים הראשונים שלו זמינים — או נזרק */
  private async firstBytes(meta: DriveMeta, index: number): Promise<void> {
    const key = `${meta.id}|${meta.version}|${index}`
    const pending = this.block(meta, index)
    const into = await this.fillingFor(key, pending)
    if (!into) {
      await pending
      return
    }
    while (into.filled === 0 && !into.failed && this.filling.get(key) === into) {
      await new Promise<void>((resolve) => into.wake.add(resolve))
    }
    if (into.filled === 0) await pending
  }

  /**
   * פינוי לפי זמן הגישה האחרון.
   *
   * רץ לכל היותר פעם בחצי דקה, ומפנה עד 85% מהתקרה — כך שהכתיבה הבאה
   * לא מפעילה אותו שוב מיד.
   */
  async evict(force = false): Promise<void> {
    if (!force && Date.now() - this.lastEviction < 30_000) return
    this.lastEviction = Date.now()
    const blocks = await this.listBlocks()
    let total = blocks.reduce((sum, b) => sum + b.size, 0)
    if (total <= this.limit) return
    const target = this.limit * 0.85
    blocks.sort((a, b) => a.mtime - b.mtime)
    for (const block of blocks) {
      if (total <= target) break
      await fs.promises.rm(block.file, { force: true }).catch(() => undefined)
      total -= block.size
    }
  }

  private async listBlocks(): Promise<Array<{ file: string; size: number; mtime: number }>> {
    const out: Array<{ file: string; size: number; mtime: number }> = []
    let dirs: string[] = []
    try {
      dirs = await fs.promises.readdir(this.opts.cacheDir)
    } catch {
      return out
    }
    for (const dir of dirs) {
      const full = path.join(this.opts.cacheDir, dir)
      let files: string[] = []
      try {
        files = await fs.promises.readdir(full)
      } catch {
        continue
      }
      for (const name of files) {
        if (!name.endsWith('.blk')) continue
        try {
          const stat = await fs.promises.stat(path.join(full, name))
          out.push({ file: path.join(full, name), size: stat.size, mtime: stat.mtimeMs })
        } catch {
          /* נמחק בינתיים */
        }
      }
    }
    return out
  }

  /** גודל המטמון והתקרה, להצגה בהגדרות */
  async cacheInfo(): Promise<{ bytes: number; limitBytes: number }> {
    const blocks = await this.listBlocks()
    return { bytes: blocks.reduce((sum, b) => sum + b.size, 0), limitBytes: this.limit }
  }

  async clearCache(): Promise<void> {
    await fs.promises.rm(this.opts.cacheDir, { recursive: true, force: true }).catch(() => undefined)
    await fs.promises.mkdir(this.opts.cacheDir, { recursive: true }).catch(() => undefined)
  }

  // ---------- השרת המקומי ----------

  private async start(): Promise<void> {
    if (this.server && this.port) return
    if (this.starting) return this.starting
    const starting = new Promise<void>((resolve, reject) => {
      const server = http.createServer((request, response) => void this.handle(request, response))
      server.once('error', reject)
      // ‏127.0.0.1 בלבד: אף מחשב אחר ברשת אינו יכול לפנות לכאן
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        if (!address || typeof address === 'string') return reject(new Error('Drive loopback unavailable'))
        this.server = server
        this.port = address.port
        resolve()
      })
    })
    this.starting = starting
    try {
      await starting
    } finally {
      if (this.starting === starting) this.starting = null
    }
  }

  private async handle(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
    const token = /^\/drive\/([A-Za-z0-9_-]{32,64})$/.exec(request.url ?? '')?.[1]
    const session = token ? this.sessions.get(token) : undefined
    if (!session || session.expiresAt < Date.now()) {
      if (token) this.sessions.delete(token)
      response.writeHead(404).end()
      return
    }

    let meta: DriveMeta
    try {
      meta = await this.metadata(session.fileId)
    } catch (error) {
      response.writeHead(error instanceof DriveError && error.kind === 'auth' ? 403 : 502).end()
      return
    }

    const range = parseRange(request.headers.range, meta.size)
    if (range === null) {
      response.writeHead(416, { 'Content-Range': `bytes */${meta.size}` }).end()
      return
    }
    const start = range === 'none' ? 0 : range.start
    const end = range === 'none' ? meta.size - 1 : range.end

    const headers: Record<string, string> = {
      'Accept-Ranges': 'bytes',
      'Content-Type': meta.mimeType,
      'Content-Length': String(end - start + 1),
      'Cache-Control': 'no-store'
    }
    if (range !== 'none') headers['Content-Range'] = `bytes ${start}-${end}/${meta.size}`
    response.writeHead(range === 'none' ? 200 : 206, headers)

    // ‏HEAD צריך רק את הכותרות — והן כבר ידועות מהמטא-דאטה, בלי בקשה לגוגל
    if (request.method === 'HEAD' || meta.size === 0) {
      response.end()
      return
    }

    let closed = false
    response.on('close', () => {
      closed = true
    })

    try {
      const blocks = blocksFor(start, end)
      for (const index of blocks) {
        if (closed) return
        // קדימה ברקע: בזמן שהבלוק הזה נשלח, הבאים כבר בדרך
        for (let ahead = 1; ahead <= READ_AHEAD; ahead++) {
          const next = index + ahead
          if (next * BLOCK_BYTES < meta.size) void this.block(meta, next).catch(() => undefined)
        }
        const blockStart = index * BLOCK_BYTES
        const from = Math.max(start, blockStart) - blockStart
        const to = Math.min(end, blockStart + blockLength(index, meta.size) - 1) - blockStart
        await this.stream(meta, index, from, to, async (slice) => {
          if (closed) return false
          // לחץ חוזר: לא דוחפים לזיכרון יותר ממה ש-mpv קורא
          if (!response.write(slice)) {
            await new Promise<void>((resolve) => {
              const done = (): void => {
                response.off('drain', done)
                response.off('close', done)
                resolve()
              }
              response.once('drain', done)
              response.once('close', done)
            })
          }
          return !closed
        })
        if (closed) return
      }
      response.end()
    } catch {
      // הכותרות כבר נשלחו; ניתוק הוא הדרך היחידה לומר ל-mpv שנכשל
      response.destroy()
    }
  }

  /**
   * ממתין שכל ההורדות ברקע — קריאה קדימה והבלוק האחרון — יסתיימו.
   *
   * בלי זה סגירה באמצע משאירה בקשות רשת תלויות. ב-Windows, fetch של
   * Node מפיל את התהליך כולו כשהן נסגרות מתחתיו (assertion של libuv,
   * קוד יציאה ‎0xC0000409) — וזה בדיוק מה שהפיל בדיקה אחרת בכל פעם.
   */
  async drain(): Promise<void> {
    while (this.inflight.size > 0) {
      await Promise.allSettled([...this.inflight.values()])
    }
  }

  close(): void {
    this.sessions.clear()
    /*
     * ‏close לבדו מפסיק לקבל חיבורים חדשים אבל משאיר את הקיימים —
     * ו-mpv, כמו כל לקוח HTTP, מחזיק חיבור keep-alive פתוח. חיבור כזה
     * ששרד יכול להיעשות שימוש חוזר על ידי לקוח שמקבל את אותו פורט
     * משרת חדש, והבקשה מגיעה למנוע שכבר נסגר.
     */
    this.server?.closeAllConnections()
    this.server?.close()
    this.server = null
    this.port = 0
  }
}
