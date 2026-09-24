import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { enginePath, makeAudioFixture } from './fixture'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

let app: ElectronApplication
let page: Page
let audioFile: string
let userData: string

test.beforeAll(async () => {
  test.skip(!fs.existsSync(enginePath(root)), 'מנוע הנגינה חסר')
  audioFile = makeAudioFixture(root, 60)
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-music-'))

  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env[key] = value
  delete env.ELECTRON_RUN_AS_NODE

  app = await electron.launch({ args: [root, `--user-data-dir=${userData}`], cwd: root, env, timeout: 60_000 })
  page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.evaluate(() => window.cinema.app.setLocale('en'))
  await page.reload()
  await page.waitForTimeout(2500)
})

test.afterAll(async () => {
  await app?.close().catch(() => undefined)
  try {
    execFileSync('taskkill', ['/F', '/IM', 'mpv.exe'], { stdio: 'ignore' })
  } catch {
    /* לא רץ */
  }
  for (const dir of [path.dirname(audioFile), userData]) fs.rmSync(dir, { recursive: true, force: true })
})

test('לשונית המוזיקה פותחת מתחם ייעודי', async () => {
  await page.getByRole('button', { name: 'Music' }).click()
  await expect(page.getByRole('heading', { name: 'Music', exact: true })).toBeVisible()
  // חיפוש אחד לכל המקורות — ולא חיפוש נפרד לכל שירות
  await expect(page.getByPlaceholder('Search your computer, Drive, Spotify, Deezer and YouTube…')).toBeVisible()
  /*
   * החשבונות הם שורת מצב, לא שני כרטיסים עם כותרות.
   * מה שצריך להיות גלוי הוא האם מחובר ומה הפעולה.
   */
  await expect(page.getByRole('button', { name: 'Connect' }).first()).toBeVisible()
})

test('מוזיקה מקומית מופיעה ומופעלת מתוך המתחם', async () => {
  await page.getByRole('button', { name: 'Music' }).click()
  const added = await app.evaluate(async ({ app: electronApp }, folder) => {
    const service = (electronApp as unknown as {
      __library?: { addLocalFolder: (dir: string) => Promise<{ ok: boolean }> }
    }).__library
    return service ? (await service.addLocalFolder(folder)).ok : false
  }, path.dirname(audioFile))
  expect(added).toBe(true)

  await page.evaluate(() => window.cinema.library.scan())
  await page.waitForFunction(() => window.cinema.library.scanning().then((state) => !state), null, { timeout: 90_000 })

  const audio = await page.evaluate(() => window.cinema.library.catalog().then((catalog) => catalog.items.find((item) => item.kind === 'audio')))
  expect(audio).toBeTruthy()

  /*
   * האוסף המקומי הוא הדבר הראשון בעמוד, והוא רשימה ולא כרטיסים.
   * הבדיקה מפעילה משורת השיר עצמה — בדיוק כמו המשתמש.
   */
  await expect(page.getByRole('heading', { name: 'Your collection' })).toBeVisible()
  // אותו פירוק שהמסך עושה: "אמן - שיר" מפוצל על מקף עם רווחים
  const bare = audio!.fileName.replace(/\.[^.]+$/, '')
  const dash = bare.search(/\s[-–—]\s/)
  const shown = dash < 0 ? bare : bare.slice(dash + 3).trim()
  const row = page.getByRole('button', { name: shown, exact: false }).first()
  await expect(row).toBeVisible()
  await row.click()
  await page.waitForFunction((uri) => window.cinema.player.state().then((state) => state.path === uri), audio!.uri)

  await page.evaluate((target) => window.cinema.player.load({
    target,
    mediaId: 'deezer:test:1',
    title: 'A Real Track Title',
    artist: 'A Real Artist',
    cover: 'https://example.invalid/high-resolution-cover.jpg',
    provider: 'Deezer',
    playbackMode: 'preview'
  }).catch(() => undefined), audioFile)
  await page.waitForFunction(() => window.cinema.player.state().then((state) => state.mediaId === 'deezer:test:1'))

  const state = await page.evaluate(() => window.cinema.player.state())
  expect(state.title).toBe('A Real Track Title')
  expect(state.artist).toBe('A Real Artist')
  expect(state.cover).toContain('high-resolution-cover.jpg')
  expect(state.playbackMode).toBe('preview')
  expect(state.title).not.toMatch(/^[a-f0-9]{24,}/i)
})

test('יעד החיפוש פותח חלון Spotlight צף', async () => {
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page.getByPlaceholder('A film, a series, a track — anywhere')).toBeVisible()
  const panel = page.locator('.glass-regular').first()
  await expect(panel).toBeVisible()
})
