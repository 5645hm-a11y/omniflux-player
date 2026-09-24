import type { SpotifyDevice } from '@shared/api'
import { usePlayer } from '../store/player'

/**
 * הפעלת פריט.
 *
 * ‏URI של Spotify אינו קובץ שאפשר לתת ל-mpv. הוא נשלח למכשיר
 * Web Playback המבודד של OmniFlux, שמפענח את הרצועה המלאה ב-Widevine.
 */
export async function activate(target: {
  itemId?: string
  playUri?: string
  fallbackPlayUri?: string
  providerTrackId?: string
  deezerPremium?: boolean
  externalUrl?: string
  origin?: string
  source?: string
  id?: string
  title?: string
  subtitle?: string
  poster?: string | null
  sourceLabel?: string
  queueUris?: string[]
}): Promise<{ ok: boolean; reason?: string }> {
  const pauseSpotify = async (): Promise<void> => {
    const state = await window.cinema.spotify.state().catch(() => null)
    if (state?.active && !state.paused) await window.cinema.spotify.pause()
  }
  const loadMusic = async (uri: string, provider?: string): Promise<void> => {
    await pauseSpotify()
    usePlayer.getState().preferMpv()
    const artist = target.subtitle?.split(/\s*[·•]\s*/)[0]?.trim()
    await window.cinema.player.load({
      target: uri,
      mediaId: target.id,
      title: target.title,
      artist,
      cover: target.poster,
      provider,
      playbackMode: provider === 'Deezer' ? 'preview' : 'full'
    })
  }
  // A catalog object is descriptive video metadata. Even if malformed provider
  // data happens to contain an audio-shaped URI, it must never reach Spotify.
  if (target.origin === 'catalog' || target.source === 'catalog') {
    return { ok: false, reason: 'needs-details' }
  }
  if (target.itemId) {
    await pauseSpotify()
    usePlayer.getState().preferMpv()
    try {
      await window.cinema.player.playItem(target.itemId)
      return { ok: true }
    } catch (error) {
      usePlayer.getState().reportError(error)
      return { ok: false, reason: 'playback-failed' }
    }
  }
  if (target.playUri?.startsWith('spotify:')) {
    const local = await window.cinema.player.state()
    if (local.path && !local.paused) await window.cinema.player.playPause()
    const connected = await window.cinema.spotify.connected()
    const result = connected
      ? await window.cinema.spotify.play(target.playUri, target.queueUris)
      : { ok: false, reason: 'not-connected' }
    if (result.ok) usePlayer.getState().preferSpotify()
    // Spotify failures are never hidden behind a 30-second preview. A Free or
    // disconnected account gets the explicit subscription/connect UI instead.
    return result
  }
  if (target.playUri) {
    if (target.origin === 'music' || target.source === 'music') {
      await loadMusic(target.playUri, target.sourceLabel)
    } else {
      await window.cinema.player.load(target.playUri)
    }
    return { ok: true }
  }
  if (target.sourceLabel === 'Deezer' && target.providerTrackId) {
    const account = target.deezerPremium
      ? { connected: true, tier: 'premium' as const }
      : await window.cinema.deezer.account().catch(() => null)
    if (account?.connected && account.tier === 'premium') {
      usePlayer.getState().preferDeezer({
        id: target.providerTrackId,
        title: target.title,
        artist: target.subtitle?.split(/\s*[·•]\s*/)[0]?.trim(),
        cover: target.poster
      })
      const local = await window.cinema.player.state()
      if (local.path && !local.paused) await window.cinema.player.playPause()
      await window.cinema.spotify.pause().catch(() => false)
      const ok = await window.cinema.deezer.play(target.providerTrackId)
      if (ok) {
        return { ok: true }
      }
    }
    // Deezer's documented Free/on-demand entitlement is a 30-second extract.
    // The public preview remains in-app and is never mislabeled as a full track.
    if (target.playUri) {
      await loadMusic(target.playUri, 'Deezer')
      return { ok: true, reason: account?.connected ? 'preview-only' : 'login-for-full' }
    }
  }
  if ((target.origin === 'music' || target.source === 'music') && target.externalUrl) {
    return { ok: false, reason: 'not-playable' }
  }
  /*
   * כותר שאינו אצלנו אינו נפתח בדפדפן.
   *
   * הוא מבקש כרטיס פרטים בתוך התוכנה, והמודאל הוא זה שמציע את
   * הקישורים לשירותים. שליחה ישירה לדף TMDB עונה על שאלה אחרת
   * מזו שהמשתמש שאל.
   */
  return { ok: false, reason: 'needs-details' }
}

/** הודעה למשתמש לפי סיבת הכישלון */
export function reasonKey(reason?: string): 'spotify.noDevice' | 'spotify.premiumRequired' | 'spotify.notConnected' | 'spotify.failed' | 'status.spotifyDrm' {
  if (reason === 'no-device') return 'spotify.noDevice'
  // אחרי שספוטיפיי דחתה את הרישיון, כל לחיצה חוזרת עם הסיבה הזו — והיא ראויה להסבר, לא ל"נכשל"
  if (reason === 'drm-license') return 'status.spotifyDrm'
  if (reason === 'premium-required') return 'spotify.premiumRequired'
  if (reason === 'not-connected') return 'spotify.notConnected'
  return 'spotify.failed'
}

export type { SpotifyDevice }
