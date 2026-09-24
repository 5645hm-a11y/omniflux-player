import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * טקסט מקודד בקוד אינו מתורגם לעולם.
 *
 * זו הדליפה הקלה ביותר: מוסיפים הודעת שגיאה אחת בעברית, הכול עובד,
 * ומשתמש צרפתי מקבל אותה כמו שהיא. נמצאו כך 30 מחרוזות אחרי שהממשק
 * כבר "תורגם במלואו".
 */

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')

/** אותיות עברית או ערבית — שתי השפות שבוודאות אינן קוד. */
const NON_LATIN = /[֐-׿؀-ۿ]/
const LITERAL = /'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`/g

/**
 * מסיר הערות לפני הסריקה.
 *
 * בדיקת "שורה שמתחילה בכוכבית" אינה מספיקה: הערת JSX רב-שורתית
 * נראית כך —
 *
 *   {\/*
 *     טקסט חופשי, ובתוכו "מרכאות"
 *   *\/}
 *
 * והשורה האמצעית אינה מתחילה בשום סימן. מרכאות בתוכה נקראו כמחרוזת
 * ממשק, והבדיקה נפלה על ההסבר של עצמה.
 */
function stripComments(text: string): string[] {
  let inBlock = false
  /*
   * הפיצול מנקה גם את ה-CR.
   *
   * בקבצים עם סופי שורה של Windows, `//.*$` אינו תופס כלום: נקודה
   * אינה מתאימה ל-CR, ולכן `$` אינו מגיע לסוף — וההערה נשארה, על
   * המרכאות שבתוכה. הבדיקה נפלה על הערות שלה עצמה.
   */
  return text.split(/\r?\n/).map((raw) => {
    let line = raw
    if (inBlock) {
      const end = line.indexOf('*/')
      if (end < 0) return ''
      line = line.slice(end + 2)
      inBlock = false
    }
    // הערת בלוק שנפתחת ואינה נסגרת באותה שורה
    const open = line.indexOf('/*')
    if (open >= 0) {
      const close = line.indexOf('*/', open + 2)
      if (close < 0) {
        inBlock = true
        line = line.slice(0, open)
      } else {
        line = line.slice(0, open) + line.slice(close + 2)
      }
    }
    return line.replace(/\/\/.*$/, '')
  })
}

/**
 * שמות שקיימים על הדיסק, ואינם טקסט שמוצג למשתמש.
 *
 * תיקיית הנתונים של הגרסה הישנה נקראת כך במחשב של המשתמש. תרגום
 * שלה היה שולח את המעבר לחפש תיקייה שאינה קיימת.
 */
const ON_DISK = new Set(['בית הקולנוע'])

/** קבצים שבהם טקסט לא-לטיני הוא תוכן לגיטימי ולא מחרוזת ממשק. */
const ALLOWED = ['i18n', '__tests__', 'legacy_services']

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (ALLOWED.some((a) => full.includes(a))) continue
    if (entry.isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

test('אין מחרוזות ממשק מקודדות מחוץ למילונים', () => {
  const offenders: string[] = []
  for (const file of walk(path.join(root, 'src'))) {
    const lines = stripComments(fs.readFileSync(file, 'utf8'))
    lines.forEach((line, i) => {
      for (const m of line.matchAll(LITERAL)) {
        const value = m[1] ?? m[2] ?? m[3]
        if (value && NON_LATIN.test(value) && !ON_DISK.has(value)) {
          offenders.push(`${path.relative(root, file).replace(/\\/g, '/')}:${i + 1}  ${value.slice(0, 50)}`)
        }
      }
    })
  }
  expect(offenders, `מחרוזות שיגיעו למשתמש בלי תרגום:\n${offenders.join('\n')}`).toEqual([])
})

/**
 * מפתח מטמון התמונות חייב לכלול שפה.
 *
 * בלעדיה כרזה שנשמרה בשפה אחת נשארת לנצח — הקובץ קיים, הבדיקה
 * מוצאת אותו, ואף אחד לא מוריד את הגרסה החדשה. נצפה בפועל: ממשק
 * בערבית עם לוגו בעברית וכרזות בצרפתית, על אותו מסך.
 */
test('מפתחות מטמון התמונות כוללים את השפה', () => {
  const files = ['src/main/services/hub.ts', 'src/core/metadata/index.ts']
  const offenders: string[] = []
  for (const rel of files) {
    const text = fs.readFileSync(path.join(root, rel), 'utf8')
    text.split('\n').forEach((line, i) => {
      const call = /(?:cacheImage|cachePoster)\([^)]*`([^`]+)`/.exec(line)
      if (!call) return
      if (!/\$\{(lang|deps\.locale)\}/.test(call[1])) {
        offenders.push(`${rel}:${i + 1}  ${call[1]}`)
      }
    })
  }
  expect(offenders, `מפתח בלי שפה:\n${offenders.join('\n')}`).toEqual([])
})

/**
 * הפלטה הישנה אינה חוזרת בדלת האחורית.
 *
 * שם צבע שנשאר בקובץ אחד שורד כל בנייה בשקט: Tailwind פשוט לא
 * מייצר את המחלקה, והרכיב מאבד את צבעו בלי שגיאה. אחרי מעבר פלטה
 * זה בדיוק מה שקורה, ורק צילום מסך חושף אותו.
 */
test('לא נותרו טוקנים של הפלטה הקודמת', () => {
  const dead = ['amber', 'gold', 'bone', 'ink-950', 'ink-1000', 'fl-lg', 'fl-64', 'glass-deep']
  const offenders: string[] = []
  for (const file of walk(path.join(root, 'src', 'renderer'))) {
    const lines = stripComments(fs.readFileSync(file, 'utf8'))
    lines.forEach((line, i) => {
      for (const token of dead) {
        if (line.includes(token)) {
          offenders.push(`${path.relative(root, file).replace(/\\/g, '/')}:${i + 1}  ${token}`)
        }
      }
    })
  }
  expect(offenders, `טוקנים מתים:\n${offenders.join('\n')}`).toEqual([])
})

/**
 * הייחוס המשפטי קיים בכל השפות.
 *
 * תנאי השימוש של TMDB מחייבים אזכור JustWatch לצד נתוני הזמינות,
 * והצהרה שהתוכנה אינה מאושרת על ידה. אי-עמידה עלולה לשלול את
 * המפתח — ואיתו הכרזות, המטא-דאטה והזמינות.
 */
test('נוסח הייחוס מזכיר את JustWatch ואת TMDB בכל שפה', async () => {
  const { DICTS, LOCALES } = await import('../index')
  for (const { code } of LOCALES) {
    const text = (DICTS[code] as unknown as { legal: { attribution: string } }).legal.attribution
    expect(text, `${code}: חסר JustWatch`).toContain('JustWatch')
    expect(text, `${code}: חסר TMDB`).toContain('TMDB')
  }
})

/**
 * מילון בלי מפתחות מתים.
 *
 * מפתח שאיש אינו קורא לו אינו נראה בממשק, ולכן איש אינו מגלה שהוא
 * מיותר — אבל הוא נשאר בשמונה מילונים, ומי שמוסיף שפה מתרגם אותו.
 * נמצאו כך 15: מסך פתיחה שהוסר, כפתורי חלון שהוחלפו, ושתי שורות
 * ייחוס שהתאחדו לאחת.
 *
 * מפתח שנבנה בזמן ריצה — ‎t(`power.${id}`)‎ — אינו מופיע בקוד כמחרוזת
 * שלמה, ולכן קבוצה שנבנית כך נחשבת בשימוש במלואה.
 */
test('אין מפתחות שאיש אינו קורא להם', () => {
  const fr = fs.readFileSync(path.join(root, 'src/shared/i18n/locales/fr.ts'), 'utf8')
  const defined = new Set<string>()
  let group: string | null = null
  for (const line of fr.replace(/\r\n/g, '\n').split('\n')) {
    const open = /^ {2}([a-zA-Z]+): \{/.exec(line)
    if (open) {
      group = open[1]
      continue
    }
    if (/^ {2}\},?$/.test(line)) {
      group = null
      continue
    }
    if (!group) continue
    for (const key of line.matchAll(/(?:^\s+|,\s*)["']?([a-zA-Z0-9_]+)["']?:/g)) defined.add(`${group}.${key[1]}`)
  }

  const used = new Set<string>()
  const built = new Set<string>()
  const sources = [...walk(path.join(root, 'src')), ...walk(path.join(root, 'tests'))]
  for (const file of sources) {
    const text = fs.readFileSync(file, 'utf8')
    for (const m of text.matchAll(/["'`]([a-zA-Z]+\.[a-zA-Z0-9_]+)["'`]/g)) used.add(m[1])
    for (const m of text.matchAll(/["'`]([a-zA-Z]+)\.[a-zA-Z0-9_]*\$\{/g)) built.add(m[1])
  }

  const dead = [...defined].filter((key) => !used.has(key) && !built.has(key.split('.')[0])).sort()
  expect(dead, `מפתחות שאין להם קורא:\n${dead.join('\n')}`).toEqual([])
})
