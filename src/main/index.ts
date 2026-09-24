import { app, BrowserWindow, components, dialog, ipcMain, protocol, session, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { PlayerWindow } from './window/player'
import { LibraryService } from './services/library'
import { AmbientService } from './services/ambient'
import { UpdaterService } from './services/updater'
import { HubService } from './services/hub'
import { artPath, http, jsonStore } from './services/storage'
import { sprite } from './services/thumbs'
import * as subs from './services/subscriptions'
import * as spotifyAuth from './services/spotify-auth'
import * as spotifyConnect from './services/spotify-connect'
import * as spotifyMusic from './services/spotify-music'
import { SpotifyWebPlaybackService } from './services/spotify-web-playback'
import { DeezerWebPlaybackService } from './services/deezer-web-playback'
import { configure as configureLyrics, lyricsFor } from '../adapters/provider-lyrics'
import { VIDEO_EXT, AUDIO_EXT, SUBTITLE_EXT, mediaFromArgv } from './formats'
import { currentLocale, localOnly, openDefaultAppsSettings, setLocale, setLocalOnly, t } from './services/settings'
import type { LocaleCode } from '../shared/i18n'
import type { HubData, LibraryFolder, PlaybackRequest, VideoViewport } from '../shared/api'
import type { SearchGroup } from '../core/search/types'
import { parseTrackTitle } from '../shared/track'
import { OnlineSubtitleService } from './services/online-subtitles'
import * as googleDriveAuth from './services/google-drive-auth'
import { MARK_FILE, migrateFromOldApp, type MigrationMark } from './services/migrate'
import { identifyYouTubeEmbeds } from './services/youtube-embed'
import { YouTubeProvider, type QuotaState, type YouTubeCache } from '../adapters/provider-youtube'

// הכרזות מוגשות דרך סכימה משלנו ולא מ-file://, כדי לא לפתוח לממשק
// גישה לכל הדיסק
protocol.registerSchemesAsPrivileged([
  { scheme: 'art', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

/**
 * מחזור החיים של התוכנה.
 *
 * שלב 01: חלון אחד, מנוע אחד, וקובץ מקומי שמתנגן. הספרייה, החיפוש
 * והמטא-דאטה מגיעים בשלבים הבאים ונתלים על אותו חוזה IPC.
 */

let player: PlayerWindow | null = null
const spotifyWebPlayback = new SpotifyWebPlaybackService()
const deezerWebPlayback = new DeezerWebPlaybackService()
const library = new LibraryService()
const updater = new UpdaterService()
const hub = new HubService(library, library.tmdb, library.deezer)
const onlineSubtitles = new OnlineSubtitleService(http)
const youtube = new YouTubeProvider({
  http,
  apiKey: import.meta.env.MAIN_VITE_YOUTUBE_API_KEY ?? '',
  cache: jsonStore<YouTubeCache>('youtube-cache.json', {}),
  quota: jsonStore<QuotaState>('youtube-quota.json', { day: '', searches: 0, exhausted: false })
})
let spotifyPlaybackAttempt = 0
/** השיר שהתבקש וטרם נשמע — הממשק מציג עליו "מתחיל…" */
let spotifyStarting: string | null = null
// חשוף לבדיקות בלבד: הוספת תיקייה עוברת דרך דיאלוג שאי אפשר לשלוט בו מבחוץ
;(app as unknown as { __library: LibraryService }).__library = library
// חשוף לבדיקות: התקדמות צפייה נוצרת רק מנגינה אמיתית לאורך זמן
;(app as unknown as { __hub: HubService }).__hub = hub
// חשוף לבדיקות: מצב המשטח הנסתר של Spotify, שאין לו דרך אחרת לצאת החוצה
;(app as unknown as { __spotifySurface: SpotifyWebPlaybackService }).__spotifySurface = spotifyWebPlayback

// מופע שני היה נותן שני מנועים ושני חלונות על אותו צינור
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    player?.overlay.show()
    player?.overlay.focus()
    // "פתח באמצעות" על תוכנה שכבר רצה
    const file = mediaFromArgv(argv)
    if (file) void player?.engine.load(file)
  })
}

/** מסנני הדיאלוג, בשפה הפעילה ברגע הפתיחה. */
function mediaFilters(): Electron.FileFilter[] {
  return [
    { name: t('dialog.video'), extensions: [...VIDEO_EXT] },
    { name: t('dialog.audio'), extensions: [...AUDIO_EXT] },
    { name: t('dialog.all'), extensions: ['*'] }
  ]
}

/**
 * דואג שהשיר שנבחר באמת יישמע.
 *
 * הניסיון הראשון לנגן במשטח שזה עתה קם נכשל כמעט תמיד: ה-SDK מדווח
 * שגיאת ניגון ומשהה את עצמו על 0:00. נמדד מול חשבון אמיתי — כשמונה
 * שניות של כישלונות, ואז ניגון תקין. מה שהחזיר אותו לחיים היה פקודת
 * "המשך" פשוטה.
 *
 * לכן: בודקים שהשיר הנכון באמת מתקדם, ומבקשים "המשך" כל עוד הוא
 * תקוע. כשזה נכשל עד הסוף — עוברים למכשיר אחר של המשתמש, ואם אין
 * כזה, אומרים לו מה קרה במקום להשאיר מסך ששקט בו.
 *
 * אין כאן הוספה לתור של ספוטיפיי. נוסתה, ונמדדה כמזיקה: התור נשמר
 * בחשבון גם אחרי שהניגון הוחלף, ובפעם הבאה שהניגון נכשל לרגע
 * ספוטיפיי דילגה אל שאריות התור — כלומר בדיוק אותה תקלה שהתחלנו
 * ממנה, רק מהצד השני.
 */
async function recoverPlayback(
  attempt: number,
  uri: string,
  deviceId: string,
  queueUris: string[],
  overlay: Electron.BrowserWindow
): Promise<void> {
  try {
    await runRecovery(attempt, uri, deviceId, queueUris, overlay)
  } finally {
    /*
     * הסימון "מתחיל…" נמחק תמיד.
     *
     * קודם הוא נמחק רק במסלולי הסיום הצפויים, ויציאה מוקדמת השאירה
     * אותו דלוק לנצח. הממשק מתעלם מלחיצות על הכפתור הראשי כל עוד הוא
     * דלוק — ולכן סימון תקוע השתיק את הכפתור גם בסרט מהדרייב, שאין
     * לו שום קשר לספוטיפיי. זה בדיוק "לוחץ המשך ולא קורה כלום".
     */
    if (spotifyStarting === uri) spotifyStarting = null
  }
}

async function runRecovery(
  attempt: number,
  uri: string,
  deviceId: string,
  queueUris: string[],
  overlay: Electron.BrowserWindow
): Promise<void> {
  let lastPosition = -1
  let stuck = 0
  for (let tries = 0; tries < 14; tries++) {
    await new Promise((resolve) => setTimeout(resolve, 1200))
    // לחיצה חדשה של המשתמש מבטלת את ההתאוששות של הקודמת
    if (attempt !== spotifyPlaybackAttempt) return
    // רישיון שנדחה לא ישתנה מהשהיה והמשך — ישר לחלופה
    if (spotifyWebPlayback.licenseRejected()) break
    /*
     * המדידה היא של הנגן עצמו, לא של ה-API של ספוטיפיי.
     *
     * ‏/me/player מדווח באיחור ולפעמים נשאר על 0 בשניות הראשונות, וכך
     * שיר שהתנגן מצוין נמדד כ"תקוע": ההתאוששות השהתה אותו שוב ושוב,
     * ואחרי ארבע-עשרה בדיקות הכריזה כישלון וסגרה את חלון הניגון.
     * מבחוץ זה נראה בדיוק כמו מה שדווח — הקול נעלם באמצע השיר בזמן
     * שסרגל הנגן ממשיך לזוז.
     */
    const health = await spotifyWebPlayback.playbackHealth()
    /*
     * ‏linked_from: ספוטיפיי מחליפה לפעמים שיר בגרסה מקבילה שזמינה
     * באזור של המשתמש, ואז הנגן מדווח URI אחר מזה שנשלח. בלי ההשוואה
     * הזו שיר שמתנגן יפה נחשב "לא השיר שלנו", וההתאוששות משהה וממשיכה
     * אותו כל שנייה וחצי.
     */
    const onTrack = health.trackUri === uri || health.linkedFromUri === uri

    if (onTrack && health.paused === false) {
      const now = health.positionMs
      // התקדמות אמיתית היא הסימן היחיד שהניגון חי
      if (now > lastPosition && now > 0) return
      stuck = now === lastPosition ? stuck + 1 : 0
      lastPosition = now
      if (stuck < 2) continue
    }

    /*
     * התערבות רק כשבאמת תקוע.
     *
     * השהיה ואז המשך מאפסות את מכונת המצבים של ה-SDK, וזו הפעולה
     * היחידה שנמדדה כמחזירה ניגון תקוע לחיים — "המשך" לבדו לא הזיז
     * כלום ב-24 ניסיונות, ופקודת ניגון חדשה רק התחילה את הטעינה
     * מההתחלה ולא נשמע דבר במשך שלושים שניות. אבל התערבות מוקדמת
     * מדי פוגעת דווקא בטעינה תקינה, ולכן קודם נותנים לה הזדמנות.
     */
    stuck = 0
    await spotifyWebPlayback.control('pause').catch(() => false)
    await new Promise((resolve) => setTimeout(resolve, 300))
    if (attempt !== spotifyPlaybackAttempt) return
    await spotifyWebPlayback.control('resume').catch(() => false)
  }

  if (attempt !== spotifyPlaybackAttempt) return
  // מנגן בפועל? אז לא קרה כלום, ואין על מה לוותר
  const live = await spotifyWebPlayback.playbackHealth()
  /*
   * רישיון שנדחה גובר על מה שה-SDK מדווח.
   *
   * נמדד: אחרי דחייה ה-SDK מדווח לרגע "מנגן" עם מיקום חיובי, בלי שום
   * צליל — ולכן הבדיקה הזו לבדה ויתרה על החלופה, והסרגל רץ בשקט.
   */
  const rejected = spotifyWebPlayback.licenseRejected()
  if (!rejected && live.paused === false && live.positionMs > 0) return
  const devices = await spotifyConnect.devices()
  const external = devices.find((device) => device.id !== deviceId && device.active)
    ?? devices.find((device) => device.id !== deviceId)
  await spotifyWebPlayback.markPlaybackFailed(rejected)
  if (external) {
    const fallback = await spotifyConnect.play(uri, external.id, queueUris)
    overlay.webContents.send('player:error', fallback.ok
      ? t('status.spotifyExternalFallback', { name: external.name })
      : t('status.spotifyDrm'))
  } else {
    overlay.webContents.send('player:error', t('status.spotifyDrm'))
  }
}

function registerIpc(p: PlayerWindow): void {
  const { engine, overlay } = p

  ipcMain.handle('window:minimize', () => overlay.minimize())
  ipcMain.handle('window:maximize', () => {
    if (overlay.isMaximized()) overlay.unmaximize()
    else overlay.maximize()
    return overlay.isMaximized()
  })
  ipcMain.handle('window:close', () => app.quit())
  ipcMain.handle('window:setFullscreen', (_e, enabled: boolean) => p.setFullscreen(Boolean(enabled)))
  ipcMain.handle('window:setPictureInPicture', (_e, enabled: boolean) =>
    p.setPictureInPicture(Boolean(enabled))
  )
  /*
   * הממשק הוא שיודע איפה יש מקום פנוי לווידאו — סרגל צד, סרגל נגן,
   * או מסך מלא. הוא מודד ושולח; כאן רק מעבירים לחלון.
   */
  ipcMain.on('window:videoViewport', (_e, v: VideoViewport) => p.setVideoViewport(v))

  // קובץ שנפתח ישירות אינו פריט בספרייה, ואין למי לשמור התקדמות
  ipcMain.handle('player:openFile', async () => {
    hub.markPlaying(null)
    const res = await dialog.showOpenDialog(overlay, {
      title: t('dialog.chooseFile'),
      properties: ['openFile'],
      filters: mediaFilters()
    })
    const file = res.canceled ? null : (res.filePaths[0] ?? null)
    if (file) await engine.load(file)
    return file
  })
  ipcMain.handle('player:load', (_e, input: string | PlaybackRequest) => {
    hub.markPlaying(null)
    // קובץ מקומי שמתחיל — ספוטיפיי כבר אינה מה שמתחיל כאן
    spotifyStarting = null
    if (typeof input === 'string') return engine.load(input)
    if (!input || typeof input.target !== 'string' || input.target.length > 4096) {
      throw new Error('Invalid playback request')
    }
    const short = (value: unknown, max = 300): string | undefined =>
      typeof value === 'string' && value.length <= max ? value : undefined
    return engine.load(input.target, {
      mediaId: short(input.mediaId, 200),
      title: short(input.title),
      artist: short(input.artist),
      cover: short(input.cover, 4096) ?? null,
      provider: short(input.provider, 60),
      playbackMode: input.playbackMode === 'preview' || input.playbackMode === 'full' ? input.playbackMode : undefined
    })
  })
  ipcMain.handle('player:playPause', () => engine.playPause())
  ipcMain.handle('player:seek', (_e, s: number, mode?: 'absolute' | 'relative') => engine.seek(s, mode))
  ipcMain.handle('player:setVolume', (_e, v: number) => {
    if (process.env.OMNIFLUX_AUDIO_DEBUG === '1') console.log('[audio-debug] volume from UI', v)
    return engine.setVolume(v)
  })
  ipcMain.handle('player:setSpeed', (_e, v: number) => engine.setSpeed(v))
  ipcMain.handle('player:selectTrack', (_e, t: 'audio' | 'sub' | 'video', id: number | 'no') =>
    engine.selectTrack(t, id)
  )
  ipcMain.handle('player:addSubtitle', async () => {
    const res = await dialog.showOpenDialog(overlay, {
      title: t('dialog.chooseSubtitle'),
      properties: ['openFile'],
      filters: [{ name: t('dialog.subtitles'), extensions: [...SUBTITLE_EXT] }]
    })
    if (!res.canceled && res.filePaths[0]) await engine.addSubtitle(res.filePaths[0])
  })
  ipcMain.handle('player:subtitleProvider', () => onlineSubtitles.status())
  ipcMain.handle('player:searchSubtitles', (_e, languages: string[]) =>
    onlineSubtitles.search(engine.state.path, Array.isArray(languages) ? languages : [])
  )
  ipcMain.handle('player:loadOnlineSubtitle', async (_e, id: string) => {
    const file = await onlineSubtitles.download(id)
    await engine.addSubtitle(file)
  })
  ipcMain.handle('player:setSubDelay', (_e, s: number) => engine.setSubDelay(s))
  ipcMain.handle('player:setAudioDelay', (_e, s: number) => engine.setAudioDelay(s))
  ipcMain.handle('player:setEqualizer', (_e, gains: number[]) => engine.setEqualizer(gains))
  ipcMain.handle('player:setAspect', (_e, ratio: string) => engine.setAspect(ratio))
  ipcMain.handle(
    'player:setVideoAdjustment',
    (_e, property: 'brightness' | 'contrast' | 'saturation' | 'gamma', value: number) =>
      engine.setVideoAdjustment(property, value)
  )
  ipcMain.handle('player:setSharpen', (_e, value: number) => engine.setSharpen(value))
  ipcMain.handle('player:setDeband', (_e, enabled: boolean) => engine.setDeband(Boolean(enabled)))
  ipcMain.handle('player:setVideoFit', (_e, mode: 'fit' | 'fill' | 'zoom') => engine.setVideoFit(mode))
  ipcMain.handle('player:resetVideo', () => engine.resetVideo())
  ipcMain.handle('player:screenshot', async () => {
    const res = await dialog.showSaveDialog(overlay, {
      title: t('dialog.saveImage'),
      defaultPath: `omniflux-${Date.now()}.jpg`,
      filters: [{ name: t('dialog.image'), extensions: ['jpg'] }]
    })
    if (res.canceled || !res.filePath) return null
    await engine.screenshotTo(res.filePath)
    return res.filePath
  })
  ipcMain.handle('player:state', () => engine.state)
  ipcMain.handle('player:lyrics', () => {
    /*
     * הכותרת מגיעה מהמנוע, ובלי תגיות היא שם הקובץ — כולל הסיומת.
     * חיפוש מילים ל-"Yellow.mp3" אינו מחזיר דבר.
     */
    const { title, artist: metadataArtist, duration } = engine.state
    if (!title) return null
    const parsed = parseTrackTitle(title)
    const artist = metadataArtist ?? parsed.artist
    const track = metadataArtist ? title : parsed.track
    return lyricsFor(artist, track, duration)
  })
  ipcMain.handle('player:thumbs', () => {
    const { path: file, duration } = engine.state
    return file ? sprite(file, duration) : null
  })

  // ---------- עדכונים ----------
  ipcMain.handle('updates:state', () => updater.state())
  ipcMain.handle('updates:check', () => updater.check())
  ipcMain.handle('updates:install', () => updater.install())
  updater.on('state', (st) => send('updates:state', st))

  const visibleHub = (data: HubData): HubData => ({
    ...data,
    rows: data.rows.filter((row) => row.key !== 'music' || deezerWebPlayback.isConnected())
  })
  /*
   * שיר מ-Spotify בלי חשבון מחובר הוא מבוי סתום — הוא יוצא. שיר מ-Deezer
   * נשאר תמיד: בלי חשבון הוא קטע של 30 שניות שמסומן ככזה, וזה מה שמשתמש
   * חדש (או מי שאינו ברשימת Spotify) מקבל מהקטלוג.
   */
  const visibleSearch = (groups: SearchGroup[]): SearchGroup[] => {
    const spotify = spotifyAuth.isConnected()
    return groups.flatMap((group) => {
      if (group.key !== 'music') return [group]
      const results = group.results.filter((result) => result.sourceLabel !== 'Spotify' || spotify)
      return results.length ? [{ ...group, results }] : []
    })
  }

  // ---------- מסך הבית ----------
  ipcMain.handle('hub:data', async () => visibleHub(await hub.data()))
  ipcMain.handle('hub:details', (_e, id: string) => hub.details(id))
  ipcMain.handle('hub:refresh', async () => visibleHub(await hub.refresh()))
  ipcMain.handle('hub:toggleWatchlist', (_e, entry) => hub.toggleWatchlist(entry))
  ipcMain.handle('hub:inWatchlist', (_e, id: string) => hub.inWatchlist(id))
  hub.on('data', (d) => send('hub:data', visibleHub(d)))

  // ---------- מנויים ----------
  ipcMain.handle('subs:list', () => subs.subscriptions())
  ipcMain.handle('subs:toggle', (_e, provider: string) => {
    const added = subs.toggleSubscription(provider)
    // Subscription badges and direct CTAs are part of cached hub cards. Rebuild in
    // the background so Home updates without requiring an application restart.
    hub.invalidate()
    void hub.refresh()
    return added
  })
  ipcMain.handle('player:lyricsFor', (_e, artist: string, track: string, durationSeconds: number) => {
    return lyricsFor(String(artist).slice(0, 200), String(track).slice(0, 300), Math.max(0, Number(durationSeconds) || 0))
  })
  ipcMain.handle('subs:available', () => hub.knownProviders())

  // ---------- Spotify ----------
  ipcMain.handle('spotify:connected', () => spotifyAuth.isConnected())
  ipcMain.handle('spotify:account', () => spotifyAuth.account())
  ipcMain.handle('spotify:connect', async () => {
    const result = await spotifyAuth.connect()
    if (result.ok) {
      spotifyWebPlayback.disconnect()
      void spotifyWebPlayback.ensureDevice()
      hub.invalidate()
      void hub.refresh()
    } else if (result.error === 'unlisted') {
      send('player:error', t('spotify.unlisted'))
    }
    return result
  })
  ipcMain.handle('spotify:disconnect', () => {
    spotifyWebPlayback.disconnect()
    spotifyAuth.disconnect()
    hub.invalidate()
    void hub.refresh()
  })
  ipcMain.handle('spotify:devices', async () => {
    const embedded = await spotifyWebPlayback.ensureDevice()
    const external = await spotifyConnect.devices()
    return [
      ...(embedded ? [{ id: embedded, name: 'OmniFlux Player', type: 'Computer', active: true }] : []),
      ...external.filter((device) => device.id !== embedded)
    ]
  })
  ipcMain.handle('spotify:play', async (_e, uri: string, queueUris?: string[]) => {
    // קלט מהממשק אינו מהימן: URI חסר או משובש מקבל סירוב ברור ולא TypeError בתהליך הראשי
    if (typeof uri !== 'string' || !/^spotify:(track|episode|album|playlist|artist):[\w-]+$/.test(uri)) {
      return { ok: false, reason: 'invalid' }
    }
    if (queueUris !== undefined && !Array.isArray(queueUris)) queueUris = undefined
    const attempt = ++spotifyPlaybackAttempt
    const embedded = await spotifyWebPlayback.ensureDevice()
    if (!embedded) {
      const devices = await spotifyConnect.devices()
      const external = devices.find((device) => device.active) ?? devices[0]
      return external
        ? spotifyConnect.play(uri, external.id, queueUris)
        : { ok: false, reason: spotifyWebPlayback.status().reason ?? 'embedded-unavailable' }
    }
    /*
     * השיר שנבחר, ורק הוא.
     *
     * קודם נשלחה לספוטיפיי רשימה — השיר שנבחר ואחריו כל מה שמתחתיו
     * ברשימה. הניסיון הראשון לנגן נכשל כמעט תמיד (התחלה קרה של
     * המשטח), וספוטיפיי מטפלת בכישלון בדיוק כמו בסיום שיר: היא עוברת
     * לבא בתור. וכך, בלחיצה אחת, המשתמש ראה את השירים מתחלפים לבדם
     * אחד אחרי השני, כולם ב-0:00, בשקט מוחלט — עד שאחד מהם הצליח.
     *
     * עם שיר אחד אין לאן לדלג: כישלון נשאר על אותו שיר, ואפשר לתקן
     * אותו. השאר נכנסים לתור רק אחרי שהניגון באמת התחיל.
     */
    spotifyWebPlayback.resetLicenseWatch()
    const result = await spotifyConnect.play(uri, embedded)
    if (result.ok) {
      spotifyStarting = uri
      void recoverPlayback(attempt, uri, embedded, queueUris ?? [], overlay)
    }
    return result
  })
  ipcMain.handle('spotify:state', async () => {
    const state = await spotifyConnect.state()
    const embeddedStatus = spotifyWebPlayback.status()
    const embedded = embeddedStatus.deviceId
    const starting = Boolean(spotifyStarting)
    if (embeddedStatus.reason === 'drm-license') return { ...state, starting }
    return embedded && state.deviceId === embedded
      ? { ...state, starting }
      : { ...state, starting, active: starting, paused: true, positionMs: 0, deviceId: null, deviceName: null, track: state.track && starting ? state.track : null }
  })
  ipcMain.handle('spotify:pause', async () => await spotifyWebPlayback.control('pause') || spotifyConnect.pause())
  ipcMain.handle('spotify:resume', async () => await spotifyWebPlayback.control('resume') || spotifyConnect.resume())
  ipcMain.handle('spotify:previous', async () => await spotifyWebPlayback.control('previous') || spotifyConnect.previous())
  ipcMain.handle('spotify:next', async () => await spotifyWebPlayback.control('next') || spotifyConnect.next())
  ipcMain.handle('spotify:seek', async (_e, positionMs: number) =>
    await spotifyWebPlayback.control('seek', positionMs) || spotifyConnect.seek(positionMs)
  )
  ipcMain.handle('spotify:volume', async (_e, value: number) =>
    await spotifyWebPlayback.control('volume', value / 100) || spotifyConnect.volume(value)
  )
  ipcMain.handle('spotify:shuffle', (_e, enabled: boolean) => spotifyConnect.shuffle(Boolean(enabled)))
  ipcMain.handle('spotify:repeat', (_e, mode: 'off' | 'context' | 'track') => spotifyConnect.repeat(mode))
  ipcMain.handle('spotify:queue', () => spotifyConnect.queue())
  ipcMain.handle('spotify:addToQueue', (_e, uri: string) => spotifyConnect.addToQueue(uri))
  ipcMain.handle('spotify:hub', () => spotifyMusic.hub())
  ipcMain.handle('spotify:artist', (_e, id: string) => spotifyMusic.artist(id))
  ipcMain.handle('spotify:album', (_e, id: string) => spotifyMusic.album(id))
  ipcMain.handle('spotify:toggleLike', (_e, uri: string, liked: boolean) => spotifyMusic.toggleLike(uri, liked))
  ipcMain.handle('spotify:createPlaylist', (_e, name: string) => spotifyMusic.createPlaylist(name))
  // ---------- YouTube ----------
  // "ספרייה בלבד" עוצר גם את YouTube: זה תוכן מהרשת
  ipcMain.handle('youtube:status', () => youtube.status())
  ipcMain.handle('youtube:search', (_e, query: string) =>
    localOnly() ? { tracks: [], reason: 'local-only' } : youtube.search(String(query).slice(0, 200), {
      language: currentLocale().split('-')[0],
      region: app.getLocaleCountryCode()
    }))
  ipcMain.handle('youtube:trending', () =>
    localOnly() ? { tracks: [], reason: 'local-only' } : youtube.trending(app.getLocaleCountryCode() || 'US'))
  ipcMain.handle('youtube:cached', (_e, query: string) => localOnly() ? [] : youtube.cachedSearch(String(query).slice(0, 200)))
  ipcMain.handle('music:newReleases', () => localOnly() ? [] : library.deezer.newReleases(20))
  ipcMain.handle('youtube:playlist', (_e, link: string) =>
    localOnly() ? { tracks: [], reason: 'local-only' } : youtube.playlist(String(link).slice(0, 500)))
  ipcMain.handle('deezer:account', () => deezerWebPlayback.account())
  ipcMain.handle('deezer:connect', async () => {
    const account = await deezerWebPlayback.connect()
    hub.invalidate()
    void hub.refresh()
    return account
  })
  ipcMain.handle('deezer:disconnect', async () => {
    await deezerWebPlayback.disconnect()
    hub.invalidate()
    void hub.refresh()
  })
  ipcMain.handle('deezer:play', (_e, trackId: string) => deezerWebPlayback.play(String(trackId).slice(0, 20)))
  ipcMain.handle('deezer:pause', () => deezerWebPlayback.control('pause'))
  ipcMain.handle('deezer:resume', () => deezerWebPlayback.control('resume'))
  ipcMain.handle('deezer:seek', (_e, seconds: number) => deezerWebPlayback.control('seek', Math.max(0, Number(seconds) || 0)))
  ipcMain.handle('deezer:state', () => deezerWebPlayback.state())
  // ספרייה בלבד: גם גילוי המוזיקה הוא תוכן מהרשת, ולכן הוא נעצר כאן
  ipcMain.handle('music:discovery', () => !localOnly() && deezerWebPlayback.isConnected()
    ? library.deezer.discovery()
    : Promise.resolve({ tracks: [], artists: [], albums: [] }))
  ipcMain.handle('music:deezerFallback', async (_e, title: string, artist: string) => {
    const safeTitle = String(title).slice(0, 200).trim()
    const safeArtist = String(artist).slice(0, 160).trim()
    if (!safeTitle) return null
    const results = await library.deezer.search(`${safeArtist} ${safeTitle}`.trim(), 5)
    const titleKey = safeTitle.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    const artistKey = safeArtist.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    return results.find((result) => {
      const candidateTitle = result.title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
      const candidateArtist = result.subtitle.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
      return candidateTitle === titleKey && (!artistKey || candidateArtist.includes(artistKey))
    }) ?? results.find((result) => Boolean(result.playUri)) ?? null
  })

  // ---------- חיפוש ----------
  ipcMain.handle('search:run', async (_e, query: string) => visibleSearch(await library.search(query)))
  ipcMain.handle('search:status', () => library.searchStatus())
  ipcMain.handle('search:openExternal', (_e, url: string) => {
    // רק http(s). קישור מהרשת אינו מקבל רשות לפתוח כל סכימה במערכת.
    if (!/^https?:\/\//i.test(url)) return
    void shell.openExternal(url)
  })

  // ---------- הספרייה ----------
  ipcMain.handle('library:folders', () => library.folders())
  ipcMain.handle('library:driveAccount', () => Promise.resolve({
    provider: 'google-drive' as const,
    configured: googleDriveAuth.enabled(),
    connected: googleDriveAuth.isConnected(),
    tier: 'storage' as const,
    displayName: null
  }))
  ipcMain.handle('library:connectDrive', () => googleDriveAuth.connect())
  ipcMain.handle('library:disconnectDrive', () => googleDriveAuth.disconnect())
  ipcMain.handle('library:driveCacheInfo', () => library.driveCacheInfo())
  ipcMain.handle('library:clearDriveCache', () => library.clearDriveCache())
  ipcMain.handle('library:catalog', () => library.catalog())
  ipcMain.handle('library:scanning', () => library.scanning())
  ipcMain.handle('library:cancelScan', () => library.cancel())
  ipcMain.handle('library:scan', (_e, opts?: { force?: boolean }) => library.scan(opts))
  ipcMain.handle('library:removeFolder', (_e, id: string) => library.removeFolder(id))
  ipcMain.handle('library:addDriveFolder', (_e, link: string) => library.addDriveFolder(link))
  ipcMain.handle('library:addLocalFolder', async () => {
    const res = await dialog.showOpenDialog(overlay, {
      title: t('dialog.chooseFolder'),
      properties: ['openDirectory', 'multiSelections']
    })
    if (res.canceled || res.filePaths.length === 0) return { ok: false }
    let added = 0
    let error: string | undefined
    for (const dir of res.filePaths) {
      const r = await library.addLocalFolder(dir)
      if (r.ok) added++
      else error = r.error
    }
    if (added > 0) void library.scan()
    return { ok: added > 0, error: added > 0 ? undefined : error }
  })

  ipcMain.handle('player:playItem', async (_e, id: string) => {
    spotifyStarting = null
    const item = library.catalog().items.find((i) => i.id === id)
    if (!item) throw new Error(t('errors.itemMissing'))
    // נרשם לפני הטעינה, כדי שדיווח המצב הראשון כבר ידע למי לשייך
    hub.markPlaying(id)
    const request = await library.playbackRequest(item)
    await engine.load(request.target, { httpHeaders: request.httpHeaders })
  })

  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('app:engineReady', () => engine.available())
  ipcMain.handle('app:locale', () => currentLocale())
  ipcMain.handle('app:setLocale', (_e, code: LocaleCode) => {
    if (code === currentLocale()) return
    setLocale(code)
    library.refreshMessages()
    hub.invalidate()
    /*
     * המטא-דאטה השמורה היא בשפה הקודמת, ו-carryMeta יזרוק אותה
     * בסריקה הבאה. בלי להפעיל אותה כאן המשתמש היה רואה ממשק בשפה
     * אחת וספרייה שלמה בשפה אחרת, עד שיסרוק ביוזמתו.
     */
    void library.scan()
  })
  ipcMain.handle('app:openDefaultAppsSettings', () => openDefaultAppsSettings())

  ipcMain.handle('app:localOnly', () => localOnly())
  /*
   * החלפת המצב מנקה את המטמון ובונה מחדש.
   *
   * בלי זה המשתמש מכבה את תוכן הרשת ועדיין רואה באנר של כותר
   * שאינו אצלו — המטמון על הדיסק בן שש שעות, והוא נבנה לפני
   * ההחלפה. הבנייה המחודשת יוצאת מיד, כך שהמסך מתעדכן לנגד עיניו.
   */
  ipcMain.handle('app:setLocalOnly', async (_e, value: boolean) => {
    if (value === localOnly()) return
    setLocalOnly(value)
    hub.invalidate()
    await hub.refresh()
  })

  const send = (channel: string, payload: unknown): void => {
    if (!overlay.isDestroyed()) overlay.webContents.send(channel, payload)
  }
  engine.on('state', (s) => send('player:state', s))
  /*
   * ‏OMNIFLUX_AUDIO_DEBUG=1: בכל מעבר בין ניגון להשהיה נרשמים מאפייני השמע
   * של mpv — עוצמה והשתקה שלו, של ההתקן, וההתקן עצמו. שקט בזמן שהסרגל
   * רץ הוא בדיוק המקרה שבו "מתנגן" במצב אינו אומר דבר על הרמקולים.
   */
  if (process.env.OMNIFLUX_AUDIO_DEBUG === '1') {
    // עיכוב בלולאת האירועים של התהליך הראשי — אם היא נחסמת, תשובות של mpv מחכות בתור
    let tick = Date.now()
    setInterval(() => {
      const lag = Date.now() - tick - 250
      if (lag > 700) console.log(`[ipc-debug] main event loop blocked ${lag}ms`)
      tick = Date.now()
    }, 250)
    let lastPaused: boolean | null = null
    engine.on('state', (st) => {
      if (st.paused === lastPaused || !st.path) return
      lastPaused = st.paused
      void Promise.all(['volume', 'mute', 'ao-volume', 'ao-mute', 'current-ao', 'audio-device', 'audio-params/samplerate'].map(
        (prop) => engine.get(prop).then((v) => `${prop}=${JSON.stringify(v)}`, () => `${prop}=?`)
      )).then((parts) => console.log(`[audio-debug] paused=${st.paused} ${parts.join(' ')}`))
    })
  }
  // סוף קובץ — התור בממשק עובר לשיר הבא. רק eof: עצירה, החלפה ושגיאה אינן "נגמר"
  engine.on('ended', (reason) => send('player:ended', reason))
  engine.on('state', (s) => {
    if (!s.paused && !s.idle) hub.recordProgress(s.position, s.duration)
  })
  engine.on('error', (m) => send('player:error', m))
  engine.on('exit', (code) => send('player:error', t('errors.engineClosed', { code: code ?? t('errors.noCode') })))
  /*
   * תאורת האווירה רצה רק כשבאמת מנגנים. אין טעם לצלם פריימים כשהסרט
   * מושהה או כשאין מדיה — וזה גם חוסך עבודה מיותרת.
   */
  const ambient = new AmbientService(engine, (bytes) => send('player:frame', bytes))
  ;(app as unknown as { __ambient: AmbientService }).__ambient = ambient
  let wasPlaying = false
  engine.on('state', (st) => {
    const playing = Boolean(st.path) && !st.paused && !st.idle
    if (playing === wasPlaying) return
    wasPlaying = playing
    if (playing) ambient.start()
    else ambient.stop()
  })
  app.on('before-quit', () => ambient.stop())

  library.on('progress', (pr) => send('library:progress', pr))
  library.on('catalog', (c) => send('library:catalog', c))
}

configureLyrics({ http })

// Windows groups every visible surface under one installed application identity.
app.setAppUserModelId('com.avisharabi.omniflux')

/*
 * קריסה של חלון הממשק אינה משאירה מסך מת.
 *
 * ‏mpv הוא תהליך נפרד, ולכן סרט שמתנגן ממשיך גם כשהממשק נפל — אבל בלי
 * טעינה מחדש לא נשאר אף כפתור לשלוט בו. הסיבה נרשמת ביומן, כדי שאפשר
 * יהיה לדעת מה קרה אצל משתמש, והממשק עולה שוב. משטחי Spotify ו-Deezer
 * נסגרים ונבנים מחדש על ידי השירותים שלהם בפעם הבאה שצריך אותם.
 */
let lastRendererReload = 0
app.on('render-process-gone', (_e, contents, details) => {
  console.error('[renderer-gone]', details.reason, details.exitCode, contents.getURL().slice(-80))
  if (details.reason === 'clean-exit' || contents.isDestroyed()) return
  if (player && contents === player.overlay.webContents && Date.now() - lastRendererReload > 5000) {
    lastRendererReload = Date.now()
    contents.reload()
  }
})
app.on('child-process-gone', (_e, details) => {
  if (details.reason !== 'clean-exit') console.error('[child-gone]', details.type, details.reason, details.exitCode, details.name ?? '')
})
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
app.whenReady().then(async () => {
  // CastLabs registers Widevine with Chromium while components.whenReady() runs.
  // It should finish before the first BrowserWindow is created; waiting only when
  // the hidden Spotify surface was opened left Chromium with no EME key system.
  const drmReady: Promise<unknown> = components.whenReady([components.WIDEVINE_CDM_ID]).catch((error: unknown) => {
    // Keep the rest of OmniFlux usable. A later Spotify attempt retries the
    // component updater and reports an embedded-player error if it still fails.
    console.error('[widevine] component initialization failed', error)
  })
  /*
   * אבל לא לנצח.
   *
   * בהפעלה ראשונה הרכיב יורד מ-Google, ועד שההורדה נגמרת לא נפתח שום חלון.
   * נמדד בפרופיל נקי: שלושה תהליכים, אפס חלונות, ואין סוף — משתמש חדש, או
   * מחשב בלי רשת, רואה תוכנה שלא עולה. אחרי עשר שניות החלון נפתח בכל
   * זאת; המשטח של Spotify ממשיך לחכות לרכיב האמיתי לפני שהוא נוצר.
   */
  const drmInTime = await Promise.race([
    drmReady.then(() => true),
    new Promise<false>((resolve) => setTimeout(() => resolve(false), 10_000))
  ])
  if (!drmInTime) console.warn('[widevine] still initializing after 10s — opening the window; Spotify waits for it')
  spotifyWebPlayback.setDrmReady(() => drmReady)
  // טריילרים ושירים מ-YouTube: בלי זיהוי, הנגן המוטמע מציג שגיאה 153
  identifyYouTubeEmbeds(session.defaultSession)
  // ‏PKCE משתמש במזהה הלקוח בלבד; הסוד נשאר לחיפוש בקטלוג הציבורי
  spotifyAuth.configure({ clientId: import.meta.env.MAIN_VITE_SPOTIFY_CLIENT_ID ?? '' })
  googleDriveAuth.configure({
    clientId: import.meta.env.MAIN_VITE_GOOGLE_CLIENT_ID ?? '',
    clientSecret: import.meta.env.MAIN_VITE_GOOGLE_CLIENT_SECRET ?? ''
  })
  deezerWebPlayback.configure(import.meta.env.MAIN_VITE_DEEZER_APP_ID ?? '')

  /*
   * מי שמעדכן מ"בית הקולנוע" מוצא את תיקיות הדרייב שלו במקום ספרייה
   * ריקה. רץ לפני שהחלון נפתח, כדי שהמסך הראשון כבר יראה אותן.
   *
   * בבנייה ארוזה בלבד: בפיתוח, מחשב שיש עליו את הגרסה הישנה היה מזליג
   * את התיקיות שלה לכל הרצת בדיקות, ושתי בדיקות ספרייה אכן נפלו כך.
   * ‏OMNIFLUX_MIGRATE=1 מפעיל אותו בכל זאת, לאימות מול התקנה אמיתית.
   */
  const migrated = app.isPackaged || process.env.OMNIFLUX_MIGRATE === '1' ? migrateFromOldApp({
    appDataDir: app.getPath('appData'),
    folders: jsonStore<LibraryFolder[]>('folders.json', []),
    mark: jsonStore<MigrationMark | null>(MARK_FILE, null)
  }) : 0
  if (migrated > 0) console.log(`[migrate] imported ${migrated} folders from the previous version`)

  /*
   * הכרזות נשמרות בתיקיית הנתונים ומוגשות דרך art://. שם הקובץ
   * מנוקה מכל תו נתיב, כדי שכתובת לא תוכל לצאת מהתיקייה.
   */
  protocol.handle('art', async (request) => {
    /*
     * ב-"art://x.jpg" השם יושב ב-hostname ולא ב-pathname — כתובת בלי
     * נתיב מפרשת את החלק הראשון כמארח. נתמכות שתי הצורות, כדי
     * שקטלוגים שנשמרו קודם ימשיכו להציג כרזות.
     */
    const url = new URL(request.url)
    const name = path.basename(url.pathname || '') || url.hostname
    const file = artPath(name)
    try {
      return new Response(fs.readFileSync(file), { headers: { 'Content-Type': 'image/jpeg' } })
    } catch {
      return new Response(null, { status: 404 })
    }
  })

  player = new PlayerWindow()
  ;(app as unknown as { __player: PlayerWindow }).__player = player
  registerIpc(player)
  player.overlay.once('closed', () => {
    spotifyWebPlayback.disconnect()
    deezerWebPlayback.destroy()
    if (process.platform !== 'darwin') app.quit()
  })

  player.overlay.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    await player.overlay.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    await player.overlay.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  try {
    await player.start()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    player.overlay.webContents.send('player:error', message)
  }

  player.show()
  // The visible renderer must be the first ready BrowserWindow. Starting the
  // hidden Spotify surface earlier can win the load race and confuse window
  // automation/accessibility clients, even though it never appears onscreen.
  if (spotifyAuth.isConnected()) void spotifyWebPlayback.ensureDevice()
  updater.schedule()

  // קובץ שנפתח בלחיצה כפולה או דרך "פתח באמצעות"
  const file = mediaFromArgv(process.argv)
  if (file) await player.engine.load(file)
})

app.on('window-all-closed', () => {
  void player?.engine.stop()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  spotifyWebPlayback.disconnect()
  deezerWebPlayback.destroy()
  void player?.engine.stop()
  library.close()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) app.quit()
})
