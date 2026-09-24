/**
 * בודק את הבנייה הארוזה, לא את בניית הפיתוח.
 *
 * אפליקציה ארוזה נופלת במקומות שפיתוח לא: נתיבים בתוך asar, מיקום
 * המנוע, ומשאבים שלא נכללו. אם לא בודקים את מה שנשלח למשתמש, בודקים
 * משהו אחר.
 *
 * הבדיקה אינה עוברת דרך Playwright: electron-builder מדליק את
 * ה-Fuses של Electron, ואלה מכבים את `--inspect` — וזה נכון מבחינת
 * אבטחה, אז לא נוגעים בזה. במקום, מדברים ישירות עם המנוע דרך הצינור
 * שלו, ומאשרים משם שהקובץ באמת נטען ומתנגן.
 */
import { spawn, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const exe = path.join(root, 'release', 'win-unpacked', 'OmniFlux Player.exe')
const engine = path.join(root, 'resources', 'engine', 'mpv.exe')

if (!fs.existsSync(exe)) {
  console.error('✕ אין בנייה ארוזה. הרץ: npx electron-builder --win --publish never')
  process.exit(1)
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-pkg-'))
const NAME = 'סרט עברי – ארוז [2026] & מבחן ✓.mp4'
execFileSync(
  engine,
  ['av://lavfi:testsrc2=size=640x360:rate=25:duration=30', '--no-config', '--ovc=libx264',
   '--no-audio', `--o=${NAME}`],
  { cwd: dir, stdio: 'ignore' }
)
const clip = path.join(dir, NAME)

const env = {}
for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(exe, [clip, `--user-data-dir=${path.join(dir, 'data')}`], { env, stdio: 'ignore' })

/**
 * שורת הפקודה של המנוע שנפתח כאן — ולא של מנוע אחר שרץ במקרה.
 *
 * הבדיקה בחרה קודם את תהליך ה-mpv הראשון במערכת. תהליך שנשאר מריצה
 * קודמת — בדיקה שהופסקה, או התוכנה עצמה פתוחה — נבחר במקומו, והבדיקה
 * דיווחה שהארוז שבור כשהוא תקין לגמרי: "המנוע רץ מ-resources: false",
 * ושם קובץ שאיש לא ביקש.
 *
 * ‏mpv מקבל שם צינור שנגזר ממזהה התהליך של התוכנה — וזה בדיוק התהליך
 * שנפתח כאן, ולכן הזיהוי ודאי.
 */
function mpvCommandLine(pid) {
  try {
    const all = execFileSync(
      'powershell',
      ['-NoProfile', '-Command',
       "Get-CimInstance Win32_Process -Filter \"Name='mpv.exe'\" | ForEach-Object { $_.CommandLine }"],
      { encoding: 'utf8' }
    )
    return all.split(/\r?\n/).find((line) => line.includes(`omniflux-mpv-${pid}`)) ?? ''
  } catch {
    return ''
  }
}

/*
 * ממתינים למנוע, ולא לשעון.
 *
 * קודם ישבה כאן המתנה קבועה של 12 שניות. ההרצה הראשונה אחרי אריזה
 * איטית בהרבה מהשאר — Windows סורק קובץ הפעלה חדש בנפח 236 מגה-בייט
 * לפני שהוא מרשה לו לרוץ — ולכן הבדיקה נכשלה על בנייה תקינה לגמרי,
 * ועברה בהרצה שנייה. אבחון שגוי כזה כבר עלה בהכרזה על חסם שחרור
 * שלא היה קיים.
 *
 * ההמתנה נגמרת ברגע שהמנוע עלה, ולכן הבדיקה גם מהירה יותר כשהכול
 * תקין.
 */
const DEADLINE_MS = 60_000
const started = Date.now()
let cmd = ''
while (Date.now() - started < DEADLINE_MS) {
  if (child.exitCode !== null) break
  cmd = mpvCommandLine(child.pid)
  if (/--input-ipc-server=/.test(cmd)) break
  await new Promise((r) => setTimeout(r, 1000))
}
// המנוע קם, אבל הקובץ עוד נטען. שנייה אחת מספיקה כדי שהנגינה תתחיל.
if (cmd) await new Promise((r) => setTimeout(r, 1500))
console.log(`  (המנוע עלה אחרי ${((Date.now() - started) / 1000).toFixed(1)} שניות)`)

function ask(pipe, payload, ms = 5000) {
  return new Promise((resolve) => {
    const s = net.connect(pipe)
    s.setEncoding('utf8')
    let buf = ''
    const t = setTimeout(() => { s.destroy(); resolve({ error: 'timeout' }) }, ms)
    s.on('data', (d) => {
      buf += d
      for (const line of buf.split('\n')) {
        if (!line.trim()) continue
        try {
          const m = JSON.parse(line)
          if (m.error !== undefined) { clearTimeout(t); s.end(); resolve(m); return }
        } catch { /* חלקי */ }
      }
    })
    s.on('error', (e) => { clearTimeout(t); resolve({ error: e.message }) })
    s.on('connect', () => s.write(Buffer.from(JSON.stringify(payload) + '\n', 'utf8')))
  })
}

const pipe = /--input-ipc-server=(\S+)/.exec(cmd)?.[1] ?? ''
const fromResources = /win-unpacked[\\/]resources[\\/]engine[\\/]mpv\.exe/i.test(cmd)

const probe = {}
if (pipe) {
  for (const [k, c] of [
    ['path', ['get_property', 'path']],
    ['duration', ['get_property', 'duration']],
    ['position', ['get_property', 'time-pos']],
    ['paused', ['get_property', 'pause']],
    ['hwdec', ['get_property', 'hwdec-current']]
  ]) {
    const r = await ask(pipe, { command: c })
    probe[k] = r.error === 'success' ? r.data : `✕ ${r.error}`
  }
}

const dataDir = path.join(dir, 'data')
const wrote = fs.existsSync(dataDir) ? fs.readdirSync(dataDir).length : 0

console.log('— הבנייה הארוזה —')
console.log(`  התהליך חי             ${child.exitCode === null}`)
console.log(`  המנוע רץ מ-resources  ${fromResources}`)
console.log(`  קובץ נטען             ${String(probe.path ?? '—').split(/[\\/]/).pop()}`)
console.log(`  מנגן                  ${probe.paused === false} · ${probe.position ?? '?'}s מתוך ${probe.duration ?? '?'}`)
console.log(`  פענוח חומרה           ${probe.hwdec ?? '—'}`)
console.log(`  תיקיית נתונים נוצרה   ${wrote > 0}`)

const ok =
  child.exitCode === null &&
  fromResources &&
  String(probe.path ?? '').includes('ארוז') &&
  probe.paused === false &&
  Number(probe.position) > 0.5
console.log(ok ? '\n✓ הארוז עובד' : '\n✕ יש בעיה בארוז')

/*
 * סוגרים את מה שנפתח כאן, ורק אותו.
 *
 * קודם נסגרו כל תהליכי mpv וכל עותק של התוכנה במערכת — כלומר גם
 * הסרט שהמשתמש צופה בו באותו רגע, בלי אזהרה. ‏‎/T סוגר את התהליך
 * ואת צאצאיו, והמנוע הוא אחד מהם.
 */
try { child.kill() } catch { /* כבר מת */ }
await new Promise((r) => setTimeout(r, 1000))
try { execFileSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' }) } catch { /* כבר נסגר */ }
fs.rmSync(dir, { recursive: true, force: true })
process.exit(ok ? 0 : 1)
