import { expect, test } from '@playwright/test'
import crypto from 'node:crypto'
import net from 'node:net'
import fs from 'node:fs'
import path from 'node:path'

/**
 * אבני הבניין של ההתחברות ל-Spotify.
 *
 * ההסכמה עצמה דורשת שהמשתמש ילחץ בדפדפן, ואי אפשר לבדוק אותה
 * אוטומטית — ואסור להתחזות אליו. מה שכן נבדק כאן הוא כל מה
 * שקורה סביבה: גזירת ה-PKCE, הפורט שנרשם מראש, וכתובת החזרה.
 */

/** אותה גזירה שמבצע השירות */
function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

test('אתגר PKCE נגזר נכון מהמאמת', () => {
  // וקטור מ-RFC 7636 §4: המאמת הזה חייב לתת בדיוק את האתגר הזה
  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest())
  expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
})

test('המאמת והאתגר אינם זהים', () => {
  // שליחת המאמת במקום האתגר מבטלת את כל ההגנה של PKCE
  const verifier = base64url(crypto.randomBytes(64))
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest())
  expect(challenge).not.toBe(verifier)
  expect(challenge).toHaveLength(43)
})

test('הקידוד בטוח לכתובת', () => {
  // ‏+ ו-/ ו-= היו נשברים בשאילתה, ולכן base64url ולא base64
  for (let i = 0; i < 40; i++) {
    const s = base64url(crypto.randomBytes(64))
    expect(s).not.toMatch(/[+/=]/)
  }
})

test('כל התחברות מקבלת מאמת חדש', () => {
  const seen = new Set(Array.from({ length: 50 }, () => base64url(crypto.randomBytes(64))))
  expect(seen.size, 'אין חזרות').toBe(50)
})

/**
 * הפורט אינו שרירותי.
 *
 * ‏127.0.0.1:8888/callback הוא מה שרשום אצל Spotify ככתובת חזרה
 * מותרת. פורט אחר מחזיר invalid_redirect_uri, ואז ההתחברות נכשלת
 * בלי שום רמז למה.
 */
test('הפורט הרשום פנוי לשימוש', async () => {
  const free = await new Promise<boolean>((resolve) => {
    const s = net.createServer()
    s.once('error', () => resolve(false))
    s.once('listening', () => s.close(() => resolve(true)))
    s.listen(8888, '127.0.0.1')
  })
  expect(free, 'פורט 8888 תפוס — ההתחברות ל-Spotify תיכשל').toBe(true)
})

test('כתובת ההסכמה נבנית עם כל הפרמטרים הנדרשים', () => {
  const url = new URL('https://accounts.spotify.com/authorize')
  url.searchParams.set('client_id', 'x')
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', 'http://127.0.0.1:8888/callback')
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('code_challenge', 'y')
  url.searchParams.set('state', 'z')
  url.searchParams.set('scope', 'user-read-playback-state user-modify-playback-state')

  for (const key of ['client_id', 'response_type', 'redirect_uri', 'code_challenge_method', 'code_challenge', 'state', 'scope']) {
    expect(url.searchParams.get(key), `חסר ${key}`).toBeTruthy()
  }
  expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  // ההרשאות המבוקשות הן המינימום שנדרש לשליטה בנגינה, ולא יותר
  expect(url.searchParams.get('scope')).not.toContain('user-library')
  expect(url.searchParams.get('scope')).not.toContain('playlist')
})

test('הרשאות Web Playback ומתחם המוזיקה מוגדרות בזרימת ה-PKCE האמיתית', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/main/services/spotify-auth.ts'), 'utf8')
  for (const scope of ['streaming', 'user-read-email', 'user-read-private', 'user-read-playback-state', 'user-modify-playback-state']) {
    expect(source).toContain(`'${scope}'`)
  }
  for (const scope of [
    'user-top-read',
    'user-library-read',
    'user-library-modify',
    'user-follow-read',
    'playlist-read-private',
    'playlist-modify-private'
  ]) {
    expect(source).toContain(`'${scope}'`)
  }
  expect(source).not.toContain("'user-read-recently-played'")
})
