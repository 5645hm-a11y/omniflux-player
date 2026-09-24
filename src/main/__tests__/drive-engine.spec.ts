import { expect, test } from '@playwright/test'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { BLOCK_BYTES, DriveEngine, DriveError, blocksFor, parseRange } from '../services/drive-engine'

/**
 * מנוע ההזרמה מדרייב, מול שרת Google מזויף.
 *
 * הבדיקות לא מאמתות מחרוזות בקוד אלא התנהגות: מה mpv מקבל, כמה
 * בקשות יוצאות לגוגל, ומה קורה כשגוגל מסרב. השרת המזויף מממש את
 * שני הנתיבים ש-Drive v3 חושף — מטא-דאטה ו-alt=media עם Range — ואת
 * תשובות השגיאה שלו בפורמט האמיתי.
 */

const SIZE = BLOCK_BYTES * 2 + 512 * 1024 + 17 // שלושה בלוקים, האחרון חלקי
const FILE_ID = 'video-file-id'
const SOURCE = `https://www.googleapis.com/drive/v3/files/${FILE_ID}?alt=media&key=stale-key`

/** תוכן דטרמיניסטי: אפשר לאמת כל בייט בלי לשמור עותק */
const CONTENT = Buffer.alloc(SIZE)
for (let i = 0; i < SIZE; i++) CONTENT[i] = (i * 31 + 7) & 0xff

interface FakeGoogle {
  base: string
  dataRequests: number
  close: () => Promise<void>
  /** טווח מקסימלי לפני downloadQuotaExceeded; Infinity = בלי מגבלה */
  maxRange: number
  /** כמה בקשות נתונים ראשונות יקבלו 429 */
  rateLimited: number
  requireAuth: boolean
  missing: boolean
  /** דף ה-"Sorry..." של גוגל מול תעבורה אוטומטית — HTML ולא JSON */
  sorryPage: boolean
  /** הזרמה איטית: גודל חלק והשהיה בין חלקים. Infinity = הכול בבת אחת */
  chunkBytes: number
  chunkDelayMs: number
}

function driveError(res: http.ServerResponse, status: number, reason: string, retryAfter?: number): void {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (retryAfter !== undefined) headers['Retry-After'] = String(retryAfter)
  res.writeHead(status, headers)
  res.end(JSON.stringify({ error: { code: status, errors: [{ reason, message: reason }] } }))
}

async function fakeGoogle(): Promise<FakeGoogle> {
  const state = {
    dataRequests: 0,
    maxRange: Infinity,
    rateLimited: 0,
    requireAuth: false,
    missing: false,
    sorryPage: false,
    chunkBytes: Infinity,
    chunkDelayMs: 0
  }
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x')
    const match = /^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname)
    if (!match) return driveError(res, 404, 'notFound')
    const authed = (req.headers.authorization ?? '').startsWith('Bearer ')
    if (state.missing || match[1] !== FILE_ID) return driveError(res, 404, 'notFound')
    if (state.requireAuth && !authed) return driveError(res, 404, 'notFound')

    if (url.searchParams.get('alt') !== 'media') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ id: FILE_ID, size: String(SIZE), mimeType: 'video/mp4', md5Checksum: 'abc123' }))
      return
    }

    state.dataRequests++
    if (state.sorryPage) {
      // הצורה האמיתית, כפי שנצפתה: 403, HTML, כותרת "Sorry..."
      res.writeHead(403, { 'Content-Type': 'text/html; charset=UTF-8' })
      res.end('<html><head><title>Sorry...</title></head><body>automated queries</body></html>')
      return
    }
    if (state.rateLimited > 0) {
      state.rateLimited--
      return driveError(res, 429, 'userRateLimitExceeded', 0)
    }
    const range = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range ?? '')
    if (!range) return driveError(res, 400, 'badRequest')
    const start = Number(range[1])
    const end = Math.min(Number(range[2]), SIZE - 1)
    if (end - start + 1 > state.maxRange) return driveError(res, 403, 'downloadQuotaExceeded')
    res.writeHead(206, {
      'Content-Type': 'video/mp4',
      'Content-Range': `bytes ${start}-${end}/${SIZE}`,
      'Content-Length': String(end - start + 1)
    })
    if (!Number.isFinite(state.chunkBytes)) {
      res.end(CONTENT.subarray(start, end + 1))
      return
    }
    // גוגל אמיתי שולח את הטווח בחלקים לאורך זמן, וזה מה שמאפשר
    // להתחיל לנגן לפני שהבלוק כולו הגיע
    void (async () => {
      for (let at = start; at <= end; at += state.chunkBytes) {
        if (res.destroyed) return
        res.write(CONTENT.subarray(at, Math.min(end + 1, at + state.chunkBytes)))
        await new Promise((resolve) => setTimeout(resolve, state.chunkDelayMs))
      }
      res.end()
    })()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  return Object.assign(state, {
    base: `http://127.0.0.1:${port}/drive/v3`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  }) as FakeGoogle
}

function engineFor(google: FakeGoogle, opts: { token?: string | null; limit?: number } = {}): {
  engine: DriveEngine
  cacheDir: string
} {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-drive-cache-'))
  const engine = new DriveEngine({
    fetch: (url, init) => fetch(url, init),
    token: async () => opts.token ?? null,
    apiKey: 'public-key',
    cacheDir,
    cacheLimitBytes: opts.limit,
    apiBase: google.base,
    sleep: async () => undefined
  })
  return { engine, cacheDir }
}

async function read(url: string, range?: string): Promise<{ status: number; body: Buffer; headers: Headers }> {
  const response = await fetch(url, { headers: range ? { Range: range } : {} })
  return { status: response.status, body: Buffer.from(await response.arrayBuffer()), headers: response.headers }
}

let google: FakeGoogle
test.beforeEach(async () => {
  google = await fakeGoogle()
})
test.afterEach(async () => {
  await google.close()
})

// ---------- חשבון Google אינו תנאי ----------

test('ניגון עובד בלי חשבון Google מחובר — מפתח ה-API מספיק לתיקייה משותפת', async () => {
  const { engine } = engineFor(google, { token: null })
  const url = await engine.open(SOURCE)
  const { status, body } = await read(url)
  expect(status).toBe(200)
  expect(body.length).toBe(SIZE)
  expect(body.equals(CONTENT), 'כל בייט זהה למקור').toBe(true)
  await engine.drain()
  engine.close()
})

// ---------- דיוק ----------

test('כל טווח מוגש בדיוק, כולל חציית גבולות בלוקים', async () => {
  const { engine } = engineFor(google)
  const url = await engine.open(SOURCE)
  const cases: Array<[string, number, number]> = [
    ['bytes=0-0', 0, 0],
    [`bytes=${BLOCK_BYTES - 5}-${BLOCK_BYTES + 5}`, BLOCK_BYTES - 5, BLOCK_BYTES + 5],
    [`bytes=${BLOCK_BYTES * 2 + 3}-`, BLOCK_BYTES * 2 + 3, SIZE - 1],
    ['bytes=-100', SIZE - 100, SIZE - 1],
    [`bytes=${SIZE - 1}-${SIZE + 500}`, SIZE - 1, SIZE - 1]
  ]
  for (const [header, start, end] of cases) {
    const { status, body, headers } = await read(url, header)
    expect(status, header).toBe(206)
    expect(headers.get('content-range'), header).toBe(`bytes ${start}-${end}/${SIZE}`)
    expect(body.equals(CONTENT.subarray(start, end + 1)), header).toBe(true)
  }
  await engine.drain()
  engine.close()
})

test('טווח שמחוץ לקובץ מקבל 416, ו-HEAD אינו מוריד דבר', async () => {
  const { engine } = engineFor(google)
  const url = await engine.open(SOURCE)
  // ‏open חוזר כשהבייטים הראשונים הגיעו, ובלוקים ממשיכים לרדת ברקע;
  // ממתינים לכולם, אחרת הם נספרים כאן
  await engine.drain()
  const before = engine.stats.dataRequests

  const beyond = await read(url, `bytes=${SIZE + 10}-`)
  expect(beyond.status).toBe(416)
  expect(beyond.headers.get('content-range')).toBe(`bytes */${SIZE}`)

  const head = await fetch(url, { method: 'HEAD' })
  expect(head.status).toBe(200)
  expect(head.headers.get('content-length')).toBe(String(SIZE))
  expect(head.headers.get('accept-ranges')).toBe('bytes')
  expect(engine.stats.dataRequests, 'HEAD ו-416 לא יצאו לגוגל').toBe(before)
  await engine.drain()
  engine.close()
})

// ---------- חיסכון בבקשות ----------

test('סרט שלם יורד בבקשה אחת לכל בלוק — לא בעשרות אלפי בקשות', async () => {
  const { engine } = engineFor(google)
  const url = await engine.open(SOURCE)
  const { body } = await read(url)
  expect(body.equals(CONTENT)).toBe(true)

  const blocks = Math.ceil(SIZE / BLOCK_BYTES)
  expect(google.dataRequests, `צפוי ${blocks}`).toBe(blocks)
  /*
   * לשם השוואה: הגרסה הקודמת ביקשה 64 קילובייט בכל פעם. על בלוק מלא
   * זה פי 128; על הקובץ הקטן הזה, שהבלוק האחרון שלו חלקי, היחס נמוך
   * יותר — ולכן הסף כאן 80 ולא 128.
   */
  const previous = Math.ceil(SIZE / (64 * 1024))
  expect(previous / google.dataRequests).toBeGreaterThan(80)
  await engine.drain()
  engine.close()
})

test('צפייה חוזרת ודילוג אחורה מוגשים מהמטמון, בלי בקשה לגוגל', async () => {
  const { engine } = engineFor(google)
  const url = await engine.open(SOURCE)
  await read(url)
  const afterFirst = google.dataRequests

  const again = await read(url)
  const back = await read(url, `bytes=${BLOCK_BYTES}-${BLOCK_BYTES + 1000}`)
  expect(again.body.equals(CONTENT)).toBe(true)
  expect(back.body.equals(CONTENT.subarray(BLOCK_BYTES, BLOCK_BYTES + 1001))).toBe(true)
  expect(google.dataRequests, 'אף בקשה חדשה').toBe(afterFirst)
  await engine.drain()
  engine.close()
})

test('המטמון שורד בין הפעלות: מנוע חדש על אותה תיקייה אינו מוריד שוב', async () => {
  const first = engineFor(google)
  await read(await first.engine.open(SOURCE))
  await first.engine.drain()
  first.engine.close()
  const downloaded = google.dataRequests

  const second = new DriveEngine({
    fetch: (url, init) => fetch(url, init),
    token: async () => null,
    apiKey: 'public-key',
    cacheDir: first.cacheDir,
    apiBase: google.base,
    sleep: async () => undefined
  })
  const { body } = await read(await second.open(SOURCE))
  expect(body.equals(CONTENT)).toBe(true)
  expect(google.dataRequests, 'רק בקשת המטא-דאטה, לא נתונים').toBe(downloaded)
  await second.drain()
  second.close()
})

test('שתי בקשות במקביל לאותו בלוק חולקות הורדה אחת', async () => {
  const { engine } = engineFor(google)
  // בלי open: לא לחמם את המטמון, כדי שהבלוק באמת יירד כאן
  const meta = await engine.metadata(FILE_ID)
  const [a, b, c] = await Promise.all([engine.block(meta, 1), engine.block(meta, 1), engine.block(meta, 1)])
  expect(a.equals(b) && b.equals(c)).toBe(true)
  expect(google.dataRequests).toBe(1)
  await engine.drain()
  engine.close()
})

// ---------- זמן עד הפריים הראשון ----------

/**
 * הפריים הראשון אינו מחכה לבלוק שלם.
 *
 * ‏mpv צריך כמה עשרות קילובייט כדי להתחיל, ובלוק הוא 8 מגה. כשהמנוע
 * המתין לבלוק מלא, קובץ אמיתי לקח 6.4 שניות עד הפריים הראשון — הזמן
 * שלוקח לבלוק כולו לרדת. הבדיקה מזרימה את הבלוק לאורך זמן (כמו גוגל
 * אמיתי) ומודדת מתי הגיע הבייט הראשון לעומת מתי הסתיים הבלוק.
 */
test('הבייטים הראשונים מגיעים לנגן הרבה לפני שהבלוק כולו ירד', async () => {
  google.chunkBytes = 256 * 1024
  google.chunkDelayMs = 8 // בלוק שלם: 32 חלקים, כרבע שנייה
  const { engine } = engineFor(google)

  const started = Date.now()
  const url = await engine.open(SOURCE)
  const opened = Date.now() - started

  const response = await fetch(url, { headers: { Range: `bytes=0-${BLOCK_BYTES - 1}` } })
  const reader = response.body!.getReader()
  const { value: first } = await reader.read()
  const toFirstByte = Date.now() - started
  let received = first!.length
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.length
  }
  const toWholeBlock = Date.now() - started

  expect(received, 'הבלוק כולו הגיע בסוף').toBe(BLOCK_BYTES)
  // שלושת הבלוקים של הקובץ: הראשון, האחרון, והקריאה קדימה — בקשה לכל אחד
  expect(google.dataRequests, 'עדיין בקשה אחת לכל בלוק').toBeLessThanOrEqual(3)
  expect(toFirstByte * 3, `בייט ראשון ב-${toFirstByte}ms מול בלוק ב-${toWholeBlock}ms`).toBeLessThan(toWholeBlock)
  expect(opened * 3, `הפתיחה חזרה ב-${opened}ms`).toBeLessThan(toWholeBlock)
  await engine.drain()
  engine.close()
})

// ---------- כשגוגל מסרב ----------

test('קובץ שגוגל מגביל לטווחים קטנים עדיין מתנגן, דרך טווחי משנה', async () => {
  google.maxRange = 1024 * 1024
  const { engine } = engineFor(google)
  const url = await engine.open(SOURCE)
  const { body } = await read(url, `bytes=${BLOCK_BYTES - 10}-${BLOCK_BYTES + 10}`)
  expect(body.equals(CONTENT.subarray(BLOCK_BYTES - 10, BLOCK_BYTES + 11))).toBe(true)
  await engine.drain()
  engine.close()
})

test('מגבלת קצב (429) מנוסה שוב ומצליחה', async () => {
  google.rateLimited = 2
  const { engine } = engineFor(google)
  const url = await engine.open(SOURCE)
  const { body } = await read(url, 'bytes=0-99')
  expect(body.equals(CONTENT.subarray(0, 100))).toBe(true)
  expect(engine.stats.retries).toBeGreaterThanOrEqual(2)
  await engine.drain()
  engine.close()
})

test('קובץ פרטי בלי חשבון מסווג כ"צריך חשבון", ולא כ"לא קיים"', async () => {
  google.requireAuth = true
  const anonymous = engineFor(google, { token: null })
  const error = await anonymous.engine.open(SOURCE).catch((e: unknown) => e)
  expect(error).toBeInstanceOf(DriveError)
  expect((error as DriveError).kind).toBe('auth')
  expect(anonymous.engine.stats.retries, 'שגיאה קבועה אינה מנוסה שוב').toBe(0)

  // עם חשבון מחובר אותו קובץ נפתח
  const signedIn = engineFor(google, { token: 'user-token' })
  const { body } = await read(await signedIn.engine.open(SOURCE), 'bytes=0-9')
  expect(body.equals(CONTENT.subarray(0, 10))).toBe(true)
  await anonymous.engine.drain()
  anonymous.engine.close()
  await signedIn.engine.drain()
  signedIn.engine.close()
})

/*
 * דף ה-"Sorry..." של גוגל אינו "אין הרשאה".
 *
 * נצפה בפועל אחרי פרץ של בקשות מקבילות. קודם הוא סווג כחסימת גישה,
 * והמשתמש קיבל עצה לחבר חשבון לבעיה זמנית. וגם אסור לנסות שוב: עוד
 * בקשות נראות אוטומטיות עוד יותר, ומאריכות את החסימה.
 */
test('דף ההגנה של גוגל מסווג כחסימה זמנית, ואינו מנוסה שוב', async () => {
  google.sorryPage = true
  const { engine } = engineFor(google)
  const error = await engine.open(SOURCE).catch((e: unknown) => e)
  expect(error).toBeInstanceOf(DriveError)
  expect((error as DriveError).kind).toBe('blocked')
  expect(engine.stats.retries, 'אין ניסיון חוזר מול הגנה מפני אוטומציה').toBe(0)
  // ניסיון אחד לכל בלוק פתיחה — הראשון והאחרון — ולא יותר
  expect(google.dataRequests).toBeLessThanOrEqual(2)
  await engine.drain()
  engine.close()
})

test('קובץ שנמחק מסווג כ"לא קיים" כשיש חשבון מחובר', async () => {
  google.missing = true
  const { engine } = engineFor(google, { token: 'user-token' })
  const error = await engine.open(SOURCE).catch((e: unknown) => e)
  expect((error as DriveError).kind).toBe('notFound')
  await engine.drain()
  engine.close()
})

// ---------- המטמון אינו גדל בלי סוף ----------

test('הפינוי שומר את המטמון מתחת לתקרה', async () => {
  const limit = BLOCK_BYTES + 1024 * 1024
  const { engine } = engineFor(google, { limit })
  await read(await engine.open(SOURCE))
  await engine.evict(true)
  const { bytes } = await engine.cacheInfo()
  expect(bytes).toBeLessThanOrEqual(limit)
  await engine.drain()
  engine.close()
})

test('ניקוי המטמון מפנה הכול', async () => {
  const { engine } = engineFor(google)
  await read(await engine.open(SOURCE))
  // הבייט האחרון נשלח לנגן לפני שהבלוק נכתב לדיסק — ולכן ממתינים לכתיבה
  await engine.drain()
  expect((await engine.cacheInfo()).bytes).toBeGreaterThan(0)
  await engine.clearCache()
  expect((await engine.cacheInfo()).bytes).toBe(0)
  await engine.drain()
  engine.close()
})

// ---------- חשבון הבלוקים ----------

test('חישוב בלוקים וטווחים', () => {
  expect(blocksFor(0, 0)).toEqual([0])
  expect(blocksFor(BLOCK_BYTES - 1, BLOCK_BYTES)).toEqual([0, 1])
  expect(parseRange(undefined, 100)).toBe('none')
  expect(parseRange('bytes=10-', 100)).toEqual({ start: 10, end: 99 })
  expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 })
  expect(parseRange('bytes=100-', 100)).toBeNull()
  expect(parseRange('bytes=50-10', 100)).toBeNull()
  expect(parseRange('items=0-1', 100)).toBeNull()
})
