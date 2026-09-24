import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { LibraryFolder } from '../../shared/api'
import type { Kv } from '../../legacy_services/ports'

/**
 * מעבר מ"בית הקולנוע" לגרסה הזאת.
 *
 * הגרסה הישנה מותקנת אצל כ-1,000 משתמשים, והמתקין מסיר אותה. מה
 * שהמשתמש בנה בעצמו הוא רשימת תיקיות הדרייב שלו — ורק היא: הקטלוג
 * והמטא-דאטה נבנים מחדש בסריקה, וטוב שכך, כי המבנה שלהם שונה לגמרי.
 * בלי המעבר הזה, מי שמעדכן פותח ספרייה ריקה וצריך למצוא שוב את
 * הקישור לתיקייה שהגדיר פעם אחת לפני חודשים.
 *
 * ההסרה של הגרסה הישנה אינה מוחקת את הנתונים שלה
 * (`deleteAppDataOnUninstall: false`), ולכן הקובץ עדיין שם כשהגרסה
 * החדשה עולה בפעם הראשונה.
 *
 * הקובץ אינו מייבא דבר מ-Electron: תיקיית הנתונים והאחסון מוזרקים,
 * וכך אפשר לבדוק את המעבר על תצורה אמיתית של 1.x בלי להפעיל תוכנה.
 */

const OLD_APP_DIR = 'בית הקולנוע'
export const MARK_FILE = 'migrated-from-1x.json'

/** התצורה של 1.x, בשמות שלה */
export interface OldSettings {
  rootFolderId?: string
  userFolders?: Array<{ id?: string; name?: string; addedAt?: number }>
}

export interface MigrationMark {
  at: number
  imported: number
}

/**
 * התיקיות שיש להוסיף.
 *
 * מזהה שאינו נראה כמו מזהה של גוגל נדחה, וכך גם מזהה שכבר קיים:
 * משתמש שהתקין את החדשה והוסיף תיקייה בעצמו אינו מקבל אותה פעמיים.
 */
export function foldersToImport(old: OldSettings, existing: LibraryFolder[]): LibraryFolder[] {
  const have = new Set(existing.filter((f) => f.source === 'gdrive').map((f) => f.ref))
  const added: LibraryFolder[] = []
  // התיקייה הראשית של הגרסה הישנה, ואחריה התיקיות שהמשתמש הוסיף
  const candidates: OldSettings['userFolders'] = [{ id: old.rootFolderId }, ...(old.userFolders ?? [])]
  for (const candidate of candidates) {
    const ref = (candidate.id ?? '').trim()
    if (!/^[A-Za-z0-9_-]{10,}$/.test(ref) || have.has(ref)) continue
    have.add(ref)
    added.push({
      id: randomUUID(),
      source: 'gdrive',
      ref,
      // השם האמיתי מגיע מגוגל בסריקה הראשונה; עד אז, מה שהמשתמש ראה
      label: (candidate.name ?? '').trim() || 'Google Drive',
      addedAt: typeof candidate.addedAt === 'number' ? candidate.addedAt : Date.now()
    })
  }
  return added
}

/** קובץ ההגדרות של הגרסה הישנה, בתוך תיקיית הנתונים של המשתמש */
export function oldSettingsFile(appDataDir: string): string {
  return path.join(appDataDir, OLD_APP_DIR, 'settings.json')
}

export interface MigrationDeps {
  /** ‏app.getPath('appData') — התיקייה שבה יושבות שתי הגרסאות זו לצד זו */
  appDataDir: string
  folders: Kv<LibraryFolder[]>
  mark: Kv<MigrationMark | null>
}

/**
 * מייבא את תיקיות הדרייב של הגרסה הישנה, אם יש.
 *
 * רץ פעם אחת בלבד, ומסומן בקובץ משלו: משתמש שמחק תיקייה שעברה אינו
 * מקבל אותה בחזרה בהפעלה הבאה. מחזיר כמה יובאו, ואינו זורק — כשל
 * כאן לא יכול למנוע מהתוכנה לעלות.
 */
export function migrateFromOldApp(deps: MigrationDeps): number {
  if (deps.mark.read()) return 0

  let imported = 0
  try {
    const old = JSON.parse(fs.readFileSync(oldSettingsFile(deps.appDataDir), 'utf8')) as OldSettings
    const existing = deps.folders.read()
    const added = foldersToImport(old, existing)
    if (added.length > 0) deps.folders.write([...existing, ...added])
    imported = added.length
  } catch {
    // אין גרסה ישנה, או שהקובץ שלה אינו קריא — אין מה להעביר
  }

  try {
    deps.mark.write({ at: Date.now(), imported })
  } catch {
    /* אם הסימון נכשל, הריצה הבאה תנסה שוב — וכפילויות כבר נמנעות */
  }
  return imported
}
