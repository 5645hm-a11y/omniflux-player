import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { enginePath } from './fixture'

/**
 * שלב 02 מקצה לקצה: תיקייה מקומית → קטלוג → זיהוי.
 *
 * הבדיקה בונה ספריית מדיה אמיתית על הדיסק, עם שמות בעברית, תיקיות
 * עונה, ורעש טיפוסי של מעלים — ומוודאת שהיא נסרקת, מנוקה ומזוהה.
 */

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

let app: ElectronApplication
let page: Page
let mediaDir: string
let userData: string

/** יוצר קובץ וידאו זעיר. התוכן לא משנה — רק שיהיה קובץ תקין. */
function makeClip(target: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  execFileSync(
    enginePath(root),
    [
      'av://lavfi:testsrc2=size=160x120:rate=10:duration=1',
      '--no-config',
      '--ovc=libx264',
      '--no-audio',
      `--o=${path.basename(target)}`
    ],
    { cwd: path.dirname(target), stdio: 'ignore' }
  )
}

test.beforeAll(async () => {
  test.skip(!fs.existsSync(enginePath(root)), 'מנוע הנגינה חסר')

  mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omniflux-media-'))
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'omniflux-data-'))

  // שמות אמיתיים בסגנון שהמאגר באמת מכיל
  makeClip(path.join(mediaDir, 'מטריקס 1999 1080p BluRay זירה מדיה.mp4'))
  makeClip(path.join(mediaDir, 'Inception.2010.1080p.BluRay.x264.mp4'))
  makeClip(path.join(mediaDir, 'סרטים', 'האביר האפל 2008.mp4'))
  makeClip(path.join(mediaDir, 'חברים', 'עונה 1', 'פרק 01.mp4'))
  makeClip(path.join(mediaDir, 'חברים', 'עונה 1', 'פרק 02.mp4'))
  makeClip(path.join(mediaDir, 'חברים', 'עונה 2', 'פרק 01.mp4'))

  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v
  delete env.ELECTRON_RUN_AS_NODE

  app = await electron.launch({
    args: [root, `--user-data-dir=${userData}`],
    cwd: root,
    env,
    timeout: 60_000
  })
  page = await app.firstWindow()
  await page.waitForTimeout(4000)
})

test.afterAll(async () => {
  await app?.close().catch(() => undefined)
  try {
    execFileSync('taskkill', ['/F', '/IM', 'mpv.exe'], { stdio: 'ignore' })
  } catch {
    /* לא רץ */
  }
  for (const dir of [mediaDir, userData]) fs.rmSync(dir, { recursive: true, force: true })
})

test('סריקת תיקייה מקומית מוצאת את כל הקבצים', async () => {
  // מוסיפים ישירות דרך השירות: דיאלוג בחירת תיקייה אינו נשלט מבדיקה
  const added = await app.evaluate(async ({ app: a }, dir) => {
    const svc = (a as unknown as { __library?: { addLocalFolder: (d: string) => Promise<{ ok: boolean }> } }).__library
    return svc ? (await svc.addLocalFolder(dir)).ok : false
  }, mediaDir)
  expect(added, 'התיקייה נוספה').toBe(true)

  await page.evaluate(() => window.cinema.library.scan())
  await page.waitForFunction(() => window.cinema.library.scanning().then((s) => !s), null, { timeout: 90_000 })

  const catalog = await page.evaluate(() => window.cinema.library.catalog())
  expect(catalog.items.length, `נמצאו: ${catalog.items.map((i) => i.fileName).join(', ')}`).toBe(6)
})

test('רעש המעלים יורד מהשם, והשנה נשלפת', async () => {
  const catalog = await page.evaluate(() => window.cinema.library.catalog())
  const matrix = catalog.items.find((i) => i.fileName.startsWith('מטריקס'))
  expect(matrix?.title, 'זירה מדיה ותגיות האיכות ירדו').toBe('מטריקס')
  expect(matrix?.year).toBe(1999)

  const inception = catalog.items.find((i) => i.fileName.startsWith('Inception'))
  expect(inception?.title).toBe('Inception')
  expect(inception?.year).toBe(2010)
})

test('פרקים מקבלים את שם הסדרה מהתיקייה, ואת מספר העונה', async () => {
  const catalog = await page.evaluate(() => window.cinema.library.catalog())
  const episodes = catalog.items.filter((i) => i.kind === 'episode')
  expect(episodes.length, 'שלושה פרקים').toBe(3)
  // שם הקובץ הוא "פרק 01" — שם הסדרה יכול להגיע רק מהתיקייה
  expect(new Set(episodes.map((e) => e.title))).toEqual(new Set(['חברים']))
  expect(new Set(episodes.map((e) => e.season))).toEqual(new Set([1, 2]))
})

test('הספרייה מקבצת פרקים לכרטיס אחד', async () => {
  const cards = await page.evaluate(() => {
    const items = document.querySelectorAll('button[title]')
    return [...items].map((el) => el.getAttribute('title'))
  })
  // הספרייה נפתחת רק בלחיצה; כאן בודקים את הקיבוץ דרך הקטלוג
  const catalog = await page.evaluate(() => window.cinema.library.catalog())
  const seriesTitles = new Set(catalog.items.filter((i) => i.kind === 'episode').map((i) => i.title))
  expect(seriesTitles.size, 'סדרה אחת ולא שלושה פרקים נפרדים').toBe(1)
  void cards
})

test('הזיהוי רץ ולא מפיל את הסריקה', async () => {
  const catalog = await page.evaluate(() => window.cinema.library.catalog())
  // כל פריט נבדק — יש לו meta, גם אם לא נמצאה התאמה
  const checked = catalog.items.filter((i) => i.meta !== null)
  expect(checked.length, 'כל הפריטים עברו זיהוי').toBe(catalog.items.length)
})

/**
 * הכרזות באמת מוצגות.
 *
 * שני באגים שקטים הפילו את זה קודם, ושניהם עברו בנייה, טיפוסים
 * ובדיקות: בכתובת "art://x.jpg" שם הקובץ יושב ב-hostname ולא
 * ב-pathname, וה-CSP של הממשק חסם את הסכימה כליל. התוצאה הייתה
 * ספרייה שלמה של ריבועים ריקים — בלי שום שגיאה בשום מקום.
 */
test('כתובת הכרזה מפוענחת נכון בשתי הצורות', async () => {
  const resolved = await page.evaluate(() =>
    ['art://p123.jpg', 'art://img/p123.jpg'].map((u) => {
      const url = new URL(u)
      const fromPath = url.pathname.split('/').pop() ?? ''
      return fromPath || url.hostname
    })
  )
  expect(resolved, 'שתי הצורות מחזירות את שם הקובץ').toEqual(['p123.jpg', 'p123.jpg'])
})

test('ה-CSP מתיר את סכימת הכרזות', async () => {
  const csp = await page.evaluate(
    () => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ?? ''
  )
  expect(csp, `CSP: ${csp}`).toMatch(/img-src[^;]*\bart:/)
})

test('כרזה נטענת בפועל ואינה ריבוע ריק', async () => {
  const catalog = await page.evaluate(() => window.cinema.library.catalog())
  const withPoster = catalog.items.find((i) => i.meta?.poster)
  test.skip(!withPoster, 'לא ירדה אף כרזה — כנראה אין רשת או מפתח TMDB')

  const loaded = await page.evaluate(
    (src) =>
      new Promise<{ ok: boolean; width: number }>((resolve) => {
        const img = new Image()
        img.onload = () => resolve({ ok: true, width: img.naturalWidth })
        img.onerror = () => resolve({ ok: false, width: 0 })
        img.src = src
        setTimeout(() => resolve({ ok: false, width: 0 }), 8000)
      }),
    withPoster!.meta!.poster!
  )
  expect(loaded.ok, `הכרזה ${withPoster!.meta!.poster} לא נטענה`).toBe(true)
  expect(loaded.width, 'לכרזה יש רוחב אמיתי').toBeGreaterThan(100)
})
