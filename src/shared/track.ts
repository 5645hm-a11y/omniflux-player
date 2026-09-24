/**
 * פירוק כותרת רצועה לאמן ולשם.
 *
 * כשאין תגיות בקובץ, mpv מדווח את שם הקובץ עצמו ככותרת — כולל
 * הסיומת. חיפוש מילים ל-"Yellow.mp3" אינו מחזיר דבר, והמסך הציג את
 * הסיומת כשם השיר. שני הצדדים משתמשים באותה פונקציה, כדי שמה
 * שמוצג ומה שמחופש יהיו אותו דבר.
 */

const MEDIA_EXT =
  /\.(mp3|flac|m4a|opus|ogg|wav|aac|wma|mp4|mkv|avi|mov|webm|m4v|ts|m2ts|flv|wmv|mpg|mpeg)$/i

/** מסיר סיומת מדיה, אם יש */
export function stripExtension(name: string): string {
  return name.replace(MEDIA_EXT, '')
}

export interface TrackName {
  artist: string
  track: string
}

/**
 * "Artist - Title" הוא הפורמט הרווח בקבצי אודיו.
 *
 * בלי מקש מפריד הכול נחשב לשם הרצועה, והאמן נשאר ריק — עדיף
 * מלנחש חצי שם. מספר רצועה מוביל ("03 - ...") אינו אמן, ולכן הוא
 * נחתך לפני הפיצול.
 */
export function parseTrackTitle(raw: string): TrackName {
  const clean = stripExtension(raw.trim()).replace(/^\s*\d{1,3}\s*[-.–]\s*/, '')
  const dash = clean.search(/\s[-–—]\s/)
  if (dash < 0) return { artist: '', track: clean.trim() }
  return {
    artist: clean.slice(0, dash).trim(),
    track: clean.slice(dash + 3).trim()
  }
}
