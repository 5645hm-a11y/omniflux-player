import type { Http } from '../../legacy_services/ports'
import type { SearchResult } from '../../core/search/types'

/**
 * Deezer — חיפוש מוזיקה.
 *
 * ה-API הציבורי שלהם פתוח לגמרי: אין מפתח, אין רישום, ואין הגבלת
 * מנוי. הוא גם מחזיר `preview` — קטע של שלושים שניות שאפשר לנגן
 * במנוע שלנו, ולכן זו תוצאה שאפשר באמת ללחוץ עליה ולא רק קישור.
 */

const API = 'https://api.deezer.com'

interface DeezerTrack {
  id: number
  title: string
  link: string
  duration: number
  preview: string
  artist: { name: string }
  album: { title: string; cover_xl?: string | null; cover_big?: string | null; cover_medium: string | null }
}

export interface NewRelease {
  id: string
  title: string
  artist: string
  cover: string | null
  releaseDate: string | null
  link: string
}

export interface MusicDiscovery {
  tracks: SearchResult[]
  artists: SearchResult[]
  albums: SearchResult[]
}

interface DeezerArtist {
  id: number
  name: string
  link: string
  picture_medium: string | null
  nb_fan?: number
}

interface DeezerAlbum {
  id: number
  title: string
  link: string
  cover_medium: string | null
  cover_xl?: string | null
  cover_big?: string | null
  artist?: { name?: string }
}

export class DeezerProvider {
  constructor(private readonly http: Http) {}

  async search(query: string, limit = 8): Promise<SearchResult[]> {
    const url = new URL(`${API}/search`)
    url.searchParams.set('q', query)
    url.searchParams.set('limit', String(limit))
    try {
      const res = await this.http(url, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) return []
      const json = (await res.json()) as { data?: DeezerTrack[] }
      return (json.data ?? []).map((track) => this.trackResult(track))
    } catch {
      return []
    }
  }

  /**
   * אלבומים חדשים — "שוחרר השבוע", מהמערכת של Deezer. ציבורי, בלי מפתח
   * ובלי מכסה, ולכן מזין את הבאנר הראשי גם כשאין חשבון מחובר.
   */
  async newReleases(limit = 20): Promise<NewRelease[]> {
    /*
     * ‏releases חוזר ריק באזורים מסוימים — נמדד מישראל: `{"data":[],"total":0}`.
     * הבחירה של העורכים (selection) היא אלבומים חדשים שנבחרו ביד, והיא
     * החלופה: עדיף "נבחר השבוע" מאשר באנר בלי אף אלבום.
     */
    for (const path of ['editorial/0/releases', 'editorial/0/selection']) {
      const found = await this.albums(path, limit)
      if (found.length > 0) return found
    }
    return []
  }

  private async albums(path: string, limit: number): Promise<NewRelease[]> {
    const url = new URL(`${API}/${path}`)
    url.searchParams.set('limit', String(limit))
    try {
      const response = await this.http(url, { signal: AbortSignal.timeout(8000) })
      if (!response.ok) return []
      const body = (await response.json()) as { data?: Array<DeezerAlbum & { release_date?: string }> }
      return (body.data ?? [])
        .filter((album) => album.cover_xl || album.cover_big)
        .map((album) => ({
          id: `deezer:album:${album.id}`,
          title: album.title,
          artist: album.artist?.name ?? '',
          cover: album.cover_xl ?? album.cover_big ?? album.cover_medium,
          releaseDate: album.release_date ?? null,
          link: album.link
        }))
    } catch {
      return []
    }
  }

  /** Public Deezer chart: useful even when the local library is empty. */
  async discovery(limit = 12): Promise<MusicDiscovery> {
    const url = new URL(`${API}/chart/0`)
    url.searchParams.set('limit', String(limit))
    try {
      const response = await this.http(url, { signal: AbortSignal.timeout(8000) })
      if (!response.ok) return { tracks: [], artists: [], albums: [] }
      const body = (await response.json()) as {
        tracks?: { data?: DeezerTrack[] }
        artists?: { data?: DeezerArtist[] }
        albums?: { data?: DeezerAlbum[] }
      }
      const tracks = (body.tracks?.data ?? []).map((track) => this.trackResult(track))
      const artists = (body.artists?.data ?? []).map((artist) => ({
        id: `deezer:artist:${artist.id}`,
        origin: 'music' as const,
        title: artist.name,
        subtitle: artist.nb_fan ? artist.nb_fan.toLocaleString() : '',
        poster: artist.picture_medium,
        year: null,
        rating: 0,
        playable: false,
        externalUrl: artist.link,
        sourceLabel: 'Deezer'
      }))
      const albums = (body.albums?.data ?? []).map((album) => ({
        id: `deezer:album:${album.id}`,
        origin: 'music' as const,
        title: album.title,
        subtitle: album.artist?.name ?? '',
        poster: album.cover_xl ?? album.cover_big ?? album.cover_medium,
        year: null,
        rating: 0,
        playable: false,
        externalUrl: album.link,
        sourceLabel: 'Deezer'
      }))
      return { tracks, artists, albums }
    } catch {
      return { tracks: [], artists: [], albums: [] }
    }
  }

  private trackResult(track: DeezerTrack): SearchResult {
    return {
      id: `deezer:${track.id}`,
      origin: 'music',
      title: track.title,
      subtitle: `${track.artist.name} · ${track.album.title}`,
      poster: track.album.cover_xl ?? track.album.cover_big ?? track.album.cover_medium,
      year: null,
      rating: 0,
      playable: Boolean(track.preview),
      playUri: track.preview || undefined,
      providerTrackId: String(track.id),
      externalUrl: track.link,
      sourceLabel: 'Deezer'
    }
  }
}
