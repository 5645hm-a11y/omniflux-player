import type { Session } from 'electron'

/**
 * זיהוי מול YouTube לכל נגן מוטמע.
 *
 * הממשק נטען מ-file://, ודף כזה אינו שולח Referer. ‏YouTube דורש מאז
 * 2025 שכל embed יזהה את האפליקציה שמטמיעה אותו, ובלי זה הנגן מציג
 * "שגיאה 153 — שגיאת תצורה של נגן הווידאו" במקום הסרטון. נמדד כאן:
 * הטריילר והשיר מ-YouTube נפלו שניהם בדיוק כך.
 *
 * הזיהוי הוא אתר המוצר — כתובת אמיתית שלנו, לא התחזות. הוא נוסף רק
 * כשאין Referer בכלל: בקשות מתוך הנגן עצמו כבר נושאות את שלהן.
 *
 * ‏webRequest מחזיק מאזין אחד לכל אירוע בסשן. ‏onBeforeSendHeaders אינו
 * בשימוש במקום אחר; המשטח של Spotify משתמש ב-onCompleted, שהוא אירוע אחר.
 */
export const PRODUCT_SITE = 'https://5645hm-a11y.github.io/beit-hakolnoa-releases/'

export function identifyYouTubeEmbeds(session: Session): void {
  session.webRequest.onBeforeSendHeaders(
    { urls: ['https://www.youtube-nocookie.com/*', 'https://www.youtube.com/*'] },
    (details, callback) => {
      const headers = details.requestHeaders
      if (!headers.Referer && !headers.referer) headers.Referer = PRODUCT_SITE
      callback({ requestHeaders: headers })
    }
  )
}
