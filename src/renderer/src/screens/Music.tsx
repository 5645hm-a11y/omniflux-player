import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import type {
  ProviderAccount,
  SpotifyAlbumDetails,
  SpotifyArtistDetails,
  SpotifyDevice,
  SpotifyMusicHub,
  SpotifyTrack,
  YouTubeTrack
} from '@shared/api'
import { useT } from '../i18n'
import { useCards } from '../store/library'
import { useQueue } from '../store/queue'
import { useYouTube } from '../store/youtube'
import { useUnifiedSearch } from '../lib/unified-search'
import { Icon, IconButton } from '../components/ui'
import { LocalMusic, localQueueItems } from '../components/LocalMusic'
import {
  ForYouShelf, MoodsAndGenres, PlaylistImport, QueueDrawer, RecentShelf, TopArtists, TrackCard, TrendingShelf
} from '../components/MusicShelves'
import { Carousel } from '../components/music/Carousel'
import { Hero, type Release } from '../components/music/Hero'
import { SearchResults } from '../components/music/SearchResults'
import { PlaylistPicker, PlaylistsCarousel, PlaylistView } from '../components/music/Playlists'
import {
  AccountChip, CollectionCarousel, SpotifyDetails, SpotifyQueue, SpotifyTrackList
} from '../components/music/Spotify'
import { queueKey } from '../store/queue'

/**
 * מתחם המוזיקה — נבנה מחדש מאפס.
 *
 * העיקרון: כותרת, שורה; כותרת, שורה. כל מדף הוא קרוסלה אופקית אחת,
 * כך שהעמוד כולו נקרא בגלילה אחת ובלי קירות של כרטיסים. הסדר הולך מהקרוב
 * אל הרחוק — מה ששמעת, מה שבשבילך, מה ששמרת, מה שבמצב רוח, מה שעל המחשב
 * — ורק אחר כך מה שחדש בעולם.
 *
 * חיפוש מחליף את העמוד כולו בתוצאות אחודות מכל המקורות.
 */
export function Music(): React.JSX.Element {
  const t = useT()
  const libraryCards = useCards()
  const [query, setQuery] = useState('')
  const [deezerAccount, setDeezerAccount] = useState<ProviderAccount | null>(null)
  const [spotifyConnected, setSpotifyConnected] = useState(false)
  const [devices, setDevices] = useState<SpotifyDevice[]>([])
  const [spotifyHub, setSpotifyHub] = useState<SpotifyMusicHub | null>(null)
  const [artistDetails, setArtistDetails] = useState<SpotifyArtistDetails | null>(null)
  const [albumDetails, setAlbumDetails] = useState<SpotifyAlbumDetails | null>(null)
  const [spotifyQueue, setSpotifyQueue] = useState<SpotifyTrack[] | null>(null)
  const [showQueue, setShowQueue] = useState(false)
  const [openPlaylist, setOpenPlaylist] = useState<string | null>(null)
  const [showAllLocal, setShowAllLocal] = useState(false)
  const [trending, setTrending] = useState<YouTubeTrack[]>([])
  const [releases, setReleases] = useState<Release[]>([])
  const [ytStatus, setYtStatus] = useState<{ enabled: boolean; searchesLeft: number; exhausted: boolean } | null>(null)
  const queueLength = useQueue((s) => s.items.length)
  const ytPlaying = useYouTube((s) => Boolean(s.track))

  const deezerPremium = deezerAccount?.tier === 'premium'
  const search = useUnifiedSearch(query, libraryCards, deezerPremium)
  const searching = query.trim().length >= 2
  const localItems = useMemo(() => localQueueItems(libraryCards), [libraryCards])
  const localGenres = useMemo(() => {
    const count = new Map<string, number>()
    for (const item of localItems) if (item.genre) count.set(item.genre, (count.get(item.genre) ?? 0) + 1)
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([genre]) => genre)
  }, [localItems])

  const refreshSpotify = (): void => {
    void window.cinema.spotify.connected().then((value) => {
      setSpotifyConnected(value)
      if (!value) {
        setDevices([])
        setSpotifyHub(null)
        return
      }
      void Promise.all([window.cinema.spotify.devices(), window.cinema.spotify.hub()]).then(([nextDevices, hub]) => {
        setDevices(nextDevices)
        setSpotifyHub(hub)
      })
    })
  }
  const refreshDeezer = (): void => void window.cinema.deezer.account().then(setDeezerAccount)
  const refreshYouTube = (): void => void window.cinema.youtube.status().then(setYtStatus)

  useEffect(() => {
    refreshSpotify()
    refreshDeezer()
    refreshYouTube()
    void window.cinema.music.newReleases().then(setReleases).catch(() => setReleases([]))
  }, [])

  // אחרי חיפוש ב-YouTube המונה של החיפושים שנותרו משתנה
  useEffect(() => {
    if (search.youtube) refreshYouTube()
  }, [search.youtube])

  const explore = (value: string): void => setQuery(value)
  const openAlbum = (id: string): void => void window.cinema.spotify.album(id).then((details) => {
    setArtistDetails(null)
    setAlbumDetails(details)
  })

  return (
    <div className="pointer-events-auto absolute inset-0 overflow-y-auto bg-canvas">
      {/* ---------- כותרת וחיפוש — נשארים למעלה בגלילה ---------- */}
      <header className="sticky top-0 z-30 border-b border-ink/6 bg-canvas/80 px-10 pt-7 pb-4 backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <h1 className="font-display text-[32px] leading-none font-extrabold tracking-tight">{t('nav.music')}</h1>
          <div className="glass-thin flex h-11 min-w-[280px] flex-1 items-center gap-3 rounded-full px-4">
            <Icon name="search" size={17} className="text-ink-3" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && ytStatus?.enabled) search.submitYouTube()
                if (event.key === 'Escape') setQuery('')
              }}
              placeholder={t('music.searchEverywhere')}
              aria-label={t('music.searchEverywhere')}
              className="h-full min-w-0 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-ink-3"
            />
            {search.busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink/20 border-t-violet" />}
            {query && <IconButton icon="close" label={t('nav.close')} size={15} className="h-8 w-8" onClick={() => setQuery('')} />}
          </div>
          {queueLength > 0 && (
            <button onClick={() => setShowQueue(true)} className="flex h-11 items-center gap-2 rounded-full bg-violet/16 px-4 text-[12.5px] font-semibold text-violet-bright transition-colors duration-fast hover:bg-violet/24">
              <Icon name="queue" size={15} />
              {t('music.queue')} · {queueLength}
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <AccountChip
            provider="Spotify"
            connected={spotifyConnected}
            detail={spotifyConnected && devices.length > 0 ? t('music.spotifyDevices', { n: devices.length }) : undefined}
            onConnect={() => void window.cinema.spotify.connect().then(refreshSpotify)}
            onDisconnect={() => void window.cinema.spotify.disconnect().then(refreshSpotify)}
          />
          {deezerAccount?.configured !== false && <AccountChip
            provider="Deezer"
            connected={Boolean(deezerAccount?.connected)}
            detail={deezerAccount?.connected
              ? deezerPremium ? t('accounts.premium') : t('accounts.free')
              : undefined}
            onConnect={() => void window.cinema.deezer.connect().then(refreshDeezer)}
            onDisconnect={() => void window.cinema.deezer.disconnect().then(refreshDeezer)}
          />}
          {spotifyConnected && (
            <button onClick={() => void window.cinema.spotify.queue().then(setSpotifyQueue)} className="rounded-full px-3 py-1.5 text-[12px] text-ink-3 transition-colors duration-fast hover:bg-ink/8 hover:text-ink">
              {t('music.spotifyQueue')}
            </button>
          )}
        </div>
      </header>

      {/* כשנגן YouTube צף בפינה, המדף האחרון צריך מקום לגלול מתחתיו */}
      <motion.div
        key={searching ? 'search' : 'home'}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        className={`flex flex-col gap-12 px-10 pt-7 ${ytPlaying ? 'pb-[260px]' : 'pb-20'}`}
      >
        {searching ? (
          <SearchResults search={search} deezerPremium={deezerPremium} youtubeLeft={ytStatus?.enabled ? ytStatus.searchesLeft : null} />
        ) : (
          <>
            <Hero trending={trending} releases={releases} onExplore={explore} />
            <RecentShelf />
            <ForYouShelf local={localItems} trending={trending} />
            <PlaylistsCarousel onOpen={setOpenPlaylist} />
            <MoodsAndGenres localGenres={localGenres} />

            {localItems.length > 0 && (
              showAllLocal ? (
                <div className="flex flex-col gap-3">
                  <LocalMusic cards={libraryCards} />
                  <button onClick={() => setShowAllLocal(false)} className="self-center text-[12.5px] text-ink-3 hover:text-ink">{t('music.showLess')}</button>
                </div>
              ) : (
                <Carousel
                  title={t('music.local')}
                  subtitle={t('music.trackCount', { n: localItems.length })}
                  action={<button onClick={() => setShowAllLocal(true)} className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-ink-2 hover:bg-ink/8 hover:text-ink">{t('music.seeAll')}</button>}
                >
                  {localItems.slice(0, 30).map((item, index) => (
                    <TrackCard
                      key={item.key}
                      item={item}
                      index={index}
                      onPlay={() => useQueue.getState().playList(localItems.map((i) => ({ ...i, key: queueKey() })), index)}
                    />
                  ))}
                </Carousel>
              )
            )}

            <Carousel title={t('music.newReleases')} itemWidth={176}>
              {releases.map((release) => (
                <button key={release.id} onClick={() => explore(`${release.artist} ${release.title}`)} className="group w-full min-w-0 text-start">
                  <span className="card-lift group-hover:card-lift-on relative block aspect-square overflow-hidden rounded-o-lg bg-surf-2">
                    {release.cover && <img src={release.cover} alt="" loading="lazy" className="h-full w-full object-cover" />}
                    <span className="absolute inset-0 grid place-items-center bg-canvas/30 opacity-0 transition-opacity duration-fast group-hover:opacity-100">
                      <span className="grid h-11 w-11 place-items-center rounded-full bg-arctic text-canvas shadow-e3"><Icon name="search" size={16} /></span>
                    </span>
                  </span>
                  <span dir="auto" className="mt-2.5 block truncate text-[13.5px] font-semibold">{release.title}</span>
                  <span dir="auto" className="mt-0.5 block truncate text-[11.5px] text-ink-3">{release.artist}</span>
                </button>
              ))}
            </Carousel>

            <TrendingShelf onTracks={setTrending} />
            <TopArtists onArtist={explore} />
            {ytStatus?.enabled && <PlaylistImport />}

            {spotifyConnected && spotifyHub && (
              <>
                <SpotifyTrackList title={t('music.spotifyTop')} tracks={spotifyHub.personalized} onChanged={refreshSpotify} limit={10} />
                <CollectionCarousel title={t('music.dailyMixes')} items={spotifyHub.mixes} onAlbum={openAlbum} />
                <CollectionCarousel title={t('music.playlists')} items={spotifyHub.playlists} onAlbum={openAlbum} />
                <SpotifyTrackList title={t('music.likedSongs')} tracks={spotifyHub.liked} onChanged={refreshSpotify} limit={10} />
              </>
            )}

            {/* אוסף ריק הוא הזמנה להוסיף תיקייה, לא תוכן — הוא יושב בסוף */}
            {localItems.length === 0 && <LocalMusic cards={libraryCards} />}
          </>
        )}
      </motion.div>

      {showQueue && <QueueDrawer onClose={() => setShowQueue(false)} />}
      {openPlaylist && <PlaylistView id={openPlaylist} onClose={() => setOpenPlaylist(null)} />}
      <PlaylistPicker />
      <SpotifyDetails
        artist={artistDetails}
        album={albumDetails}
        onClose={() => { setArtistDetails(null); setAlbumDetails(null) }}
        onAlbum={openAlbum}
        onChanged={refreshSpotify}
      />
      {spotifyQueue && <SpotifyQueue tracks={spotifyQueue} onClose={() => setSpotifyQueue(null)} onChanged={refreshSpotify} />}
    </div>
  )
}
