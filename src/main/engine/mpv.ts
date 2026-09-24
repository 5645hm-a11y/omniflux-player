import { spawn, type ChildProcess } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import fs from 'node:fs'
import { app } from 'electron'
import { EventEmitter } from 'node:events'
import { t } from '../services/settings'

/**
 * מנוע הנגינה.
 *
 * mpv רץ כתהליך נפרד, מצייר לחלון משלו, ונשלט דרך צינור בשם עם JSON.
 * הבחירה הזאת נבדקה ולא הונחה: ניסיתי לתת ל-mpv את ה-HWND של חלון
 * Electron, והתוצאה הייתה שחלון הבן שלו כיסה את כל מה ש-Chromium מצייר —
 * כלומר הממשק נעלם מתחת לווידאו. בחלון נפרד שניהם חיים יחד.
 *
 * כל התקשורת ב-UTF-8 מפורש, ונתיבי קבצים נשלחים כפקודת `loadfile`
 * בצינור ולא כארגומנט בשורת הפקודה. שורת הפקודה עוברת דרך המרה לדף
 * הקוד המקומי אצל תוכניות שקוראות argv בגרסת ANSI, ושם נתיב עברי הופך
 * לסימני שאלה. הצינור לא נוגע בזה בכלל.
 */

export interface TrackInfo {
  id: number
  type: 'video' | 'audio' | 'sub'
  title?: string
  lang?: string
  selected: boolean
  codec?: string
  /** לכתוביות ואודיו: האם מוטמע בקובץ או נטען מבחוץ */
  external?: boolean
}

export interface EngineState {
  path: string | null
  title: string | null
  artist: string | null
  cover: string | null
  mediaId: string | null
  provider: string | null
  playbackMode: 'preview' | 'full' | null
  duration: number
  position: number
  paused: boolean
  volume: number
  muted: boolean
  speed: number
  /** האם אין קובץ טעון במנוע. השהיה אינה "סרק". */
  idle: boolean
  hwdec: string | null
  tracks: TrackInfo[]
  subDelay: number
  audioDelay: number
  /** הגברים באקולייזר, בדציבלים */
  eq: number[]
  /** יחס תצוגה שנכפה, או '-1' לזה שבקובץ */
  aspect: string
  brightness: number
  contrast: number
  saturation: number
  gamma: number
  sharpen: number
  deband: boolean
  videoFit: 'fit' | 'fill' | 'zoom'
}

const EMPTY: EngineState = {
  path: null,
  title: null,
  artist: null,
  cover: null,
  mediaId: null,
  provider: null,
  playbackMode: null,
  duration: 0,
  position: 0,
  paused: true,
  volume: 100,
  muted: false,
  speed: 1,
  idle: true,
  hwdec: null,
  tracks: [],
  subDelay: 0,
  audioDelay: 0,
  eq: Array(10).fill(0),
  aspect: '-1',
  brightness: 0,
  contrast: 0,
  saturation: 0,
  gamma: 0,
  sharpen: 0,
  deband: false,
  videoFit: 'fit'
}

/** מה שאנחנו מבקשים ממנו לדווח לנו על כל שינוי */
const OBSERVED: Array<[id: number, prop: string, key: keyof EngineState]> = [
  [1, 'time-pos', 'position'],
  [2, 'duration', 'duration'],
  [3, 'pause', 'paused'],
  [4, 'volume', 'volume'],
  [5, 'mute', 'muted'],
  [6, 'speed', 'speed'],
  [7, 'path', 'path'],
  [8, 'media-title', 'title'],
  /*
   * ‏idle-active ולא core-idle.
   *
   * ‏core-idle דלוק גם כשהמשתמש השהה — נמדד: pause=yes core-idle=yes.
   * הממשק מבין ממנו "אין מה לנגן", ולכן אחרי השהיה כפתור הניגון ננעל
   * (disabled) ו-togglePlayback חזר בלי לעשות דבר. זה היה "השהיתי סרט
   * מהדרייב ואי אפשר להמשיך".
   */
  [9, 'idle-active', 'idle'],
  [10, 'hwdec-current', 'hwdec'],
  [11, 'sub-delay', 'subDelay'],
  [12, 'audio-delay', 'audioDelay'],
  [13, 'brightness', 'brightness'],
  [14, 'contrast', 'contrast'],
  [15, 'saturation', 'saturation'],
  [16, 'gamma', 'gamma']
]

/** מזהה המעקב אחרי eof-reached — מחוץ ל-OBSERVED, כי אינו שדה במצב */
const EOF_ID = 50

interface Pending {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
}

/**
 * האם שורת stderr היא כשל שראוי להראות למשתמש.
 *
 * הבדיקה חיובית ולא שלילית: מוצגת רק שורה שנראית כמו שגיאה, וכל
 * השאר הולך ליומן. הכיוון ההפוך — חסימה לפי רשימת אזהרות מוכרות —
 * היה מדליף כל הודעה חדשה שגרסת מנוע הבאה תוסיף.
 */
function isEngineFailure(line: string): boolean {
  const lower = line.toLowerCase()
  // שורה מתויגת של רכיב פנימי היא דיווח, אלא אם היא אומרת אחרת
  if (/^\[?(ffmpeg|lavf|lavc|ao|vo|vd|ad|cplayer)/i.test(line) && !/error|failed|cannot/.test(lower)) {
    return false
  }
  return /\berror\b|\bfailed\b|\bcannot\b|\bunable to\b|\bno such file\b|\bopening failed\b/.test(lower)
}

export declare interface MpvEngine {
  on(event: 'state', listener: (state: EngineState) => void): this
  on(event: 'ended', listener: (reason: string) => void): this
  on(event: 'error', listener: (message: string) => void): this
  on(event: 'exit', listener: (code: number | null) => void): this
}

export class MpvEngine extends EventEmitter {
  private child: ChildProcess | null = null
  private sock: net.Socket | null = null
  private buffer = ''
  private nextId = 100
  private pending = new Map<number, Pending>()
  private debugSent = new Map<number, number>()
  /** פקודות שלא נענו ברצף — שתיים = המנוע תקוע */
  private unanswered = 0
  private closing = false
  private displayTitle: string | null = null
  /** מה שנטען אחרון — כדי שאפשר יהיה לחזור אליו אם המנוע ייפול */
  private lastLoad: { target: string; metadata?: Parameters<MpvEngine['load']>[1] } | null = null
  readonly state: EngineState = { ...EMPTY, eq: Array(10).fill(0) }

  private set eq(v: number[]) {
    this.state.eq = v
  }
  private set aspect(v: string) {
    this.state.aspect = v
  }

  /*
   * שם חדש לכל הפעלה של המנוע.
   *
   * השם היה קבוע לפי מזהה התהליך של התוכנה, ולכן מנוע שקם אחרי נפילה
   * ניסה לפתוח צינור בשם שעדיין תפוס. מה שקרה בפועל: החיבור נקשר אל
   * הצינור הישן והמת, כל פקודה נשלחה לשומקום, ואחרי שמונה שניות חזרה
   * שגיאת "הפקודה לא נענתה" — כלומר תוכנה שנראית חיה ואינה מגיבה.
   */
  private pipe = `\\\\.\\pipe\\omniflux-mpv-${process.pid}-${Date.now().toString(36)}`
  /** התאוששות אחת בכל רגע: שתיים במקביל משאירות שני מנועים */
  private restarting = false

  /** נתיב הקובץ ההרצה. בבנייה ארוזה הוא יושב ליד התוכנה. */
  private binary(): string {
    const dir = app.isPackaged
      ? path.join(process.resourcesPath, 'engine')
      : path.join(app.getAppPath(), 'resources', 'engine')
    return path.join(dir, 'mpv.exe')
  }

  available(): boolean {
    return fs.existsSync(this.binary())
  }

  /** מזהה התהליך של המנוע — לבדיקות שצריכות להפיל אותו בכוונה */
  get pid(): number | null {
    return this.child?.pid ?? null
  }

  /**
   * מפעיל את המנוע. החלון נוצר מיד גם בלי קובץ, כדי שיהיה לו מקום
   * להיצמד אליו לפני שהמשתמש בחר משהו.
   */
  async start(bounds: { x: number; y: number; width: number; height: number }): Promise<void> {
    if (this.child) return
    const bin = this.binary()
    if (!fs.existsSync(bin)) {
      throw new Error(t('status.engineMissing'))
    }

    this.closing = false
    this.pipe = `\\\\.\\pipe\\omniflux-mpv-${process.pid}-${Date.now().toString(36)}`
    this.child = spawn(
      bin,
      [
        `--input-ipc-server=${this.pipe}`,
        // אין קריאה לקובץ הגדרות של המשתמש — התנהגות זהה אצל כולם
        '--no-config',
        // הבקרות שלנו, לא של mpv
        '--no-osc',
        '--no-osd-bar',
        '--osd-level=0',
        '--no-input-default-bindings',
        '--input-vo-keyboard=no',
        // חלון בלי מסגרת, במקום ובגודל שאנחנו קובעים
        '--no-border',
        /*
         * סמל אחד בשורת המשימות, לא שניים.
         *
         * ‏mpv הוא תהליך נפרד עם חלון עליון משלו, ולכן Windows נתן לו
         * כפתור משלו — המשתמש ראה שני סמלים לאותה תוכנה. הדגל הזה
         * מסיר את שלו, ומשאיר רק את החלון של OmniFlux.
         */
        '--show-in-taskbar=no',
        '--taskbar-progress=no',
        '--title=OmniFlux Player Video Surface',
        `--geometry=${bounds.width}x${bounds.height}+${bounds.x}+${bounds.y}`,
        '--ontop=no',
        // נשאר חי בין קבצים, ולא נסגר בסוף הנגינה
        '--idle=yes',
        '--force-window=yes',
        '--keep-open=yes',
        // פענוח חומרה כשאפשר, ונפילה בטוחה לתוכנה
        '--hwdec=auto-safe',
        '--vo=gpu-next',
        // התחלה מושהית — הממשק מחליט מתי מתחילים
        '--pause=yes',
        // יומן מפורט של mpv לקובץ — לאבחון אצל משתמש, לעולם לא כברירת מחדל
        ...(process.env.OMNIFLUX_MPV_LOGFILE ? [`--log-file=${process.env.OMNIFLUX_MPV_LOGFILE}`, '--msg-level=all=v'] : [])
      ],
      { windowsHide: false, env: { ...process.env, APP_USER_MODEL_ID: 'com.avisharabi.omniflux' } }
    )

    this.child.stderr?.setEncoding('utf8')
    this.child.stderr?.on('data', (chunk: string) => {
      for (const line of chunk.split('\n')) {
        const text = line.trim()
        if (!text) continue
        /*
         * ffmpeg מדבר הרבה, ורובו אינו עניינו של המשתמש.
         *
         * "Caution: quantization tables are too coarse" היא הערה על
         * איכות JPEG בתמונה ממוזערת — היא הופיעה כהתראה אדומה על
         * הסרט. מה שאינו שגיאה אמיתית הולך ליומן בלבד.
        */
        if (process.env.OMNIFLUX_MPV_DEBUG === '1') console.error('[mpv]', text)
        if (isEngineFailure(text)) this.emit('error', text)
        else console.debug('[mpv]', text)
      }
    })
    this.child.on('exit', (code) => {
      this.child = null
      this.sock = null
      if (!this.closing) this.emit('exit', code)
    })

    await this.connect()
    for (const [id, prop] of OBSERVED) {
      void this.send(['observe_property', id, prop])
    }
    /*
     * סוף קובץ.
     *
     * עם ‎--keep-open=yes‏ mpv אינו שולח end-file כשהקובץ נגמר: הוא נעצר
     * על הפריים האחרון ומדליק את eof-reached. בלי המעקב הזה התור בממשק
     * לא ידע אף פעם ששיר נגמר, ו"נגן הכול" נעצר אחרי השיר הראשון.
     */
    void this.send(['observe_property', EOF_ID, 'eof-reached'])
  }

  /** הצינור נוצר רגע אחרי התהליך, ולכן מנסים שוב במקום להיכשל */
  private async connect(): Promise<void> {
    const deadline = Date.now() + 10_000
    for (;;) {
      try {
        await new Promise<void>((resolve, reject) => {
          const s = net.connect(this.pipe)
          s.setEncoding('utf8')
          s.once('connect', () => {
            this.sock = s
            s.on('data', (d: string) => this.onData(d))
            s.on('error', () => undefined)
            s.on('close', () => {
              this.sock = null
            })
            resolve()
          })
          s.once('error', reject)
        })
        return
      } catch (err) {
        if (Date.now() > deadline) {
          throw new Error(t('status.engineNoLink', { detail: err instanceof Error ? err.message : String(err) }))
        }
        await new Promise((r) => setTimeout(r, 120))
      }
    }
  }

  private onData(chunk: string): void {
    this.buffer += chunk
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(line) as Record<string, unknown>
      } catch {
        continue
      }
      if (typeof msg.request_id === 'number' && this.debugSent.has(msg.request_id)) {
        console.log('[ipc-debug] reply', msg.request_id, msg.error, `${Date.now() - this.debugSent.get(msg.request_id)!}ms`)
        this.debugSent.delete(msg.request_id)
      }
      if (typeof msg.request_id === 'number' && this.pending.has(msg.request_id)) {
        this.unanswered = 0
        const p = this.pending.get(msg.request_id)!
        this.pending.delete(msg.request_id)
        clearTimeout(p.timer)
        if (msg.error === 'success') p.resolve(msg.data)
        else p.reject(new Error(String(msg.error)))
        continue
      }
      if (typeof msg.event === 'string') this.onEvent(msg)
    }
  }

  private onEvent(msg: Record<string, unknown>): void {
    switch (msg.event) {
      case 'property-change': {
        if (msg.id === EOF_ID) {
          if (msg.data === true) this.emit('ended', 'eof')
          break
        }
        const entry = OBSERVED.find(([id]) => id === msg.id)
        if (!entry) break
        const [, , key] = entry
        const value = msg.data
        // null מגיע כשאין מדיה טעונה. לא דורסים בו מספרים.
        const slot = this.state as unknown as Record<string, unknown>
        /*
         * נתיב חדש מאפס את רשימת המסלולים.
         *
         * ‏mpv מדווח על הנתיב מיד, ועל `track-list` רק ב-file-loaded —
         * כלומר יש חלון של עשרות מילישניות שבו הנתיב הוא של הקובץ
         * החדש והמסלולים עדיין של הקודם. כל דיווח מצב בחלון הזה יוצא
         * החוצה כך, ולא רק הראשון.
         *
         * מי שמסיק מהמסלולים "יש כאן וידאו" טועה בדיוק אז: קובץ
         * מוזיקה שנטען אחרי סרט נראה כמו סרט, נכנס למסך צפייה, והמסך
         * נשאר שחור במקום להישאר בסרגל הנגן. נמדד: המסלולים הישנים
         * שרדו 32 מילישניות ושישה דיווחים.
         */
        if (key === 'path' && value !== this.state.path) this.state.tracks = []
        if (key === 'title' && this.displayTitle) {
          slot.title = this.displayTitle
        } else if (value === null || value === undefined) {
          // null מגיע כשאין מדיה טעונה. לא דורסים בו מספרים.
          if (key === 'path' || key === 'title' || key === 'hwdec') slot[key] = null
        } else {
          slot[key] = value
        }
        this.emit('state', this.state)
        break
      }
      case 'file-loaded':
        void this.refreshTracks()
        break
      case 'end-file':
        this.emit('ended', String(msg.reason ?? 'unknown'))
        break
      default:
        break
    }
  }

  /** שולח פקודה ומחכה לתשובה */
  send(command: unknown[], timeoutMs = 8000): Promise<unknown> {
    const sock = this.sock
    if (!sock) return Promise.reject(new Error(t('status.engineOffline')))
    const id = this.nextId++
    if (process.env.OMNIFLUX_AUDIO_DEBUG === '1' && command[0] !== 'get_property' && command[0] !== 'screenshot-to-file') {
      const started = Date.now()
      console.log('[ipc-debug] send', id, JSON.stringify(command).slice(0, 120))
      this.debugSent.set(id, started)
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        this.unanswered++
        if (this.unanswered >= 2) this.recoverFromHang()
        reject(new Error(t('status.commandTimeout', { cmd: String(command[0]) })))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      // UTF-8 מפורש: נתיבים בעברית עוברים כאן ולא בשורת הפקודה
      sock.write(Buffer.from(JSON.stringify({ command, request_id: id }) + '\n', 'utf8'))
    })
  }

  async get<T>(property: string): Promise<T> {
    return (await this.send(['get_property', property])) as T
  }

  async set(property: string, value: unknown): Promise<void> {
    // אבחון "אין צליל": מי כתב עוצמה או השתקה, ומאיפה. כבוי כברירת מחדל
    if (process.env.OMNIFLUX_AUDIO_DEBUG === '1' && (property === 'volume' || property === 'mute')) {
      console.log('[audio-debug] set', property, value, (new Error().stack ?? '').split(String.fromCharCode(10)).slice(2, 5).join(' | '))
    }
    await this.send(['set_property', property, value])
  }

  // ---------- מה שהממשק קורא לו ----------

  /** טוען קובץ או כתובת. הנתיב עובר בצינור, ולכן כל תו בו נשמר. */
  async load(target: string, metadata?: {
    mediaId?: string
    title?: string
    artist?: string
    cover?: string | null
    provider?: string
    playbackMode?: 'preview' | 'full'
    /** Private transport headers; never exposed through EngineState. */
    httpHeaders?: string[]
  }): Promise<void> {
    this.lastLoad = { target, metadata }
    this.displayTitle = metadata?.title?.trim() || null
    this.state.title = this.displayTitle
    this.state.artist = metadata?.artist?.trim() || null
    this.state.cover = metadata?.cover || null
    this.state.mediaId = metadata?.mediaId || null
    this.state.provider = metadata?.provider?.trim() || null
    this.state.playbackMode = metadata?.playbackMode ?? null
    this.emit('state', this.state)
    const headers = (metadata?.httpHeaders ?? [])
      .filter((header) => header.length <= 4096 && !/[\r\n]/.test(header))
      .slice(0, 8)
    // Keep the header installed for the lifetime of the stream: mpv can issue
    // later Range requests while seeking. The next load clears/replaces it.
    await this.set('http-header-fields', headers.join(','))
    await this.send(['loadfile', target, 'replace'])
    await this.set('pause', false)
  }

  async playPause(): Promise<void> {
    await this.set('pause', !this.state.paused)
  }

  /**
   * מקים את המנוע מחדש אחרי נפילה, וחוזר לאותו מקום בסרט.
   *
   * ‏mpv הוא תהליך נפרד, ותהליך יכול למות: מנהל התקן גרפי שקורס,
   * קובץ פגום, או מחשב עמוס. עד עכשיו התוכנה רק הודיעה על כך —
   * ומאותו רגע שום כפתור לא עשה דבר, כי אין למי לדבר. המשתמש ראה
   * בדיוק את מה שדווח: לחיצה על "המשך" שלא קורה בה כלום.
   *
   * החזרה היא לאותו קובץ ולאותה שנייה, ובאותו מצב השהיה — כדי
   * שהנפילה תיראה כמו הפרעה קצרה ולא כמו התחלה מחדש.
   */
  async restart(bounds: { x: number; y: number; width: number; height: number }): Promise<boolean> {
    if (this.restarting) return false
    this.restarting = true
    const resume = this.lastLoad
    const at = this.state.position
    const paused = this.state.paused
    this.child = null
    this.sock = null
    try {
      await this.start(bounds)
      if (!resume) return true
      await this.load(resume.target, resume.metadata)
      /*
       * הדילוג מחכה שהקובץ ייטען.
       *
       * ‏loadfile חוזר מיד, והקובץ נפתח אחריו. דילוג שנשלח באותו רגע
       * נבלע — נמדד: החזרה נפלה לשנייה 0.68 במקום ל-10.16. לכן
       * מוודאים שהגענו, ומנסים שוב אם לא.
       */
      if (at > 1) {
        for (const wait of [250, 600, 1200]) {
          await new Promise((resolve) => setTimeout(resolve, wait))
          await this.seek(at).catch(() => undefined)
          if (Math.abs(this.state.position - at) < 3) break
        }
      }
      if (paused) await this.set('pause', true)
      return true
    } catch {
      return false
    } finally {
      this.restarting = false
    }
  }

  /**
   * המנוע חי אבל אינו עונה — ומשחררים אותו.
   *
   * קורה בקובץ פגום: נמדד בסרט של 4 ג'יגה מהדרייב שבו ffmpeg מדווח
   * "timescale not set" ומחליט שהקובץ הוא תמונה אחת — ואז קורא את כולו
   * כדי "לפענח" אותה. התהליך חי, התור של הפקודות עומד, וכל לחיצה בממשק
   * מחכה שמונה שניות ונכשלת. בדיוק "הסרטון קפא והכפתורים לא מגיבים".
   *
   * הקובץ שתקע את המנוע נשכח לפני ההריגה — אחרת ההתאוששות מנפילה הייתה
   * טוענת אותו שוב, ונתקעת שוב. המנוע עולה ריק, והמשתמש מקבל הסבר.
   */
  private recoverFromHang(): void {
    if (this.restarting || !this.child) return
    console.error('[engine] not answering commands; restarting without the current file')
    this.unanswered = 0
    this.lastLoad = null
    this.emit('error', t('status.fileUnplayable'))
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer)
      p.reject(new Error(t('status.engineOffline')))
      this.pending.delete(id)
    }
    this.child.kill()
  }

  async seek(seconds: number, mode: 'absolute' | 'relative' = 'absolute'): Promise<void> {
    await this.send(['seek', seconds, mode])
  }

  async setVolume(value: number): Promise<void> {
    await this.set('volume', Math.max(0, Math.min(130, value)))
  }

  async setSpeed(value: number): Promise<void> {
    await this.set('speed', Math.max(0.25, Math.min(4, value)))
  }

  async selectTrack(type: 'audio' | 'sub' | 'video', id: number | 'no'): Promise<void> {
    await this.set(type === 'sub' ? 'sid' : type === 'audio' ? 'aid' : 'vid', id)
    await this.refreshTracks()
  }

  /** כתוביות מקובץ חיצוני */
  async addSubtitle(file: string): Promise<void> {
    await this.send(['sub-add', file, 'select'])
    await this.refreshTracks()
  }

  async setSubDelay(seconds: number): Promise<void> {
    await this.set('sub-delay', seconds)
  }

  async setAudioDelay(seconds: number): Promise<void> {
    await this.set('audio-delay', seconds)
  }

  /**
   * אקולייזר בעשר רצועות.
   *
   * superequalizer של ffmpeg מקבל 18 רצועות; אנחנו חושפים עשר
   * במרווחי אוקטבה — התקן המוכר מכל נגן — וממפים אליהן. ערכים
   * בדציבלים, מינוס עשרים עד פלוס עשרים.
   */
  async setEqualizer(gains: number[]): Promise<void> {
    const flat = gains.every((g) => Math.abs(g) < 0.5)
    if (flat) {
      await this.send(['af', 'remove', '@omni-eq']).catch(() => undefined)
      this.eq = gains
      this.emit('state', this.state)
      return
    }
    /*
     * superequalizer מצפה לערך יחסי סביב 1, לא לדציבלים. ההמרה היא
     * החזקה העשירית: 0dB → 1, +20dB → 10, ‎-20dB → 0.1.
     */
    const params = gains
      .slice(0, 10)
      .map((db, i) => `${i + 1}b=${Math.pow(10, db / 20).toFixed(3)}`)
      .join(':')
    await this.send(['af', 'add', `@omni-eq:superequalizer=${params}`])
    this.eq = gains
    this.emit('state', this.state)
  }

  /** יחס תצוגה. '-1' מחזיר לזה שבקובץ. */
  async setAspect(ratio: string): Promise<void> {
    await this.set('video-aspect-override', ratio)
    this.aspect = ratio
    this.emit('state', this.state)
  }

  async setVideoAdjustment(
    property: 'brightness' | 'contrast' | 'saturation' | 'gamma',
    value: number
  ): Promise<void> {
    const safe = Math.max(-100, Math.min(100, Number.isFinite(value) ? value : 0))
    await this.set(property, safe)
  }

  async setSharpen(value: number): Promise<void> {
    const safe = Math.max(0, Math.min(1.5, Number.isFinite(value) ? value : 0))
    await this.send(['vf', 'remove', '@omni-sharpen']).catch(() => undefined)
    if (safe > 0.01) {
      await this.send([
        'vf',
        'add',
        `@omni-sharpen:lavfi=[unsharp=luma_msize_x=5:luma_msize_y=5:luma_amount=${safe.toFixed(2)}]`
      ])
    }
    this.state.sharpen = safe
    this.emit('state', this.state)
  }

  async setDeband(enabled: boolean): Promise<void> {
    await this.set('deband', enabled)
    this.state.deband = enabled
    this.emit('state', this.state)
  }

  async setVideoFit(mode: 'fit' | 'fill' | 'zoom'): Promise<void> {
    if (mode === 'fit') {
      await this.set('panscan', 0)
      await this.set('video-zoom', 0)
    } else if (mode === 'fill') {
      await this.set('video-zoom', 0)
      await this.set('panscan', 1)
    } else {
      await this.set('panscan', 0)
      await this.set('video-zoom', 0.18)
    }
    this.state.videoFit = mode
    this.emit('state', this.state)
  }

  async resetVideo(): Promise<void> {
    await Promise.all([
      this.set('brightness', 0),
      this.set('contrast', 0),
      this.set('saturation', 0),
      this.set('gamma', 0),
      this.setAspect('-1'),
      this.setDeband(false),
      this.setVideoFit('fit')
    ])
    await this.setSharpen(0)
  }

  /** צילום פריים לקובץ שהמשתמש בוחר */
  async screenshotTo(file: string): Promise<void> {
    await this.send(['screenshot-to-file', file, 'video'])
  }

  /** מזיז ומשנה גודל של חלון הווידאו. זה מה שמדביק אותו לממשק. */
  async setBounds(b: { x: number; y: number; width: number; height: number }): Promise<void> {
    if (!this.sock) return
    await this.set('geometry', `${Math.round(b.width)}x${Math.round(b.height)}+${Math.round(b.x)}+${Math.round(b.y)}`)
  }

  private async refreshTracks(): Promise<void> {
    try {
      const raw = await this.get<Array<Record<string, unknown>>>('track-list')
      this.state.tracks = (raw ?? []).map((t) => ({
        id: Number(t.id),
        type: t.type as TrackInfo['type'],
        title: typeof t.title === 'string' ? t.title : undefined,
        lang: typeof t.lang === 'string' ? t.lang : undefined,
        selected: Boolean(t.selected),
        codec: typeof t.codec === 'string' ? t.codec : undefined,
        external: Boolean(t.external)
      }))
      this.emit('state', this.state)
    } catch {
      /* המנוע נסגר באמצע */
    }
  }

  async stop(): Promise<void> {
    this.closing = true
    for (const p of this.pending.values()) {
      clearTimeout(p.timer)
      p.reject(new Error(t('status.engineStopped')))
    }
    this.pending.clear()
    try {
      this.sock?.end()
    } catch {
      /* כבר סגור */
    }
    try {
      this.child?.kill()
    } catch {
      /* כבר מת */
    }
    this.child = null
    this.sock = null
  }
}
