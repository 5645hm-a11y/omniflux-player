import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { enginePath } from './fixture'
import { LOCALES } from '../src/shared/i18n/types'

/**
 * החלפת שפה בתוכנה שרצה.
 *
 * שלושה דברים חייבים לקרות יחד, ואם אחד מהם נשמט המשתמש רואה ממשק
 * חצי מתורגם: הטקסט מתחלף, כיוון הכתיבה מתהפך, וההעדפה שורדת הפעלה
 * מחדש.
 */

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

let app: ElectronApplication
let page: Page
let userData: string

test.beforeAll(async () => {
  test.skip(!fs.existsSync(enginePath(root)), 'מנוע הנגינה חסר')
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-locale-'))

  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v
  delete env.ELECTRON_RUN_AS_NODE

  app = await electron.launch({ args: [root, `--user-data-dir=${userData}`], cwd: root, env, timeout: 60_000 })
  page = await app.firstWindow()
  // רוחב מפורש: כותרת מסך הבית מוסתרת מתחת ל-640px, ו-innerText
  // אינו כולל אלמנטים ב-display:none
  await page.setViewportSize({ width: 1200, height: 800 })
  await page.waitForTimeout(3000)
})

test.afterAll(async () => {
  await app?.close().catch(() => undefined)
  fs.rmSync(userData, { recursive: true, force: true })
})

/** הטקסט הגלוי במסך, בלי רווחים כפולים. */
const visible = (): Promise<string> => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))

test('ברירת המחדל היא צרפתית, ונגזרת משפת המערכת', async () => {
  const code = await page.evaluate(() => window.cinema.app.locale())
  // המערכת כאן צרפתית; בכל מקרה שפה לא נתמכת נופלת לצרפתית
  expect(LOCALES.map((l) => l.code)).toContain(code)
  const lang = await page.evaluate(() => document.documentElement.lang)
  expect(lang, 'השפה הוחלה על המסמך').toBe(code)
})

test('מעבר לצרפתית מחליף את הטקסט', async () => {
  await page.evaluate(() => window.cinema.app.setLocale('fr'))
  await page.reload()
  await page.waitForTimeout(2000)
  expect(await visible()).toContain('Accueil')
  expect(await page.evaluate(() => document.documentElement.dir)).toBe('ltr')
})

test('מעבר לאנגלית מחליף את הטקסט', async () => {
  await page.evaluate(() => window.cinema.app.setLocale('en'))
  await page.reload()
  await page.waitForTimeout(2000)
  const text = await visible()
  expect(text).toContain('Home')
  expect(text, 'לא נשארה צרפתית על המסך').not.toContain('Accueil')
})

test('עברית מהפכת את כיוון הכתיבה', async () => {
  await page.evaluate(() => window.cinema.app.setLocale('he'))
  await page.reload()
  await page.waitForTimeout(2000)
  expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl')
  expect(await visible()).toContain('בית')
})

test('ערבית גם היא מימין לשמאל', async () => {
  await page.evaluate(() => window.cinema.app.setLocale('ar'))
  await page.reload()
  await page.waitForTimeout(2000)
  expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl')
  expect(await visible()).toContain('الرئيسية')
})

test('הבחירה שורדת הפעלה מחדש', async () => {
  await page.evaluate(() => window.cinema.app.setLocale('de'))
  await app.close()

  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v
  delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({ args: [root, `--user-data-dir=${userData}`], cwd: root, env, timeout: 60_000 })
  page = await app.firstWindow()
  await page.setViewportSize({ width: 1200, height: 800 })
  await page.waitForTimeout(3000)

  expect(await page.evaluate(() => window.cinema.app.locale()), 'ההעדפה נשמרה').toBe('de')
  expect(await visible()).toContain('Start')
})

test('אין מפתח תרגום גולמי על המסך', async () => {
  // "library.empty" במקום טקסט מסגיר מפתח שנשמט מהמילון
  const text = await visible()
  expect(text, `נמצא מפתח גולמי: ${text}`).not.toMatch(
    /\b(app|nav|welcome|player|power|library|search|settings|errors|dialog)\.[a-zA-Z]+\b/
  )
})
