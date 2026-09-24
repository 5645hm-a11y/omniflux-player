import { jsonStore } from './storage'
import { sameProvider } from '../../shared/providers'

/**
 * המנויים של המשתמש.
 *
 * ‏TMDB יודע לומר איפה כותר זמין, אבל לא למה יש למשתמש גישה. בלי
 * המידע הזה "כלול במנוי" הוא הבטחה לכל אחד, וגם למי שאין לו את
 * השירות — וזו בדיוק ההבטחה שמאבדת אמון.
 *
 * השמות נשמרים כפי ש-TMDB מחזיר אותם, כדי שההשוואה תהיה ישירה.
 */

const store = jsonStore<string[]>('subscriptions.json', [])

/** השוואה סלחנית: "Netflix" ו-"netflix" הם אותו שירות */
const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim()

export function subscriptions(): string[] {
  return store.read()
}

/**
 * האם השירות במנוי.
 *
 * וריאנט נחשב אותו שירות: מי שסימן "Netflix" רואה "כלול" גם על
 * כותר שזמין ב-"Netflix Standard with Ads".
 */
export function isSubscribed(provider: string): boolean {
  return store.read().some((s) => sameProvider(s, provider))
}

/** מוסיף או מסיר, ומחזיר את המצב החדש */
export function toggleSubscription(provider: string): boolean {
  const list = store.read()
  const target = norm(provider)
  const without = list.filter((s) => norm(s) !== target)
  const added = without.length === list.length
  store.write(added ? [...without, provider] : without)
  return added
}
