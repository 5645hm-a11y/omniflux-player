import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

/**
 * קובץ הבדיקה נוצר על ידי המנוע עצמו, ולא נשמר במאגר.
 *
 * השם בכוונה קשה: עברית, מקף ארוך, סוגריים, אמפרסנד, רווחים וסימן
 * שאינו ASCII. אם משהו בשרשרת ממיר לדף קוד מקומי, הוא יישבר כאן.
 */
export const NASTY_NAME = 'סרט עברי – מבחן [2026] & רווחים ✓.mp4'

export function enginePath(root: string): string {
  return path.join(root, 'resources', 'engine', 'mpv.exe')
}

export function makeFixture(root: string, seconds = 30): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cinema-fx-'))
  const out = path.join(dir, NASTY_NAME)
  execFileSync(
    enginePath(root),
    [
      `av://lavfi:testsrc2=size=640x360:rate=25:duration=${seconds}`,
      '--no-config',
      `--audio-file=av://lavfi:sine=frequency=440:duration=${seconds}`,
      '--ovc=libx264',
      '--oac=aac',
      // הפלט נקבע ב-cwd עם שם יחסי: הנתיב מכיל עברית, ותוכניות
      // שקוראות argv ב-ANSI הופכות אותה לסימני שאלה
      `--o=${NASTY_NAME}`
    ],
    { cwd: dir, stdio: 'ignore' }
  )
  if (!fs.existsSync(out)) throw new Error('קובץ הבדיקה לא נוצר')
  return out
}

/**
 * קובץ שמע בלבד, בלי שום מסלול וידאו.
 *
 * נחוץ כדי לבדוק את המעבר בין סרט לשיר: זה המקרה שבו רשימת
 * המסלולים של הקובץ הקודם עוד לא הוחלפה, ומי שמסתמך עליה חושב
 * שהשיר הוא סרט.
 */
export function makeAudioFixture(root: string, seconds = 20): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cinema-au-'))
  const name = 'שיר עברי – מבחן.m4a'
  execFileSync(
    enginePath(root),
    [
      `av://lavfi:sine=frequency=330:duration=${seconds}`,
      '--no-config',
      '--oac=aac',
      `--o=${name}`
    ],
    { cwd: dir, stdio: 'ignore' }
  )
  const out = path.join(dir, name)
  if (!fs.existsSync(out)) throw new Error('קובץ השמע לא נוצר')
  return out
}
