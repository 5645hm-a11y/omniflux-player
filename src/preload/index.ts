import { contextBridge, ipcRenderer } from 'electron'
import type { Catalog, CinemaApi, EngineState, HubData, ScanProgress, UpdateStatus } from '../shared/api'

/**
 * הגשר. הממשק לא מקבל גישה ל-Node ולא ל-Electron — רק לפונקציות
 * שרשומות כאן, ורק אליהן.
 */

function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_e: Electron.IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: CinemaApi = {
  updates: {
    state: () => ipcRenderer.invoke('updates:state'),
    check: () => ipcRenderer.invoke('updates:check'),
    install: () => ipcRenderer.invoke('updates:install'),
    onState: (cb) => on<UpdateStatus>('updates:state', cb)
  },
  subscriptions: {
    list: () => ipcRenderer.invoke('subs:list'),
    toggle: (provider) => ipcRenderer.invoke('subs:toggle', provider),
    available: () => ipcRenderer.invoke('subs:available')
  },
  spotify: {
    connected: () => ipcRenderer.invoke('spotify:connected'),
    account: () => ipcRenderer.invoke('spotify:account'),
    connect: () => ipcRenderer.invoke('spotify:connect'),
    disconnect: () => ipcRenderer.invoke('spotify:disconnect'),
    devices: () => ipcRenderer.invoke('spotify:devices'),
    play: (uri, queueUris) => ipcRenderer.invoke('spotify:play', uri, queueUris),
    state: () => ipcRenderer.invoke('spotify:state'),
    pause: () => ipcRenderer.invoke('spotify:pause'),
    resume: () => ipcRenderer.invoke('spotify:resume'),
    previous: () => ipcRenderer.invoke('spotify:previous'),
    next: () => ipcRenderer.invoke('spotify:next'),
    seek: (positionMs) => ipcRenderer.invoke('spotify:seek', positionMs),
    volume: (value) => ipcRenderer.invoke('spotify:volume', value),
    shuffle: (enabled) => ipcRenderer.invoke('spotify:shuffle', enabled),
    repeat: (mode) => ipcRenderer.invoke('spotify:repeat', mode),
    queue: () => ipcRenderer.invoke('spotify:queue'),
    addToQueue: (uri) => ipcRenderer.invoke('spotify:addToQueue', uri),
    hub: () => ipcRenderer.invoke('spotify:hub'),
    artist: (id) => ipcRenderer.invoke('spotify:artist', id),
    album: (id) => ipcRenderer.invoke('spotify:album', id),
    toggleLike: (uri, liked) => ipcRenderer.invoke('spotify:toggleLike', uri, liked),
    createPlaylist: (name) => ipcRenderer.invoke('spotify:createPlaylist', name)
  },
  youtube: {
    status: () => ipcRenderer.invoke('youtube:status'),
    search: (query) => ipcRenderer.invoke('youtube:search', query),
    trending: () => ipcRenderer.invoke('youtube:trending'),
    playlist: (link) => ipcRenderer.invoke('youtube:playlist', link),
    cached: (query) => ipcRenderer.invoke('youtube:cached', query)
  },
  deezer: {
    account: () => ipcRenderer.invoke('deezer:account'),
    connect: () => ipcRenderer.invoke('deezer:connect'),
    disconnect: () => ipcRenderer.invoke('deezer:disconnect'),
    play: (trackId) => ipcRenderer.invoke('deezer:play', trackId),
    pause: () => ipcRenderer.invoke('deezer:pause'),
    resume: () => ipcRenderer.invoke('deezer:resume'),
    seek: (seconds) => ipcRenderer.invoke('deezer:seek', seconds),
    state: () => ipcRenderer.invoke('deezer:state')
  },
  music: {
    discovery: () => ipcRenderer.invoke('music:discovery'),
    deezerFallback: (title, artist) => ipcRenderer.invoke('music:deezerFallback', title, artist),
    newReleases: () => ipcRenderer.invoke('music:newReleases')
  },
  search: {
    run: (query) => ipcRenderer.invoke('search:run', query),
    status: () => ipcRenderer.invoke('search:status'),
    openExternal: (url) => ipcRenderer.invoke('search:openExternal', url)
  },
  library: {
    driveAccount: () => ipcRenderer.invoke('library:driveAccount'),
    connectDrive: () => ipcRenderer.invoke('library:connectDrive'),
    disconnectDrive: () => ipcRenderer.invoke('library:disconnectDrive'),
    driveCacheInfo: () => ipcRenderer.invoke('library:driveCacheInfo'),
    clearDriveCache: () => ipcRenderer.invoke('library:clearDriveCache'),
    folders: () => ipcRenderer.invoke('library:folders'),
    addLocalFolder: () => ipcRenderer.invoke('library:addLocalFolder'),
    addDriveFolder: (link) => ipcRenderer.invoke('library:addDriveFolder', link),
    removeFolder: (id) => ipcRenderer.invoke('library:removeFolder', id),
    catalog: () => ipcRenderer.invoke('library:catalog'),
    scan: (opts) => ipcRenderer.invoke('library:scan', opts),
    cancelScan: () => ipcRenderer.invoke('library:cancelScan'),
    scanning: () => ipcRenderer.invoke('library:scanning'),
    onCatalog: (cb) => on<Catalog>('library:catalog', cb),
    onProgress: (cb) => on<ScanProgress>('library:progress', cb)
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    setFullscreen: (enabled) => ipcRenderer.invoke('window:setFullscreen', enabled),
    setPictureInPicture: (enabled) => ipcRenderer.invoke('window:setPictureInPicture', enabled),
    setVideoViewport: (v) => ipcRenderer.send('window:videoViewport', v)
  },
  player: {
    openFile: () => ipcRenderer.invoke('player:openFile'),
    load: (target) => ipcRenderer.invoke('player:load', target),
    playItem: (id) => ipcRenderer.invoke('player:playItem', id),
    playPause: () => ipcRenderer.invoke('player:playPause'),
    seek: (seconds, mode) => ipcRenderer.invoke('player:seek', seconds, mode),
    setVolume: (value) => ipcRenderer.invoke('player:setVolume', value),
    setSpeed: (value) => ipcRenderer.invoke('player:setSpeed', value),
    selectTrack: (type, id) => ipcRenderer.invoke('player:selectTrack', type, id),
    addSubtitle: () => ipcRenderer.invoke('player:addSubtitle'),
    subtitleProvider: () => ipcRenderer.invoke('player:subtitleProvider'),
    searchSubtitles: (languages) => ipcRenderer.invoke('player:searchSubtitles', languages),
    loadOnlineSubtitle: (id) => ipcRenderer.invoke('player:loadOnlineSubtitle', id),
    setSubDelay: (seconds) => ipcRenderer.invoke('player:setSubDelay', seconds),
    setAudioDelay: (seconds) => ipcRenderer.invoke('player:setAudioDelay', seconds),
    setEqualizer: (gains) => ipcRenderer.invoke('player:setEqualizer', gains),
    setAspect: (ratio) => ipcRenderer.invoke('player:setAspect', ratio),
    setVideoAdjustment: (property, value) => ipcRenderer.invoke('player:setVideoAdjustment', property, value),
    setSharpen: (value) => ipcRenderer.invoke('player:setSharpen', value),
    setDeband: (enabled) => ipcRenderer.invoke('player:setDeband', enabled),
    setVideoFit: (mode) => ipcRenderer.invoke('player:setVideoFit', mode),
    resetVideo: () => ipcRenderer.invoke('player:resetVideo'),
    screenshot: () => ipcRenderer.invoke('player:screenshot'),
    state: () => ipcRenderer.invoke('player:state'),
    thumbs: () => ipcRenderer.invoke('player:thumbs'),
    lyrics: () => ipcRenderer.invoke('player:lyrics'),
    lyricsFor: (artist, track, durationSeconds) => ipcRenderer.invoke('player:lyricsFor', artist, track, durationSeconds),
    onState: (cb) => on<EngineState>('player:state', cb),
    onFrame: (cb) => on<Uint8Array>('player:frame', cb),
    onError: (cb) => on<string>('player:error', cb),
    onEnded: (cb) => on<string>('player:ended', cb)
  },
  hub: {
    details: (id) => ipcRenderer.invoke('hub:details', id),
    data: () => ipcRenderer.invoke('hub:data'),
    refresh: () => ipcRenderer.invoke('hub:refresh'),
    onData: (cb) => on<HubData>('hub:data', cb),
    toggleWatchlist: (entry) => ipcRenderer.invoke('hub:toggleWatchlist', entry),
    inWatchlist: (id) => ipcRenderer.invoke('hub:inWatchlist', id)
  },
  app: {
    version: () => ipcRenderer.invoke('app:version'),
    engineReady: () => ipcRenderer.invoke('app:engineReady'),
    locale: () => ipcRenderer.invoke('app:locale'),
    setLocale: (code) => ipcRenderer.invoke('app:setLocale', code),
    openDefaultAppsSettings: () => ipcRenderer.invoke('app:openDefaultAppsSettings'),
    localOnly: () => ipcRenderer.invoke('app:localOnly'),
    setLocalOnly: (value) => ipcRenderer.invoke('app:setLocalOnly', value)
  }
}

contextBridge.exposeInMainWorld('cinema', api)
