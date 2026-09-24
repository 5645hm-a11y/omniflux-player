import { BrowserWindow } from 'electron'
import path from 'node:path'
import { SurfaceOrigin } from './surface-origin'
import { jsonStore } from './storage'
import type { ProviderAccount, DeezerPlaybackState } from '../../shared/api'

type Stored = { connected: boolean; tier: ProviderAccount['tier']; displayName: string | null }
const store = jsonStore<Stored>('deezer-account.json', { connected: false, tier: 'unknown', displayName: null })

function normalizeAccount(value: unknown, configured = true): ProviderAccount {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const tier = row.tier === 'premium' || row.tier === 'free' ? row.tier : 'unknown'
  return {
    provider: 'deezer',
    configured,
    connected: Boolean(row.connected),
    tier,
    displayName: typeof row.displayName === 'string' ? row.displayName.slice(0, 120) : null
  }
}

/** Official Deezer JavaScript SDK hosted in an isolated, persistent Electron session. */
export class DeezerWebPlaybackService {
  private window: BrowserWindow | null = null
  private ready: Promise<void> | null = null
  private appId = ''
  private readonly origin = new SurfaceOrigin(path.join(__dirname, '../renderer'))

  configure(appId: string): void { this.appId = appId.trim() }
  isConnected(): boolean { return Boolean(this.appId && store.read().connected) }

  private createWindow(): BrowserWindow {
    const win = new BrowserWindow({
      show: false,
      skipTaskbar: true,
      width: 720,
      height: 720,
      title: 'OmniFlux Deezer',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false,
        partition: 'persist:omniflux-deezer'
      }
    })
    win.webContents.setWindowOpenHandler(() => ({
      action: 'allow',
      overrideBrowserWindowOptions: { skipTaskbar: true, autoHideMenuBar: true, width: 520, height: 720 }
    }))
    const rendererUrl = process.env.ELECTRON_RENDERER_URL
    this.ready = rendererUrl
      ? win.loadURL(`${rendererUrl}/deezer-player.html`)
      // מקור אמיתי, מאותה סיבה בדיוק כמו במשטח של Spotify
      : this.origin.url().then((base) => win.loadURL(`${base}deezer-player.html`))
    return win
  }

  private async surface(): Promise<BrowserWindow | null> {
    if (!this.appId) return null
    const win = this.window && !this.window.isDestroyed() ? this.window : this.createWindow()
    this.window = win
    await this.ready
    const ok = await win.webContents.executeJavaScript(`window.omnifluxDeezer.initialize(${JSON.stringify(this.appId)})`, true)
    return ok ? win : null
  }

  async account(): Promise<ProviderAccount> {
    const win = await this.surface()
    if (!win) return { provider: 'deezer', configured: false, connected: false, tier: 'unknown', displayName: null }
    try {
      const result = normalizeAccount(await win.webContents.executeJavaScript('window.omnifluxDeezer.account()', true))
      store.write({ connected: result.connected, tier: result.tier, displayName: result.displayName })
      return result
    } catch {
      const cached = store.read()
      return { provider: 'deezer', configured: true, connected: cached.connected, tier: cached.tier, displayName: cached.displayName }
    }
  }

  async connect(): Promise<ProviderAccount> {
    const win = await this.surface()
    if (!win) return { provider: 'deezer', configured: false, connected: false, tier: 'unknown', displayName: null }
    win.show()
    win.focus()
    try {
      const result = normalizeAccount(await win.webContents.executeJavaScript('window.omnifluxDeezer.connect()', true))
      store.write({ connected: result.connected, tier: result.tier, displayName: result.displayName })
      return result
    } finally {
      if (!win.isDestroyed()) win.hide()
    }
  }

  async disconnect(): Promise<void> {
    const win = await this.surface()
    if (win) await win.webContents.executeJavaScript('window.omnifluxDeezer.disconnect()', true).catch(() => undefined)
    store.write({ connected: false, tier: 'unknown', displayName: null })
  }

  async play(trackId: string): Promise<boolean> {
    const win = await this.surface()
    if (!win || !/^\d{1,20}$/.test(trackId)) return false
    return Boolean(await win.webContents.executeJavaScript(`window.omnifluxDeezer.play(${JSON.stringify(trackId)})`, true).catch(() => false))
  }

  async control(command: 'pause' | 'resume' | 'seek', value?: number): Promise<boolean> {
    const win = await this.surface()
    if (!win) return false
    return Boolean(await win.webContents.executeJavaScript(
      `window.omnifluxDeezer.control(${JSON.stringify(command)}, ${Number.isFinite(value) ? Number(value) : 'undefined'})`, true
    ).catch(() => false))
  }

  async state(): Promise<DeezerPlaybackState> {
    const empty: DeezerPlaybackState = { active: false, paused: true, position: 0, duration: 0, trackId: null, title: null, artist: null, cover: null }
    const win = await this.surface()
    if (!win) return empty
    return await win.webContents.executeJavaScript('window.omnifluxDeezer.state()', true).catch(() => empty) as DeezerPlaybackState
  }

  destroy(): void {
    if (this.window && !this.window.isDestroyed()) this.window.destroy()
    this.window = null
    this.ready = null
  }
}
