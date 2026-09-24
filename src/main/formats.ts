/**
 * הסיומות שהתוכנה מטפלת בהן — מקור אמת אחד.
 *
 * הרשימה הזאת הייתה כתובה בשלושה מקומות: מסנני הדיאלוג, זיהוי הקובץ
 * בשורת הפקודה, ושיוכי הקבצים במתקין. הן נפרדו: המתקין תפס 19
 * סיומות ובשורת הפקודה זוהו 13. התוצאה היא הכישלון השקט הגרוע
 * ביותר — לחיצה כפולה על ‎.mpg פותחת את הנגן, ולא קורה כלום.
 *
 * הבדיקה ב-formats.spec.ts משווה את הקובץ הזה ל-electron-builder.yml,
 * כך שהוספת סיומת במקום אחד בלבד תיפול.
 */

export const VIDEO_EXT = [
  'mp4', 'mkv', 'avi', 'mov', 'webm', 'm4v', 'ts', 'm2ts', 'flv', 'wmv', 'mpg', 'mpeg'
] as const

export const AUDIO_EXT = ['mp3', 'flac', 'm4a', 'opus', 'ogg', 'wav', 'aac', 'wma'] as const

export const MEDIA_EXT: readonly string[] = [...VIDEO_EXT, ...AUDIO_EXT]

export const SUBTITLE_EXT = ['srt', 'ass', 'ssa', 'vtt', 'sub', 'idx'] as const

/**
 * מאתר קובץ מדיה בשורת הפקודה.
 *
 * Electron מעביר גם מתגים משלו, ולכן לא מספיק לקחת את הארגומנט
 * הראשון: מתג כמו ‎--user-data-dir=C:\x.mp4 אינו קובץ לנגינה.
 */
export function mediaFromArgv(argv: readonly string[]): string | null {
  for (const arg of argv) {
    if (arg.startsWith('-')) continue
    const dot = arg.lastIndexOf('.')
    if (dot < 0) continue
    if (MEDIA_EXT.includes(arg.slice(dot + 1).toLowerCase())) return arg
  }
  return null
}
