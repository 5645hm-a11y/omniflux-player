import { useMemo } from 'react'
import { create } from 'zustand'
import type { DeezerPlaybackState, EngineState, SpotifyPlaybackState, TrackInfo, YouTubeTrack } from '@shared/api'
import { inAd, useYouTube } from './youtube'
import { useQueue } from './queue'

/**
 * מצב הנגן בממשק.
 *
 * המנוע הוא מקור האמת היחיד: הוא מדווח על כל שינוי, והממשק רק מציג.
 * אין כאן העתק שני של "איפה אנחנו בסרט" שעלול להתפצל מהמציאות.
 */

const EMPTY: EngineState = {
  path: null,
  title: null,
  artist: null,
  cover: null,
  mediaId: null,
  provider: null,
  playbackMode: null,
  duration: 0,
  position: 0,
  paused: true,
  volume: 100,
  muted: false,
  speed: 1,
  idle: true,
  hwdec: null,
  tracks: [],
  subDelay: 0,
  audioDelay: 0,
  eq: Array(10).fill(0),
  aspect: '-1',
  brightness: 0,
  contrast: 0,
  saturation: 0,
  gamma: 0,
  sharpen: 0,
  deband: false,
  videoFit: 'fit'
}

interface Store {
  engine: EngineState
  spotify: SpotifyPlaybackState | null
  deezer: DeezerPlaybackState | null
  error: string | null
  version: string
  engineReady: boolean
  /** גרירה מקומית של הסרגל, כדי שהוא לא יקפוץ בזמן שמזיזים */
  scrubbing: number | null
  preferredSource: 'mpv' | 'spotify' | 'deezer' | 'youtube' | null
  optimisticPaused: boolean | null
  optimisticPosition: number | null

  init: () => Promise<void>
  setScrubbing: (value: number | null) => void
  dismissError: () => void
  reportError: (error: unknown) => void
  preferMpv: () => void
  preferSpotify: () => void
  preferDeezer: (track?: { id?: string; title?: string; artist?: string; cover?: string | null }) => void
  preferYouTube: (track: YouTubeTrack) => void
  togglePlayback: () => void
  seekTo: (seconds: number) => void
  seekRelative: (seconds: number) => void
  skip: (direction: 'previous' | 'next') => void
  /** עוצמה לכל מקור. mpv עד 130 (הגברה), השאר עד 100 */
  setVolume: (value: number) => void
}

/** מה שהסרגל מציג כש-YouTube מנגן */
function youTubeEngine(
  yt: { track: YouTubeTrack | null; state: number; time: number; duration: number; volume: number; muted: boolean },
  current: { optimisticPaused: boolean | null; optimisticPosition: number | null }
): EngineState {
  const track = yt.track!
  return {
    ...EMPTY,
    path: `youtube:${track.videoId}`,
    title: track.title,
    artist: track.artist,
    cover: track.thumbnail,
    mediaId: `youtube:${track.videoId}`,
    provider: 'YouTube',
    playbackMode: 'full',
    duration: yt.duration || track.durationSec,
    // בזמן פרסומת הזמן המדווח הוא של הפרסומת; הסרגל של השיר נשאר על ההתחלה
    position: current.optimisticPosition ?? (inAd(yt) ? 0 : yt.time),
    /*
     * מושהה רק כשהנגן באמת עומד: השהיה (2), סוף (0), או מוכן-ולא-התחיל (5).
     * פרסומת לפני השיר מדווחת מצבים אחרים — ובזמנה הכפתור הציג "נגן"
     * בזמן שהרמקולים כבר השמיעו. נמדד בצילום מסך.
     */
    paused: current.optimisticPaused ?? (yt.state === 2 || yt.state === 0 || yt.state === 5),
    volume: yt.volume,
    muted: yt.muted,
    idle: false
  }
}

/** מקור אחר לוקח את הבמה — הנגן של YouTube נסגר, ולא רק מושהה, כי אסור שיישאר נסתר */
function stopYouTube(): void {
  if (useYouTube.getState().track) useYouTube.getState().stop()
}

let transportVersion = 0
let positionVersion = 0

export const usePlayer = create<Store>((set, get) => ({
  engine: EMPTY,
  spotify: null,
  deezer: null,
  error: null,
  version: '',
  engineReady: true,
  scrubbing: null,
  preferredSource: null,
  optimisticPaused: null,
  optimisticPosition: null,

  async init() {
    const [state, version, engineReady] = await Promise.all([
      window.cinema.player.state(),
      window.cinema.app.version(),
      window.cinema.app.engineReady()
    ])
    let lastMpv = state
    set({ engine: state, version, engineReady })

    window.cinema.player.onState((next) => {
      lastMpv = next
      set((current) => {
        /*
         * קובץ שמתנגן כאן גובר על זיכרון של שירות חיצוני.
         *
         * קודם, ברגע שהמשתמש שמע שיר ב-Spotify, כל דיווח של המנוע
         * המקומי נזרק — לתמיד. מי שפתח אחר כך סרט ראה סרגל נגן שמציג
         * את השיר הישן, והכפתורים שלו נשלחו ל-Spotify במקום לסרט.
         * מנוע שמדווח על קובץ טעון ולא-סרק הוא האמת, ולכן הוא מחזיר
         * לעצמו את הבמה.
         */
        // ‏idle הוא "אין קובץ", ולכן השהיה נבדקת בנפרד: סרט מושהה אינו לוקח את הבמה מ-Spotify
        const playingHere = Boolean(next.path) && !next.idle && !next.paused
        if ((current.preferredSource === 'spotify' || current.preferredSource === 'youtube') && !playingHere) return {}
        /*
         * המנוע התחיל לנגן בזמן ש-YouTube מנגן — שני קולות יחד.
         *
         * לחיצה בממשק כבר עוצרת את YouTube, אבל לא כל ניגון מתחיל בממשק:
         * "פתח באמצעות" מסייר הקבצים טוען קובץ ישר למנוע. נמדד בבדיקת
         * הרגרסיה: סרט מהדרייב התחיל, והשיר מ-YouTube המשיך מתחתיו.
         */
        if (playingHere && current.preferredSource === 'youtube') stopYouTube()
        return {
          preferredSource: playingHere ? 'mpv' : current.preferredSource,
          engine: {
            ...next,
            paused: current.optimisticPaused ?? next.paused,
            position: current.optimisticPosition ?? next.position
          }
        }
      })
    })
    window.cinema.player.onError((message) => set({ error: message }))

    const syncSpotify = async (): Promise<void> => {
      const spotify = await window.cinema.spotify.state().catch(() => null)
      if (!spotify) return
      if (!spotify.active || !spotify.track) {
        set((current) => current.spotify?.active ? { spotify, engine: lastMpv } : { spotify })
        return
      }
      if (usePlayer.getState().preferredSource === 'mpv') return
      const track = spotify.track
      set({
        spotify,
        engine: {
          ...EMPTY,
          path: track.uri,
          title: track.title,
          artist: track.artist,
          cover: track.cover,
          mediaId: `spotify:${track.id}`,
          provider: 'Spotify',
          playbackMode: 'full',
          duration: track.durationMs / 1000,
          position: usePlayer.getState().optimisticPosition ?? spotify.positionMs / 1000,
          paused: usePlayer.getState().optimisticPaused ?? spotify.paused,
          volume: spotify.volume,
          muted: spotify.volume === 0,
          idle: false
        }
      })
    }
    void syncSpotify()
    window.setInterval(() => void syncSpotify(), 1000)

    const syncDeezer = async (): Promise<void> => {
      if (usePlayer.getState().preferredSource !== 'deezer') return
      const deezer = await window.cinema.deezer.state().catch(() => null)
      if (!deezer?.active) return
      set({
        deezer,
        engine: {
          ...EMPTY,
          path: deezer.trackId ? `deezer:${deezer.trackId}` : null,
          title: deezer.title,
          artist: deezer.artist,
          cover: deezer.cover,
          mediaId: deezer.trackId ? `deezer:${deezer.trackId}` : null,
          provider: 'Deezer',
          playbackMode: 'full',
          duration: deezer.duration,
          position: usePlayer.getState().optimisticPosition ?? deezer.position,
          paused: usePlayer.getState().optimisticPaused ?? deezer.paused,
          idle: false
        }
      })
    }
    void syncDeezer()
    window.setInterval(() => void syncDeezer(), 500)

    /*
     * ‏YouTube מדווח בעצמו, כמה פעמים בשנייה, דרך הנגן המוטמע. כשהוא
     * המקור המועדף, הדיווחים שלו הם מה שהסרגל מציג.
     */
    useYouTube.subscribe((yt) => {
      if (usePlayer.getState().preferredSource !== 'youtube' || !yt.track) return
      set((current) => ({ engine: youTubeEngine(yt, current) }))
    })
  },

  setScrubbing: (scrubbing) => set({ scrubbing }),
  dismissError: () => set({ error: null }),
  reportError: (error) => {
    const raw = error instanceof Error ? error.message : String(error)
    set({ error: raw.replace(/^Error invoking remote method '[^']+': Error: /, '') })
  },
  preferMpv: () => {
    stopYouTube()
    set({ preferredSource: 'mpv', spotify: null, deezer: null })
  },
  preferSpotify: () => {
    stopYouTube()
    set({ preferredSource: 'spotify', deezer: null })
  },
  preferYouTube: (track) => set((current) => ({
    preferredSource: 'youtube',
    spotify: null,
    deezer: null,
    engine: youTubeEngine({ ...useYouTube.getState(), track, state: 3, time: 0, duration: track.durationSec }, current)
  })),
  preferDeezer: (track) => set((current) => (stopYouTube(), {
    preferredSource: 'deezer',
    spotify: null,
    engine: track ? {
      ...EMPTY,
      path: track.id ? `deezer:${track.id}` : null,
      mediaId: track.id ? `deezer:${track.id}` : null,
      title: track.title ?? null,
      artist: track.artist ?? null,
      cover: track.cover ?? null,
      provider: 'Deezer',
      playbackMode: 'full',
      paused: false,
      idle: false
    } : current.engine
  })),

  togglePlayback: () => {
    const before = get()
    /*
     * ההמתנה חלה על ספוטיפיי בלבד.
     *
     * הכפתור התעלם מלחיצות כל עוד ספוטיפיי מדווחת "מתחיל" — גם כשמה
     * שמתנגן הוא סרט מהדרייב. סימון שנתקע דלוק השתיק כך את הכפתור
     * לגמרי, וזה נראה בדיוק כמו נגן שבור.
     */
    if (before.engine.provider === 'Spotify' && before.spotify?.starting) return
    if (before.engine.idle && before.engine.paused) return
    const desiredPaused = !before.engine.paused
    const version = ++transportVersion
    set({
      engine: { ...before.engine, paused: desiredPaused },
      spotify: before.spotify ? { ...before.spotify, paused: desiredPaused } : null,
      optimisticPaused: desiredPaused
    })

    const command = before.engine.provider === 'YouTube'
      ? Promise.resolve(desiredPaused ? useYouTube.getState().pause() : useYouTube.getState().resume())
      : before.engine.provider === 'Spotify'
      ? desiredPaused ? window.cinema.spotify.pause() : window.cinema.spotify.resume()
      : before.preferredSource === 'deezer'
        ? desiredPaused ? window.cinema.deezer.pause() : window.cinema.deezer.resume()
        : window.cinema.player.playPause()

    void command
      .catch(() => false)
      .finally(() => {
        window.setTimeout(() => {
          if (version !== transportVersion) return
          set({ optimisticPaused: null })
        }, 180)
      })
  },

  seekTo: (seconds) => {
    const before = get()
    const target = Math.max(0, Math.min(before.engine.duration || Number.MAX_SAFE_INTEGER, seconds))
    const version = ++positionVersion
    set({
      engine: { ...before.engine, position: target },
      spotify: before.spotify ? { ...before.spotify, positionMs: target * 1000 } : null,
      optimisticPosition: target
    })
    const command = before.engine.provider === 'YouTube'
      ? Promise.resolve(useYouTube.getState().seek(target))
      : before.engine.provider === 'Spotify'
      ? window.cinema.spotify.seek(target * 1000)
      : before.preferredSource === 'deezer'
        ? window.cinema.deezer.seek(target)
        : window.cinema.player.seek(target)
    void command.catch(() => false).finally(() => {
      window.setTimeout(() => {
        if (version === positionVersion) set({ optimisticPosition: null })
      }, 250)
    })
  },

  setVolume: (value) => {
    const provider = get().engine.provider
    if (provider === 'YouTube') useYouTube.getState().setVolume(value)
    else if (provider === 'Spotify') void window.cinema.spotify.volume(Math.min(100, value))
    else void window.cinema.player.setVolume(value)
  },

  seekRelative: (seconds) => {
    const current = get().engine.position
    get().seekTo(current + seconds)
  },

  skip: (direction) => {
    const before = get()
    // תור פעיל — "הבא" ו"הקודם" הם שירים, לא עשר שניות
    const queue = useQueue.getState()
    if (queue.active && queue.items.length > 0 && before.engine.provider !== 'Spotify') {
      if (direction === 'next') queue.next()
      else queue.previous()
      return
    }
    if (before.engine.provider !== 'Spotify') {
      get().seekRelative(direction === 'previous' ? -10 : 10)
      return
    }
    const version = ++positionVersion
    set({
      engine: { ...before.engine, position: 0 },
      spotify: before.spotify ? { ...before.spotify, positionMs: 0 } : null,
      optimisticPosition: 0
    })
    const command = direction === 'previous' ? window.cinema.spotify.previous() : window.cinema.spotify.next()
    void command.catch(() => false).finally(() => {
      window.setTimeout(() => {
        if (version === positionVersion) set({ optimisticPosition: null })
      }, 350)
    })
  }
}))

/*
 * הסינון נעשה כאן ולא בסלקטור.
 *
 * סלקטור שמחזיר `tracks.filter(...)` מייצר מערך חדש בכל קריאה,
 * zustand משווה בזהות, ומסיק שהמצב השתנה — לולאת רינדור אינסופית.
 * זה בדיוק מה שקרה: React נפל ב-#185 והממשק לא צויר כלל.
 */
export function useTracks(type: TrackInfo['type']): TrackInfo[] {
  const tracks = usePlayer((s) => s.engine.tracks)
  return useMemo(() => tracks.filter((t) => t.type === type), [tracks, type])
}
