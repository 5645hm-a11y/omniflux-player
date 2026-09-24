import { userToken } from './spotify-auth'
import type {
  SpotifyAlbumDetails,
  SpotifyArtist,
  SpotifyArtistDetails,
  SpotifyCollection,
  SpotifyMusicHub,
  SpotifyTrack
} from '../../shared/api'

const API = 'https://api.spotify.com/v1'

type Image = { url?: string; width?: number }
type ArtistObject = { id?: string; uri?: string; name?: string; images?: Image[]; external_urls?: { spotify?: string } }
type AlbumObject = {
  id?: string
  uri?: string
  name?: string
  album_type?: string
  release_date?: string
  total_tracks?: number
  duration_ms?: number
  images?: Image[]
  artists?: ArtistObject[]
  external_urls?: { spotify?: string }
  tracks?: { items?: TrackObject[] }
}
type TrackObject = {
  id?: string
  uri?: string
  name?: string
  duration_ms?: number
  artists?: ArtistObject[]
  album?: AlbumObject
  external_urls?: { spotify?: string }
}
type PlaylistObject = {
  id?: string
  uri?: string
  name?: string
  description?: string
  images?: Image[]
  owner?: { display_name?: string }
  external_urls?: { spotify?: string }
  items?: { total?: number }
  tracks?: { total?: number }
}

async function call(path: string, init?: RequestInit): Promise<Response | null> {
  const token = await userToken()
  if (!token) return null
  try {
    return await fetch(`${API}${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token}`
      }
    })
  } catch {
    return null
  }
}

function art(images?: Image[]): string | null {
  return [...(images ?? [])].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ?? null
}

export function mapTrack(value: TrackObject, liked = false, inherited?: AlbumObject): SpotifyTrack | null {
  const uri = value.uri ?? (value.id ? `spotify:track:${value.id}` : '')
  if (!value.id || !uri || !value.name) return null
  const album = value.album ?? inherited
  const primary = value.artists?.[0] ?? album?.artists?.[0]
  return {
    id: value.id,
    uri,
    title: value.name,
    artist: (value.artists ?? album?.artists ?? []).map((item) => item.name).filter(Boolean).join(', '),
    artistId: primary?.id ?? null,
    album: album?.name ?? '',
    albumId: album?.id ?? null,
    cover: art(album?.images),
    durationMs: Math.max(0, value.duration_ms ?? 0),
    externalUrl: value.external_urls?.spotify ?? `https://open.spotify.com/track/${value.id}`,
    liked
  }
}

function mapPlaylist(value: PlaylistObject): SpotifyCollection | null {
  if (!value.id || !value.name) return null
  return {
    id: value.id,
    uri: value.uri ?? `spotify:playlist:${value.id}`,
    name: value.name,
    subtitle: value.owner?.display_name ?? value.description ?? 'Spotify',
    cover: art(value.images),
    externalUrl: value.external_urls?.spotify ?? `https://open.spotify.com/playlist/${value.id}`,
    kind: 'playlist',
    totalTracks: value.items?.total ?? value.tracks?.total ?? 0
  }
}

function mapAlbum(value: AlbumObject): SpotifyCollection | null {
  if (!value.id || !value.name) return null
  const kind = value.album_type === 'single' ? 'single' : 'album'
  return {
    id: value.id,
    uri: value.uri ?? `spotify:album:${value.id}`,
    name: value.name,
    subtitle: (value.artists ?? []).map((item) => item.name).filter(Boolean).join(', '),
    cover: art(value.images),
    externalUrl: value.external_urls?.spotify ?? `https://open.spotify.com/album/${value.id}`,
    kind,
    totalTracks: value.total_tracks ?? value.tracks?.items?.length ?? 0
  }
}

function mapArtist(value: ArtistObject): SpotifyArtist | null {
  if (!value.id || !value.name) return null
  return {
    id: value.id,
    uri: value.uri ?? `spotify:artist:${value.id}`,
    name: value.name,
    image: art(value.images),
    externalUrl: value.external_urls?.spotify ?? `https://open.spotify.com/artist/${value.id}`
  }
}

async function json<T>(path: string): Promise<T | null> {
  const res = await call(path)
  return res?.ok ? ((await res.json()) as T) : null
}

export async function hub(): Promise<SpotifyMusicHub> {
  const [top, saved, playlistsBody, followed] = await Promise.all([
    json<{ items?: TrackObject[] }>('/me/top/tracks?time_range=short_term&limit=10'),
    json<{ items?: Array<{ track?: TrackObject; item?: TrackObject }> }>('/me/tracks?limit=10'),
    json<{ items?: PlaylistObject[] }>('/me/playlists?limit=10'),
    json<{ artists?: { items?: ArtistObject[] } }>('/me/following?type=artist&limit=10')
  ])
  const playlists = (playlistsBody?.items ?? []).map(mapPlaylist).filter((v): v is SpotifyCollection => Boolean(v))
  return {
    personalized: (top?.items ?? []).map((v) => mapTrack(v)).filter((v): v is SpotifyTrack => Boolean(v)),
    liked: (saved?.items ?? []).map((v) => mapTrack(v.track ?? v.item ?? {}, true)).filter((v): v is SpotifyTrack => Boolean(v)),
    mixes: playlists.filter((v) => /mix|discover weekly|release radar|radar|découvertes/i.test(v.name)),
    playlists,
    artists: (followed?.artists?.items ?? []).map(mapArtist).filter((v): v is SpotifyArtist => Boolean(v))
  }
}

export async function artist(id: string): Promise<SpotifyArtistDetails | null> {
  if (!/^[\w-]{1,80}$/.test(id)) return null
  const artistBody = await json<ArtistObject>(`/artists/${encodeURIComponent(id)}`)
  const mappedArtist = artistBody ? mapArtist(artistBody) : null
  if (!mappedArtist) return null
  const [albums, tracks] = await Promise.all([
    json<{ items?: AlbumObject[] }>(`/artists/${encodeURIComponent(id)}/albums?include_groups=album,single&limit=10`),
    json<{ tracks?: { items?: TrackObject[] } }>(`/search?q=${encodeURIComponent(`artist:"${mappedArtist.name}"`)}&type=track&limit=10`)
  ])
  return {
    artist: mappedArtist,
    topTracks: (tracks?.tracks?.items ?? [])
      .filter((track) => track.artists?.some((item) => item.id === id))
      .map((track) => mapTrack(track))
      .filter((v): v is SpotifyTrack => Boolean(v))
      .slice(0, 5),
    releases: (albums?.items ?? []).map(mapAlbum).filter((v): v is SpotifyCollection => Boolean(v))
  }
}

export async function album(id: string): Promise<SpotifyAlbumDetails | null> {
  if (!/^[\w-]{1,80}$/.test(id)) return null
  const body = await json<AlbumObject>(`/albums/${encodeURIComponent(id)}`)
  const mapped = body ? mapAlbum(body) : null
  if (!body || !mapped) return null
  const tracks = (body.tracks?.items ?? []).map((track) => mapTrack(track, false, body)).filter((v): v is SpotifyTrack => Boolean(v))
  return {
    album: {
      ...mapped,
      releaseYear: body.release_date ? Number(body.release_date.slice(0, 4)) || null : null,
      artist: mapped.subtitle,
      durationMs: tracks.reduce((sum, track) => sum + track.durationMs, 0)
    },
    tracks
  }
}

export async function toggleLike(uri: string, liked: boolean): Promise<boolean> {
  if (!/^spotify:(track|album):[\w-]+$/.test(uri)) return false
  const res = await call('/me/library', { method: liked ? 'DELETE' : 'PUT', body: JSON.stringify({ uris: [uri] }) })
  return Boolean(res && (res.ok || res.status === 204))
}

export async function createPlaylist(name: string): Promise<SpotifyCollection | null> {
  const clean = name.trim().slice(0, 100)
  if (!clean) return null
  const res = await call('/me/playlists', {
    method: 'POST',
    body: JSON.stringify({ name: clean, public: false, description: 'Created with OmniFlux Player' })
  })
  if (!res?.ok) return null
  return mapPlaylist((await res.json()) as PlaylistObject)
}
