type SpotifyError = { message: string }
type SpotifyPlayer = {
  connect: () => Promise<boolean>
  getCurrentState: () => Promise<{
    paused?: boolean
    position?: number
    track_window?: { current_track?: { uri?: string; linked_from?: { uri?: string | null } } }
  } | null>
  disconnect: () => void
  pause: () => Promise<void>
  resume: () => Promise<void>
  seek: (positionMs: number) => Promise<void>
  previousTrack: () => Promise<void>
  nextTrack: () => Promise<void>
  setVolume: (volume: number) => Promise<void>
  addListener: (event: string, listener: (payload: any) => void) => void
}

type ConnectResult = { deviceId: string | null; reason: string | null }
type PlaybackHealth = { deviceId: string | null; error: string | null; paused: boolean | null; positionMs: number; trackUri: string | null; linkedFromUri: string | null }
type LocalCommand = 'pause' | 'resume' | 'seek' | 'previous' | 'next' | 'volume'

declare global {
  interface Window {
    Spotify?: { Player: new (options: Record<string, unknown>) => SpotifyPlayer }
    onSpotifyWebPlaybackSDKReady?: () => void
    omnifluxSpotify: {
      connect: (token: string) => Promise<ConnectResult>
      disconnect: () => void
      updateToken: (token: string) => void
      control: (command: LocalCommand, value?: number) => Promise<boolean>
      status: () => PlaybackHealth
      health: () => Promise<PlaybackHealth>
    }
  }
}

let sdkPromise: Promise<void> | null = null
let player: SpotifyPlayer | null = null
let deviceId: string | null = null
let currentToken = ''
let lastError: string | null = null
let playbackHealth: Omit<PlaybackHealth, 'deviceId' | 'error'> = { paused: null, positionMs: 0, trackUri: null, linkedFromUri: null }

function loadSdk(): Promise<void> {
  if (window.Spotify) return Promise.resolve()
  if (sdkPromise) return sdkPromise
  sdkPromise = new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('Spotify SDK timeout')), 12_000)
    window.onSpotifyWebPlaybackSDKReady = () => {
      window.clearTimeout(timeout)
      resolve()
    }
    const script = document.createElement('script')
    script.src = 'https://sdk.scdn.co/spotify-player.js'
    script.async = true
    script.onerror = () => {
      window.clearTimeout(timeout)
      reject(new Error('Spotify SDK unavailable'))
    }
    document.head.appendChild(script)
  })
  return sdkPromise
}

/**
 * אירוע פנימי של ה-SDK אינו מפיל את הנגן.
 *
 * ‏‎_getListeners של ה-SDK עושה ‎__spreadArray על ‎_listeners[name]‎ בלי
 * לבדוק שהוא קיים, ולכן אירוע שאיש לא נרשם אליו זורק TypeError בתוך
 * לולאת ההודעות של ה-SDK — וממנה היא אינה מתאוששת: הנגן מפסיק לקבל
 * הודעות, `ready` לעולם אינו מגיע, והמכשיר לא נרשם.
 *
 * זה לא תיאורטי. ‏ACTIVATE_ELEMENT_ERROR הרג כך כל ניגון: המשתמש בחר
 * שיר, הנגן שלנו מעולם לא נרשם, הבקשה נשלחה למכשיר אחר בחשבון,
 * וספוטיפיי דילגה בין שירים בשקט מוחלט.
 *
 * ההגנה כאן היא על התשתית של ה-SDK ולא על אירוע מסוים: כל שם שמגיע
 * מקבל מערך ריק אם אין לו אחד. שמות פנימיים אינם מתועדים ואינם
 * יציבים, ולכן רשימה סגורה של שמות הייתה נשברת שוב בשם הבא.
 */
function guardSdkEvents(instance: SpotifyPlayer): void {
  const proto = Object.getPrototypeOf(instance) as {
    _onEvent?: (...args: unknown[]) => unknown
    __omnifluxGuarded?: boolean
  }
  const onEvent = proto._onEvent
  if (!onEvent || proto.__omnifluxGuarded) return
  proto.__omnifluxGuarded = true
  proto._onEvent = function (this: { _listeners?: Record<string, unknown[]> }, ...args: unknown[]): unknown {
    const first = args[0]
    const name = typeof first === 'string'
      ? first
      : typeof (first as { name?: unknown })?.name === 'string'
        ? (first as { name: string }).name
        : null
    if (name && this._listeners && !this._listeners[name]) this._listeners[name] = []
    return onEvent.apply(this, args)
  }
}

/** השיר שנשלח, כשספוטיפיי ניגנה במקומו גרסה מקבילה שלו (relinking) */
function linkedFrom(track?: { linked_from?: { uri?: string | null } }): string | null {
  const uri = track?.linked_from?.uri
  return typeof uri === 'string' && uri.length < 200 ? uri : null
}

window.omnifluxSpotify = {
  async connect(token: string): Promise<ConnectResult> {
    if (deviceId) return { deviceId, reason: null }
    if (!token || token.length > 4096) return { deviceId: null, reason: 'not-connected' }
    currentToken = token
    try {
      await loadSdk()
      if (!window.Spotify) return { deviceId: null, reason: 'sdk-unavailable' }
      return await new Promise<ConnectResult>((resolve) => {
        let settled = false
        const finish = (value: ConnectResult): void => {
          if (settled) return
          settled = true
          resolve(value)
        }
        const timeout = window.setTimeout(() => finish({ deviceId: null, reason: 'timeout' }), 12_000)
        player = new window.Spotify!.Player({
          name: 'OmniFlux Player',
          volume: 0.8,
          enableMediaSession: true,
          getOAuthToken: (callback: (value: string) => void) => callback(currentToken)
        })
        guardSdkEvents(player)
        player.addListener('ready', ({ device_id }: { device_id: string }) => {
          window.clearTimeout(timeout)
          deviceId = device_id
          finish({ deviceId: device_id, reason: null })
        })
        player.addListener('not_ready', ({ device_id }: { device_id: string }) => {
          if (deviceId === device_id) deviceId = null
        })
        player.addListener('player_state_changed', (state: any) => {
          if (!state) return
          playbackHealth = {
            paused: Boolean(state.paused),
            positionMs: Math.max(0, Number(state.position) || 0),
            trackUri: typeof state.track_window?.current_track?.uri === 'string'
              ? state.track_window.current_track.uri
              : null,
            linkedFromUri: linkedFrom(state.track_window?.current_track)
          }
          if (!state.paused) lastError = null
        })
        player.addListener('playback_error', (error: SpotifyError) => {
          lastError = error?.message || 'Spotify playback error'
          console.error('[spotify-playback]', lastError)
        })
        const failed = (reason: string) => (_error: SpotifyError): void => {
          window.clearTimeout(timeout)
          finish({ deviceId: null, reason })
        }
        player.addListener('initialization_error', failed('embedded-unavailable'))
        player.addListener('authentication_error', failed('not-connected'))
        player.addListener('account_error', failed('premium-required'))
        player.addListener('autoplay_failed', () => finish({ deviceId: null, reason: 'autoplay-failed' }))
        /*
         * אין קריאה ל-activateElement.
         *
         * היא נועדה לעקוף את חסימת ההפעלה האוטומטית של הדפדפן בעזרת
         * מגע של המשתמש — ובמשטח נסתר אין מגע, ולכן היא נכשלה תמיד.
         * החלון נפתח עם autoplayPolicy שמתיר הפעלה בלי מגע, וזה פותר
         * את מה שהיא ניסתה לפתור.
         */
        void player.connect().then((ok) => {
          if (!ok) finish({ deviceId: null, reason: 'connect-failed' })
        })
      })
    } catch {
      return { deviceId: null, reason: 'sdk-unavailable' }
    }
  },
  disconnect(): void {
    player?.disconnect()
    player = null
    deviceId = null
    currentToken = ''
    lastError = null
    playbackHealth = { paused: null, positionMs: 0, trackUri: null, linkedFromUri: null }
  },
  updateToken(token: string): void {
    if (token && token.length <= 4096) currentToken = token
  },
  async control(command: LocalCommand, value?: number): Promise<boolean> {
    if (!player || !deviceId) return false
    try {
      if (command === 'pause') await player.pause()
      else if (command === 'resume') await player.resume()
      else if (command === 'seek') await player.seek(Math.max(0, Math.round(value ?? 0)))
      else if (command === 'previous') await player.previousTrack()
      else if (command === 'next') await player.nextTrack()
      else if (command === 'volume') await player.setVolume(Math.max(0, Math.min(1, value ?? 1)))
      return true
    } catch {
      return false
    }
  },
  status(): PlaybackHealth {
    return { deviceId, error: lastError, ...playbackHealth }
  },
  /**
   * המצב החי של הנגן, ולא ההד האחרון שהגיע באירוע.
   *
   * ‏player_state_changed נשלח על שינויים, ולכן המיקום שבו מתיישן בזמן
   * שהשיר מתנגן יפה. מי שמסיק מהמיקום הזה "תקוע" טועה בדיוק על שיר
   * תקין — וזה מה שקרה: ההתאוששות הכריזה כישלון על ניגון חי, סגרה את
   * חלון הניגון, והקול נעלם באמצע השיר.
   */
  async health(): Promise<PlaybackHealth> {
    const base = { deviceId, error: lastError }
    if (!player) return { ...base, paused: null, positionMs: 0, trackUri: null, linkedFromUri: null }
    const live = await player.getCurrentState().catch(() => null)
    if (!live) return { ...base, ...playbackHealth }
    return {
      ...base,
      paused: Boolean(live.paused),
      positionMs: Math.max(0, Number(live.position) || 0),
      trackUri: typeof live.track_window?.current_track?.uri === 'string'
        ? live.track_window.current_track.uri
        : null,
      linkedFromUri: linkedFrom(live.track_window?.current_track)
    }
  }
}

export {}
