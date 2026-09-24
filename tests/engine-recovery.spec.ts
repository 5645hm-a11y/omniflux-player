import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { enginePath, makeFixture } from './fixture'

/**
 * מנוע שנפל קם מחדש, וממשיך מאותו מקום.
 *
 * ‏mpv הוא תהליך נפרד, ותהליך יכול למות — מנהל התקן גרפי שקורס, קובץ
 * פגום, מחשב עמוס. עד התיקון הזה, נפילה אחת הפכה את התוכנה לקישוט:
 * הכפתורים נראו תקינים, כל לחיצה נשלחה לצינור שאין בצדו איש, ושום
 * דבר לא קרה עד הפעלה מחדש. זה בדיוק מה שמשתמש דיווח עליו —
 * "לוחץ המשך ולא קורה כלום".
 *
 * הבדיקה הורגת את המנוע באמצע נגינה, בדיוק כמו נפילה אמיתית.
 */

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

let app: ElectronApplication
let page: Page
let clip: string
let userData: string

const state = (): Promise<{ paused: boolean; position: number; idle: boolean; path: string | null }> =>
  page.evaluate(() => window.cinema.player.state())

test.beforeAll(async () => {
  test.skip(!fs.existsSync(enginePath(root)), 'מנוע הנגינה חסר')
  clip = makeFixture(root, 120)
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-recover-'))
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v
  delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({ args: [root, `--user-data-dir=${userData}`], cwd: root, env, timeout: 60_000 })
  app.process().stdout?.on('data', (d: Buffer) => {
    const text = d.toString().trim()
    if (text.includes('[engine]')) console.log('ראשי:', text)
  })
  app.process().stderr?.on('data', (d: Buffer) => {
    const text = d.toString().trim()
    if (text.includes('[engine]')) console.log('ראשי:', text)
  })
  page = await app.firstWindow()
  await page.waitForTimeout(3000)
})

test.afterAll(async () => {
  await app?.close().catch(() => undefined)
  for (const dir of [path.dirname(clip), userData]) fs.rmSync(dir, { recursive: true, force: true })
})

test('נפילה של המנוע באמצע סרט אינה משאירה תוכנה מתה', async () => {
  await page.evaluate((file) => window.cinema.player.load(file), clip)
  await page.waitForTimeout(3500)
  const before = await state()
  expect(before.paused, 'מתנגן לפני הנפילה').toBe(false)
  expect(before.position, 'והזמן מתקדם').toBeGreaterThan(0.5)

  // הריגה של תהליך המנוע הזה בלבד, ולא של כל mpv במחשב
  const pid = await app.evaluate(({ app: a }) =>
    (a as unknown as { __player: { engine: { pid: number | null } } }).__player.engine.pid
  )
  expect(pid, 'למנוע יש תהליך').toBeTruthy()
  execFileSync('taskkill', ['/F', '/PID', String(pid)], { stdio: 'ignore' })

  // ההתאוששות מתחילה מיד, אבל טעינה מחדש לוקחת רגע
  // המצב האחרון נשאר בזיכרון גם כשהמנוע מת, ולכן "יש מיקום" אינו
  // עדות לכלום. העדות היא שהמיקום ממשיך להתקדם אחרי הנפילה.
  await expect
    .poll(async () => (await state()).position, { timeout: 30_000, intervals: [500] })
    .toBeGreaterThan(before.position + 2)

  const after = await state()
  expect(after.idle, 'המנוע חי שוב').toBe(false)
  expect(after.path, 'ואותו קובץ נטען').toBe(before.path)

  // והכי חשוב: הכפתורים עובדים שוב
  await page.evaluate(() => window.cinema.player.playPause())
  await page.waitForTimeout(1200)
  expect((await state()).paused, 'השהיה עובדת אחרי ההתאוששות').toBe(true)

  const paused = await state()
  await page.evaluate(() => window.cinema.player.playPause())
  await expect
    .poll(async () => (await state()).position, { timeout: 10_000, intervals: [400] })
    .toBeGreaterThan(paused.position + 0.4)
})

/*
 * מנוע חי שאינו עונה — קורה בקובץ פגום.
 *
 * נמדד בסרט של 4 ג'יגה מהדרייב: ffmpeg מדווח "timescale not set", מחליט
 * שהקובץ הוא תמונה אחת וקורא את כולו כדי לפענח אותה. התהליך לא נופל, ולכן
 * ההתאוששות מנפילה לא נכנסה לפעולה — וכל לחיצה חיכתה שמונה שניות ונכשלה.
 *
 * הבדיקה מדמה את זה בדיוק: הצינור למנוע "בולע" פקודות, והמנוע אינו עונה.
 * אחרי שתי פקודות שלא נענו, המנוע משתחרר, הקובץ שתקע אותו נשכח, המשתמש
 * מקבל הסבר — וקובץ אחר מתנגן מיד.
 */
test('מנוע תקוע משתחרר לבד, מסביר, ומנגן את הקובץ הבא', async () => {
  test.setTimeout(90_000)
  await page.evaluate((file) => window.cinema.player.load(file), clip)
  await page.waitForTimeout(2500)
  await page.evaluate(() => {
    const w = window as unknown as { __errors: string[] }
    w.__errors = []
    window.cinema.player.onError((m) => w.__errors.push(m))
  })

  // מכאן המנוע "תקוע": שום פקודה לא מגיעה אליו, ולכן שום תשובה לא חוזרת
  await app.evaluate(({ app: a }) => {
    const engine = (a as unknown as { __player: { engine: { sock: { write: (b: unknown) => boolean } } } }).__player.engine
    engine.sock.write = () => true
  })
  const first = await page.evaluate(() => window.cinema.player.seek(10).then(() => 'ok', () => 'timeout'))
  const second = await page.evaluate(() => window.cinema.player.seek(20).then(() => 'ok', () => 'timeout'))
  expect([first, second], 'שתי פקודות שלא נענו').toEqual(['timeout', 'timeout'])

  // ההסבר הגיע לממשק, והמנוע עלה מחדש ריק — בלי הקובץ שתקע אותו
  await expect.poll(() => page.evaluate(() => (window as unknown as { __errors: string[] }).__errors.join(' | ')), { timeout: 10_000 })
    .toMatch(/damaged|endommagé|פגום|dañado|beschädigt/i)
  await expect.poll(async () => (await state()).idle, { timeout: 20_000, intervals: [500] }).toBe(true)

  // והכי חשוב: הנגן עובד שוב
  await page.evaluate((file) => window.cinema.player.load(file), clip)
  await expect.poll(async () => (await state()).position, { timeout: 15_000, intervals: [400] }).toBeGreaterThan(1)
})
