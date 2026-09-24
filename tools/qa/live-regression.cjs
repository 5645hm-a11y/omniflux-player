/**
 * בדיקת רגרסיה חיה — התוכנה עצמה, בפרופיל מבודד, מול הרמקולים.
 *
 * הרצה:  npx electron-vite build && node tools/qa/live-regression.cjs
 *
 * מה היא בודקת: תגיות, ניגון מקומי (השהיה, דילוג, הבא/הקודם, מעבר אוטומטי),
 * פלייליסט והיסטוריה, YouTube (כולל דילוג בזמן פרסומת), סרט מהדרייב (השהיה,
 * דילוג קדימה ואחורה), דליפות זיכרון ב-30 מחזורים, והפעלה מחדש.
 *
 * למה חיה ולא Playwright רגיל: דרך electron.launch נמדד בעבר ש-Widevine חסר
 * וש-mpv "אינו מחובר" — מסקנות שגויות. כאן התוכנה רצה ישירות, ו-CDP רק מתבונן.
 *
 * שמע: audio-meter.ps1 רץ במקביל ורושם את עוצמת השמע של כל תהליך בכל שנייה
 * (Core Audio). בסוף, כל שלב "מתנגן" מוצלב מול "נשמע", וכל "מושהה" מול "שקט".
 * מצב הנגן לבדו אינו הוכחה: SDK מדווח "מנגן" גם כשאין צליל.
 *
 * לחיצות עכבר אמיתיות בזמן הריצה נרשמות ומסומנות: לחיצה על "השתק" כדי לא
 * לשמוע את צלילי הבדיקה נראית אחרת בדיוק כמו באג של השתקה. (קרה.)
 */
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { spawn, execFileSync } = require('node:child_process')
const root = path.resolve(__dirname, '..', '..')
const { chromium } = require(path.join(root, 'node_modules/@playwright/test'))
const mpv = path.join(root, 'resources/engine/mpv.exe')
const here = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-qa-'))
const PORT = 41791
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const clock = () => new Date().toTimeString().slice(0, 8)
const results = []
const out = fs.createWriteStream(path.join(here, 'regression.log'))
const say = (line) => { const l = `${clock()} ${line}`; console.log(l); out.write(l + '\n') }
const check = (name, ok, detail = '') => { results.push({ name, ok }); say(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`) }
// תלוי בגורם חיצוני (פרסומת של YouTube שלא נגמרה) — לא עבר ולא נכשל
const skip = (name, why) => say(`SKIP  ${name}  — ${why}`)

// ---------- פרופיל מבודד ----------
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-regress-'))
const real = path.join(process.env.APPDATA, 'OmniFlux Player')
for (const f of ['catalog.json', 'google-drive.json', 'settings.json', 'youtube-cache.json', 'youtube-quota.json', 'spotify.json', 'hub.json']) {
  if (fs.existsSync(path.join(real, f))) fs.copyFileSync(path.join(real, f), path.join(profile, f))
}
// שלושה שירים עם תגיות, 9 שניות כל אחד — לתור, למעבר אוטומטי ולתגיות
const music = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-music-'))
const songs = [['Alpha Band', 'First Light', 330], ['Beta Crew', 'Second Wind', 440], ['Gamma Set', 'Third Wave', 550]]
for (const [artist, title, freq] of songs) {
  execFileSync(mpv, ['--no-config', `av://lavfi:sine=frequency=${freq}:duration=9`, `--o=${path.join(music, `${artist} - ${title}.mp3`)}`,
    `--oset-metadata=title="${title}",artist="${artist}",album="Regression",genre="Test"`], { stdio: 'ignore' })
}
const folders = JSON.parse(fs.readFileSync(path.join(real, 'folders.json'), 'utf8'))
folders.push({ id: 'regress-local', source: 'local', ref: music, label: 'Regression', addedAt: Date.now() })
fs.writeFileSync(path.join(profile, 'folders.json'), JSON.stringify(folders))

const meterLog = path.join(here, 'audio-meter.log')
const meter = spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'audio-meter.ps1'), '-Seconds', '600'], { stdio: ['ignore', fs.openSync(meterLog, 'w'), 'ignore'] })

function launch() {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(path.join(root, 'node_modules/electron/dist/electron.exe'), [root, `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`], { cwd: root, env })
  child.stdout.on('data', () => {}); child.stderr.on('data', () => {})
  return child
}
async function connect() {
  let browser
  for (let i = 0; i < 80 && !browser; i++) { try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`) } catch { await sleep(500) } }
  const ctx = browser.contexts()[0]
  let page
  for (let i = 0; i < 80 && !page; i++) { page = ctx.pages().find((p) => p.url().includes('index.html')); if (!page) await sleep(500) }
  return { browser, page }
}

;(async () => {
  let child = launch()
  let { browser, page } = await connect()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  const humanClicks = []
  await page.exposeFunction('__qaHuman', (line) => humanClicks.push(line)).catch(() => {})
  /*
   * לחיצות של הבדיקה עצמה (דרך CDP) גם הן isTrusted — אי אפשר להבדיל לפי זה.
   * לכן נרשמות רק לחיצות על מה שהבדיקה לעולם אינה לוחצת עליו: השתקה ועוצמה,
   * ופקדי החלון. לחיצה כזו היא יד אנושית.
   */
  await page.evaluate(() => document.addEventListener('pointerdown', (e) => {
    const label = e.target?.closest?.('button')?.getAttribute('aria-label') ?? ''
    const inWindowBar = Boolean(e.target?.closest?.('[class*="window"], .titlebar'))
    if (/son|sound|mute|volume|השתק|Minimi|Maximi|Fermer|Close|מזער|סגור/i.test(label) || inWindowBar || e.target?.type === 'range') {
      window.__qaHuman(`${new Date().toTimeString().slice(0, 8)} ${label || e.target?.tagName}`)
    }
  }, true))
  await sleep(4000)
  const st = () => page.evaluate(() => window.cinema.player.state())
  const nav = async (re) => { await page.locator('aside button, nav button').filter({ hasText: re }).first().click(); await sleep(1200) }
  const miniTitle = () => page.locator('.drag.glass-thin span[dir="auto"]').first().innerText().catch(() => '')

  // ---------- סריקה ותגיות ----------
  say('SCAN start')
  await page.evaluate(() => window.cinema.library.scan())
  await page.waitForFunction(() => window.cinema.library.scanning().then((s) => !s), null, { timeout: 180_000 })
  const catalog = await page.evaluate(() => window.cinema.library.catalog())
  const local = catalog.items.filter((i) => i.kind === 'audio' && i.source === 'local')
  check('תגיות ID3 נקראו מהקבצים', local.length === 3 && local.every((i) => i.audio?.title && i.audio?.artist),
    local.map((i) => `${i.audio?.artist} – ${i.audio?.title}`).join(', '))

  // ---------- מקומי: תור, השהיה, דילוג, הבא/הקודם, מעבר אוטומטי ----------
  await nav(/Musique|Music|מוזיקה/)
  await sleep(2500)
  const collection = page.locator('section', { has: page.locator('h2', { hasText: /Votre collection|Your collection|האוסף שלך/ }) }).first()
  await collection.locator('button[title]').first().click()
  say('ACTION local play (first card of collection)')
  await sleep(2500)
  let s = await st()
  check('מקומי: מתנגן מהאוסף', Boolean(s.path?.includes('omni-music-')) && !s.paused, path.basename(s.path || ''))
  const firstPath = s.path
  await page.keyboard.press('k'); await sleep(900)
  s = await st(); check('מקומי: השהיה', s.paused === true)
  say('MARK local-paused')
  await sleep(2000)
  await page.keyboard.press('k'); await sleep(900)
  s = await st(); check('מקומי: המשך', s.paused === false)
  const before = s.position
  // שנייה 4 ולא 6: מ-6 השיר (9 שניות) מסתיים לבד לפני שהבדיקה מגיעה ל"הבא"
  await page.evaluate(() => window.cinema.player.seek(4)); await sleep(900)
  s = await st(); check('מקומי: דילוג בזמן (seek)', s.position >= 3.5, `${before.toFixed(1)} → ${s.position.toFixed(1)}`)
  const next = page.locator('.drag.glass-thin button[aria-label="Titre suivant"], .drag.glass-thin button[aria-label="Next track"], .drag.glass-thin button[aria-label="הרצועה הבאה"]').first()
  await next.click(); await sleep(1800)
  s = await st(); check('מקומי: "הבא" עובר לשיר הבא בתור', s.path !== firstPath && s.path?.includes('omni-music-'), path.basename(s.path || ''))
  const secondPath = s.path
  const prev = page.locator('.drag.glass-thin button[aria-label="Titre précédent"], .drag.glass-thin button[aria-label="Previous track"], .drag.glass-thin button[aria-label="הרצועה הקודמת"]').first()
  await prev.click(); await sleep(1800)
  s = await st(); check('מקומי: "הקודם" חוזר לשיר הקודם', s.path === firstPath, path.basename(s.path || ''))
  say('WAIT auto-advance (song is 9s)')
  await page.evaluate(() => window.cinema.player.seek(7.5)); await sleep(4500)
  s = await st(); check('מקומי: מעבר אוטומטי בסוף שיר', s.path === secondPath && !s.paused, path.basename(s.path || ''))
  say('MARK local-playing-second')

  // ---------- פלייליסט מהתור, והיסטוריה ----------
  await page.locator('header button', { hasText: /File d’attente|File|Queue|תור/ }).first().click(); await sleep(800)
  await page.locator('aside button', { hasText: /Enregistrer comme playlist|Save as playlist|שמירה כפלייליסט/ }).first().click(); await sleep(600)
  await page.locator('input[aria-label="Nouvelle playlist"], input[aria-label="New playlist"], input[aria-label="פלייליסט חדש"]').first().fill('Regression mix')
  await page.keyboard.press('Enter'); await sleep(1200)
  // הבוחר נסגר לבד אחרי השמירה; נשארה מגירת התור. Escape אחד סוגר אותה — ולא עוזב את מסך המוזיקה
  await page.keyboard.press('Escape'); await sleep(700)
  const stillMusic = await page.locator('header h1').first().innerText({ timeout: 3000 }).catch(() => '')
  check('Escape סוגר חלונות בלי לעזוב את מסך המוזיקה', /Musique|Music|מוזיקה/.test(stillMusic) && !(await page.locator('aside.glass-thick').count()), stillMusic)
  const lists = await page.evaluate(() => JSON.parse(localStorage.getItem('omniflux.playlists.v1') || '[]'))
  check('פלייליסט נשמר מהתור', lists.length === 1 && lists[0].items.length === 3, `${lists[0]?.name} · ${lists[0]?.items.length} שירים`)
  const hist = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('omniflux.listening.v1') || '{}')))
  check('היסטוריית האזנה נרשמה', hist.length >= 2, `${hist.length} שירים`)

  // ---------- YouTube: ניגון, השהיה, דילוג, הבא ----------
  await page.screenshot({ path: path.join(here, 'reg-before-yt.png') })
  say('H2 ' + JSON.stringify(await page.locator('main h2').allInnerTexts()))
  const trendingSection = page.locator('h2', { hasText: /Tendances sur YouTube|Trending now on YouTube|פופולרי עכשיו ב-YouTube/ }).first().locator('xpath=ancestor::section[1]')
  await trendingSection.scrollIntoViewIfNeeded({ timeout: 8000 })
  await trendingSection.locator('div.snap-start button[title]').first().click()
  say('ACTION youtube play (trending)')
  await sleep(9000)
  const ytPlaying = await page.evaluate(() => Boolean(document.querySelector('iframe[src*="youtube"]')))
  check('YouTube: הנגן הגלוי קם', ytPlaying)
  const ytTitle1 = await miniTitle()
  say('MARK youtube-playing')
  await page.keyboard.press('k'); await sleep(1500)
  say('MARK youtube-paused')
  await sleep(2500)
  await page.keyboard.press('k'); await sleep(1500)
  say('MARK youtube-resumed')
  await sleep(2500)
  await next.click(); await sleep(6000)
  const ytTitle2 = await miniTitle()
  check('YouTube: "הבא" עובר לשיר אחר', ytTitle2 && ytTitle2 !== ytTitle1, `${ytTitle1} → ${ytTitle2}`)
  const posText = async () => page.locator('.drag.glass-thin div[dir="ltr"] span').first().innerText().catch(() => '0:00')
  const durText = async () => page.locator('.drag.glass-thin div[dir="ltr"] span').last().innerText().catch(() => '0:00')
  const secs = (x) => { const [m, s2] = x.split(':').map(Number); return m * 60 + s2 }
  // דילוג מיד בתחילת השיר — לעיתים קרובות בזמן פרסומת. הוא חייב להתבצע כשהשיר עצמו מתחיל
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await sleep(300)
  const adLabel = page.locator('.drag.glass-thin span', { hasText: /Publicité|Ad —|פרסומת/ })
  const hadAd = (await adLabel.count()) > 0
  for (let i = 0; i < 60 && (await adLabel.count()) > 0; i++) await sleep(1000)
  await sleep(2500)
  const t2 = await posText()
  if ((await adLabel.count()) > 0) skip('YouTube: דילוג בזמן', 'הפרסומת לא נגמרה תוך דקה')
  else check('YouTube: דילוג בזמן (+10 שניות, גם כשנלחץ בזמן פרסומת)', secs(t2) >= 8, `${hadAd ? 'היתה פרסומת; ' : ''}אחרי: ${t2} / ${await durText()}`)

  // ---------- סרט מהדרייב: ניגון, השהיה, דילוג ----------
  // ‏DRIVE_MOVIE בוחר סרט ידוע כתקין; בלעדיו — הראשון בקטלוג (שעלול להיות פגום או מוגבל במכסה)
  const drive = catalog.items.find((i) => i.source === 'gdrive' && i.kind === 'movie' && (!process.env.DRIVE_MOVIE || i.fileName.includes(process.env.DRIVE_MOVIE)))
  if (drive) {
    await page.evaluate((id) => window.cinema.player.playItem(id), drive.id)
    say('ACTION drive movie play')
    await sleep(7000)
    s = await st(); check('דרייב: הסרט מתנגן', Boolean(s.path?.includes('127.0.0.1')) && !s.paused && s.position > 0.5, `pos ${s.position.toFixed(1)}`)
    check('דרייב: נגן YouTube נסגר כשסרט התחיל', await page.evaluate(() => !document.querySelector('iframe[src*="youtube"]')))
    await page.keyboard.press('k'); await sleep(1200)
    s = await st(); check('דרייב: השהיה', s.paused === true)
    await sleep(6000)
    await page.keyboard.press('k'); await sleep(1500)
    s = await st(); check('דרייב: המשך אחרי 6 שניות השהיה', s.paused === false)
    const p0 = s.position
    const seekFwd = await page.evaluate((to) => window.cinema.player.seek(to).then(() => 'ok', (e) => e.message), p0 + 120); await sleep(5000)
    if (seekFwd !== 'ok') say(`NOTE seek: ${seekFwd}`)
    s = await st(); check('דרייב: דילוג קדימה 2 דקות (בלוק חדש מגוגל)', s.position > p0 + 110 && !s.paused, `${p0.toFixed(1)} → ${s.position.toFixed(1)}`)
    await page.evaluate(() => window.cinema.player.seek(3).catch(() => undefined)); await sleep(3000)
    s = await st(); check('דרייב: דילוג אחורה (מהמטמון)', s.position < 10 && s.position > 2.5, `→ ${s.position.toFixed(1)}`)
    await page.evaluate(() => window.cinema.player.playPause())
    // הסרט פתח מסך צפייה מלא; יוצאים ממנו כמו משתמש
    await page.keyboard.press('Escape'); await sleep(800)
  } else check('דרייב: אין סרט בקטלוג', false)

  // ---------- זיכרון: 30 מחזורי ניווט וחיפוש ----------
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  const metrics = async () => {
    await cdp.send('HeapProfiler.collectGarbage'); await sleep(400)
    await cdp.send('HeapProfiler.collectGarbage'); await sleep(400)
    const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]))
    return { heap: m.JSHeapUsedSize / 1048576, listeners: m.JSEventListeners, nodes: m.Nodes }
  }
  await nav(/Musique|Music|מוזיקה/); await sleep(2000)
  const m0 = await metrics()
  for (let i = 0; i < 30; i++) {
    await nav(/Accueil|Home|בית/)
    await nav(/Musique|Music|מוזיקה/)
    const input = page.locator('header input').first()
    await input.fill(i % 2 ? 'yellow' : 'first light'); await sleep(700)
    await input.fill(''); await sleep(300)
  }
  await sleep(1500)
  const m1 = await metrics()
  say(`MEMORY before heap=${m0.heap.toFixed(1)}MB listeners=${m0.listeners} nodes=${m0.nodes}`)
  say(`MEMORY after  heap=${m1.heap.toFixed(1)}MB listeners=${m1.listeners} nodes=${m1.nodes}`)
  check('זיכרון: הערימה לא גדלה ביותר מ-25% אחרי 30 מחזורים', m1.heap < m0.heap * 1.25 + 2, `${m0.heap.toFixed(1)} → ${m1.heap.toFixed(1)} MB`)
  check('זיכרון: אין הצטברות מאזינים', m1.listeners <= m0.listeners * 1.15 + 20, `${m0.listeners} → ${m1.listeners}`)
  check('זיכרון: אין הצטברות צמתים', m1.nodes <= m0.nodes * 1.3 + 200, `${m0.nodes} → ${m1.nodes}`)

  // ---------- הפעלה מחדש: פלייליסט והיסטוריה שורדים ----------
  await browser.close().catch(() => {}); child.kill(); await sleep(2500)
  try { execFileSync('taskkill', ['/F', '/IM', 'mpv.exe'], { stdio: 'ignore' }) } catch {}
  child = launch(); ({ browser, page } = await connect()); await sleep(4000)
  const lists2 = await page.evaluate(() => JSON.parse(localStorage.getItem('omniflux.playlists.v1') || '[]'))
  const hist2 = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('omniflux.listening.v1') || '{}')).length)
  check('אחרי הפעלה מחדש: הפלייליסט קיים', lists2.length === 1 && lists2[0].name === 'Regression mix')
  check('אחרי הפעלה מחדש: ההיסטוריה קיימת', hist2 >= 2, `${hist2}`)
  await nav(/Musique|Music|מוזיקה/); await sleep(2500)
  const plCard = page.locator('h2', { hasText: /Vos playlists|Your playlists|הפלייליסטים שלך/ }).first()
    .locator('xpath=ancestor::section[1]').locator('button', { hasText: 'Regression mix' }).first()
  await plCard.scrollIntoViewIfNeeded(); await plCard.click()
  // החלון של הפלייליסט נפתח — ו"נגן הכול" נלחץ בתוכו, לא במדף אחר בעמוד
  const dialog = page.locator('.glass-thick', { has: page.locator('input[value="Regression mix"]') }).first()
  await dialog.waitFor({ timeout: 8000 })
  await dialog.locator('button', { hasText: /Tout lire|Play all|נגן הכול/ }).first().click(); await sleep(2500)
  s = await st(); check('אחרי הפעלה מחדש: הפלייליסט מתנגן', Boolean(s.path?.includes('omni-music-')) && !s.paused, path.basename(s.path || ''))
  say('MARK playlist-playing')
  await page.evaluate(() => window.cinema.player.playPause())

  check('אין שגיאות JavaScript בממשק', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))

  // ---------- שמע: "מתנגן" מול הרמקולים ----------
  meter.kill()
  await sleep(800)
  const ours = {}
  const lines = (text) => text.split(String.fromCharCode(10)).map((l) => l.replace(String.fromCharCode(13), ''))
  for (const line of lines(fs.readFileSync(meterLog, 'utf8'))) {
    const m = /^(\d\d:\d\d:\d\d)\s+(.*)$/.exec(line)
    if (!m) continue
    const values = [...m[2].matchAll(/(?:mpv|electron|OmniFlux[^:]*):\d+=([\d,]+)/g)].map((x) => Number(x[1].replace(',', '.')))
    ours[m[1]] = values.length ? Math.max(...values) : 0
  }
  const at = (time, from, to) => {
    const [h, mi, se] = time.split(':').map(Number)
    let best = 0
    for (let d = from; d <= to; d++) {
      const t = new Date(2000, 0, 1, h, mi, se + d).toTimeString().slice(0, 8)
      best = Math.max(best, ours[t] ?? 0)
    }
    return best
  }
  const audible = [['MARK local-playing-second', 0, 2], ['MARK youtube-resumed', 1, 3], ['MARK playlist-playing', 0, 1]]
  const log = fs.readFileSync(path.join(here, 'regression.log'), 'utf8')
  for (const [mark, from, to] of audible) {
    const line = lines(log).find((l) => l.includes(mark))
    if (line) { const v = at(line.slice(0, 8), from, to); check(`שמע נשמע: ${mark.replace('MARK ', '')}`, v > 0.02, v.toFixed(3)) }
  }
  const pausedLine = lines(log).find((l) => l.includes('MARK local-paused'))
  // רק השנייה שאחרי ההשהיה: אחריה כבר נלחץ "המשך", והדגימה של אותה שנייה עלולה לתפוס אותו
  if (pausedLine) { const v = at(pausedLine.slice(0, 8), 1, 1); check('שמע שקט בזמן השהיה', v < 0.01, v.toFixed(3)) }
  if (humanClicks.length) say(`WARNING לחיצות עכבר אמיתיות בזמן הריצה (תוצאות השמע אינן אמינות): ${humanClicks.join(', ')}`)
  const failed = results.filter((r) => !r.ok)
  say(`SUMMARY ${results.length - failed.length}/${results.length} passed`)
  await browser.close().catch(() => {}); child.kill()
  try { execFileSync('taskkill', ['/F', '/IM', 'mpv.exe'], { stdio: 'ignore' }) } catch {}
  fs.rmSync(profile, { recursive: true, force: true }); fs.rmSync(music, { recursive: true, force: true })
  say(`יומנים: ${here}`)
  process.exit(failed.length ? 1 : 0)
})().catch((e) => { say('CRASH ' + e.message); meter.kill(); process.exit(1) })
