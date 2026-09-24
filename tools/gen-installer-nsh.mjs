/**
 * מייצר את build/installer.nsh מתוך electron-builder.yml.
 *
 * שתי בעיות אמיתיות שהמאקרו המובנה של electron-builder לא פותר:
 *
 * 1. הוא דורס את השיוך הקודם ואינו מחזיר אותו בהסרה. מי שמסיר את
 *    OmniFlux היה נשאר עם ‎.mp4 שמצביע על ProgId שכבר לא קיים —
 *    כלומר הנגן הקודם שלו מפסיק להיות ברירת המחדל. אומת בהתקנה
 *    אמיתית: כל 20 הסיומות איבדו את VLC.
 *
 * 2. בלי Capabilities ו-RegisteredApplications התוכנה אינה מופיעה
 *    כראוי במסך "אפליקציות ברירת מחדל" של Windows. מאז Windows 8
 *    רק המשתמש יכול לקבוע ברירת מחדל, ולכן המסך הזה הוא הדרך
 *    היחידה — והתוכנה חייבת להופיע בו.
 *
 * הרשימה נקראת מתצורת הבנייה כדי שלא תיווצר רשימה שלישית שתיפרד
 * מהשתיים הקיימות.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

/** קורא את קבוצות השיוך מ-electron-builder.yml. */
export function readAssociations(yml = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8')) {
  const groups = []
  const re = /^ {2}- ext: \[([^\]]+)\]\r?\n {4}name: (.+?)\r?\n {4}description: (.+?)\r?\n/gm
  for (const m of yml.matchAll(re)) {
    groups.push({
      ext: m[1].split(',').map((s) => s.trim()),
      name: m[2].trim(),
      description: m[3].trim()
    })
  }
  if (groups.length === 0) throw new Error('לא נמצאו שיוכי קבצים ב-electron-builder.yml')
  return groups
}

export function render(groups) {
  const all = groups.flatMap((g) => g.ext.map((e) => ({ ext: e, progId: g.name })))
  const L = []
  const w = (s = '') => L.push(s)

  w('; נוצר על ידי tools/gen-installer-nsh.mjs — אין לערוך ידנית.')
  w('; המקור הוא fileAssociations ב-electron-builder.yml.')
  w('')
  w('!define OMNI_BACKUP_KEY "Software\\OmniFlux Player\\AssocBackup"')
  w('')

  /*
   * הצילום חייב לרוץ לפני registerFileAssociations, ולכן הוא יושב
   * ב-customInit ולא ב-customInstall: סדר ההרצה הוא שיוכים ואז
   * customInstall, וכשזה רץ הערך הקודם כבר נמחק.
   */
  w('!macro customInit')

  /*
   * הסרת "בית הקולנוע" לפני ההתקנה.
   *
   * זו אותה תוכנה שנבנתה מחדש, אבל מזהה היישום שלה שונה
   * (com.avisharabi.beithakolnoa מול com.avisharabi.omniflux). מבחינת
   * Windows אלה שני מוצרים, ולכן בלי השורות האלה המשתמש היה מקבל
   * התקנה שנייה לצד הישנה — שתי תוכנות בתפריט התחל, שני סמלים, ושתי
   * ספריות שיוכי קבצים שנלחמות זו בזו.
   *
   * ההסרה שקטה ומחכה לסיום (`_?=` מכריח את המסיר לרוץ בתהליך הנוכחי
   * במקום להעתיק את עצמו ולחזור מיד). נתוני המשתמש אינם נמחקים:
   * המסיר הישן נבנה עם deleteAppDataOnUninstall כבוי.
   *
   * שני פרטים שנמדדו על התקנה אמיתית של 1.6.1, ובלעדיהם השלב הזה
   * היה נכשל בשקט:
   *
   *   · שם תת-המפתח הוא המזהה **בלי סוגריים מסולסלים**. ניסיון
   *     ראשון עטף אותו ב-{} לפי המקובל ב-MSI, וקריאה כזאת פשוט
   *     אינה מוצאת דבר.
   *   · המזהה נמדד ולא חושב. ‏electron-builder גוזר אותו מ-appId
   *     בזמן הבנייה, ואף צירוף סביר של UUID v5 לא שחזר את הערך
   *     שברישום — ערך שנמדד עדיף על ערך שנגזר "כנראה נכון".
   *
   * שתי צורות השם נבדקות בכל זאת, כי גרסאות electron-builder שונות
   * כתבו את המפתח אחרת, ובדיקה מיותרת אחת זולה מהתקנה כפולה.
   *
   * הכישלון כאן אינו עוצר: משתמש שכבר הסיר את הישנה, או שנשאר אצלו
   * מפתח יתום בלי קובץ מסיר — וכזה נמצא בפועל — עדיין זכאי להתקין.
   */
  const OLD_ID = '11905866-38ea-515c-805e-83a90b0ab429'
  w('  ; --- הסרת "בית הקולנוע", אם היא מותקנת ---')
  for (const rootKey of ['HKCU', 'HKLM']) {
    for (const name of [OLD_ID, `{${OLD_ID}}`]) {
      const key = `Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${name}`
      w(`  ReadRegStr $R0 ${rootKey} "${key}" "UninstallString"`)
      w('  ${If} $R0 != ""')
      w(`    ReadRegStr $R1 ${rootKey} "${key}" "InstallLocation"`)
      w('    ${If} $R1 != ""')
      w('      ExecWait \'"$R0" /S _?=$R1\'')
      w('    ${Else}')
      w('      ExecWait \'"$R0" /S\'')
      w('    ${EndIf}')
      w('  ${EndIf}')
    }
  }
  w('')

  for (const { ext, progId } of all) {
    w(`  ReadRegStr $0 SHELL_CONTEXT "Software\\Classes\\.${ext}" ""`)
    // התקנה חוזרת או עדכון: הערך כבר שלנו, והגיבוי הקיים הוא הנכון
    w(`  \${If} $0 != "${progId}"`)
    w(`  \${AndIf} $0 != ""`)
    w(`    WriteRegStr SHELL_CONTEXT "\${OMNI_BACKUP_KEY}" "${ext}" "$0"`)
    w('  ${EndIf}')
  }
  w('!macroend')
  w('')

  /*
   * Capabilities הוא מה שמאפשר ל-Windows להציג את התוכנה במסך
   * "אפליקציות ברירת מחדל". בלעדיו המשתמש אינו יכול לבחור בה כלל.
   */
  w('!macro customInstall')
  w('  WriteRegStr SHELL_CONTEXT "Software\\OmniFlux Player\\Capabilities" "ApplicationName" "OmniFlux Player"')
  w('  WriteRegStr SHELL_CONTEXT "Software\\OmniFlux Player\\Capabilities" "ApplicationDescription" "OmniFlux Player"')
  w('  WriteRegStr SHELL_CONTEXT "Software\\OmniFlux Player\\Capabilities" "ApplicationIcon" "$INSTDIR\\${APP_EXECUTABLE_FILENAME},0"')
  for (const { ext, progId } of all) {
    w(`  WriteRegStr SHELL_CONTEXT "Software\\OmniFlux Player\\Capabilities\\FileAssociations" ".${ext}" "${progId}"`)
  }
  w('  WriteRegStr SHELL_CONTEXT "Software\\RegisteredApplications" "OmniFlux Player" "Software\\OmniFlux Player\\Capabilities"')
  w('!macroend')
  w('')

  /*
   * ההסרה מחזירה את השיוך הקודם. unregisterFileAssociations של
   * electron-builder רץ אחרי customUnInstall ואינו נוגע בערך
   * ברירת המחדל, ולכן השחזור כאן שורד אותו.
   */
  w('!macro customUnInstall')
  w('  ${ifNot} ${isUpdated}')
  for (const { ext, progId } of all) {
    w(`    ReadRegStr $0 SHELL_CONTEXT "\${OMNI_BACKUP_KEY}" "${ext}"`)
    w(`    ReadRegStr $1 SHELL_CONTEXT "Software\\Classes\\.${ext}" ""`)
    // רק אם השיוך עדיין שלנו — משתמש ששינה אותו בינתיים לא ייפגע
    w(`    \${If} $1 == "${progId}"`)
    w('      ${If} $0 != ""')
    w(`        WriteRegStr SHELL_CONTEXT "Software\\Classes\\.${ext}" "" "$0"`)
    w('      ${Else}')
    w(`        DeleteRegValue SHELL_CONTEXT "Software\\Classes\\.${ext}" ""`)
    w('      ${EndIf}')
    w('    ${EndIf}')
  }
  w('    DeleteRegValue SHELL_CONTEXT "Software\\RegisteredApplications" "OmniFlux Player"')
  w('    DeleteRegKey SHELL_CONTEXT "Software\\OmniFlux Player"')
  w('  ${endIf}')
  w('!macroend')
  w('')

  return L.join('\r\n')
}

const target = path.join(root, 'build', 'installer.nsh')

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const text = render(readAssociations())
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const before = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null
  fs.writeFileSync(target, text)
  console.log(before === text ? '= installer.nsh ללא שינוי' : '✓ installer.nsh נוצר מחדש')
}

export { target }
