import type { Http } from '../../legacy_services/ports'

/**
 * TMDB — כותרים, תקצירים, כרזות, וזמינות בפלטפורמות.
 *
 * החיפוש הטקסטואלי כאן טוב לכותר לועזי וגרוע לעברי. הנתיב העברי
 * עובר קודם דרך ויקינתונים במודול `hebrew`, שמחזיר מזהה מדויק —
 * וכאן רק שולפים לפיו.
 */

const API = 'https://api.themoviedb.org/3'
const IMG = 'https://image.tmdb.org/t/p'

export interface TmdbResult {
  id: number
  title: string
  originalTitle: string
  overview: string
  year: number | null
  posterPath: string | null
  backdropPath: string | null
  rating: number
  popularity: number
  genres: string[]
  runtimeMinutes: number | null
}

interface RawResult {
  id: number
  title?: string
  name?: string
  original_title?: string
  original_name?: string
  overview?: string
  poster_path?: string | null
  backdrop_path?: string | null
  release_date?: string
  first_air_date?: string
  vote_average?: number
  popularity?: number
  genres?: Array<{ name: string }>
  runtime?: number
  episode_run_time?: number[]
}

interface RawVideo {
  key?: string
  site?: string
  type?: string
  official?: boolean
  published_at?: string
  /** שפת האודיו של הסרטון, או null כשלא סומנה */
  iso_639_1?: string | null
}

/** טריילר שנבחר, יחד עם שפת האודיו שלו */
export interface Trailer {
  key: string
  /** קוד ISO 639-1, או null כשהסרטון לא סומן בשפה */
  language: string | null
}

function normalize(r: RawResult): TmdbResult {
  const date = r.release_date ?? r.first_air_date ?? ''
  return {
    id: r.id,
    title: r.title ?? r.name ?? '',
    originalTitle: r.original_title ?? r.original_name ?? '',
    overview: (r.overview ?? '').trim(),
    year: Number(date.slice(0, 4)) || null,
    posterPath: r.poster_path ?? null,
    backdropPath: r.backdrop_path ?? null,
    rating: r.vote_average ?? 0,
    popularity: r.popularity ?? 0,
    genres: (r.genres ?? []).map((g) => g.name),
    runtimeMinutes: r.runtime ?? r.episode_run_time?.[0] ?? null
  }
}

export class TmdbProvider {
  /**
   * השפה נמסרת כפונקציה ולא כמחרוזת.
   *
   * המשתמש יכול להחליף שפה בזמן ריצה, ומופע שנבנה עם מחרוזת היה
   * ממשיך למשוך מטא-דאטה בשפה הישנה עד להפעלה מחדש.
   */
  constructor(
    private readonly http: Http,
    private readonly apiKey: string,
    private readonly language: () => string = () => 'en-US'
  ) {}

  enabled(): boolean {
    return Boolean(this.apiKey)
  }

  private async get<T>(pathname: string, params: Record<string, string> = {}): Promise<T | null> {
    if (!this.apiKey) return null
    const url = new URL(API + pathname)
    url.searchParams.set('api_key', this.apiKey)
    url.searchParams.set('language', this.language())
    for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v)

    /*
     * שלושה ניסיונות, ולא רק על 429.
     *
     * קודם רק "יותר מדי בקשות" גרר ניסיון נוסף, וכל תקלה חולפת
     * אחרת — 5xx או ניתוק רגעי — חזרה כ-null מיד. אצל המשתמש זה
     * נראה ככותר בלי תקציר ובלי שחקנים, בלי שום סימן שמשהו נכשל.
     *
     * שגיאת רשת נזרקת ואינה מחזירה תשובה, ולכן היא נתפסת כאן ולא
     * אצל הקורא: שם היא כבר בלתי ניתנת להבחנה מ"אין תוצאה".
     */
    for (let attempt = 0; attempt < 3; attempt++) {
      const wait = (): Promise<void> =>
        new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
      let res: Response
      try {
        res = await this.http(url, { headers: { Accept: 'application/json' } })
      } catch {
        if (attempt === 2) return null
        await wait()
        continue
      }
      if (res.ok) return (await res.json()) as T
      // 429 = יותר מדי בקשות, 5xx = תקלה אצלם. שתיהן חולפות.
      if (res.status === 429 || res.status >= 500) {
        if (attempt === 2) return null
        await wait()
        continue
      }
      // 401, 404 וכדומה אינם חולפים, ואין טעם לחזור עליהם
      return null
    }
    return null
  }

  async search(type: 'movie' | 'tv', query: string, year: number | null): Promise<TmdbResult[]> {
    const params: Record<string, string> = { query, include_adult: 'false' }
    if (year) params[type === 'movie' ? 'primary_release_year' : 'first_air_date_year'] = String(year)
    const res = await this.get<{ results?: RawResult[] }>(`/search/${type}`, params)
    return (res?.results ?? []).map(normalize)
  }

  async details(type: 'movie' | 'tv', id: number): Promise<TmdbResult | null> {
    const res = await this.get<RawResult>(`/${type}/${id}`)
    return res ? normalize(res) : null
  }

  async findByImdb(imdbId: string): Promise<{ type: 'movie' | 'tv'; result: TmdbResult } | null> {
    const res = await this.get<{ movie_results?: RawResult[]; tv_results?: RawResult[] }>(
      `/find/${encodeURIComponent(imdbId)}`,
      { external_source: 'imdb_id' }
    )
    if (res?.movie_results?.[0]) return { type: 'movie', result: normalize(res.movie_results[0]) }
    if (res?.tv_results?.[0]) return { type: 'tv', result: normalize(res.tv_results[0]) }
    return null
  }

  /**
   * איפה הכותר זמין לצפייה, לפי מדינה.
   *
   * זו הדרך החוקית לחיפוש חוצה-פלטפורמות: אין API ציבורי לקטלוג של
   * נטפליקס או דיסני, אבל TMDB יודע לומר איפה כל כותר יושב ולתת
   * קישור ישיר. משמש בשלב 04.
   */
  async watchProviders(
    type: 'movie' | 'tv',
    id: number,
    region = 'US'
  ): Promise<{
    link: string | null
    flatrate: ProviderRef[]
    rent: ProviderRef[]
    buy: ProviderRef[]
  }> {
    const res = await this.get<{
      results?: Record<string, {
        link?: string
        flatrate?: RawProvider[]
        rent?: RawProvider[]
        buy?: RawProvider[]
      }>
    }>(`/${type}/${id}/watch/providers`)
    const r = res?.results?.[region]
    /*
     * הלוגו מגיע מ-TMDB ולא מקובץ אצלנו.
     *
     * אלה סימנים מסחריים של נטפליקס, דיסני ואחרים, ו-TMDB הוא
     * הצינור המורשה שמגיש אותם יחד עם נתוני הזמינות. שמירת עותקים
     * משלנו הייתה שימוש בסימן מסחרי בלי הרשאה.
     */
    const map = (list: RawProvider[] = []): ProviderRef[] =>
      list.map((p) => ({ name: p.provider_name, logoPath: p.logo_path ?? null }))
    return {
      link: r?.link ?? null,
      flatrate: map(r?.flatrate),
      rent: map(r?.rent),
      buy: map(r?.buy)
    }
  }

  /**
   * כשאין כרזה בשפת הממשק, גלריית התמונות מחזירה את כל הגרסאות.
   * עדיף כרזה בשפת המקור מריבוע ריק.
   */
  async anyImage(type: 'movie' | 'tv', id: number): Promise<{ poster: string | null; backdrop: string | null }> {
    const res = await this.get<{ posters?: TmdbImage[]; backdrops?: TmdbImage[] }>(`/${type}/${id}/images`, {
      language: ''
    })
    const lang = this.language().split('-')[0]
    return {
      poster: bestImage(res?.posters ?? [], lang),
      backdrop: bestImage(res?.backdrops ?? [], lang)
    }
  }


  /**
   * מה שהעולם צופה בו השבוע.
   *
   * זה מה שממלא את הבאנר ואת שורת הטרנדים במסך הבית. TMDB מחזיר
   * סרטים וסדרות מעורבים, ולכן הסוג מגיע בשדה media_type ולא נגזר
   * מהנתיב.
   */
  async trending(limit = 20): Promise<Array<TmdbResult & { type: 'movie' | 'tv' }>> {
    const res = await this.get<{ results?: Array<RawResult & { media_type?: string }> }>('/trending/all/week')
    return (res?.results ?? [])
      .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
      .filter((r) => r.backdrop_path)
      .slice(0, limit)
      .map((r) => ({ ...normalize(r), type: r.media_type === 'tv' ? ('tv' as const) : ('movie' as const) }))
  }

  /** Best official YouTube trailer, with an English fallback when the locale has none. */
  /**
   * הטריילר, בשפת הממשק כשיש כזה.
   *
   * בקשה אחת שמחזירה שלוש קבוצות: שפת הממשק, אנגלית, וסרטונים שלא
   * סומנו בשפה. הגרסה הקודמת ביקשה `language=fr-FR` — שפה ואזור יחד —
   * ופספסה טריילר צרפתי שסומן `fr` עם אזור אחר; ורק אחרי שנכשלה שאלה
   * שוב באנגלית. כאן הדירוג הוא שמכריע: קודם שפת הממשק, אחר כך
   * אנגלית, ורק בתוך כל שפה — רשמי לפני לא רשמי, טריילר לפני טיזר,
   * החדש לפני הישן.
   *
   * השפה של הטריילר שנבחר חוזרת יחד איתו, כדי שהנגן ידע להדליק
   * כתוביות בשפת הממשק כשהטריילר עצמו באנגלית — וזה המצב הנפוץ
   * בעברית ובערבית, שבהן טריילרים מדובבים נדירים.
   */
  async trailer(type: 'movie' | 'tv', id: number): Promise<Trailer | null> {
    const ui = this.language().split('-')[0].toLowerCase()
    const response = await this.get<{ results?: RawVideo[] }>(`/${type}/${id}/videos`, {
      include_video_language: [...new Set([ui, 'en'])].join(',') + ',null'
    })
    const rank = (lang: string | null | undefined): number => {
      const code = (lang ?? '').toLowerCase()
      if (code === ui) return 0
      if (code === 'en') return 1
      return 2
    }
    const best = (response?.results ?? [])
      .filter((video) => video.site === 'YouTube' && Boolean(video.key))
      .filter((video) => video.type === 'Trailer' || video.type === 'Teaser')
      .sort(
        (a, b) =>
          rank(a.iso_639_1) - rank(b.iso_639_1) ||
          Number(Boolean(b.official)) - Number(Boolean(a.official)) ||
          Number(b.type === 'Trailer') - Number(a.type === 'Trailer') ||
          String(b.published_at ?? '').localeCompare(String(a.published_at ?? ''))
      )[0]
    return best?.key ? { key: best.key, language: best.iso_639_1 ? best.iso_639_1.toLowerCase() : null } : null
  }

  async topRatedMovies(limit = 20): Promise<Array<TmdbResult & { type: 'movie' }>> {
    const response = await this.get<{ results?: RawResult[] }>('/movie/top_rated')
    return (response?.results ?? [])
      .filter((result) => result.poster_path)
      .slice(0, limit)
      .map((result) => ({ ...normalize(result), type: 'movie' as const }))
  }

  async popularTv(limit = 20): Promise<Array<TmdbResult & { type: 'tv' }>> {
    const response = await this.get<{ results?: RawResult[] }>('/tv/popular')
    return (response?.results ?? [])
      .filter((result) => result.poster_path)
      .slice(0, limit)
      .map((result) => ({ ...normalize(result), type: 'tv' as const }))
  }

  /**
   * לוגו הכותר על רקע שקוף.
   *
   * זה ההבדל בין באנר שנראה כמו נטפליקס לבין באנר עם כותרת בטקסט:
   * הלוגו הוא נכס גרפי של הסרט עצמו. אם אין לוגו בשפת הממשק,
   * האנגלי משמש — ואם אין בכלל, הממשק נופל לטיפוגרפיה.
   */
  async logo(type: 'movie' | 'tv', id: number): Promise<string | null> {
    const res = await this.get<{ logos?: TmdbImage[] }>(`/${type}/${id}/images`, { language: '' })
    return bestImage(res?.logos ?? [], this.language().split('-')[0])
  }

  /**
   * שחקנים ראשיים.
   *
   * שישה ולא יותר: כרטיס פרטים אינו רשימת קאסט מלאה, והשמות
   * הראשונים הם מה שעונה על "מי משחק בזה".
   */
  async cast(type: 'movie' | 'tv', id: number): Promise<Array<{ name: string; character: string; photo: string | null }>> {
    const res = await this.get<{ cast?: Array<{ name: string; character?: string; profile_path?: string | null }> }>(
      `/${type}/${id}/credits`
    )
    return (res?.cast ?? []).slice(0, 6).map((c) => ({
      name: c.name,
      character: c.character ?? '',
      photo: c.profile_path ? this.imageUrl(c.profile_path, 'w500') : null
    }))
  }

  imageUrl(path: string, size: 'w500' | 'w780' | 'w1280' | 'original' = 'w500'): string {
    return `${IMG}/${size}${path}`
  }
}

interface RawProvider {
  provider_name: string
  logo_path?: string | null
}

/** שם הפלטפורמה יחד עם נתיב הלוגו הרשמי שלה ב-TMDB */
export interface ProviderRef {
  name: string
  logoPath: string | null
}

interface TmdbImage {
  file_path: string
  iso_639_1?: string | null
  vote_average?: number
}

/** עברית, אחריה אנגלית, אחריה תמונה בלי טקסט, ורק אז שפת המקור */
function bestImage(images: TmdbImage[], prefer = 'en'): string | null {
  if (images.length === 0) return null
  /*
   * שפת הממשק ראשונה, אחריה אנגלית, אחריה תמונה בלי טקסט כלל.
   * קודם העברית הייתה מקודדת כאן — ומשתמש צרפתי קיבל כרזות עבריות
   * גם אחרי שכל השאר תורגם.
   */
  const rank = (lang: string | null | undefined): number => {
    if (lang === prefer) return 5
    if (prefer === 'he' && lang === 'iw') return 5
    if (lang === 'en') return 3
    if (!lang) return 2
    return 1
  }
  const sorted = [...images].sort(
    (a, b) => rank(b.iso_639_1) - rank(a.iso_639_1) || (b.vote_average ?? 0) - (a.vote_average ?? 0)
  )
  return sorted[0]?.file_path ?? null
}
