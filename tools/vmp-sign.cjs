/**
 * חתימת VMP לייצור, אחרי האריזה.
 *
 * ‏Spotify מסרבת לתת רישיון Widevine לנגן שאין לו חתימת VMP לייצור.
 * נמדד מול חשבון Premium אמיתי, 2026-09-23:
 *
 *   · Electron מ-node_modules — "Certificate is valid for development only",
 *     ו-widevine-license מחזיר 500.
 *   · 2.0.3 המותקן — "InvalidSignature": electron-builder משנה את שם
 *     electron.exe ל-"OmniFlux Player.exe", והחתימה שהגיעה מ-CastLabs
 *     (electron.exe.sig) כבר אינה של הקובץ הזה. widevine-license מחזיר 403.
 *
 * בשני המקרים: אפס צליל, בכל שיר. לכן החתימה נעשית כאן, על החבילה
 * הסופית, ואחריה אימות — ובנייה שהאימות שלה נכשל נעצרת. שחרור בלי
 * חתימה תקינה הוא Spotify שבור אצל כל המשתמשים, בשקט.
 *
 * ‏afterSign ולא afterPack: ב-Windows חתימת Authenticode משנה את קובץ
 * ההפעלה, ולכן חתימת VMP חייבת לבוא אחריה.
 *
 * הגדרה חד-פעמית (חשבון EVS של CastLabs, חינם):
 *   python -m pip install --upgrade castlabs-evs
 *   python -m castlabs_evs.account signup
 * אחר כך הכלי זוכר את ההתחברות. בסביבה בלי זיכרון: EVS_ACCOUNT_NAME ו-EVS_PASSWD.
 *
 * ‏OMNIFLUX_SKIP_VMP=1 מדלג במפורש — לבניית בדיקה בלבד, לעולם לא לשחרור.
 */
const { spawnSync } = require('node:child_process')
const path = require('node:path')

function evs(args) {
  const python = process.env.PYTHON || 'python'
  const result = spawnSync(python, ['-m', 'castlabs_evs.vmp', '-n', ...args], {
    encoding: 'utf8',
    // נתיב הפרויקט בעברית; בלי זה פייתון נופל בהדפסה ב-cp1252
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }
  })
  return { ok: result.status === 0, output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(), missing: Boolean(result.error) }
}

exports.default = async function vmpSign(context) {
  if (context.electronPlatformName !== 'win32') return
  const dir = context.appOutDir
  if (process.env.OMNIFLUX_SKIP_VMP === '1') {
    console.warn(`\n  ⚠ VMP: דילוג מפורש (OMNIFLUX_SKIP_VMP=1). Spotify לא ינגן בבנייה הזו: ${dir}\n`)
    return
  }

  const credentials = process.env.EVS_ACCOUNT_NAME && process.env.EVS_PASSWD
    ? ['-A', process.env.EVS_ACCOUNT_NAME, '-P', process.env.EVS_PASSWD]
    : []
  /*
   * החתימה מעלה את קובץ ההפעלה כולו (כ-225 מגה) לשרת של CastLabs, בכל
   * בנייה. נמדד כאן: 0.6 מגה בשנייה, כלומר כשש דקות וחצי — ובריצה
   * איטית יותר פג אסימון ההעלאה באמצע (ExpiredToken) והבנייה נעצרה.
   * לכן: חלקים במקביל כדי לקצר את ההעלאה, זמן נדיב, וניסיון חוזר —
   * כל ניסיון מקבל חריץ העלאה ואסימון חדשים.
   */
  const args = ['sign-pkg', '--upload-timeout', '3600', '--sign-timeout', '600', '--multipart-max-concurrency', '8', ...credentials, dir]
  let signed = evs(args)
  for (let attempt = 2; !signed.ok && !signed.missing && attempt <= 3; attempt++) {
    console.warn(`  • VMP: ניסיון ${attempt} — ${signed.output.split('\n').pop()}`)
    signed = evs(args)
  }
  if (!signed.ok) {
    throw new Error([
      'VMP: החתימה נכשלה, והבנייה נעצרת — בלי חתימה Spotify אינו מנגן אצל אף משתמש.',
      signed.missing ? 'פייתון לא נמצא (PYTHON=... לנתיב אחר).' : signed.output.split('\n').slice(-6).join('\n'),
      'הגדרה חד-פעמית: python -m pip install --upgrade castlabs-evs && python -m castlabs_evs.account signup',
      'לבניית בדיקה בלבד: OMNIFLUX_SKIP_VMP=1'
    ].join('\n'))
  }

  const verified = evs(['verify-pkg', dir])
  if (!verified.ok) {
    throw new Error(`VMP: החבילה נחתמה אבל האימות נכשל:\n${verified.output.split('\n').slice(-4).join('\n')}`)
  }
  console.log(`  • VMP: נחתם ואומת — ${path.basename(dir)}`)
}
