import type { Http, Kv } from '../ports'

/*
 * HTTP, המפתח והאחסון — כולם מוזרקים. האחסון הוא מפתח-ערך פשוט,
 * ולכן במחשב זה קובץ JSON ובמובייל אחסון מקומי, בלי לגעת כאן.
 */
let http: Http = () => Promise.reject(new Error('לא הוזרק HTTP. יש לקרוא ל-configure תחילה.'))
let groqKey = ''
let storage: Kv<Cache> | null = null
export function configure(deps: { http: Http; groqKey: string; store: Kv<Cache> }): void {
  http = deps.http
  groqKey = deps.groqKey
  storage = deps.store
}
const netFetch: Http = (url, init) => http(url, init)
const APP_CONFIG = {
  get groqKey(): string {
    return groqKey
  }
}

/**
 * מודל שפה בשירות הזיהוי, כחלק מהסריקה עצמה.
 *
 * הביטויים שחוזרים במאגר מטופלים ב-titleParser, שהוא מהיר, חינמי
 * ועובד בלי רשת. אבל כל מעלה ממציא צורה חדשה, ולרשימה קבועה אין
 * סיכוי להדביק. המודל מקבל שם קובץ ומחזיר שלושה דברים:
 *
 *   title — הכותר שקבור בשם הקובץ, בלי הרעש ובלי שגיאות כתיב
 *   en    — הכותר בשפת המקור, אם הוא מכיר אותו
 *   year  — שנת ההפקה, אם היא ידועה לו
 *
 * `en` הוא המפתח: חיפוש ב-TMDB לפי כותר לועזי מדויק כמעט תמיד קולע,
 * בעוד שכותר עברי קצר מתאים במקרה לסרט אחר לגמרי. `year` משמש לאימות.
 *
 * מה נשלח: שם הקובץ בלבד. לא מי המשתמש, לא איזו תיקייה, ולא מה הוא
 * צופה. התשובות נשמרות, ולכן כל שם נשלח פעם אחת בלבד.
 */

const URL_CHAT = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'llama-3.3-70b-versatile'
const CLEAN_BATCH = 15

/**
 * המכסה החינמית של Groq למודל הזה היא 12,000 אסימונים לדקה, ומעליה
 * גם 100,000 ליממה. חריגה מחזירה 429, ולכן מודדים לבד ומחכים במקום
 * להיכשל — ואת המכסה היומית אי אפשר להמתין לה בתוך סריקה, אז
 * מפסיקים לשאול עד שהיא מתחדשת.
 */
const TOKENS_PER_MINUTE = 10_000

/** ביטויים שאותרו במאגר. המודל מקבל אותם כדי שלא יטעה בהם לשם סרט. */
const KNOWN_JUNK = [
  'לולו סרטים',
  'יהודה מנוחה פוקס',
  'אוצר סיפורי ל באנימציה',
  'סרט חרדי',
  'גל פז',
  'סרט דתי',
  'וסדרות בדרייב',
  'סיפורי צדיקים',
  'וסדרות',
  'סרט לנשים',
  'לבנות בלבד',
  'זירה מדיה',
  'נתי מדיה',
  'דב סרטים',
  'חננאל סרטים',
  'שבי גוזלן',
  'אייל',
  'מני',
  'שימי'
]

const SYSTEM_CLEAN = `אתה מזהה כותרי סרטים וסדרות משמות של קובצי וידאו, בעברית ובאנגלית.

בשם הקובץ יש רעש: שם המעלה, ערוץ הפצה, מפיץ, שמות שחקנים, תגיות
איכות וקודק, שנה, סיומת, מספר עונה ופרק, ותגיות קהל. כל אלה אינם
חלק מהכותר. הביטויים הבאים הם תמיד רעש:
${KNOWN_JUNK.join(' | ')}

לכל שם החזר:
- title: הכותר בלי הרעש, כולל תיקון שגיאות כתיב. באותה שפה שבקובץ.
  שמור מספר סידורי שהוא חלק מהשם ("הארי פוטר 7", "רוקי 3").
  אין בשם שום כותר (שם אוטומטי של טלגרם, מספרים בלבד) — החזר "".
- en: הכותר בשפת המקור או באנגלית, רק אם אתה מכיר אותו בוודאות.
  הפקה ישראלית או חרדית שאין לה שם לועזי — null. אל תתרגם בעצמך.
- year: שנת ההפקה אם ידועה לך או מופיעה בשם, אחרת null.

אל תמציא סרט שאינו קיים. אינך מכיר את הכותר — נקה בלבד, en יהיה null.
החזר JSON בלבד: {"results":[{"i":0,"title":"","en":null,"year":null}]}`

/** מה שהמודל החזיר על שם קובץ אחד */
export interface AiTitle {
  /** הכותר הנקי, או "" כשאין בשם שום כותר */
  title: string
  /** הכותר בשפת המקור, כשהמודל מכיר אותו */
  en: string | null
  year: number | null
}

const NOTHING: AiTitle = { title: '', en: null, year: null }

interface Cache {
  /** שם גולמי → מה שהמודל החזיר. גם תשובה ריקה נשמרת, כדי לא לשאול שוב. */
  titles: Record<string, AiTitle>
}

/**
 * המטמון. אם לא הוזרק אחסון, המודול עדיין עובד — הוא פשוט שוכח בין
 * הרצות. עדיף מלהתפוצץ.
 */
const fallback: Cache = { titles: {} }
function db(): { data: Cache; set: (next: Cache) => void } {
  if (!storage) {
    return {
      data: fallback,
      set: (next) => Object.assign(fallback, next)
    }
  }
  return { data: storage.read(), set: (next) => storage!.write(next) }
}

export function aiEnabled(): boolean {
  return Boolean(APP_CONFIG.groqKey)
}

// ---------- מכסת אסימונים ----------

/**
 * חלון מתגלגל של דקה. לפני כל בקשה מעריכים כמה תעלה, ומחכים עד
 * שהחלון מתפנה. אחרי התשובה רושמים את הצריכה האמיתית.
 */
const spent: Array<{ at: number; n: number }> = []

function inWindow(now: number): number {
  while (spent.length > 0 && now - spent[0].at > 60_000) spent.shift()
  return spent.reduce((sum, e) => sum + e.n, 0)
}

async function reserve(estimate: number): Promise<void> {
  for (;;) {
    const now = Date.now()
    if (inWindow(now) + estimate <= TOKENS_PER_MINUTE) return
    const oldest = spent[0]
    if (!oldest) return
    await new Promise((r) => setTimeout(r, Math.max(250, 60_000 - (now - oldest.at))))
  }
}

function record(n: number): void {
  spent.push({ at: Date.now(), n })
}

/**
 * המכסה היומית.
 *
 * להמתין לה בתוך סריקה אין טעם — היא מתחדשת בעוד שעות. עד אז פשוט
 * לא שואלים, וכל כותר שנשאר בלי זיהוי ינוסה שוב בסריקה הבאה.
 */
let quotaUntil = 0

export function aiQuotaExhausted(): boolean {
  return Date.now() < quotaUntil
}

/** "Please try again in 16m12s" → כמה זמן באמת לחכות */
function parseRetry(body: string): number {
  const m = body.match(/try again in\s+(?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i)
  if (!m) return 3600_000
  const hours = Number(m[1] ?? 0)
  const minutes = Number(m[2] ?? 0)
  const seconds = Number(m[3] ?? 0)
  const ms = (hours * 3600 + minutes * 60 + seconds) * 1000
  return ms > 0 ? ms : 3600_000
}

// ---------- הקריאה עצמה ----------

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>
  usage?: { total_tokens?: number }
}

/** הערכה גסה: אסימון לכל שלושה תווים, ועוד מקום לתשובה */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3) + 400
}

async function ask(system: string, user: string): Promise<string | null> {
  if (aiQuotaExhausted()) return null
  const estimate = estimateTokens(system + user)
  await reserve(estimate)

  let res: Response
  try {
    res = await netFetch(URL_CHAT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${APP_CONFIG.groqKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ]
      }),
      signal: AbortSignal.timeout(45_000)
    })
  } catch {
    record(estimate)
    return null
  }
  if (!res.ok) {
    // 429 למרות המדידה — סופרים את המכסה כמלאה וממשיכים בבקשה הבאה
    record(res.status === 429 ? TOKENS_PER_MINUTE : estimate)
    if (res.status === 429) {
      const body = await res.text().catch(() => '')
      // מכסה יומית — אין מה להמתין לה בתוך סריקה
      if (/per day|TPD|RPD/i.test(body)) quotaUntil = Date.now() + parseRetry(body)
    }
    return null
  }

  const json = (await res.json().catch(() => null)) as ChatResponse | null
  record(json?.usage?.total_tokens ?? estimate)
  return json?.choices?.[0]?.message?.content ?? null
}

function parseJson<T>(content: string | null): T | null {
  if (!content) return null
  try {
    return JSON.parse(content) as T
  } catch {
    return null
  }
}

// ---------- זיהוי ----------

interface RawAnswer {
  i: number
  title?: string
  en?: string | null
  year?: number | string | null
}

function toYear(v: RawAnswer['year']): number | null {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && n >= 1900 && n <= 2100 ? n : null
}

/** null = הבקשה נכשלה. מפה ריקה = המודל ענה ולא היה מה לנקות. */
async function askBatch(names: string[]): Promise<Map<string, AiTitle> | null> {
  const out = new Map<string, AiTitle>()
  const payload = JSON.stringify(names.map((name, i) => ({ i, name })))
  const parsed = parseJson<{ results?: RawAnswer[] }>(await ask(SYSTEM_CLEAN, payload))
  if (!parsed) return null

  for (const r of parsed.results ?? []) {
    const original = names[r.i]
    if (!original) continue
    const title = (r.title ?? '').trim()
    // כותר ארוך מהשם הגולמי אינו ניקוי אלא המצאה
    if (title.length > original.length) continue
    const en = typeof r.en === 'string' && r.en.trim() ? r.en.trim() : null
    out.set(original, { title, en, year: toYear(r.year) })
  }
  return out
}

export interface CleanStream {
  /** מה שהמודל אמר על השם. נפתר כשהקבוצה שלו חוזרת. */
  get: (name: string) => Promise<AiTitle>
  /** נפתר כשכל הקבוצות הסתיימו */
  done: Promise<void>
}

/**
 * מתחיל לנקות ומחזיר מיד.
 *
 * הסריקה לא עוצרת ומחכה: כל שם מקבל הבטחה משלו, והעובד שנתקע על
 * כותר מסוים ממתין רק לקבוצה שלו. הקבוצות נשלחות באותו סדר שבו
 * העובדים מתקדמים, ולכן התשובה כמעט תמיד כבר שם.
 */
export function startCleaning(names: string[]): CleanStream {
  const resolvers = new Map<string, (v: AiTitle) => void>()
  const promises = new Map<string, Promise<AiTitle>>()

  const unique: string[] = []
  for (const n of names) {
    if (!n || promises.has(n)) continue
    unique.push(n)
    promises.set(
      n,
      new Promise<AiTitle>((resolve) => resolvers.set(n, resolve))
    )
  }

  const settle = (name: string, value: AiTitle): void => {
    const r = resolvers.get(name)
    if (!r) return
    resolvers.delete(name)
    r(value)
  }

  const run = async (): Promise<void> => {
    if (!aiEnabled()) return
    const cached = db().data.titles
    const toAsk: string[] = []
    for (const n of unique) {
      const hit = cached[n]
      if (hit === undefined) toAsk.push(n)
      else settle(n, hit)
    }

    for (let i = 0; i < toAsk.length; i += CLEAN_BATCH) {
      const slice = toAsk.slice(i, i + CLEAN_BATCH)
      // המכסה נגמרה באמצע — משחררים את השאר בלי לשאול ובלי לשמור
      const answers = aiQuotaExhausted() ? null : await askBatch(slice)
      if (!answers) {
        // אין רשת או שהשירות נפל. לא שומרים "אין תשובה" — אחרת
        // תקלה רגעית אחת הייתה מנשלת חמישה-עשר שמות לתמיד.
        for (const name of slice) settle(name, NOTHING)
        continue
      }
      const learned: Record<string, AiTitle> = {}
      for (const name of slice) {
        // גם "אין מה לנקות" נשמר, כדי שלא נשאל על אותו שם שוב ושוב
        const answer = answers.get(name) ?? NOTHING
        learned[name] = answer
        settle(name, answer)
      }
      db().set({ titles: { ...db().data.titles, ...learned } })
    }
  }

  // מה שלא נענה חייב להיפתר בכל מקרה, אחרת עובד הסריקה ימתין לנצח
  const done = run()
    .catch(() => undefined)
    .finally(() => {
      for (const name of [...resolvers.keys()]) settle(name, NOTHING)
    })

  return {
    get: (name) => promises.get(name) ?? Promise.resolve(NOTHING),
    done
  }
}

/** סריקה עמוקה שואלת הכול מחדש */
export function forgetAiTitles(): void {
  db().set({ titles: {} })
}
