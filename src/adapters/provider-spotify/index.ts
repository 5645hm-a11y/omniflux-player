import type { Http } from '../../legacy_services/ports'
import type { SearchResult } from '../../core/search/types'

/** הודעות המצב של Spotify, מוזרקות בשפת הממשק */
export interface SpotifyMessages {
  noKeys: string
  auth: string
  authStatus: (code: number) => string
  notPremium: string
  search: string
  searchStatus: (code: number) => string
}

let SMSG: SpotifyMessages = {
  noKeys: 'No keys configured',
  auth: 'Authentication failed',
  authStatus: (c) => 'Authentication failed (' + c + ')',
  notPremium: 'The account that owns the app is not Premium',
  search: 'Search failed',
  searchStatus: (c) => 'Search failed (' + c + ')'
}

export function setSpotifyMessages(messages: SpotifyMessages): void {
  SMSG = messages
}


/**
 * Spotify — חיפוש מוזיקה.
 *
 * שים לב למגבלה שאינה בקוד: אפליקציה במצב פיתוח דורשת ש**בעל
 * האפליקציה** יהיה מנוי Premium. בלי זה כל קריאה מוחזרת עם
 * "Active premium subscription required for the owner of the app",
 * גם כשהאסימון תקין לגמרי. אומת מול המפתחות שלנו.
 *
 * לכן המודול נכשל בשקט ומדווח על עצמו כלא-זמין, במקום להפיל את
 * החיפוש כולו. ברגע שיחובר Premium הוא יתחיל לעבוד בלי שינוי קוד.
 */

const API = 'https://api.spotify.com/v1'

interface SpotifyTrack {
  id: string
  name: string
  preview_url: string | null
  /** מזהה בפורמט spotify:track:… — מה שנשלח ל-Connect */
  uri: string
  external_urls: { spotify: string }
  artists: Array<{ name: string }>
  album: { name: string; images: Array<{ url: string; width: number }> }
}

export class SpotifyProvider {
  private unavailableReason: string | null = null

  /*
   * החיפוש רץ באסימון של המשתמש המחובר (PKCE), ולא ב-client credentials.
   * ‏client secret שנצרב בתוכנה שמופצת לכולם — ועוד בקוד פתוח — אינו סוד:
   * כל אחד יכול לחלץ אותו מהקובץ ולהשתמש במכסה של האפליקציה. וממילא
   * תוצאות Spotify מוצגות רק למי שמחובר.
   */
  constructor(
    private readonly http: Http,
    private readonly clientId: string,
    private readonly userToken: () => Promise<string | null>
  ) {}

  configured(): boolean {
    return Boolean(this.clientId)
  }

  /** למה החיפוש אינו פעיל, אם אינו פעיל */
  status(): string | null {
    if (!this.configured()) return SMSG.noKeys
    return this.unavailableReason
  }

  private async accessToken(): Promise<string | null> {
    if (!this.configured()) return null
    return this.userToken().catch(() => null)
  }

  async search(query: string, limit = 8): Promise<SearchResult[]> {
    const token = await this.accessToken()
    if (!token) return []
    const url = new URL(`${API}/search`)
    url.searchParams.set('q', query)
    url.searchParams.set('type', 'track')
    url.searchParams.set('limit', String(limit))
    try {
      const res = await this.http(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000)
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        this.unavailableReason = /premium/i.test(body)
          ? SMSG.notPremium
          : SMSG.searchStatus(res.status)
        return []
      }
      this.unavailableReason = null
      const json = (await res.json()) as { tracks?: { items?: SpotifyTrack[] } }
      return (json.tracks?.items ?? []).map((t) => ({
        id: `spotify:${t.id}`,
        origin: 'music' as const,
        title: t.name,
        subtitle: `${t.artists.map((a) => a.name).join(', ')} · ${t.album.name}`,
        poster: t.album.images.sort((a, b) => a.width - b.width)[1]?.url ?? t.album.images[0]?.url ?? null,
        year: null,
        rating: 0,
        /*
         * ‏preview_url מת.
         *
         * Spotify הפסיקה להגיש קטעי תצוגה מקדימה ב-Web API, ונמדד
         * כאן: אפס מתוך חמש רצועות חזרו עם קישור. לכן הנגינה עוברת
         * דרך Connect — ה-URI נשלח למכשיר של המשתמש, והאודיו מנוגן
         * באפליקציית Spotify שמורשית להגיש אותו.
         */
        playable: true,
        playUri: t.uri,
        externalUrl: t.external_urls.spotify,
        sourceLabel: 'Spotify'
      }))
    } catch (err) {
      this.unavailableReason = err instanceof Error ? err.message : SMSG.search
      return []
    }
  }
}
