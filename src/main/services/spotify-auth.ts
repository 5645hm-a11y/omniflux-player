import crypto from 'node:crypto'
import http from 'node:http'
import { shell } from 'electron'
import { jsonStore } from './storage'
import type { ProviderAccount } from '../../shared/api'

/**
 * התחברות לחשבון Spotify.
 *
 * זרימת Authorization Code עם PKCE, ולא client credentials: אלה
 * שתי רמות הרשאה שונות לגמרי. אסימון אפליקציה מאפשר חיפוש בקטלוג
 * הציבורי בלבד, ואילו כאן צריך את המשתמש עצמו — רק לו יש מנוי,
 * ורק דרכו אפשר לשלוט בנגינה.
 *
 * הסוד אינו נשלח בהחלפה. PKCE נועד בדיוק לתוכנות שרצות אצל
 * המשתמש, שבהן אין מקום להסתיר סוד — הוא היה יושב בקובץ על הדיסק.
 */

const AUTH = 'https://accounts.spotify.com/authorize'
const TOKEN = 'https://accounts.spotify.com/api/token'
const REDIRECT = 'http://127.0.0.1:8888/callback'

/**
 * ההרשאות המבוקשות, ולא יותר.
 *
 * מעבר לנגן עצמו, מתחם המוזיקה מציג רק מידע שהמשתמש אישר במפורש:
 * Top Items, ספרייה, אמנים ופלייליסטים, ומאפשר יצירת פלייליסטים ושינוי Liked Songs.
 * אין הרשאות להיסטוריית האזנה, תמונת פרופיל, podcasts או העלאת תוכן.
 */
const SCOPE_VERSION = 3
const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-read-currently-playing',
  'user-modify-playback-state',
  'user-top-read',
  'user-library-read',
  'user-library-modify',
  'user-follow-read',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-private',
  'playlist-modify-public'
].join(' ')

interface Stored {
  refreshToken: string | null
  /** נשמר כדי לא לבקש אסימון חדש בכל קריאה */
  accessToken: string | null
  expiresAt: number
  scopeVersion?: number
  tier?: ProviderAccount['tier']
  displayName?: string | null
}

const store = jsonStore<Stored>('spotify.json', {
  refreshToken: null,
  accessToken: null,
  expiresAt: 0,
  scopeVersion: 0,
  tier: 'unknown',
  displayName: null
})

let clientId = ''

export function configure(deps: { clientId: string }): void {
  clientId = deps.clientId
}

export function isConnected(): boolean {
  const state = store.read()
  return Boolean(state.refreshToken && state.scopeVersion === SCOPE_VERSION)
}

export function disconnect(): void {
  store.write({ refreshToken: null, accessToken: null, expiresAt: 0, scopeVersion: 0, tier: 'unknown', displayName: null })
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * פותח את דף ההסכמה וממתין לחזרה.
 *
 * השרת המקומי חי רק למשך ההתחברות ונסגר מיד אחריה — תוכנה שמשאירה
 * פורת פתוח לכל אורך חייה פותחת משטח תקיפה בלי סיבה.
 */
export function connect(): Promise<{ ok: boolean; error?: string }> {
  if (!clientId) return Promise.resolve({ ok: false, error: 'no client id' })

  const verifier = base64url(crypto.randomBytes(64))
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest())
  const state = base64url(crypto.randomBytes(16))

  return new Promise((resolve) => {
    let settled = false
    const done = (result: { ok: boolean; error?: string }): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      server.close()
      resolve(result)
    }

    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', REDIRECT)
      if (url.pathname !== '/callback') {
        res.writeHead(404).end()
        return
      }
      const code = url.searchParams.get('code')
      const returned = url.searchParams.get('state')
      const error = url.searchParams.get('error')

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(
        `<!doctype html><meta charset="utf-8"><body style="background:#08090c;color:#f2f3f5;font:15px system-ui;display:grid;place-items:center;height:100vh;margin:0">
         <p>${error ? 'Spotify: ' + error : 'OmniFlux ✓'}</p></body>`
      )

      if (error) return done({ ok: false, error })
      if (!code || returned !== state) return done({ ok: false, error: 'state mismatch' })

      void exchange(code, verifier).then(listed).then(done)
    })

    server.on('error', (err) => done({ ok: false, error: err.message }))
    // הפורט קבוע כי הוא רשום מראש אצל Spotify כתובת חזרה מותרת
    server.listen(8888, '127.0.0.1', () => {
      const url = new URL(AUTH)
      url.searchParams.set('client_id', clientId)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('redirect_uri', REDIRECT)
      url.searchParams.set('code_challenge_method', 'S256')
      url.searchParams.set('code_challenge', challenge)
      url.searchParams.set('state', state)
      url.searchParams.set('scope', SCOPES)
      void shell.openExternal(url.toString())
    })

    // משתמש שסגר את הדפדפן לא ישאיר את השרת פתוח לנצח
    const timer = setTimeout(() => done({ ok: false, error: 'timeout' }), 180_000)
  })
}

async function exchange(code: string, verifier: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT,
      code_verifier: verifier
    })
  })
  if (!res.ok) return { ok: false, error: `token ${res.status}` }
  const body = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number }
  store.write({
    refreshToken: body.refresh_token,
    accessToken: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000,
    scopeVersion: SCOPE_VERSION,
    tier: 'unknown',
    displayName: null
  })
  return { ok: true }
}

/**
 * אפליקציה של Spotify במצב פיתוח פתוחה רק לחשבונות שבעל האפליקציה הוסיף
 * לרשימה. כל חשבון אחר מקבל התחברות תקינה — ואז 403 על כל בקשה. עדיף
 * לומר את זה מיד, ולא להשאיר חיבור שנראה תקין ואינו מנגן כלום.
 */
async function listed(result: { ok: boolean; error?: string }): Promise<{ ok: boolean; error?: string }> {
  if (!result.ok) return result
  const token = store.read().accessToken
  const response = await fetch('https://api.spotify.com/v1/me', { headers: { Authorization: `Bearer ${token}` } }).catch(() => null)
  if (response?.status !== 403) return result
  disconnect()
  return { ok: false, error: 'unlisted' }
}

/** Subscription level comes from /me and is only available with user-read-private. */
export async function account(): Promise<ProviderAccount> {
  const token = await userToken()
  const cached = store.read()
  if (!token) {
    return { provider: 'spotify', configured: Boolean(clientId), connected: false, tier: 'unknown', displayName: cached.displayName ?? null }
  }
  try {
    const response = await fetch('https://api.spotify.com/v1/me', { headers: { Authorization: `Bearer ${token}` } })
    if (!response.ok) throw new Error(String(response.status))
    const profile = await response.json() as { product?: string; display_name?: string | null }
    const tier: ProviderAccount['tier'] = profile.product === 'premium' ? 'premium' : profile.product ? 'free' : 'unknown'
    store.write({ ...cached, tier, displayName: profile.display_name ?? null })
    return { provider: 'spotify', configured: true, connected: true, tier, displayName: profile.display_name ?? null }
  } catch {
    return { provider: 'spotify', configured: Boolean(clientId), connected: isConnected(), tier: cached.tier ?? 'unknown', displayName: cached.displayName ?? null }
  }
}

/**
 * אסימון תקף, מרוענן כשצריך.
 *
 * מרווח של דקה לפני הפקיעה: בקשה שיוצאת ברגע האחרון עלולה להגיע
 * אחרי שהאסימון כבר פג.
 */
export async function userToken(): Promise<string | null> {
  const s = store.read()
  if (s.scopeVersion !== SCOPE_VERSION) return null
  if (s.accessToken && Date.now() < s.expiresAt - 60_000) return s.accessToken
  if (!s.refreshToken || !clientId) return null

  const res = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: s.refreshToken
    })
  })
  if (!res.ok) {
    // רענון שנכשל פירושו הרשאה שנשללה; עדיף לנתק מאשר לנסות שוב לנצח
    if (res.status === 400) disconnect()
    return null
  }
  const body = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number }
  store.write({
    refreshToken: body.refresh_token ?? s.refreshToken,
    accessToken: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000,
    scopeVersion: SCOPE_VERSION,
    tier: s.tier ?? 'unknown',
    displayName: s.displayName ?? null
  })
  return body.access_token
}
