import { userToken } from './spotify-auth'
import type { SpotifyDevice, SpotifyPlaybackState, SpotifyRepeatMode, SpotifyTrack } from '../../shared/api'
import { mapTrack } from './spotify-music'

/**
 * ניגון דרך Spotify Connect, כולל מכשיר Web Playback מבודד של OmniFlux.
 *
 * מכשיר שהגיע מ־SpotifyWebPlaybackService נשלח ישירות גם לפני שהוא
 * מופיע ברשימת המכשירים של Web API. אם סביבת Electron אינה תומכת
 * ב־EME, שכבת ה־renderer נופלת ל־Deezer Preview או לקישור הרצועה.
 */

const API = 'https://api.spotify.com/v1'

async function call(path: string, init?: RequestInit): Promise<Response | null> {
  const token = await userToken()
  if (!token) return null
  try {
    return await fetch(`${API}${path}`, {
      ...init,
      headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` }
    })
  } catch {
    return null
  }
}

/** המכשירים שהחשבון רואה כרגע */
export async function devices(): Promise<SpotifyDevice[]> {
  const res = await call('/me/player/devices')
  if (!res?.ok) return []
  const body = (await res.json()) as {
    devices?: Array<{ id: string | null; name: string; type: string; is_active: boolean }>
  }
  return (body.devices ?? [])
    .filter((d): d is { id: string; name: string; type: string; is_active: boolean } => Boolean(d.id))
    .map((d) => ({ id: d.id, name: d.name, type: d.type, active: d.is_active }))
}

/**
 * מעביר רצועה למכשיר.
 *
 * בלי מכשיר פעיל אין לאן לשלוח, ולכן במקרה כזה מוחזרת סיבה מפורשת
 * ולא כישלון שקט — "לא קרה כלום" הוא המסר הגרוע ביותר שאפשר לתת.
 */
export async function play(uri: string, deviceId?: string, queueUris?: string[]): Promise<{ ok: boolean; reason?: string }> {
  let target = deviceId
  if (!target) {
    const list = await devices()
    if (list.length === 0) return { ok: false, reason: 'no-device' }
    target = list.find((d) => d.active)?.id ?? list[0].id
  }
  const orderedUris = [uri, ...(queueUris ?? [])]
    .filter((value, index, all) => /^spotify:(track|episode):[\w-]+$/.test(value) && all.indexOf(value) === index)
    .slice(0, 100)
  // Replace the playback context atomically. Adding rows one-by-one through
  // /queue left old manual queue entries behind and could switch to an unrelated
  // song while the newly selected track was still starting.
  const body = JSON.stringify(uri.includes(':track:') ? { uris: orderedUris.length ? orderedUris : [uri] } : { context_uri: uri })
  const start = (): Promise<Response | null> => call(`/me/player/play?device_id=${encodeURIComponent(target!)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body
  })
  /*
   * פקודה אחת, לא שתיים.
   *
   * קודם נשלחה העברה (PUT /me/player) ומיד אחריה ניגון. נמדד מול בנייה
   * חתומה וחשבון Premium: שתי הפקודות מגיעות למכשיר כמעט יחד, ה-SDK
   * מקבל state_conflict שלוש פעמים, מאפס את הנגן — ולא מוריד יותר אף
   * בית של שמע. הרישיון תקף, הסרגל רץ, ואין צליל. בלי ההעברה: אין
   * התנגשות, והשמע יוצא מהרמקולים בתוך שנייה.
   *
   * ‏device_id בבקשת הניגון מספיק כדי להפעיל את המכשיר. העברה נשלחת רק
   * כשהניגון מחזיר 404 — מכשיר שזה עתה נרשם ועדיין אינו מוכר ל-Web API.
   */
  let res = await start()
  if (res?.status === 404) {
    const transfer = await call('/me/player', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_ids: [target], play: false })
    })
    if (!transfer) return { ok: false, reason: 'not-connected' }
    if (transfer.status === 403) return { ok: false, reason: 'premium-required' }
    if (transfer.ok || transfer.status === 204) {
      await new Promise((resolve) => setTimeout(resolve, 150))
      res = await start()
    }
  }

  if (!res) return { ok: false, reason: 'not-connected' }
  // 403 מ-Spotify על נגינה פירושו כמעט תמיד חשבון שאינו Premium
  if (res.status === 403) return { ok: false, reason: 'premium-required' }
  if (res.status === 404) return { ok: false, reason: 'no-device' }
  return res.ok || res.status === 204 ? { ok: true } : { ok: false, reason: `http-${res.status}` }
}

export async function state(): Promise<SpotifyPlaybackState> {
  const empty: SpotifyPlaybackState = {
    active: false,
    paused: true,
    positionMs: 0,
    volume: 100,
    shuffle: false,
    repeat: 'off',
    deviceId: null,
    deviceName: null,
    track: null,
    // מי שמסמן "מתחיל" הוא התהליך הראשי, שיודע מה התבקש
    starting: false
  }
  const res = await call('/me/player')
  if (!res?.ok || res.status === 204) return empty
  const body = (await res.json()) as {
    is_playing?: boolean
    progress_ms?: number
    shuffle_state?: boolean
    repeat_state?: SpotifyRepeatMode
    device?: { id?: string | null; name?: string; volume_percent?: number }
    item?: Parameters<typeof mapTrack>[0]
  }
  return {
    active: Boolean(body.item),
    paused: !body.is_playing,
    positionMs: Math.max(0, body.progress_ms ?? 0),
    volume: Math.max(0, Math.min(100, body.device?.volume_percent ?? 100)),
    shuffle: Boolean(body.shuffle_state),
    repeat: body.repeat_state ?? 'off',
    deviceId: body.device?.id ?? null,
    deviceName: body.device?.name ?? null,
    track: body.item ? mapTrack(body.item) : null,
    starting: false
  }
}

async function command(path: string, method: 'POST' | 'PUT' = 'POST'): Promise<boolean> {
  const res = await call(path, { method })
  return Boolean(res && (res.ok || res.status === 204))
}

export const pause = (): Promise<boolean> => command('/me/player/pause', 'PUT')
export const resume = (): Promise<boolean> => command('/me/player/play', 'PUT')
export const next = (): Promise<boolean> => command('/me/player/next')
export const previous = (): Promise<boolean> => command('/me/player/previous')
export const seek = (positionMs: number): Promise<boolean> =>
  command(`/me/player/seek?position_ms=${Math.max(0, Math.round(positionMs))}`, 'PUT')
export const volume = (value: number): Promise<boolean> =>
  command(`/me/player/volume?volume_percent=${Math.max(0, Math.min(100, Math.round(value)))}`, 'PUT')
export const shuffle = (enabled: boolean): Promise<boolean> =>
  command(`/me/player/shuffle?state=${enabled ? 'true' : 'false'}`, 'PUT')
export const repeat = (mode: SpotifyRepeatMode): Promise<boolean> =>
  command(`/me/player/repeat?state=${encodeURIComponent(mode)}`, 'PUT')

export async function queue(): Promise<SpotifyTrack[]> {
  const res = await call('/me/player/queue')
  if (!res?.ok) return []
  const body = (await res.json()) as { queue?: Array<Parameters<typeof mapTrack>[0]> }
  return (body.queue ?? []).map((track) => mapTrack(track)).filter((track): track is SpotifyTrack => Boolean(track))
}

export async function addToQueue(uri: string): Promise<boolean> {
  if (!/^spotify:(track|episode):[\w-]+$/.test(uri)) return false
  return command(`/me/player/queue?uri=${encodeURIComponent(uri)}`)
}
