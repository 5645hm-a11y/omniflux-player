import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { enginePath } from './fixture'

/**
 * מסך הבית מקצה לקצה.
 *
 * המסך הזה הוא הדבר הראשון שמשתמש רואה, ולכן שלוש שאלות חייבות
 * תשובה: הוא נפתח מיד גם בלי רשת, הוא מציג תוכן אמיתי, ולחיצה על
 * כרטיס באמת מנגנת.
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
    ['av://lavfi:testsrc2=size=160x120:rate=10:duration=1', '--no-config', '--ovc=libx264',
     '--no-audio', `--o=${path.basename(target)}`],
    { cwd: path.dirname(target), stdio: 'ignore' }
  )
}

test.beforeAll(async () => {
  test.skip(!fs.existsSync(enginePath(root)), 'מנוע הנגינה חסר')

  mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-hubmedia-'))
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-hubdata-'))
  makeClip(path.join(mediaDir, 'Dune.2021.2160p.mkv'))
  makeClip(path.join(mediaDir, 'מטריקס 1999 1080p.mp4'))
  makeClip(path.join(mediaDir, 'Inception 2010 720p.mp4'))

  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v
  delete env.ELECTRON_RUN_AS_NODE

  app = await electron.launch({ args: [root, `--user-data-dir=${userData}`], cwd: root, env, timeout: 60_000 })
  page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.waitForTimeout(3500)
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

test('מסך הבית נפתח מיד, גם לפני שיש נתונים', async () => {
  // אין המתנה לרשת: המסך חייב להיות מצויר ברגע שהחלון נפתח
  const drawn = await page.evaluate(() => document.body.innerText.trim().length > 0)
  expect(drawn, 'משהו מצויר').toBe(true)
})

test('הקטלוג נסרק ונכנס לשורות', async () => {
  const added = await app.evaluate(async ({ app: a }, dir) => {
    const svc = (a as unknown as { __library?: { addLocalFolder: (d: string) => Promise<{ ok: boolean }> } }).__library
    return svc ? (await svc.addLocalFolder(dir)).ok : false
  }, mediaDir)
  expect(added).toBe(true)

  await page.evaluate(() => window.cinema.library.scan())
  await page.waitForFunction(() => window.cinema.library.scanning().then((s) => !s), null, { timeout: 120_000 })

  const data = await page.evaluate(() => window.cinema.hub.data())
  const recent = data.rows.find((r) => r.key === 'recent')
  expect(recent, 'שורת האחרונים קיימת').toBeTruthy()
  expect(recent!.cards.length, 'שלושת הקבצים נכנסו').toBe(3)
})

test('תגי איכות מגיעים עד המסך', async () => {
  const data = await page.evaluate(() => window.cinema.hub.data())
  const recent = data.rows.find((r) => r.key === 'recent')!
  const qualities = recent.cards.map((c) => c.quality).sort()
  expect(qualities).toEqual(['1080p', '4K', '720p'])
})

test('"המשך צפייה" מופיעה רק אחרי שבאמת נצפה משהו', async () => {
  const before = await page.evaluate(() => window.cinema.hub.data())
  expect(before.rows.some((r) => r.key === 'continue'), 'אין שורה לפני צפייה').toBe(false)

  await app.evaluate(async ({ app: a }) => {
    const hub = (a as unknown as { __hub: { forceProgress: (id: string, p: number, d: number) => void } }).__hub
    const lib = (a as unknown as { __library: { catalog: () => { items: Array<{ id: string }> } } }).__library
    hub.forceProgress(lib.catalog().items[0].id, 1800, 5400)
  })

  const after = await page.evaluate(() => window.cinema.hub.data())
  const cont = after.rows.find((r) => r.key === 'continue')
  expect(cont, 'השורה נוספה').toBeTruthy()
  expect(cont!.cards[0].progress).toBeCloseTo(1 / 3, 2)
})

test('השורות מצוירות בממשק עם הכותרות בשפה הנכונה', async () => {
  await page.reload()
  await page.waitForTimeout(2500)
  const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
  // ברירת המחדל צרפתית; אם המערכת בשפה אחרת הבדיקה עדיין דורשת כותרת כלשהי
  const locale = await page.evaluate(() => window.cinema.app.locale())
  const expected: Record<string, string> = {
    fr: 'Continuer la lecture',
    en: 'Continue watching',
    he: 'המשך צפייה',
    es: 'Seguir viendo',
    de: 'Weiterschauen',
    ar: 'متابعة المشاهدة'
  }
  expect(text, `שפה: ${locale}`).toContain(expected[locale])
})

test('לחיצה על כרטיס מנגנת בפועל', async () => {
  const played = await page.evaluate(async () => {
    const data = await window.cinema.hub.data()
    const card = data.rows.flatMap((r) => r.cards).find((c) => c.itemId)
    if (!card?.itemId) return null
    await window.cinema.player.playItem(card.itemId)
    return card.itemId
  })
  expect(played, 'נמצא כרטיס שאפשר לנגן').toBeTruthy()

  await page.waitForTimeout(4000)
  const state = await page.evaluate(() => window.cinema.player.state())
  expect(state.path, 'המנוע טען קובץ').toBeTruthy()
})

test('מיקום הצפייה נשמר מנגינה אמיתית', async () => {
  // הנגינה מהבדיקה הקודמת ממשיכה; ההקלטה מוגבלת בקצב ולכן ממתינים
  await page.waitForTimeout(6000)
  const progress = await app.evaluate(({ app: a }) => {
    const hub = (a as unknown as { __hub: { progress: () => Record<string, unknown> } }).__hub
    return hub.progress()
  })
  expect(Object.keys(progress).length, 'נשמרה התקדמות').toBeGreaterThan(0)
})

/**
 * רשימת הצפייה.
 *
 * הכפתור אחד לשני הכיוונים, ולכן הבדיקה מוודאת שהמצב שהוא מחזיר
 * תואם למה שנשמר — כפתור שאומר "נוסף" בזמן שהרשימה ריקה הוא
 * בדיוק סוג התקלה שמאבד אמון.
 */
test('הוספה והסרה מרשימת הצפייה', async () => {
  const entry = {
    id: 'tmdb:movie:603',
    title: 'The Matrix',
    poster: null,
    year: 1999,
    rating: 8.2,
    brand: null
  }

  expect(await page.evaluate((e) => window.cinema.hub.inWatchlist(e.id), entry)).toBe(false)

  const added = await page.evaluate((e) => window.cinema.hub.toggleWatchlist(e), entry)
  expect(added, 'ההוספה החזירה "נוסף"').toBe(true)
  expect(await page.evaluate((e) => window.cinema.hub.inWatchlist(e.id), entry)).toBe(true)

  const removed = await page.evaluate((e) => window.cinema.hub.toggleWatchlist(e), entry)
  expect(removed, 'ההסרה החזירה "הוסר"').toBe(false)
  expect(await page.evaluate((e) => window.cinema.hub.inWatchlist(e.id), entry)).toBe(false)
})

test('הרשימה מופיעה כשורה במסך הבית', async () => {
  const entry = {
    id: 'tmdb:movie:27205',
    title: 'Inception',
    poster: null,
    year: 2010,
    rating: 8.4,
    brand: null
  }
  await page.evaluate((e) => window.cinema.hub.toggleWatchlist(e), entry)

  const data = await page.evaluate(() => window.cinema.hub.data())
  const row = data.rows.find((r) => r.key === 'watchlist')
  expect(row, 'שורת הרשימה קיימת').toBeTruthy()
  expect(row!.cards[0].title).toBe('Inception')

  await page.evaluate((e) => window.cinema.hub.toggleWatchlist(e), entry)
  const after = await page.evaluate(() => window.cinema.hub.data())
  expect(after.rows.some((r) => r.key === 'watchlist'), 'שורה ריקה נעלמת').toBe(false)
})

test('הרשימה שורדת הפעלה מחדש', async () => {
  const entry = {
    id: 'tmdb:movie:238',
    title: 'The Godfather',
    poster: null,
    year: 1972,
    rating: 8.7,
    brand: null
  }
  await page.evaluate((e) => window.cinema.hub.toggleWatchlist(e), entry)
  await page.reload()
  await page.waitForTimeout(2500)
  expect(await page.evaluate((id) => window.cinema.hub.inWatchlist(id), entry.id)).toBe(true)
})

test('תגי הפלטפורמה נושאים לוגו רשמי ולא רק שם', async () => {
  const data = await page.evaluate(() => window.cinema.hub.data())
  const trending = data.rows.find((r) => r.key === 'trending')
  test.skip(!trending, 'אין טרנדים — כנראה אין מפתח TMDB או רשת')

  const branded = trending!.cards.filter((c) => c.brand)
  test.skip(branded.length === 0, 'אף כותר אינו זמין בפלטפורמה באזור הזה')
  // לוגו מוגש דרך המטמון שלנו; שם בלי לוגו עדיין תקין, אבל לא הכול
  expect(branded.some((c) => c.brand?.logo), 'לפחות מותג אחד עם לוגו').toBe(true)
})

/**
 * הבאנר לעולם אינו מציג כותר שאי אפשר לעשות בו כלום.
 *
 * כותר שאינו בספרייה ואין לו זמינות מציג כפתור ראשי מושבת ודהוי —
 * הדבר הראשון שרואים בתוכנה, ואי אפשר ללחוץ עליו. נצפה בפועל על
 * כותר שטרם יצא.
 */
test('כל שקופית בבאנר ניתנת לנגינה או לפתיחה', async () => {
  const data = await page.evaluate(() => window.cinema.hub.data())
  test.skip(data.hero.length === 0, 'אין באנר — כנראה אין מפתח TMDB או רשת')

  const dead = data.hero.filter((h) => !h.playable && !h.externalUrl && !h.trailerKey)
  expect(dead.map((h) => h.title), 'שקופיות בלי יעד').toEqual([])
})

/**
 * אלבום אחד, כרטיס אחד.
 *
 * חמש רצועות מאותו פסקול הן חמישה מזהים שונים ואותה עטיפה בדיוק,
 * ולכן השורה הראתה חמש פעמים את אותה תמונה.
 */
test('שורת המוזיקה אינה חוזרת על אותה עטיפה', async () => {
  const data = await page.evaluate(() => window.cinema.hub.data())
  const music = data.rows.find((r) => r.key === 'music')?.cards ?? []
  test.skip(music.length === 0, 'אין מוזיקה — כנראה אין רשת')

  const posters = music.map((c) => c.poster).filter(Boolean)
  expect(new Set(posters).size, 'כל עטיפה מופיעה פעם אחת').toBe(posters.length)
})

test('שורה ריקה אינה מציגה כותרת בלי תוכן', async () => {
  const data = await page.evaluate(() => window.cinema.hub.data())
  const empty = data.rows.filter((r) => r.cards.length === 0)
  expect(empty.map((r) => r.key), 'שורות ריקות שהגיעו לממשק').toEqual([])
})

/**
 * כרטיס הפרטים.
 *
 * לחיצה על כותר שאינו אצלנו שלחה את המשתמש לדף TMDB בדפדפן —
 * החוצה מהתוכנה, אל אתר שאינו קשור אליו, במקום לענות על "מה זה
 * ואיפה אפשר לראות".
 */
test('פרטי כותר מוחזרים עם תקציר, שחקנים וזמינות', async () => {
  const data = await page.evaluate(() => window.cinema.hub.data())
  const card = data.rows.find((r) => r.key === 'trending')?.cards.find((c) => !c.itemId)
  test.skip(!card, 'אין טרנדים — כנראה אין מפתח TMDB או רשת')

  const det = await page.evaluate((id) => window.cinema.hub.details(id), card!.id)
  expect(det, 'הוחזרו פרטים').toBeTruthy()
  expect(det!.title.length, 'יש כותרת').toBeGreaterThan(0)
  expect(Array.isArray(det!.cast), 'יש רשימת שחקנים').toBe(true)
  expect(Array.isArray(det!.watch), 'יש רשימת זמינות').toBe(true)
})

/*
 * הכרטיס שנפתח הוא הכרטיס שנלחץ.
 *
 * ‏TMDB מנהל שני מרחבי מספרים נפרדים — לסרטים ולסדרות — ואותו מספר
 * קיים בשניהם על כותרים שונים לגמרי. כשהמזהה נשא את המספר בלבד,
 * כרטיס הפרטים ניחש "סרט": סדרה נפלה ל-404, וסדרה שמספרה תפוס גם
 * בצד הסרטים החזירה סרט אחר — עם תקציר ושחקנים שאינם שלה.
 *
 * לכן זו אינה בדיקה של "חזר משהו" אלא של "חזר הדבר הנכון".
 */
test('כרטיס הפרטים מחזיר את הכותר שנלחץ, גם לסדרות', async () => {
  const data = await page.evaluate(() => window.cinema.hub.data())
  const cards = (data.rows.find((r) => r.key === 'trending')?.cards ?? []).filter((c) => !c.itemId)
  test.skip(cards.length === 0, 'אין טרנדים — כנראה אין מפתח TMDB או רשת')

  const wanted = cards.slice(0, 4)
  const got = await page.evaluate(async (ids: string[]) => {
    const out: Array<string | null> = []
    for (const id of ids) out.push((await window.cinema.hub.details(id))?.title ?? null)
    return out
  }, wanted.map((c) => c.id))

  for (const [i, card] of wanted.entries()) {
    expect(card.id, `${card.id} נושא סוג`).toMatch(/^tmdb:(movie|tv):\d+$/)
    expect(got[i], `הוחזרו פרטים עבור ${card.title}`).toBeTruthy()
    expect(got[i], `${card.id} החזיר כותר אחר`).toBe(card.title)
  }
})

test('אף קישור זמינות אינו מפנה ל-TMDB או JustWatch', async () => {
  const data = await page.evaluate(() => window.cinema.hub.data())
  const cards = data.rows.find((r) => r.key === 'trending')?.cards ?? []
  test.skip(cards.length === 0, 'אין טרנדים')

  // כמה כותרים, כדי לפגוש כזה שבאמת יש לו ספקים
  const links: string[] = []
  for (const c of cards.slice(0, 6)) {
    const det = await page.evaluate((id) => window.cinema.hub.details(id), c.id)
    for (const w of det?.watch ?? []) if (w.url) links.push(w.url)
  }
  test.skip(links.length === 0, 'אף כותר אינו זמין בפלטפורמה באזור הזה')

  const offenders = links.filter((u) => /themoviedb\.org|justwatch\.com/i.test(u))
  expect(offenders, 'קישורים שמפנים החוצה במקום לשירות').toEqual([])
})

test('מנוי מסומן משנה את הסימון על השירות', async () => {
  const before = await page.evaluate(() => window.cinema.subscriptions.list())
  const added = await page.evaluate(() => window.cinema.subscriptions.toggle('Netflix'))
  expect(added, 'נוסף').toBe(true)
  expect(await page.evaluate(() => window.cinema.subscriptions.list())).toContain('Netflix')

  const removed = await page.evaluate(() => window.cinema.subscriptions.toggle('Netflix'))
  expect(removed, 'הוסר').toBe(false)
  expect(await page.evaluate(() => window.cinema.subscriptions.list())).toEqual(before)
})

test('סימון המנוי אינו תלוי באותיות גדולות', async () => {
  await page.evaluate(() => window.cinema.subscriptions.toggle('Netflix'))
  // ‏TMDB מחזיר לפעמים "netflix" ולפעמים "Netflix"; שתיהן אותו שירות
  const second = await page.evaluate(() => window.cinema.subscriptions.toggle('netflix'))
  expect(second, 'הזיהוי סלחני לאותיות').toBe(false)
  expect(await page.evaluate(() => window.cinema.subscriptions.list())).not.toContain('Netflix')
})
