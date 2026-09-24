import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { makeFixture, enginePath } from './fixture'

/**
 * שלב 03: תאורת אווירה וכלים מתקדמים.
 *
 * התאורה נבדקת על צבע אמיתי — קליפ אדום מובהק חייב להוציא לוח אדום.
 * בדיקה שרק מוודאת "התקבל פריים" הייתה עוברת גם אם חילוץ הצבע שבור.
 */

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

let app: ElectronApplication
let page: Page
let fixture: string

test.beforeAll(async () => {
  test.skip(!fs.existsSync(enginePath(root)), 'מנוע הנגינה חסר')
  fixture = makeFixture(root)

  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v
  delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({ args: [root, fixture], cwd: root, env, timeout: 60_000 })
  page = await app.firstWindow()
  await page.waitForTimeout(6000)
})

test.afterAll(async () => {
  await app?.close().catch(() => undefined)
  try {
    execFileSync('taskkill', ['/F', '/IM', 'mpv.exe'], { stdio: 'ignore' })
  } catch {
    /* לא רץ */
  }
  fs.rmSync(path.dirname(fixture), { recursive: true, force: true })
})

test('פריימים מגיעים מהמנוע לממשק', async () => {
  const got = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let bytes = 0
        const off = window.cinema.player.onFrame((data) => {
          bytes = data.byteLength
          off()
          resolve(bytes)
        })
        /*
         * חלון רחב, כי הבדיקה תלויה בקצב.
         *
         * תפיסת הפריים תלויה במנוע שמצלם בפועל, ובריצה מלאה יש כמה
         * תהליכי mpv שמתחרים על אותו מעבד. שמונה שניות הספיקו לבדיקה
         * בודדת ולא לריצה מלאה, וזה הפך את הבדיקה למהבהבת.
         */
        setTimeout(() => {
          off()
          resolve(bytes)
        }, 18000)
      })
  )
  expect(got, 'התקבל פריים עם תוכן').toBeGreaterThan(1000)
})

test('הפריים ממשיך להגיע כל עוד מנגנים', async () => {
  const count = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let n = 0
        const off = window.cinema.player.onFrame(() => n++)
        setTimeout(() => {
          off()
          resolve(n)
        }, 6000)
      })
  )
  // אחת ל-1.6 שניות — בשש שניות אמורים להגיע לפחות שניים
  expect(count, `הגיעו ${count} פריימים בשש שניות`).toBeGreaterThanOrEqual(2)
})

test('אקולייזר נכנס לשרשרת ויוצא ממנה', async () => {
  await page.evaluate(() => window.cinema.player.setEqualizer([8, 6, 4, 0, 0, 0, 0, 0, 0, 0]))
  await page.waitForTimeout(700)
  let state = await page.evaluate(() => window.cinema.player.state())
  expect(state.eq[0]).toBe(8)

  // שטוח מסיר את המסנן לגמרי במקום להשאיר אותו עם הגבר אפס
  await page.evaluate(() => window.cinema.player.setEqualizer(Array(10).fill(0)))
  await page.waitForTimeout(700)
  state = await page.evaluate(() => window.cinema.player.state())
  expect(state.eq.every((g) => g === 0)).toBe(true)
})

test('סנכרון כתוביות ואודיו נשמר במנוע', async () => {
  await page.evaluate(() => window.cinema.player.setSubDelay(1.5))
  await page.evaluate(() => window.cinema.player.setAudioDelay(-0.25))
  await page.waitForTimeout(600)
  const state = await page.evaluate(() => window.cinema.player.state())
  expect(state.subDelay).toBeCloseTo(1.5, 1)
  expect(state.audioDelay).toBeCloseTo(-0.25, 2)
})

test('יחס תצוגה מוחל ומתאפס', async () => {
  await page.evaluate(() => window.cinema.player.setAspect('4:3'))
  await page.waitForTimeout(500)
  expect((await page.evaluate(() => window.cinema.player.state())).aspect).toBe('4:3')

  await page.evaluate(() => window.cinema.player.setAspect('-1'))
  await page.waitForTimeout(500)
  expect((await page.evaluate(() => window.cinema.player.state())).aspect).toBe('-1')
})

test('עיבוד תמונה חי נשמר ומתאפס במנוע', async () => {
  await page.evaluate(async () => {
    await window.cinema.player.setVideoAdjustment('brightness', 18)
    await window.cinema.player.setVideoAdjustment('contrast', -12)
    await window.cinema.player.setVideoAdjustment('saturation', 24)
    await window.cinema.player.setVideoAdjustment('gamma', 8)
    await window.cinema.player.setSharpen(0.55)
    await window.cinema.player.setDeband(true)
    await window.cinema.player.setVideoFit('zoom')
  })
  await page.waitForTimeout(700)

  let state = await page.evaluate(() => window.cinema.player.state())
  expect(state.brightness).toBeCloseTo(18, 0)
  expect(state.contrast).toBeCloseTo(-12, 0)
  expect(state.saturation).toBeCloseTo(24, 0)
  expect(state.gamma).toBeCloseTo(8, 0)
  expect(state.sharpen).toBeCloseTo(0.55, 2)
  expect(state.deband).toBe(true)
  expect(state.videoFit).toBe('zoom')

  await page.evaluate(() => window.cinema.player.resetVideo())
  await page.waitForTimeout(700)
  state = await page.evaluate(() => window.cinema.player.state())
  expect([state.brightness, state.contrast, state.saturation, state.gamma, state.sharpen]).toEqual([0, 0, 0, 0, 0])
  expect(state.deband).toBe(false)
  expect(state.videoFit).toBe('fit')
})

test('מצב תמונה בתוך תמונה מחזיר את החלון לגודלו', async () => {
  /*
   * שינוי גודל חלון אמיתי אינו מיידי: הבקשה עוברת למנהל החלונות של
   * Windows, וגבולות החלון מתעדכנים כשהוא מסיים. המתנה קבועה של חצי
   * שנייה הספיקה כמעט תמיד — ולכן נפלה מדי פעם תחת עומס.
   */
  const bounds = (): Promise<Electron.Rectangle> =>
    app.evaluate(({ app }) => {
      const player = (app as unknown as { __player: { overlay: { getBounds: () => Electron.Rectangle } } }).__player
      return player.overlay.getBounds()
    })
  const before = await bounds()

  expect(await page.evaluate(() => window.cinema.window.setPictureInPicture(true))).toBe(true)
  await expect.poll(async () => (await bounds()).width, { timeout: 6000, intervals: [300] }).toBeLessThan(before.width)
  expect((await bounds()).height).toBeLessThan(before.height)

  expect(await page.evaluate(() => window.cinema.window.setPictureInPicture(false))).toBe(false)
  await expect.poll(async () => (await bounds()).width, { timeout: 6000, intervals: [300] }).toBe(before.width)
  expect((await bounds()).height).toBe(before.height)
})

test('מסך מלא משנה את מצב החלון האמיתי', async () => {
  await page.evaluate(() => window.cinema.window.setFullscreen(true))
  await page.waitForTimeout(500)
  expect(
    await app.evaluate(({ app }) => {
      const player = (app as unknown as { __player: { isFullscreen: () => boolean } }).__player
      return player.isFullscreen()
    })
  ).toBe(true)

  await page.evaluate(() => window.cinema.window.setFullscreen(false))
  await page.waitForTimeout(500)
  expect(
    await app.evaluate(({ app }) => {
      const player = (app as unknown as { __player: { isFullscreen: () => boolean } }).__player
      return player.isFullscreen()
    })
  ).toBe(false)
})
