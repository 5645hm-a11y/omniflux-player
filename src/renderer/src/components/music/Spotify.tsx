import { motion } from 'motion/react'
import type { SpotifyAlbumDetails, SpotifyArtistDetails, SpotifyCollection, SpotifyTrack } from '@shared/api'
import { useT } from '../../i18n'
import { usePlayer } from '../../store/player'
import { activate } from '../../lib/activate'
import { IconButton } from '../ui'
import { MusicProviderBadge } from '../MusicProviderBadge'
import { Equalizer } from '../Motion'
import { clock } from '../Controls'
import { Carousel } from './Carousel'
import { useEscapeLayer } from '../../store/ui'
import placeholder from '../../assets/placeholder-v2.png'

/**
 * ‏Spotify בתוך המתחם: רצועות, אוספים, אמן ואלבום, והתור שבחשבון.
 *
 * ‏Spotify מנגן בנגן שלו ובתור שלו — ולא בתור האחוד — ולכן החלקים שלו
 * יושבים יחד כאן, מופרדים מהשאר, ומסומנים בתג שלו.
 */

function SpotifyTrackRow({ track, index, following, onChanged }: { track: SpotifyTrack; index: number; following: SpotifyTrack[]; onChanged: () => void }): React.JSX.Element {
  const t = useT()
  const activeId = usePlayer((state) => state.engine.mediaId)
  const paused = usePlayer((state) => state.engine.paused)
  const active = activeId === `spotify:${track.id}`
  const play = (): void => {
    void activate({
      id: `spotify:${track.id}`,
      origin: 'music',
      title: track.title,
      subtitle: `${track.artist} · ${track.album}`,
      poster: track.cover,
      playUri: track.uri,
      queueUris: following.map((item) => item.uri),
      externalUrl: track.externalUrl,
      sourceLabel: 'Spotify'
    })
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.025 }}
      className={`grid grid-cols-[32px_48px_minmax(0,1fr)_auto_auto_auto_auto] items-center gap-3 rounded-o-lg px-3 py-2 ${active ? 'bg-violet/12 ring-1 ring-violet/35' : 'hover:bg-ink/6'}`}
    >
      <button onClick={play} className="grid h-8 w-8 place-items-center rounded-full text-ink-2 hover:bg-ink/10 hover:text-ink">
        {active ? <Equalizer active={!paused} /> : <span className="text-[12px] tabular-nums">{index + 1}</span>}
      </button>
      <img src={track.cover ?? placeholder} alt="" className="h-12 w-12 rounded-o-md object-cover" />
      <button onClick={play} className="min-w-0 text-start">
        <span dir="auto" className="block truncate text-[13.5px] font-semibold">{track.title}</span>
        <span dir="auto" className="block truncate text-[11.5px] text-ink-3">{track.artist} · {track.album}</span>
      </button>
      <span className="text-[11.5px] text-ink-3 tabular-nums">{clock(track.durationMs / 1000)}</span>
      <IconButton icon="queue" label={t('music.addQueue')} size={16} className="h-8 w-8" onClick={() => void window.cinema.spotify.addToQueue(track.uri)} />
      <IconButton
        icon="heart"
        label={track.liked ? t('music.unlike') : t('music.like')}
        active={Boolean(track.liked)}
        size={16}
        className="h-8 w-8"
        onClick={() => void window.cinema.spotify.toggleLike(track.uri, Boolean(track.liked)).then(onChanged)}
      />
      <IconButton icon="external" label={t('search.open')} size={15} className="h-8 w-8" onClick={() => void window.cinema.search.openExternal(track.externalUrl)} />
    </motion.div>
  )
}

export function SpotifyTrackList({ title, tracks, onChanged, limit }: { title: string; tracks: SpotifyTrack[]; onChanged: () => void; limit?: number }): React.JSX.Element | null {
  if (tracks.length === 0) return null
  const shown = limit ? tracks.slice(0, limit) : tracks
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <MusicProviderBadge provider="Spotify" />
        <h2 className="font-display text-[20px] font-bold tracking-tight">{title}</h2>
      </div>
      <div className="glass-ultrathin grid grid-cols-1 gap-x-4 rounded-o-xl p-2 xl:grid-cols-2">
        {shown.map((track, index) => <SpotifyTrackRow key={track.id} track={track} index={index} following={tracks.slice(index + 1)} onChanged={onChanged} />)}
      </div>
    </section>
  )
}

export function CollectionCarousel({ title, items, onAlbum }: { title: string; items: SpotifyCollection[]; onAlbum: (id: string) => void }): React.JSX.Element | null {
  if (items.length === 0) return null
  return (
    <Carousel title={title} itemWidth={168}>
      {items.map((item) => (
        <button key={item.id} onClick={() => item.kind === 'playlist' ? void window.cinema.spotify.play(item.uri) : onAlbum(item.id)} className="group w-full min-w-0 text-start">
          <span className="card-lift group-hover:card-lift-on relative block aspect-square overflow-hidden rounded-o-lg bg-surf-2">
            <img src={item.cover ?? placeholder} alt="" className="h-full w-full object-cover" />
            <span className="absolute end-2 top-2"><MusicProviderBadge provider="Spotify" compact /></span>
          </span>
          <span dir="auto" className="mt-2.5 block truncate text-[13.5px] font-semibold">{item.name}</span>
          <span dir="auto" className="mt-0.5 block truncate text-[11.5px] text-ink-3">{item.subtitle} · {item.totalTracks}</span>
        </button>
      ))}
    </Carousel>
  )
}

/** חיבור בשורה אחת: מחובר או לא, ומה הפעולה. ההסברים המלאים חיים בהגדרות */
export function AccountChip({
  provider,
  connected,
  detail,
  onConnect,
  onDisconnect
}: {
  provider: 'Spotify' | 'Deezer'
  connected: boolean
  detail?: string
  onConnect?: () => void
  onDisconnect: () => void
}): React.JSX.Element {
  const t = useT()
  return (
    <div className="glass-ultrathin flex items-center gap-2.5 rounded-full py-1.5 ps-2 pe-1.5">
      <MusicProviderBadge provider={provider} compact />
      <span className="flex items-center gap-1.5 text-[12px] text-ink-2">
        <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald' : 'bg-ink/30'}`} aria-hidden />
        {detail ?? (connected ? t('accounts.connected') : t('accounts.disconnected'))}
      </span>
      {connected ? (
        <button onClick={onDisconnect} className="rounded-full px-2.5 py-1 text-[11.5px] font-medium text-ink-3 transition-colors duration-fast hover:bg-ink/10 hover:text-ink">
          {t('accounts.disconnect')}
        </button>
      ) : (
        onConnect && (
          <button onClick={onConnect} className="rounded-full bg-ink/10 px-2.5 py-1 text-[11.5px] font-semibold transition-colors duration-fast hover:bg-ink/16 active:scale-95">
            {t('accounts.connect')}
          </button>
        )
      )}
    </div>
  )
}

export function SpotifyDetails({
  artist,
  album,
  onClose,
  onAlbum,
  onChanged
}: {
  artist: SpotifyArtistDetails | null
  album: SpotifyAlbumDetails | null
  onClose: () => void
  onAlbum: (id: string) => void
  onChanged: () => void
}): React.JSX.Element | null {
  const t = useT()
  useEscapeLayer(onClose, Boolean(artist || album))
  if (!artist && !album) return null
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-canvas/80 p-8 backdrop-blur-xl" onClick={onClose}>
      <div className="glass-thick max-h-[82vh] w-full max-w-4xl overflow-y-auto rounded-o-2xl p-7" onClick={(event) => event.stopPropagation()}>
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <img src={(artist?.artist.image ?? album?.album.cover) || placeholder} alt="" className={`h-28 w-28 object-cover ${artist ? 'rounded-full' : 'rounded-o-xl'}`} />
            <div>
              <MusicProviderBadge provider="Spotify" />
              <h2 className="font-display mt-2 text-[28px] font-extrabold">{artist?.artist.name ?? album?.album.name}</h2>
              {album && <p className="mt-1 text-[13px] text-ink-3">{album.album.artist} · {album.album.releaseYear ?? ''} · {clock(album.album.durationMs / 1000)}</p>}
            </div>
          </div>
          <IconButton icon="close" label={t('nav.back')} onClick={onClose} />
        </div>
        {artist && (
          <div className="flex flex-col gap-8">
            <SpotifyTrackList title={t('music.popularFive')} tracks={artist.topTracks} onChanged={onChanged} />
            <CollectionCarousel title={t('music.discography')} items={artist.releases} onAlbum={onAlbum} />
          </div>
        )}
        {album && <SpotifyTrackList title={t('music.tracklist')} tracks={album.tracks} onChanged={onChanged} />}
      </div>
    </div>
  )
}

export function SpotifyQueue({ tracks, onClose, onChanged }: { tracks: SpotifyTrack[]; onClose: () => void; onChanged: () => void }): React.JSX.Element {
  const t = useT()
  useEscapeLayer(onClose)
  return (
    <div className="fixed inset-0 z-[121] flex justify-end bg-canvas/65 backdrop-blur-md" onClick={onClose}>
      <aside className="glass-thick h-full w-[min(440px,92vw)] overflow-y-auto p-6" onClick={(event) => event.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-[22px] font-extrabold">{t('music.queue')}</h2>
          <IconButton icon="close" label={t('nav.back')} onClick={onClose} />
        </div>
        {tracks.length > 0
          ? <SpotifyTrackList title={t('music.upNext')} tracks={tracks} onChanged={onChanged} />
          : <p className="py-12 text-center text-[13px] text-ink-3">{t('music.queueEmpty')}</p>}
      </aside>
    </div>
  )
}
