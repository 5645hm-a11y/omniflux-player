/**
 * קישור ישיר לכותר בשירות.
 *
 * ‏TMDB מחזיר קישור אחד בלבד — דף JustWatch של הכותר — ולא כתובת
 * לכל ספק בנפרד. שליחת המשתמש לשם פירושה עוד תחנה לפני הצפייה,
 * וזה בדיוק מה שהוא ביקש להימנע ממנו.
 *
 * לכן נבנית כאן כתובת חיפוש בתוך השירות עצמו. זה אינו מזהה הכותר
 * המדויק — אין ממשק ציבורי שמספק אותו — אבל הוא מנחית את המשתמש
 * על הכותר בתוך השירות הנכון, בלחיצה אחת.
 */

/** התאמה לפי שם הספק כפי ש-TMDB מחזיר אותו */
const SERVICES: Array<{ match: RegExp; url: (q: string) => string }> = [
  { match: /^netflix/i, url: (q) => `https://www.netflix.com/search?q=${q}` },
  { match: /^(amazon )?prime video|^amazon video/i, url: (q) => `https://www.primevideo.com/search?phrase=${q}` },
  { match: /^apple tv/i, url: (q) => `https://tv.apple.com/search?term=${q}` },
  { match: /^disney/i, url: (q) => `https://www.disneyplus.com/search?q=${q}` },
  { match: /^(hbo )?max/i, url: (q) => `https://play.max.com/search?q=${q}` },
  { match: /^paramount/i, url: (q) => `https://www.paramountplus.com/search/${q}/` },
  { match: /^canal/i, url: (q) => `https://www.canalplus.com/recherche/?q=${q}` },
  { match: /^ocs/i, url: (q) => `https://www.ocs.fr/recherche?q=${q}` },
  { match: /^molotov/i, url: (q) => `https://www.molotov.tv/search?q=${q}` },
  { match: /^sfr/i, url: (q) => `https://www.sfrplay.fr/recherche?q=${q}` },
  { match: /^google play/i, url: (q) => `https://play.google.com/store/search?q=${q}&c=movies` },
  { match: /^youtube/i, url: (q) => `https://www.youtube.com/results?search_query=${q}` },
  { match: /^rakuten/i, url: (q) => `https://rakuten.tv/search?q=${q}` },
  { match: /^crunchyroll/i, url: (q) => `https://www.crunchyroll.com/search?q=${q}` }
]

/**
 * מחזיר קישור ישיר לשירות, או null כשאין התאמה.
 *
 * ‏null אינו כישלון: הממשק נופל אז לקישור של TMDB, שהוא עדיין
 * טוב יותר מכלום.
 */
export function serviceLink(provider: string, title: string): string | null {
  const q = encodeURIComponent(title)
  return SERVICES.find((s) => s.match.test(provider))?.url(q) ?? null
}

const SIGNUP: Array<{ match: RegExp; url: string }> = [
  { match: /^netflix/i, url: 'https://www.netflix.com/signup' },
  { match: /^(amazon )?prime video|^amazon video/i, url: 'https://www.primevideo.com/offers/nonprimehomepage/ref=dv_web_force_root' },
  { match: /^apple tv/i, url: 'https://tv.apple.com/' },
  { match: /^disney/i, url: 'https://www.disneyplus.com/sign-up' },
  { match: /^(hbo )?max/i, url: 'https://auth.max.com/product-selection' },
  { match: /^paramount/i, url: 'https://www.paramountplus.com/account/signup/pickplan/' },
  { match: /^canal/i, url: 'https://boutique.canalplus.com/' },
  { match: /^crunchyroll/i, url: 'https://www.crunchyroll.com/premium' }
]

/** Official plan/registration destination for providers that expose one publicly. */
export function signupLink(provider: string): string | null {
  return SIGNUP.find((service) => service.match.test(provider))?.url ?? null
}
