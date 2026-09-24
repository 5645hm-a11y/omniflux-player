import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { makeFixture, makeAudioFixture, enginePath, NASTY_NAME } from './fixture'

/**
 * שלב 01 מקצה לקצה: המנוע מנגן, והממשק מצויר.
 *
 * שתי הבדיקות האלה קיימות כי שתי התקלות האלה באמת קרו כאן. הממשק
 * נפל בלולאת רינדור אינסופית והמסך היה ריק — בעוד שהבנייה עברה,
 * הטיפוסים עברו, והמנוע ניגן בסדר גמור. בדיקה שמסתכלת רק על "זה
 * מתקמפל" לא הייתה תופסת את זה.
 */

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

let app: ElectronApplication
let page: Page
let fixture: string
const errors: string[] = []

test.beforeAll(async () => {
  test.skip(!fs.existsSync(enginePath(root)), 'מנוע הנגינה חסר — הרץ npm run engine')
  fixture = makeFixture(root)

  // ‏ELECTRON_RUN_AS_NODE נורש מהטרמינל של VS Code ומפיל את Electron ל-Node
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v
  delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({ args: [root, fixture], cwd: root, env, timeout: 60_000 })
  page = await app.firstWindow()
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
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

test('המנוע מנגן, ושם הקובץ העברי שרד את כל הדרך', async () => {
  const state = await page.evaluate(() => window.cinema.player.state())
  expect(state.path, 'הנתיב הגיע שלם').toContain(NASTY_NAME)
  expect(state.duration, 'אורך נקרא מהקובץ').toBeGreaterThan(4)
  expect(state.position, 'הנגינה התקדמה').toBeGreaterThan(0.5)
  expect(state.paused).toBe(false)
})

test('פענוח חומרה פעיל', async () => {
  const state = await page.evaluate(() => window.cinema.player.state())
  // בלי פענוח חומרה זה עדיין עובד, אבל שווה לדעת אם זה נעלם
  expect(state.hwdec, `hwdec=${state.hwdec}`).toBeTruthy()
})

/*
 * הבדיקה אינה תלויה בשפה.
 *
 * קודם היא חיפשה aria-label בעברית, ונפלה ברגע שברירת המחדל הפכה
 * לצרפתית — כלומר בדקה את נוסח התרגום ולא את קיום הרכיב. תפקיד
 * (role) ומבנה נשארים זהים בכל שפה.
 */
test('הממשק באמת מצויר — לא רק נבנה', async () => {
  const dom = await page.evaluate(() => {
    const root = document.getElementById('root')
    return {
      children: root?.children.length ?? 0,
      html: root?.innerHTML.length ?? 0,
      hasScrubber: Boolean(document.querySelector('[role="slider"]')),
      buttons: document.querySelectorAll('button').length,
      // כל כפתור אייקון חייב שם נגיש, בכל שפה
      unlabelled: [...document.querySelectorAll('button')].filter(
        (b) => !b.textContent?.trim() && !b.getAttribute('aria-label')
      ).length,
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      text: document.body.innerText.replace(/\s+/g, ' ')
    }
  })
  expect(dom.children, 'React רינדר משהו').toBeGreaterThan(0)
  expect(dom.hasScrubber, 'סרגל הזמן קיים').toBe(true)
  expect(dom.buttons, 'יש בקרות').toBeGreaterThan(5)
  expect(dom.unlabelled, 'כפתור בלי שם נגיש').toBe(0)
  expect(dom.lang, 'שפה הוחלה על המסמך').not.toBe('')
  expect(['ltr', 'rtl']).toContain(dom.dir)
  expect(dom.text, 'שם הקובץ מוצג').toContain('סרט עברי')
  expect(errors, `שגיאות בממשק: ${errors.join(' | ')}`).toHaveLength(0)
})

test('דילוג מגיע למקום המבוקש', async () => {
  await page.evaluate(() => window.cinema.player.seek(4))
  await page.waitForTimeout(1200)
  const state = await page.evaluate(() => window.cinema.player.state())
  expect(state.position).toBeGreaterThan(3.5)
})

test('השהיה וחידוש עוברים דרך המנוע', async () => {
  await page.evaluate(() => window.cinema.player.playPause())
  await page.waitForTimeout(600)
  expect((await page.evaluate(() => window.cinema.player.state())).paused).toBe(true)

  await page.evaluate(() => window.cinema.player.playPause())
  await page.waitForTimeout(600)
  expect((await page.evaluate(() => window.cinema.player.state())).paused).toBe(false)
})

/*
 * אותו דבר, אבל דרך הממשק ולא דרך ה-IPC.
 *
 * הבדיקה שמעל עברה כל הזמן, והמשתמש בכל זאת לא הצליח להמשיך סרט
 * מושהה: המנוע דיווח core-idle=yes בהשהיה, הממשק הבין "אין מה לנגן",
 * נעל את הכפתור, ו-togglePlayback חזר בלי לעשות דבר. קריאה ישירה
 * למנוע עוקפת בדיוק את השכבה שנשברה.
 */
test('אחרי השהיה מהממשק, אפשר להמשיך מהממשק', async () => {
  // הקובץ קצר, ובבדיקה הקודמת הגיע לסופו — שם mpv משהה את עצמו
  await page.evaluate(() => window.cinema.player.seek(0))
  if ((await page.evaluate(() => window.cinema.player.state())).paused) {
    await page.evaluate(() => window.cinema.player.playPause())
  }
  await page.waitForTimeout(600)
  expect((await page.evaluate(() => window.cinema.player.state())).paused, 'מתנגן לפני ההשהיה').toBe(false)

  await page.keyboard.press('k')
  await page.waitForTimeout(600)
  expect((await page.evaluate(() => window.cinema.player.state())).paused, 'השהיה מהמקלדת').toBe(true)

  await page.keyboard.press('k')
  await page.waitForTimeout(600)
  const resumed = await page.evaluate(() => window.cinema.player.state())
  expect(resumed.paused, 'המשך מהמקלדת אחרי השהיה').toBe(false)
  expect(resumed.idle, 'קובץ טעון אינו "סרק"').toBe(false)
})

test('מסלולי אודיו וּוידאו נקראים מהקובץ', async () => {
  const state = await page.evaluate(() => window.cinema.player.state())
  const kinds = state.tracks.map((t) => t.type)
  expect(kinds, `מסלולים: ${JSON.stringify(state.tracks)}`).toContain('video')
  expect(kinds).toContain('audio')
})

/**
 * אזהרות של המנוע אינן שגיאות של המשתמש.
 *
 * ffmpeg כותב ל-stderr הערות כמו "Caution: quantization tables are
 * too coarse" — הערה על איכות JPEG בתמונה ממוזערת. היא הופיעה
 * כהתראה אדומה על הסרט, וזה בדיוק סוג הרעש שמלמד להתעלם מהתראות.
 */
test('רעש טכני מהמנוע אינו מגיע למשתמש', async () => {
  const shown: string[] = []
  await page.exposeFunction('__omniError', (m: string) => {
    shown.push(m)
  })
  await page.evaluate(() => {
    window.cinema.player.onError((m) => (window as unknown as { __omniError: (s: string) => void }).__omniError(m))
  })

  // הקובץ מנוגן מחדש; ffmpeg מדבר בזמן הפתיחה
  await page.evaluate(() => window.cinema.player.playPause())
  await page.waitForTimeout(2500)

  const noise = shown.filter((m) => /caution|quantization|deprecated|estimating duration/i.test(m))
  expect(noise, `רעש שהוצג למשתמש: ${noise.join(' | ')}`).toEqual([])
})

/**
 * תצוגה מקדימה בסרגל הזמן.
 *
 * הגיליון נבנה עם דילוג ולא עם פענוח מלא. ההבדל נמדד: על סרטון של
 * עשר דקות, פענוח לקח 4.5 שניות ודילוג 0.28 — כלומר על סרט באורך
 * מלא זה ההבדל בין דקה לרבע שנייה.
 */
test('נבנה גיליון תצוגה מקדימה, והמשבצות נגזרות ממנו', async () => {
  const sprite = await page.evaluate(() => window.cinema.player.thumbs())
  test.skip(!sprite, 'הקובץ קצר מדי לגיליון')

  expect(sprite!.count, 'יש משבצות').toBeGreaterThan(0)
  expect(sprite!.cols * sprite!.rows, 'הרשת מכילה את כולן').toBeGreaterThanOrEqual(sprite!.count)
  expect(sprite!.interval, 'המרווח חיובי').toBeGreaterThan(0)
  expect(sprite!.url).toMatch(/^art:\/\//)

  // המשבצת האחרונה חייבת ליפול בתוך הגיליון ולא מעבר לו
  const last = Math.floor((sprite!.count - 1) * sprite!.interval)
  const index = Math.min(sprite!.count - 1, Math.floor(last / sprite!.interval))
  expect(index).toBeLessThan(sprite!.cols * sprite!.rows)
})

test('הגיליון נשמר במטמון ואינו נבנה פעמיים', async () => {
  const t0 = Date.now()
  await page.evaluate(() => window.cinema.player.thumbs())
  const again = Date.now() - t0
  // בנייה אמיתית לוקחת מאות מילישניות; מטמון מחזיר מיד
  expect(again, `החזרה השנייה לקחה ${again}ms`).toBeLessThan(400)
})

/*
 * מעבר מסרט לשיר.
 *
 * ‏mpv מדווח על הנתיב מיד ועל רשימת המסלולים רק ב-file-loaded, ולכן
 * היה חלון של עשרות מילישניות שבו הנתיב כבר של הקובץ החדש
 * והמסלולים עדיין של הקודם. כל דיווח מצב בחלון הזה יצא כך, ולא רק
 * הראשון — נמדד: 32 מילישניות ושישה דיווחים.
 *
 * למי שמסיק מהמסלולים "יש כאן וידאו" זה אינו פרט טכני: שיר שנטען
 * אחרי סרט נראה כמו סרט, נכנס למסך צפייה, והמשתמש קיבל מסך שחור
 * במקום סרגל נגן.
 */
test('שיר שנטען אחרי סרט אינו נושא את מסלולי הווידאו שלו', async () => {
  const audio = makeAudioFixture(root)
  try {
    await page.evaluate(() => {
      (window as unknown as { __stale: number }).__stale = 0
      window.cinema.player.onState((s) => {
        const isAudioFile = Boolean(s.path && /\.(m4a|mp3|flac)$/i.test(s.path))
        if (isAudioFile && s.tracks.some((t) => t.type === 'video')) (window as unknown as { __stale: number }).__stale++
      })
    })

    await page.evaluate((m) => window.cinema.player.load(m), audio)
    await page.waitForTimeout(4000)

    const state = await page.evaluate(() => window.cinema.player.state())
    expect(state.path, 'השיר נטען').toContain('.m4a')
    expect(
      state.tracks.some((t) => t.type === 'video'),
      'לשיר אין מסלול וידאו'
    ).toBe(false)
    expect(
      await page.evaluate(() => (window as unknown as { __stale: number }).__stale),
      'אף דיווח מצב לא נשא מסלולי וידאו של הקובץ הקודם'
    ).toBe(0)

    // הממשק נשאר בשיטוט: סרגל הצד קיים, ואין מסך צפייה
    expect(
      await page.evaluate(() => Boolean(document.querySelector('nav'))),
      'שיר אינו נכנס למסך צפייה'
    ).toBe(true)
  } finally {
    fs.rmSync(path.dirname(audio), { recursive: true, force: true })
  }
})
