/**
 * מוריד את מנוע הנגינה ל-resources/engine.
 *
 * mpv הוא קובץ הרצה בודד שמביא איתו FFmpeg משלו, ולכן הוא מחליף גם
 * את ffmpeg וגם את ffprobe שהיו כאן קודם. אנחנו מריצים אותו כתהליך
 * נפרד ואיננו מקשרים אליו, ולכן הקוד שלנו אינו נגזרת שלו — אבל
 * ההפצה חייבת לשאת את הרישיון, וזה מה שהחלק האחרון כאן עושה.
 *
 *   node tools/fetch-engine.mjs [--force]
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// fileURLToPath ולא pathname — בנתיב יש עברית, ו-pathname מחזיר אותה מקודדת
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'resources', 'engine')
const exe = path.join(outDir, 'mpv.exe')

/*
 * הבנייה של shinchiro היא הבנייה הקנונית ל-Windows, ומתעדכנת יומית.
 * התגית ננעלת בכוונה: בנייה שמשתנה מתחת לרגליים היא באג שקשה לשחזר.
 */
const TAG = '20260813'
const FILE = `mpv-x86_64-${TAG}-git-f4d13e1c2c.7z`
const URL = `https://github.com/shinchiro/mpv-winbuild-cmake/releases/download/${TAG}/${FILE}`

if (fs.existsSync(exe) && !process.argv.includes('--force')) {
  const mb = (fs.statSync(exe).size / 1024 / 1024).toFixed(1)
  console.log(`✓ מנוע הנגינה כבר קיים (${mb} MB)`)
  process.exit(0)
}

if (process.platform !== 'win32') {
  console.log('· הסקריפט הזה בונה עבור Windows בלבד')
  process.exit(0)
}

fs.mkdirSync(outDir, { recursive: true })
const archive = path.join(outDir, 'engine.7z')

/*
 * שלושים מגה מ-GitHub נופלים באמצע לא מעט. הסקריפט הזה רץ אצל כל
 * מי שמתקין, ולכן ניסיון בודד הוא באג בהמתנה.
 */
console.log('▸ מוריד את mpv…')
let downloaded = false
for (let attempt = 1; attempt <= 4 && !downloaded; attempt++) {
  try {
    const res = await fetch(URL, { redirect: 'follow' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    fs.writeFileSync(archive, Buffer.from(await res.arrayBuffer()))
    downloaded = true
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err)
    if (attempt === 4) {
      console.error(`✕ ההורדה נכשלה אחרי ארבעה ניסיונות: ${why}`)
      console.error(`  אפשר להוריד ידנית מ-${URL} ולחלץ ל-${outDir}`)
      process.exit(1)
    }
    console.log(`  ניסיון ${attempt} נכשל (${why}) — מנסה שוב…`)
    await new Promise((r) => setTimeout(r, attempt * 3000))
  }
}
console.log(`  ${(fs.statSync(archive).size / 1024 / 1024).toFixed(1)} MB`)

/*
 * ה-tar של Windows הוא bsdtar עם libarchive, והוא מחלץ 7z לבד.
 * זה חוסך תלות התקנה ב-7-Zip אצל כל מי שבונה.
 */
console.log('▸ מחלץ…')
const tmp = path.join(outDir, '_x')
fs.rmSync(tmp, { recursive: true, force: true })
fs.mkdirSync(tmp, { recursive: true })
/*
 * נתיבים יחסיים ו-cwd, ולא נתיבים מלאים בשורת הפקודה.
 * בנתיב הפרויקט יש עברית, ו-Windows ממיר ארגומנטים לדף הקוד המקומי —
 * "סרטים" הגיע ל-tar כ-"?????" והחילוץ נכשל. את ה-cwd עצמו Node מעביר
 * ב-Unicode תקין, ולכן זה עובד.
 */
execFileSync(
  path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe'),
  ['-xf', path.basename(archive), '-C', path.basename(tmp)],
  { cwd: outDir }
)

const found = findFile(tmp, 'mpv.exe')
if (!found) {
  console.error('✕ mpv.exe לא נמצא בארכיון')
  process.exit(1)
}

for (const old of fs.readdirSync(outDir)) {
  if (old === '_x' || old === 'engine.7z') continue
  fs.rmSync(path.join(outDir, old), { recursive: true, force: true })
}

fs.copyFileSync(found, exe)
let bytes = fs.statSync(exe).size

// ספריות נלוות, אם הבנייה מפוצלת
for (const entry of fs.readdirSync(path.dirname(found))) {
  if (!/\.dll$/i.test(entry)) continue
  const dest = path.join(outDir, entry)
  fs.copyFileSync(path.join(path.dirname(found), entry), dest)
  bytes += fs.statSync(dest).size
}

/*
 * ---------- רישיון: חובה, לא נחמדות ----------
 *
 * הבנייה של shinchiro אינה כוללת שום קובץ רישיון — רק מדריך וסקריפטים
 * של התקנה. בדקתי את הארכיון כולו. mpv הוא GPL, וההפצה חייבת לשאת את
 * נוסח הרישיון, ולכן מביאים אותו ממאגר המקור של mpv עצמו.
 */
const licDir = path.join(outDir, 'LICENSES')
fs.mkdirSync(licDir, { recursive: true })
let licenses = 0
const MPV_RAW = 'https://raw.githubusercontent.com/mpv-player/mpv/master'
for (const name of ['LICENSE.GPL', 'LICENSE.LGPL', 'Copyright']) {
  try {
    const r = await fetch(`${MPV_RAW}/${name}`, { redirect: 'follow' })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    fs.writeFileSync(path.join(licDir, name), await r.text(), 'utf8')
    licenses++
  } catch (err) {
    console.error(`✕ לא הצלחתי להביא את ${name}: ${err instanceof Error ? err.message : err}`)
    console.error('  אסור להפיץ בלי הרישיון. תקן את זה לפני בנייה להפצה.')
    process.exit(1)
  }
}
fs.writeFileSync(
  path.join(licDir, 'מקור.txt'),
  [
    'מנוע הנגינה כאן הוא mpv, בבנייה של shinchiro/mpv-winbuild-cmake.',
    '',
    `הבנייה: ${FILE}`,
    'קוד המקור והרישיון: https://github.com/shinchiro/mpv-winbuild-cmake',
    'קוד המקור של mpv עצמו: https://github.com/mpv-player/mpv',
    '',
    'בית הקולנוע מפעילה את mpv כתוכנית נפרדת ואינה מקשרת אליו.',
    'נוסח הרישיון הובא ממאגר המקור של mpv — הבנייה עצמה אינה כוללת אותו.',
    ''
  ].join('\n'),
  'utf8'
)

fs.rmSync(tmp, { recursive: true, force: true })
fs.rmSync(archive, { force: true })
console.log(`✓ מנוע הנגינה מוכן (${(bytes / 1024 / 1024).toFixed(1)} MB · ${licenses} קובצי רישיון)`)

function findFile(dir, name) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const hit = findFile(p, name)
      if (hit) return hit
    } else if (entry.name.toLowerCase() === name) {
      return p
    }
  }
  return null
}

