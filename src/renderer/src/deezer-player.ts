type DeezerUser = { id?: number; name?: string; status?: number }
type DeezerLoginResponse = { authResponse?: { accessToken?: string; expire?: number }; user?: DeezerUser }
type DeezerTrack = { id?: number; title?: string; duration?: number; artist?: { name?: string }; album?: { cover_xl?: string; cover_big?: string } }

type DeezerSdk = {
  init: (options: Record<string, unknown>) => void
  login: (callback: (response: DeezerLoginResponse) => void, options: { perms: string }) => void
  logout: () => void
  api: (path: string, callback: (response: DeezerUser) => void) => void
  Event: { subscribe: (event: string, callback: (...args: unknown[]) => void) => void }
  player: {
    playTracks: (ids: number[], index?: number, callback?: (response: unknown) => void) => void
    pause: () => void
    play: () => void
    seek: (percent: number) => void
    setVolume: (volume: number) => void
    isPlaying: () => boolean
    getPosition: () => number
    getDuration: () => number
    getCurrentTrack: () => DeezerTrack | null
  }
}

type Account = { connected: boolean; tier: 'premium' | 'free' | 'unknown'; displayName: string | null }
type State = { active: boolean; paused: boolean; position: number; duration: number; trackId: string | null; title: string | null; artist: string | null; cover: string | null }

declare global {
  interface Window {
    DZ?: DeezerSdk
    omnifluxDeezer: {
      initialize: (appId: string) => Promise<boolean>
      connect: () => Promise<Account>
      account: () => Promise<Account>
      disconnect: () => void
      play: (trackId: string) => Promise<boolean>
      control: (command: 'pause' | 'resume' | 'seek', value?: number) => Promise<boolean>
      state: () => State
    }
  }
}

let initialized = false
let ready: Promise<boolean> | null = null
let account: Account = { connected: false, tier: 'unknown', displayName: null }

function tier(user?: DeezerUser): Account['tier'] {
  if (!user || typeof user.status !== 'number') return 'unknown'
  return user.status >= 2 ? 'premium' : 'free'
}

function loadSdk(): Promise<boolean> {
  if (window.DZ) return Promise.resolve(true)
  return new Promise((resolve) => {
    const script = document.createElement('script')
    const timeout = window.setTimeout(() => resolve(false), 12_000)
    script.src = 'https://e-cdns-files.dzcdn.net/js/min/dz.js'
    script.async = true
    script.onload = () => { window.clearTimeout(timeout); resolve(Boolean(window.DZ)) }
    script.onerror = () => { window.clearTimeout(timeout); resolve(false) }
    document.head.appendChild(script)
  })
}

function currentState(): State {
  const track = window.DZ?.player.getCurrentTrack() ?? null
  return {
    active: Boolean(track?.id),
    paused: !(window.DZ?.player.isPlaying() ?? false),
    position: Math.max(0, window.DZ?.player.getPosition() ?? 0),
    duration: Math.max(0, window.DZ?.player.getDuration() ?? track?.duration ?? 0),
    trackId: track?.id ? String(track.id) : null,
    title: track?.title ?? null,
    artist: track?.artist?.name ?? null,
    cover: track?.album?.cover_xl ?? track?.album?.cover_big ?? null
  }
}

window.omnifluxDeezer = {
  async initialize(appId: string): Promise<boolean> {
    if (initialized) return true
    if (!/^\d{2,20}$/.test(appId)) return false
    if (ready) return ready
    ready = (async () => {
      if (!await loadSdk() || !window.DZ) return false
      await new Promise<void>((resolve) => {
        window.DZ!.init({
          appId,
          channelUrl: new URL('deezer-channel.html', window.location.href).href,
          player: { container: 'dz-root', width: 1, height: 1, onload: resolve }
        })
        window.setTimeout(resolve, 8_000)
      })
      initialized = true
      return true
    })()
    return ready
  },
  async connect(): Promise<Account> {
    if (!initialized || !window.DZ) return account
    return new Promise((resolve) => {
      window.DZ!.login((response) => {
        const connected = Boolean(response.authResponse?.accessToken)
        account = { connected, tier: connected ? tier(response.user) : 'unknown', displayName: response.user?.name ?? null }
        resolve(account)
      }, { perms: 'basic_access,email,offline_access' })
    })
  },
  async account(): Promise<Account> {
    if (!initialized || !window.DZ) return account
    return new Promise((resolve) => {
      window.DZ!.api('/user/me', (user) => {
        const connected = Boolean(user?.id)
        account = { connected, tier: connected ? tier(user) : 'unknown', displayName: user?.name ?? null }
        resolve(account)
      })
    })
  },
  disconnect(): void {
    window.DZ?.logout()
    account = { connected: false, tier: 'unknown', displayName: null }
  },
  async play(trackId: string): Promise<boolean> {
    if (!initialized || !window.DZ || account.tier !== 'premium' || !/^\d{1,20}$/.test(trackId)) return false
    return new Promise((resolve) => {
      let settled = false
      const done = (ok: boolean): void => { if (!settled) { settled = true; resolve(ok) } }
      window.DZ!.player.playTracks([Number(trackId)], 0, () => done(true))
      window.setTimeout(() => done(Boolean(window.DZ?.player.getCurrentTrack()?.id)), 4_000)
    })
  },
  async control(command, value): Promise<boolean> {
    if (!initialized || !window.DZ) return false
    if (command === 'pause') {
      // A short fade avoids the click/pop produced by abruptly suspending the SDK audio graph.
      for (const volume of [70, 40, 15, 0]) {
        window.DZ.player.setVolume(volume)
        await new Promise((resolve) => window.setTimeout(resolve, 18))
      }
      window.DZ.player.pause()
      window.DZ.player.setVolume(80)
    } else if (command === 'resume') {
      window.DZ.player.play()
      window.DZ.player.setVolume(80)
    } else {
      const state = currentState()
      const percent = state.duration > 0 ? Math.max(0, Math.min(100, ((value ?? 0) / state.duration) * 100)) : 0
      window.DZ.player.seek(percent)
    }
    return true
  },
  state: currentState
}

export {}
