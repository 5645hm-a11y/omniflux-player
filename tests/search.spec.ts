import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { enginePath } from './fixture'

/**
 * שלב 04: חיפוש מאוחד.
 *
 * הבדיקות רצות מול הרשת האמיתית, כי זו כל הנקודה — חיפוש שמחזיר
 * נתונים מדומים אינו מוכיח דבר. מה שתלוי ברשת נבדק בסובלנות: אם
 * שירות חיצוני נפל, הבדיקה מדלגת ולא מאדימה את הבנייה.
 */

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

let app: ElectronApplication
let page: Page
let mediaDir: string
let userData: string

function makeClip(target: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  execFileSync(
    enginePath(root),
    ['av://lavfi:testsrc2=size=160x120:rate=10:duration=1', '--no-config', '--ovc=libx264', '--no-audio',
     `--o=${path.basename(target)}`],
    { cwd: path.dirname(target), stdio: 'ignore' }
  )
}

test.beforeAll(async () => {
  test.skip(!fs.existsSync(enginePath(root)), 'מנוע הנגינה חסר')
  mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omniflux-s-'))
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'omniflux-sd-'))
  makeClip(path.join(mediaDir, 'מטריקס 1999 1080p BluRay.mp4'))

  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v
  delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({ args: [root, `--user-data-dir=${userData}`], cwd: root, env, timeout: 60_000 })
  page = await app.firstWindow()
  await page.waitForTimeout(3500)

  await app.evaluate(async ({ app: a }, dir) => {
    const svc = (a as unknown as { __library: { addLocalFolder: (d: string) => Promise<unknown> } }).__library
    await svc.addLocalFolder(dir)
  }, mediaDir)
  await page.evaluate(() => window.cinema.library.scan())
  await page.waitForFunction(() => window.cinema.library.scanning().then((s) => !s), null, { timeout: 120_000 })
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

test('הספרייה מופיעה ראשונה, ואפשר לנגן ממנה', async () => {
  const groups = await page.evaluate(() => window.cinema.search.run('מטריקס'))
  expect(groups.length, 'התקבלו קבוצות').toBeGreaterThan(0)
  expect(groups[0]!.key, 'מה שאצלנו קודם').toBe('library')

  const mine = groups[0]!.results[0]!
  expect(mine.playable, 'קובץ שיש לנו הוא לחיצה').toBe(true)
  expect(mine.itemId, 'יש מזהה לנגינה').toBeTruthy()
})

test('שאילתה קצרה מדי אינה יוצאת לרשת', async () => {
  expect(await page.evaluate(() => window.cinema.search.run('א'))).toEqual([])
  expect(await page.evaluate(() => window.cinema.search.run(''))).toEqual([])
})

test('זמינות בפלטפורמות מגיעה מ-TMDB', async () => {
  const groups = await page.evaluate(() => window.cinema.search.run('blade runner'))
  const streaming = groups.find((g) => g.key === 'streaming')
  test.skip(!streaming, 'TMDB לא החזיר תוצאות — כנראה אין רשת')

  const withWatch = streaming!.results.filter((r) => (r.watch?.length ?? 0) > 0)
  expect(withWatch.length, 'לפחות כותר אחד עם זמינות').toBeGreaterThan(0)
  // תוכן של פלטפורמות לעולם אינו לחיץ אצלנו — אין דרך חוקית לנגן אותו
  expect(streaming!.results.every((r) => !r.playable), 'אין נגינה מפלטפורמות').toBe(true)
  expect(withWatch[0]!.externalUrl, 'יש קישור למעבר').toBeTruthy()
})

test('שאילתת סדרה אינה נבלעת על ידי תוצאות מוזיקה', async () => {
  const groups = await page.evaluate(() => window.cinema.search.run('The Mentalist'))
  const streaming = groups.find((group) => group.key === 'streaming')
  test.skip(!streaming, 'TMDB לא החזיר תוצאות — כנראה אין רשת')
  expect(streaming!.results.some((result) => /mentalist/i.test(result.title))).toBe(true)
  expect(groups.findIndex((group) => group.key === 'streaming')).toBeLessThan(
    groups.findIndex((group) => group.key === 'music') < 0
      ? Number.POSITIVE_INFINITY
      : groups.findIndex((group) => group.key === 'music')
  )
})

test('לחיצה על סרט פותחת פרטים ולעולם אינה מפעילה את Spotify', async () => {
  const groups = await page.evaluate(() => window.cinema.search.run('The Batman'))
  const movie = groups.find((group) => group.key === 'streaming')?.results.find((result) => result.title === 'The Batman')
  test.skip(!movie, 'TMDB לא החזיר את The Batman — כנראה אין רשת')

  await page.getByRole('button', { name: /Search|Recherche|חיפוש/ }).click()
  const input = page.locator('input[placeholder]').first()
  await input.fill('The Batman')
  const row = page.locator(`[data-result-id="${movie!.id}"]`)
  await expect(row).toBeVisible({ timeout: 15_000 })
  await row.click()

  await expect(
    page.getByRole('heading', { name: 'The Batman', exact: true }).or(page.getByAltText('The Batman', { exact: true }))
  ).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/Spotify .*lecture|Spotify .*playback/i)).toHaveCount(0)

  const details = await page.evaluate((id) => window.cinema.hub.details(id), movie!.id)
  if (details?.trailerKey) {
    await page.getByRole('button', { name: /Bande-annonce|Watch trailer|טריילר/ }).click()
    const trailer = page.locator('iframe[title*="Bande-annonce"], iframe[title*="Watch trailer"], iframe[title*="טריילר"]')
    await expect(trailer).toBeVisible()
    await expect(trailer).toHaveAttribute('src', new RegExp(`/embed/${details.trailerKey}`))
  }
})

test('מנוי מדורג לפני השכרה', async () => {
  const groups = await page.evaluate(() => window.cinema.search.run('the matrix'))
  const streaming = groups.find((g) => g.key === 'streaming')
  test.skip(!streaming || streaming.results.length < 2, 'אין מספיק תוצאות לבדיקת דירוג')

  const results = streaming!.results
  const rank = (r: (typeof results)[number]): number => {
    const w = r.watch ?? []
    if (w.some((x) => x.kind === 'flatrate')) return 0
    if (w.some((x) => x.kind === 'rent')) return 1
    if (w.length > 0) return 2
    return 3
  }
  const ranks = results.map(rank)
  expect(ranks, `דירוג: ${ranks.join(',')}`).toEqual([...ranks].sort((a, b) => a - b))
})

/**
 * מוזיקה מ-Deezer.
 *
 * הבדיקה מבררת קודם אם השירות עצמו זמין, ורק אז בודקת אותנו.
 * ל-Deezer יש הגבלת קצב שמחזירה דף HTML במקום JSON, ובלי ההבחנה
 * הזאת חסימה זמנית מהצד שלהם נראית כמו שבירה אצלנו — או גרוע
 * מכך, דילוג שקט שמסתיר תקלה אמיתית.
 */
test('מוזיקה מגיעה מ-Deezer, עם תצוגה מקדימה שאפשר לנגן', async () => {
  // מהתהליך הראשי, כמו התוכנה: מהממשק CORS חוסם את Deezer תמיד, והבדיקה דילגה בשקט
  const reachable = await app.evaluate(async ({ net }) => {
    try {
      const res = await net.fetch('https://api.deezer.com/search?q=test&limit=1')
      const body = await res.text()
      return res.ok && body.trimStart().startsWith('{')
    } catch {
      return false
    }
  })
  test.skip(!reachable, 'Deezer אינו זמין כרגע — הגבלת קצב או אין רשת')

  const groups = await page.evaluate(() => window.cinema.search.run('idan raichel'))
  const music = groups.find((g) => g.key === 'music')
  expect(music, 'קבוצת המוזיקה קיימת').toBeTruthy()

  const deezer = music!.results.filter((r) => r.sourceLabel === 'Deezer')
  expect(deezer.length, 'יש תוצאות מ-Deezer').toBeGreaterThan(0)
  expect(deezer.some((r) => r.playable && r.playUri), 'לפחות אחת עם תצוגה מקדימה').toBe(true)
})

test('כותר שכבר בספרייה אינו חוזר תחת הפלטפורמות', async () => {
  const groups = await page.evaluate(() => window.cinema.search.run('מטריקס'))
  const streaming = groups.find((g) => g.key === 'streaming')
  const library = groups.find((g) => g.key === 'library')
  if (!streaming || !library) return
  const owned = library.results.map((r) => r.title.toLowerCase())
  const dupes = streaming.results.filter((r) => owned.includes(r.title.toLowerCase()))
  expect(dupes, `כפילויות: ${dupes.map((d) => d.title).join(', ')}`).toHaveLength(0)
})

test('Spotify מדווח על עצמו כשאינו פעיל, ולא מפיל את החיפוש', async () => {
  const status = await page.evaluate(() => window.cinema.search.status())
  // המפתחות מוגדרים, אבל ספוטיפיי דורשת Premium לבעל האפליקציה.
  // מה שחשוב: החיפוש עצמו ממשיך לעבוד.
  const groups = await page.evaluate(() => window.cinema.search.run('idan raichel'))
  expect(Array.isArray(groups), 'החיפוש לא נפל').toBe(true)
  if (status.spotify) expect(typeof status.spotify).toBe('string')
})
