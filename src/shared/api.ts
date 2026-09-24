import type { LocaleCode } from './i18n/types'

/**
 * החוזה בין הממשק לתהליך הראשי.
 *
 * זה הגבול היחיד ביניהם: הממשק אינו מייבא דבר מ-main, ו-main אינו
 * יודע דבר על React. כשתגיע גרסת מובייל, המעטפת תחליף את הצד הזה
 * ותשאיר את הממשק כמו שהוא.
 */

/**
 * החלל שהממשק משאיר לווידאו, בפיקסלי CSS יחסית לפינת החלון.
 *
 *   full   — צפייה: הווידאו ממלא את החלון
 *   rect   — שיטוט: מלבן חי בתוך סרגל הנגן
 *   hidden — אודיו בלבד, או שאין מה להראות
 *
 * חלון המנוע נפרד מחלון הממשק, ולכן "מסגרת" סביב הווידאו אינה
 * חיתוך אלא הזזה אמיתית של חלון.
 */
export interface VideoViewport {
  mode: 'full' | 'rect' | 'hidden'
  x: number
  y: number
  width: number
  height: number
}

export interface TrackInfo {
  id: number
  type: 'video' | 'audio' | 'sub'
  title?: string
  lang?: string
  selected: boolean
  codec?: string
  external?: boolean
}

/** A subtitle result safe to expose to the sandboxed renderer. */
export interface OnlineSubtitle {
  /** Opaque, short-lived identifier. Download URLs never cross the IPC boundary. */
  id: string
  name: string
  release: string
  language: string
  hearingImpaired: boolean
  fps: number | null
  matchScore: number | null
}

export interface EngineState {
  path: string | null
  title: string | null
  artist: string | null
  cover: string | null
  mediaId: string | null
  provider: string | null
  playbackMode: 'preview' | 'full' | null
  duration: number
  position: number
  paused: boolean
  volume: number
  muted: boolean
  speed: number
  idle: boolean
  hwdec: string | null
  tracks: TrackInfo[]
  subDelay: number
  audioDelay: number
  /** הגברים באקולייזר, בדציבלים */
  eq: number[]
  /** יחס תצוגה שנכפה, או '-1' לזה שבקובץ */
  aspect: string
  brightness: number
  contrast: number
  saturation: number
  gamma: number
  sharpen: number
  deband: boolean
  videoFit: 'fit' | 'fill' | 'zoom'
}

export type MediaKind = 'movie' | 'episode' | 'audio' | 'unknown'
export type SourceKind = 'local' | 'gdrive' | 'url'

export interface MediaMeta {
  title: string
  originalTitle: string
  overview: string
  year: number | null
  genres: string[]
  rating: number
  runtimeMinutes: number | null
  poster: string | null
  backdrop: string | null
  tmdbId: number | null
  tmdbType: 'movie' | 'tv' | null
  notFound: boolean
  fetchedAt: number
  /**
   * השפה שבה נמשכה המטא-דאטה.
   *
   * בלעדיה החלפת שפה משאירה ספרייה שלמה בשפה הקודמת: הכותרים
   * נשמרים במטמון, והסריקה הבאה מדלגת עליהם כי כבר יש להם meta.
   */
  locale: string
}

export interface MediaItem {
  id: string
  source: SourceKind
  uri: string
  fileName: string
  sizeBytes?: number
  modifiedAt?: number
  root: string
  trail: string[]
  kind: MediaKind
  title: string
  year: number | null
  season: number | null
  episode: number | null
  meta: MediaMeta | null
  /** תגיות שנקראו מקובץ שמע מקומי: שם, אמן, אלבום, ז'אנר ועטיפה */
  audio?: {
    stamp: string
    title: string | null
    artist: string | null
    album: string | null
    year: number | null
    genre: string | null
    track: number | null
    durationSec: number | null
    cover: string | null
  }
}

export interface Catalog {
  version: number
  scannedAt: number
  items: MediaItem[]
}

export interface LibraryFolder {
  id: string
  source: SourceKind
  ref: string
  label: string
  addedAt: number
}

export interface ScanProgress {
  phase: 'listing' | 'identifying' | 'done' | 'error'
  message: string
  current: number
  total: number
}

export type ResultOrigin = 'library' | 'catalog' | 'music'

export interface WatchOption {
  provider: string
  /** נתיב הלוגו ב-TMDB, להצגת המותג ולא רק שמו */
  logo: string | null
  kind: 'flatrate' | 'rent' | 'buy'
}

export interface SearchResult {
  id: string
  origin: ResultOrigin
  title: string
  subtitle: string
  poster: string | null
  year: number | null
  rating: number
  playable: boolean
  itemId?: string
  playUri?: string
  /** Provider-owned opaque track id; never a stream URL. */
  providerTrackId?: string
  fallbackPlayUri?: string
  watch?: WatchOption[]
  externalUrl?: string
  sourceLabel: string
}

export interface SearchGroup {
  /** הכותרת נגזרת מהמפתח בממשק, כדי שתהיה בשפת המשתמש */
  key: 'library' | 'streaming' | 'music'
  results: SearchResult[]
}

/** Metadata for a network audio stream; the URL itself is never used as UI text. */
export interface PlaybackRequest {
  target: string
  mediaId?: string
  title?: string
  artist?: string
  cover?: string | null
  provider?: string
  playbackMode?: 'preview' | 'full'
}

export interface MusicDiscovery {
  tracks: SearchResult[]
  artists: SearchResult[]
  albums: SearchResult[]
}


/**
 * פלטפורמה שבה הכותר זמין.
 *
 * הלוגו מגיש מ-TMDB בכל פעם ואינו נשמר אצלנו: אלה סימנים מסחריים,
 * ו-TMDB הוא הצינור המורשה שמספק אותם יחד עם נתוני הזמינות.
 */
export interface Brand {
  name: string
  /** כתובת art:// ללוגו הרשמי, או null אם אין */
  logo: string | null
}

/** תג איכות שנגזר משם הקובץ */
export type Quality = '4K' | 'HDR' | '1080p' | '720p' | null

/** מאיפה הכותר מגיע — קובץ שלנו, דרייב, קטלוג או מוזיקה */
export type CardSource = 'local' | 'gdrive' | 'catalog' | 'music'

export interface HubCard {
  id: string
  title: string
  subtitle: string
  poster: string | null
  year: number | null
  rating: number
  quality: Quality
  source: CardSource
  /** השירות שבו אפשר לצפות, כשאין את הקובץ */
  brand: Brand | null
  /** The primary catalog provider is one of the user's active subscriptions. */
  subscribed?: boolean
  playable: boolean
  itemId?: string
  playUri?: string
  externalUrl?: string
  /** 0..1 — כמה כבר נצפה. קיים רק בשורת "המשך צפייה" */
  progress?: number
  episodes?: number
}

/** הכותר הגדול בראש מסך הבית */
export interface HeroSlide {
  id: string
  title: string
  overview: string
  backdrop: string | null
  /** לוגו הכותר על רקע שקוף; בלעדיו הממשק נופל לטיפוגרפיה */
  logo: string | null
  year: number | null
  rating: number
  genres: string[]
  playable: boolean
  itemId?: string
  externalUrl?: string
  brand: Brand | null
  subscribed?: boolean
  trailerKey?: string
  /** שפת האודיו של הטריילר: כשאינה שפת הממשק, הנגן מדליק כתוביות */
  trailerLang?: string | null
}

export type HubRowKey = 'continue' | 'watchlist' | 'trending' | 'topRated' | 'popularTv' | 'recent' | 'music'

export interface HubRow {
  key: HubRowKey
  cards: HubCard[]
}

export interface HubData {
  hero: HeroSlide[]
  rows: HubRow[]
  /** נבנה מטמון — הממשק מציג שלד עד שמגיע מידע אמיתי */
  loading: boolean
}

/**
 * פריט ברשימת הצפייה.
 *
 * נשמר בשלמותו ולא כמזהה בלבד: כותר מ-TMDB אינו קיים בקטלוג, ואם
 * נשמור רק מזהה לא יהיה ממה לצייר את הכרטיס כשהרשת למטה.
 */
export interface WatchlistEntry {
  id: string
  title: string
  poster: string | null
  year: number | null
  rating: number
  itemId?: string
  externalUrl?: string
  brand: Brand | null
  addedAt: number
}

/**
 * גיליון תצוגה מקדימה לסרגל הזמן.
 *
 * כל המשבצות בקובץ אחד: הממשק מזיז background-position ומקבל את
 * המשבצת הנכונה בלי בקשה נוספת.
 */
export interface ThumbSprite {
  url: string
  cols: number
  rows: number
  count: number
  /** שניות בין משבצת למשבצת */
  interval: number
  tileWidth: number
}

export interface LyricLine {
  at: number
  text: string
}

/** מילים לרצועה. `synced=false` הן מילים בלי זמנים. */
export interface Lyrics {
  synced: boolean
  lines: LyricLine[]
}

export interface CastMember {
  name: string
  character: string
  photo: string | null
}

export interface WatchLink {
  provider: string
  logo: string | null
  kind: 'flatrate' | 'rent' | 'buy'
  /** קישור ישיר לשירות; null כשלא נמצאה התאמה */
  url: string | null
  /** Official registration/plan page, shown only when the service is not selected. */
  signupUrl: string | null
  /** המשתמש סימן שיש לו מנוי לשירות הזה */
  subscribed: boolean
}

/** כרטיס הפרטים המלא של כותר */
export interface TitleDetails {
  id: string
  title: string
  overview: string
  backdrop: string | null
  poster: string | null
  logo: string | null
  year: number | null
  rating: number
  genres: string[]
  runtimeMinutes: number | null
  cast: CastMember[]
  watch: WatchLink[]
  /** קישור JustWatch מ-TMDB, כמוצא אחרון */
  fallbackUrl: string | null
  playable: boolean
  itemId?: string
  /** Official YouTube trailer selected from TMDB videos. */
  trailerKey: string | null
  trailerLang: string | null
}

/** מכשיר שרשום לחשבון Spotify ואפשר לשלוח אליו רצועה */
export interface SpotifyDevice {
  id: string
  name: string
  type: string
  active: boolean
}

/** שיר מ-YouTube, אחרי ניקוי השם ("Artist - Title (Official Video)" → אמן ושם) */
export interface YouTubeTrack {
  videoId: string
  title: string
  artist: string
  channel: string
  thumbnail: string | null
  durationSec: number
}

/**
 * תשובה מ-YouTube, עם הסיבה כשהיא ריקה או חלקית.
 * ‏quota — המכסה המשותפת נגמרה היום; daily-limit — התקרה האישית לחיפושים.
 */
export interface YouTubeResult {
  tracks: YouTubeTrack[]
  reason?: 'cached' | 'no-key' | 'quota' | 'daily-limit' | 'error' | 'invalid' | 'not-found' | 'local-only'
}

export interface ProviderAccount {
  provider: 'spotify' | 'deezer' | 'google-drive'
  configured: boolean
  connected: boolean
  tier: 'premium' | 'free' | 'unknown' | 'storage'
  displayName: string | null
}

export interface DeezerPlaybackState {
  active: boolean
  paused: boolean
  position: number
  duration: number
  trackId: string | null
  title: string | null
  artist: string | null
  cover: string | null
}

export type SpotifyRepeatMode = 'off' | 'context' | 'track'

export interface SpotifyTrack {
  id: string
  uri: string
  title: string
  artist: string
  artistId: string | null
  album: string
  albumId: string | null
  cover: string | null
  durationMs: number
  externalUrl: string
  liked?: boolean
}

export interface SpotifyCollection {
  id: string
  uri: string
  name: string
  subtitle: string
  cover: string | null
  externalUrl: string
  kind: 'playlist' | 'album' | 'single'
  totalTracks: number
}

export interface SpotifyArtist {
  id: string
  uri: string
  name: string
  image: string | null
  externalUrl: string
}

export interface SpotifyMusicHub {
  personalized: SpotifyTrack[]
  liked: SpotifyTrack[]
  mixes: SpotifyCollection[]
  playlists: SpotifyCollection[]
  artists: SpotifyArtist[]
}

export interface SpotifyArtistDetails {
  artist: SpotifyArtist
  topTracks: SpotifyTrack[]
  releases: SpotifyCollection[]
}

export interface SpotifyAlbumDetails {
  album: SpotifyCollection & { releaseYear: number | null; artist: string; durationMs: number }
  tracks: SpotifyTrack[]
}

export interface SpotifyPlaybackState {
  active: boolean
  paused: boolean
  positionMs: number
  volume: number
  shuffle: boolean
  repeat: SpotifyRepeatMode
  deviceId: string | null
  deviceName: string | null
  track: SpotifyTrack | null
  /**
   * הניגון התבקש וטרם נשמע.
   *
   * ההתחלה הראשונה בכל הפעלה לוקחת כתשע שניות (התחלה קרה של
   * ספוטיפיי). בלי הסימון הזה הממשק הציג כפתור השהיה מעל 0:00 שאינו
   * זז — כלומר הבטיח ניגון שעדיין לא קרה.
   */
  starting: boolean
}

/** מיקום הצפייה האחרון בפריט */
export interface PlayProgress {
  position: number
  duration: number
  updatedAt: number
}

export type UpdateStatus =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'none' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; version: string; percent: number }
  | { status: 'ready'; version: string }
  | { status: 'error'; message: string }

export interface CinemaApi {
  updates: {
    state: () => Promise<UpdateStatus>
    check: () => Promise<UpdateStatus>
    install: () => Promise<void>
    onState: (cb: (s: UpdateStatus) => void) => () => void
  }
  subscriptions: {
    /** השירותים שהמשתמש סימן שיש לו */
    list: () => Promise<string[]>
    toggle: (provider: string) => Promise<boolean>
    /** השירותים שמופיעים באזור שלו, להצעה בהגדרות */
    available: () => Promise<Array<{ name: string; logo: string | null }>>
  }
  spotify: {
    /** האם החשבון מחובר */
    connected: () => Promise<boolean>
    account: () => Promise<ProviderAccount>
    /** פותח את דף ההסכמה של Spotify וממתין לחזרה */
    connect: () => Promise<{ ok: boolean; error?: string }>
    disconnect: () => Promise<void>
    devices: () => Promise<SpotifyDevice[]>
    /** מנגן רצועה מלאה במכשיר Web Playback המוטמע של OmniFlux. */
    play: (uri: string, queueUris?: string[]) => Promise<{ ok: boolean; reason?: string }>
    state: () => Promise<SpotifyPlaybackState>
    pause: () => Promise<boolean>
    resume: () => Promise<boolean>
    previous: () => Promise<boolean>
    next: () => Promise<boolean>
    seek: (positionMs: number) => Promise<boolean>
    volume: (value: number) => Promise<boolean>
    shuffle: (enabled: boolean) => Promise<boolean>
    repeat: (mode: SpotifyRepeatMode) => Promise<boolean>
    queue: () => Promise<SpotifyTrack[]>
    addToQueue: (uri: string) => Promise<boolean>
    hub: () => Promise<SpotifyMusicHub>
    artist: (id: string) => Promise<SpotifyArtistDetails | null>
    album: (id: string) => Promise<SpotifyAlbumDetails | null>
    toggleLike: (uri: string, liked: boolean) => Promise<boolean>
    createPlaylist: (name: string) => Promise<SpotifyCollection | null>
  }
  deezer: {
    account: () => Promise<ProviderAccount>
    connect: () => Promise<ProviderAccount>
    disconnect: () => Promise<void>
    play: (trackId: string) => Promise<boolean>
    pause: () => Promise<boolean>
    resume: () => Promise<boolean>
    seek: (seconds: number) => Promise<boolean>
    state: () => Promise<DeezerPlaybackState>
  }
  youtube: {
    status: () => Promise<{ enabled: boolean; searchesLeft: number; exhausted: boolean }>
    /** חיפוש — 100 יחידות ממכסה משותפת, ולכן רק בלחיצה מפורשת. תשובות נשמרות שבוע. */
    search: (query: string) => Promise<YouTubeResult>
    /** מוזיקה פופולרית עכשיו באזור של המשתמש */
    trending: () => Promise<YouTubeResult>
    /** פלייליסט ציבורי או לא-רשום, לפי קישור */
    playlist: (link: string) => Promise<YouTubeResult & { title?: string }>
    /** רק מה שכבר נשמר מחיפושים קודמים — בלי מכסה, ולכן מותר בכל הקשה */
    cached: (query: string) => Promise<YouTubeTrack[]>
  }
  music: {
    discovery: () => Promise<MusicDiscovery>
    deezerFallback: (title: string, artist: string) => Promise<SearchResult | null>
    /** אלבומים שיצאו השבוע (Deezer, ציבורי) — לבאנר הראשי */
    newReleases: () => Promise<Array<{ id: string; title: string; artist: string; cover: string | null; releaseDate: string | null; link: string }>>
  }
  search: {
    run: (query: string) => Promise<SearchGroup[]>
    /** למה מקור מסוים אינו פעיל, אם אינו פעיל */
    status: () => Promise<{ spotify: string | null; tmdb: boolean }>
    openExternal: (url: string) => Promise<void>
  }
  library: {
    driveAccount: () => Promise<ProviderAccount>
    connectDrive: () => Promise<{ ok: boolean; error?: string }>
    disconnectDrive: () => Promise<void>
    /**
     * מטמון הבלוקים של דרייב: כמה תופס ומה התקרה.
     *
     * חלקי קבצים שנצפו נשמרים על הדיסק, כדי שדילוג אחורה וצפייה חוזרת
     * לא יורידו שוב — וכדי שהמשתמש יוכל לראות כמה מקום זה לוקח ולפנות.
     */
    driveCacheInfo: () => Promise<{ bytes: number; limitBytes: number }>
    clearDriveCache: () => Promise<void>
    folders: () => Promise<LibraryFolder[]>
    addLocalFolder: () => Promise<{ ok: boolean; error?: string }>
    addDriveFolder: (link: string) => Promise<{ ok: boolean; error?: string }>
    removeFolder: (id: string) => Promise<void>
    catalog: () => Promise<Catalog>
    scan: (opts?: { force?: boolean }) => Promise<{ ok: boolean; error?: string }>
    cancelScan: () => Promise<void>
    scanning: () => Promise<boolean>
    onCatalog: (cb: (c: Catalog) => void) => () => void
    onProgress: (cb: (p: ScanProgress) => void) => () => void
  }
  window: {
    minimize: () => Promise<void>
    maximize: () => Promise<boolean>
    close: () => Promise<void>
    setFullscreen: (enabled: boolean) => Promise<boolean>
    setPictureInPicture: (enabled: boolean) => Promise<boolean>
    /**
     * מדווח לאן הווידאו הולך.
     *
     * הממשק מודד את החלל שהוא משאיר פנוי, וחלון המנוע נשלח לשם.
     * הודעה חד-כיוונית ולא בקשה: היא נשלחת גם בזמן גרירה, ואין למי
     * לחכות.
     */
    setVideoViewport: (v: VideoViewport) => void
  }
  player: {
    /** בוחר קובץ מהמחשב ומנגן אותו */
    openFile: () => Promise<string | null>
    /** מנגן נתיב או כתובת שכבר ידועים */
    load: (target: string | PlaybackRequest) => Promise<void>
    /** מנגן פריט מהספרייה */
    playItem: (id: string) => Promise<void>
    playPause: () => Promise<void>
    seek: (seconds: number, mode?: 'absolute' | 'relative') => Promise<void>
    setVolume: (value: number) => Promise<void>
    setSpeed: (value: number) => Promise<void>
    selectTrack: (type: 'audio' | 'sub' | 'video', id: number | 'no') => Promise<void>
    addSubtitle: () => Promise<void>
    subtitleProvider: () => Promise<{ name: 'SubDL'; enabled: boolean }>
    searchSubtitles: (languages: string[]) => Promise<OnlineSubtitle[]>
    loadOnlineSubtitle: (id: string) => Promise<void>
    setSubDelay: (seconds: number) => Promise<void>
    setAudioDelay: (seconds: number) => Promise<void>
    setEqualizer: (gains: number[]) => Promise<void>
    setAspect: (ratio: string) => Promise<void>
    setVideoAdjustment: (
      property: 'brightness' | 'contrast' | 'saturation' | 'gamma',
      value: number
    ) => Promise<void>
    setSharpen: (value: number) => Promise<void>
    setDeband: (enabled: boolean) => Promise<void>
    setVideoFit: (mode: 'fit' | 'fill' | 'zoom') => Promise<void>
    resetVideo: () => Promise<void>
    screenshot: () => Promise<string | null>
    state: () => Promise<EngineState>
    /** תצוגה מקדימה לסרגל הזמן. נבנית ברקע ומוחזרת כשהיא מוכנה. */
    thumbs: () => Promise<ThumbSprite | null>
    /** מילים לרצועה המתנגנת, או null כשאין */
    lyrics: () => Promise<Lyrics | null>
    lyricsFor: (artist: string, track: string, durationSeconds: number) => Promise<Lyrics | null>
    onState: (cb: (state: EngineState) => void) => () => void
    /** פריים מהסרט, לחילוץ צבעי תאורת האווירה */
    onFrame: (cb: (bytes: Uint8Array) => void) => () => void
    onError: (cb: (message: string) => void) => () => void
    /** סוף קובץ במנוע, עם הסיבה של mpv (eof, stop, quit, error, redirect) */
    onEnded: (cb: (reason: string) => void) => () => void
  }
  hub: {
    /** פרטי כותר מלאים, לכרטיס שנפתח בתוך התוכנה */
    details: (id: string) => Promise<TitleDetails | null>
    /** מסך הבית: באנר ושורות. מוגש ממטמון ומתרענן ברקע. */
    data: () => Promise<HubData>
    refresh: () => Promise<HubData>
    onData: (cb: (d: HubData) => void) => () => void
    /** מוסיף או מסיר מרשימת הצפייה, ומחזיר את המצב החדש */
    toggleWatchlist: (entry: Omit<WatchlistEntry, 'addedAt'>) => Promise<boolean>
    inWatchlist: (id: string) => Promise<boolean>
  }
  app: {
    version: () => Promise<string>
    engineReady: () => Promise<boolean>
    /** השפה השמורה, או שפת המערכת בהפעלה הראשונה */
    locale: () => Promise<LocaleCode>
    setLocale: (code: LocaleCode) => Promise<void>
    /**
     * פותח את מסך ברירות המחדל של Windows.
     *
     * מאז Windows 8 רק המשתמש יכול לקבוע נגן ברירת מחדל — UserChoice
     * חתום בגיבוב ואינו ניתן לכתיבה מתוכנה. אומת בהתקנה אמיתית:
     * המתקין רשם את כל 20 הסיומות, והמעטפת המשיכה לפתוח את הנגן
     * שנבחר ב-UserChoice. זה המסלול היחיד שקיים.
     */
    openDefaultAppsSettings: () => Promise<void>
    /**
     * ספרייה בלבד: בלי שום תוכן שמגיע מהרשת.
     *
     * כשהמצב פעיל מוצג אך ורק מה שהמשתמש הוסיף בעצמו. אין באנר, אין
     * טרנדים, אין תוצאות סטרימינג בחיפוש ואין קטלוג מוזיקה — והחיפוש
     * אף אינו יוצא לרשת.
     */
    localOnly: () => Promise<boolean>
    setLocalOnly: (value: boolean) => Promise<void>
  }
}

declare global {
  interface Window {
    cinema: CinemaApi
  }
}
