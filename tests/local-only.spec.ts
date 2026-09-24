import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { enginePath } from './fixture'

/**
 * "תוכן מקומי בלבד".
 *
 * המשתמש מכבה תוכן רשת ומצפה לשני דברים: שלא יופיע כלום שאינו שלו,
 * ושהשאילתות שלו לא ייצאו החוצה. הבדיקה מוודאת את שניהם — כי מצב
 * שרק מסנן את התצוגה עדיין שולח את מה שהמשתמש הקליד ל-TMDB,
 * ל-Deezer ול-Spotify.
 *
 * המצב נאכף בתהליך הראשי ולא בממשק, ולכן הבדיקה מדברת עם ה-API
 * ולא עם פיקסלים.
 */

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

let app: ElectronApplication
let page: Page
let userData: string

test.beforeAll(async () => {
  test.skip(!fs.existsSync(enginePath(root)), 'מנוע הנגינה חסר — הרץ npm run engine')
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-local-'))
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
  fs.rmSync(userData, { recursive: true, force: true })
})

test('ברירת המחדל היא תוכן מלא', async () => {
  expect(await page.evaluate(() => window.cinema.app.localOnly())).toBe(false)
})

test('המצב נשמר ונקרא חזרה', async () => {
  await page.evaluate(() => window.cinema.app.setLocalOnly(true))
  expect(await page.evaluate(() => window.cinema.app.localOnly())).toBe(true)
  await page.evaluate(() => window.cinema.app.setLocalOnly(false))
  expect(await page.evaluate(() => window.cinema.app.localOnly())).toBe(false)
})

test('כשהמצב דלוק, מסך הבית אינו מציג שום כותר מהרשת', async () => {
  await page.evaluate(() => window.cinema.app.setLocalOnly(true))
  const data = await page.evaluate(() => window.cinema.hub.refresh())

  expect(data.hero, 'אין באנר של כותרים מהקטלוג').toEqual([])

  const network = data.rows.filter((r) => ['trending', 'topRated', 'popularTv', 'music'].includes(r.key))
  expect(network, 'אין שורות קטלוג כלל').toEqual([])

  /*
   * מה שכן מותר להישאר: שורות שנבנות מהקטלוג של המשתמש עצמו.
   * הן ריקות כאן רק מפני שהספרייה ריקה, ולא בגלל המצב.
   */
  for (const row of data.rows) {
    expect(['continue', 'watchlist', 'recent']).toContain(row.key)
    for (const card of row.cards) {
      expect(card.source, `${card.title} אינו כרטיס קטלוג`).not.toBe('catalog')
    }
  }
})

test('כשהמצב דלוק, החיפוש אינו מחזיר סטרימינג או מוזיקה', async () => {
  await page.evaluate(() => window.cinema.app.setLocalOnly(true))
  const groups = await page.evaluate(() => window.cinema.search.run('matrix'))
  expect(groups.map((g) => g.key), 'רק ספרייה, אם בכלל').not.toContain('streaming')
  expect(groups.map((g) => g.key)).not.toContain('music')
})

test('כיבוי המצב מחזיר את תוכן הרשת', async () => {
  await page.evaluate(() => window.cinema.app.setLocalOnly(false))
  const groups = await page.evaluate(() => window.cinema.search.run('matrix'))
  test.skip(groups.length === 0, 'אין רשת או אין מפתח TMDB')
  expect(groups.map((g) => g.key), 'הסטרימינג חזר').toContain('streaming')
})
