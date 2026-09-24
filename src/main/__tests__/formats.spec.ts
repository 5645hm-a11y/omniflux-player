import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AUDIO_EXT, MEDIA_EXT, VIDEO_EXT, mediaFromArgv } from '../formats'

/**
 * השיוכים במתקין והקוד חייבים להסכים.
 *
 * הם לא הסכימו: המתקין תפס ‎.mpg, ‎.mpeg, ‎.m2ts, ‎.ogg, ‎.wav ו-‎.aac,
 * והקוד לא זיהה אף אחד מהם. לחיצה כפולה על קובץ כזה הייתה פותחת נגן
 * ריק — בלי שגיאה, בלי הודעה, בלי שום סימן שמשהו השתבש.
 */

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

/** קורא את רשימות הסיומות מתצורת הבנייה. */
function configured(): { video: string[]; audio: string[] } {
  const yml = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8')
  const lists = [...yml.matchAll(/^ {2}- ext: \[([^\]]+)\]/gm)].map((m) =>
    m[1].split(',').map((s) => s.trim())
  )
  expect(lists.length, 'שתי קבוצות שיוך: וידאו ואודיו').toBe(2)
  return { video: lists[0], audio: lists[1] }
}

test('רשימת הווידאו זהה בקוד ובמתקין', () => {
  expect([...VIDEO_EXT].sort()).toEqual(configured().video.sort())
})

test('רשימת האודיו זהה בקוד ובמתקין', () => {
  expect([...AUDIO_EXT].sort()).toEqual(configured().audio.sort())
})

test('כל סיומת שהמתקין תופס באמת נפתחת', () => {
  const { video, audio } = configured()
  for (const ext of [...video, ...audio]) {
    const file = `C:\\Users\\דוד\\סרטים\\סרט לדוגמה.${ext}`
    expect(mediaFromArgv([file]), `${ext} לא זוהה`).toBe(file)
  }
})

test('מתגים אינם נחשבים לקובץ, גם כשיש בהם סיומת מדיה', () => {
  // Electron מוסיף מתגים משלו; נתיב בתוך מתג אינו קובץ לנגינה
  expect(mediaFromArgv(['--user-data-dir=C:\\x\\data.mp4'])).toBeNull()
  expect(mediaFromArgv(['--inspect', '--lang=he'])).toBeNull()
})

test('נבחר הקובץ ולא נתיב התוכנה', () => {
  const clip = 'D:\\מדיה\\הסנדק 1972.mkv'
  expect(mediaFromArgv(['C:\\Program Files\\OmniFlux\\OmniFlux Player.exe', clip])).toBe(clip)
})

test('הזיהוי אדיש לאותיות גדולות', () => {
  expect(mediaFromArgv(['movie.MKV'])).toBe('movie.MKV')
  expect(mediaFromArgv(['song.FLAC'])).toBe('song.FLAC')
})

test('סיומת שאינה מדיה אינה נפתחת', () => {
  expect(mediaFromArgv(['readme.txt', 'notes.pdf', 'archive.zip'])).toBeNull()
})

test('סיומת דומה אינה נתפסת בטעות', () => {
  // "x.mp42" אינו mp4, ו-"mp4" בלי נקודה אינו סיומת בכלל
  expect(mediaFromArgv(['clip.mp42'])).toBeNull()
  expect(mediaFromArgv(['mp4'])).toBeNull()
})

test('אין כפילויות ברשימת הסיומות', () => {
  expect(new Set(MEDIA_EXT).size).toBe(MEDIA_EXT.length)
})

/**
 * הסרת ההתקנה אינה משאירה את המשתמש בלי נגן.
 *
 * המאקרו המובנה של electron-builder דורס את השיוך הקודם ואינו
 * מחזיר אותו. אומת בהתקנה אמיתית על מחשב שבו VLC היה ברירת המחדל:
 * כל 20 הסיומות איבדו אותו. installer.nsh מצלם את הערך הקודם לפני
 * הדריסה ומחזיר אותו בהסרה.
 */
test('installer.nsh מסונכרן עם תצורת הבנייה', async () => {
  const { readAssociations, render, target } = await import('../../../tools/gen-installer-nsh.mjs')
  const onDisk = fs.readFileSync(target, 'utf8')
  expect(onDisk, 'הרץ: node tools/gen-installer-nsh.mjs').toBe(render(readAssociations()))
})

test('כל סיומת מגובה לפני הדריסה ומוחזרת בהסרה', async () => {
  const { readAssociations, render } = await import('../../../tools/gen-installer-nsh.mjs')
  const nsh = render(readAssociations())
  const { video, audio } = configured()
  for (const ext of [...video, ...audio]) {
    expect(nsh, `${ext} אינו מגובה`).toContain(`"\${OMNI_BACKUP_KEY}" "${ext}"`)
    expect(nsh, `${ext} אינו מוחזר`).toContain(`ReadRegStr $0 SHELL_CONTEXT "\${OMNI_BACKUP_KEY}" "${ext}"`)
  }
})

test('התוכנה נרשמת כדי להופיע במסך ברירות המחדל של Windows', async () => {
  const { readAssociations, render } = await import('../../../tools/gen-installer-nsh.mjs')
  const nsh = render(readAssociations())
  // בלי אלה אי אפשר לבחור את OmniFlux כברירת מחדל — מאז Windows 8
  // רק המשתמש קובע, והמסך הזה הוא הדרך היחידה
  expect(nsh).toContain('Software\\RegisteredApplications')
  expect(nsh).toContain('Capabilities\\FileAssociations')
})
