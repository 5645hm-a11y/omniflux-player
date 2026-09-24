import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { LibraryFolder } from '../../shared/api'
import {
  foldersToImport,
  migrateFromOldApp,
  oldSettingsFile,
  type MigrationMark,
  type OldSettings
} from '../services/migrate'
import type { Kv } from '../../legacy_services/ports'

/**
 * מעבר מ"בית הקולנוע".
 *
 * הגרסה הישנה מותקנת אצל כ-1,000 משתמשים, והמתקין מסיר אותה. כל מה
 * שהם בנו בעצמם הוא רשימת תיקיות הדרייב — ובלי המעבר הם פותחים
 * ספרייה ריקה ומחפשים שוב קישור שהגדירו פעם אחת לפני חודשים.
 *
 * הבדיקה עובדת על הפורמט האמיתי של 1.x, כפי שהוא נקרא מהתקנה חיה.
 */

const ROOT = '1AaBbCcDdEeFfGgHhIiJjKkLlMmNn'
const USER = '1ZzYyXxWwVvUuTtSsRrQqPpOoNnMm'

/** התצורה של 1.x, על כל השדות שלה — גם אלה שאין להם מקום בחדשה */
const OLD: OldSettings & Record<string, unknown> = {
  googleApiKey: 'key',
  tmdbApiKey: 'key',
  rootFolderId: ROOT,
  downloadPath: 'C:\\Users\\x\\Downloads',
  playbackMode: 'internal',
  autoScanOnLaunch: true,
  setupDone: true,
  shabbatPlace: 'ירושלים',
  userFolders: [{ id: USER, name: 'סרטים 2026', addedAt: 1770000000000 }]
}

test('תיקיות הדרייב של הגרסה הישנה עוברות, עם השם שהמשתמש ראה', () => {
  const added = foldersToImport(OLD, [])
  expect(added.map((f) => f.ref)).toEqual([ROOT, USER])
  expect(added.every((f) => f.source === 'gdrive')).toBe(true)
  expect(added.find((f) => f.ref === USER)?.label).toBe('סרטים 2026')
  // לתיקייה הראשית לא היה שם בגרסה הישנה, ושם ריק אינו תווית
  expect(added.find((f) => f.ref === ROOT)?.label).toBe('Google Drive')
  expect(added.find((f) => f.ref === USER)?.addedAt).toBe(1770000000000)
  expect(new Set(added.map((f) => f.id)).size).toBe(2)
})

test('תיקייה שכבר קיימת בחדשה אינה נוספת פעמיים', () => {
  const existing: LibraryFolder[] = [
    { id: 'x', source: 'gdrive', ref: USER, label: 'כבר כאן', addedAt: 1 }
  ]
  expect(foldersToImport(OLD, existing).map((f) => f.ref)).toEqual([ROOT])
})

test('תיקייה מקומית בחדשה אינה מסתירה מזהה דרייב זהה', () => {
  const existing: LibraryFolder[] = [
    { id: 'x', source: 'local', ref: USER, label: 'מקומית', addedAt: 1 }
  ]
  expect(foldersToImport(OLD, existing).map((f) => f.ref)).toEqual([ROOT, USER])
})

test('תצורה ישנה בלי תיקיות כלל אינה מייצרת דבר', () => {
  expect(foldersToImport({}, [])).toEqual([])
  expect(foldersToImport({ rootFolderId: '', userFolders: [] }, [])).toEqual([])
})

test('מזהה שאינו נראה כמו מזהה של גוגל נדחה', () => {
  const junk: OldSettings = { rootFolderId: 'לא מזהה', userFolders: [{ id: 'short' }, { id: '../../etc' }] }
  expect(foldersToImport(junk, [])).toEqual([])
})

test('אותו מזהה פעמיים בקובץ הישן נכנס פעם אחת', () => {
  const twice: OldSettings = { rootFolderId: ROOT, userFolders: [{ id: ROOT, name: 'שוב' }] }
  expect(foldersToImport(twice, []).map((f) => f.ref)).toEqual([ROOT])
})

/** אחסון בזיכרון, באותו חוזה של הקבצים האמיתיים */
function memory<T>(initial: T): Kv<T> {
  let value = initial
  return { read: () => value, write: (next) => void (value = next) }
}

function oldInstall(settings: OldSettings): string {
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-appdata-'))
  const file = oldSettingsFile(appData)
  expect(file.endsWith(path.join('בית הקולנוע', 'settings.json')), 'נקרא מתיקיית הגרסה הישנה').toBe(true)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(settings), 'utf8')
  return appData
}

test('התקנה חיה של 1.x עוברת אל הספרייה החדשה', () => {
  const appDataDir = oldInstall(OLD)
  const folders = memory<LibraryFolder[]>([])
  const mark = memory<MigrationMark | null>(null)

  expect(migrateFromOldApp({ appDataDir, folders, mark })).toBe(2)
  expect(folders.read().map((f) => f.ref)).toEqual([ROOT, USER])
  expect(mark.read()?.imported).toBe(2)
  fs.rmSync(appDataDir, { recursive: true, force: true })
})

test('תיקייה שהמשתמש הסיר אינה חוזרת בהפעלה הבאה', () => {
  const appDataDir = oldInstall(OLD)
  const folders = memory<LibraryFolder[]>([])
  const mark = memory<MigrationMark | null>(null)
  migrateFromOldApp({ appDataDir, folders, mark })

  // המשתמש מוחק תיקייה שעברה, והתוכנה עולה שוב
  folders.write(folders.read().filter((f) => f.ref !== USER))
  expect(migrateFromOldApp({ appDataDir, folders, mark })).toBe(0)
  expect(folders.read().map((f) => f.ref)).toEqual([ROOT])
  fs.rmSync(appDataDir, { recursive: true, force: true })
})

test('התקנה נקייה בלי גרסה ישנה אינה נכשלת ואינה מוסיפה דבר', () => {
  const appDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-appdata-'))
  const folders = memory<LibraryFolder[]>([])
  const mark = memory<MigrationMark | null>(null)

  expect(migrateFromOldApp({ appDataDir, folders, mark })).toBe(0)
  expect(folders.read()).toEqual([])
  // מסומן גם כשאין מה להעביר, כדי לא לחפש בכל הפעלה
  expect(mark.read()).not.toBe(null)
  fs.rmSync(appDataDir, { recursive: true, force: true })
})

test('קובץ הגדרות פגום אינו מפיל את העלייה', () => {
  const appDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-appdata-'))
  const file = oldSettingsFile(appDataDir)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, '{ לא JSON', 'utf8')

  const folders = memory<LibraryFolder[]>([])
  expect(migrateFromOldApp({ appDataDir, folders, mark: memory<MigrationMark | null>(null) })).toBe(0)
  expect(folders.read()).toEqual([])
  fs.rmSync(appDataDir, { recursive: true, force: true })
})
