import { EventEmitter } from 'node:events'
import type { Brand, HubCard, HubData, HeroSlide, PlayProgress, TitleDetails, WatchLink, WatchlistEntry } from '../../shared/api'
import { serviceLink, signupLink } from '../../shared/deeplink'
import { collapseProviders } from '../../shared/providers'
import { isSubscribed } from './subscriptions'
import type { TmdbProvider, TmdbResult } from '../../adapters/provider-tmdb'
import type { DeezerProvider } from '../../adapters/provider-deezer'
import type { LibraryService } from './library'
import { buildRows, continueRow, recentRow } from '../../core/hub'
import { cacheImage, jsonStore } from './storage'
import { currentLocale, localOnly, watchRegion } from './settings'

/**
 * מסך הבית.
 *
 * שני עקרונות שקובעים את כל המבנה כאן:
 *
 * 1. המסך נפתח מיד. הוא מוגש ממטמון על הדיסק, והרענון רץ ברקע
 *    ומשדר עדכון כשהוא מוכן. מסך בית שממתין לרשת הוא מסך שנפתח
 *    באיחור של שתי שניות בכל הפעלה.
 * 2. מה שאפשר לנגן מנצח. כותר שנמצא בספרייה מוצג ככותר שלנו ולא
 *    כהמלצה מקטלוג, גם אם TMDB החזיר אותו כטרנד.
 */

const CACHE_TTL_MS = 6 * 3600e3
const HERO_COUNT = 5

interface Cached {
  data: HubData
  builtAt: number
  locale: string
}

export class HubService extends EventEmitter {
  private readonly cache = jsonStore<Cached | null>('hub.json', null)
  private readonly progressStore = jsonStore<Record<string, PlayProgress>>('progress.json', {})
  private readonly listStore = jsonStore<WatchlistEntry[]>('watchlist.json', [])
  private building = false
  /** הפריט שמתנגן כרגע, כדי לדעת למי לשמור התקדמות */
  private playingId: string | null = null

  constructor(
    private readonly library: LibraryService,
    private readonly tmdb: TmdbProvider,
    private readonly deezer: DeezerProvider
  ) {
    super()
  }

  // ---------- התקדמות צפייה ----------

  markPlaying(itemId: string | null): void {
    this.playingId = itemId
  }

  /**
   * שומר את מיקום הצפייה.
   *
   * נקרא הרבה — בכל דיווח מצב מהמנוע — ולכן הכתיבה לדיסק מוגבלת
   * בקצב. בלי זה הקובץ נכתב כמה פעמים בשנייה לאורך כל הסרט.
   */
  private lastSave = 0
  recordProgress(position: number, duration: number): void {
    const id = this.playingId
    if (!id || !Number.isFinite(duration) || duration <= 0) return
    if (Date.now() - this.lastSave < 5000) return
    this.lastSave = Date.now()
    const all = { ...this.progressStore.read() }
    all[id] = { position, duration, updatedAt: Date.now() }
    this.progressStore.write(all)
  }

  /** לבדיקות בלבד: כותב התקדמות בלי להמתין לנגינה אמיתית */
  forceProgress(itemId: string, position: number, duration: number): void {
    const all = { ...this.progressStore.read() }
    all[itemId] = { position, duration, updatedAt: Date.now() }
    this.progressStore.write(all)
  }

  progress(): Record<string, PlayProgress> {
    return this.progressStore.read()
  }

  /**
   * פרטי כותר לכרטיס שנפתח בתוך התוכנה.
   *
   * הכל בבקשה אחת: תקציר, שחקנים וזמינות. הממשק פותח מודאל ולא
   * שולח את המשתמש לדפדפן — דף TMDB אינו מה שהוא ביקש לראות.
   */
  async details(id: string): Promise<TitleDetails | null> {
    const libraryId = /^library:(.+)$/.exec(id)
    if (libraryId) {
      const itemId = decodeURIComponent(libraryId[1])
      const item = this.library.catalog().items.find((candidate) => candidate.id === itemId)
      if (!item) return null
      const meta = item.meta
      if (meta?.tmdbId && meta.tmdbType) {
        const enriched = await this.details(`tmdb:${meta.tmdbType}:${meta.tmdbId}`)
        if (enriched) return { ...enriched, id, playable: true, itemId }
      }
      return {
        id,
        title: meta?.title || item.title,
        overview: meta?.overview ?? '',
        backdrop: meta?.backdrop ?? null,
        poster: meta?.poster ?? null,
        logo: null,
        year: meta?.year ?? item.year,
        rating: meta?.rating ?? 0,
        genres: meta?.genres ?? [],
        runtimeMinutes: meta?.runtimeMinutes ?? null,
        cast: [],
        watch: [],
        fallbackUrl: null,
        playable: true,
        itemId,
        trailerKey: null,
        trailerLang: null
      }
    }
    const typed = /^tmdb:(movie|tv):(\d+)$/.exec(id)
    const bare = typed ? null : /^tmdb:(\d+)$/.exec(id)
    if (!typed && !bare) return null
    const tmdbId = Number(typed ? typed[2] : bare![1])

    /*
     * מזהה בלי סוג הוא ירושה: כך נשמרו כרטיסים ברשימת הצפייה לפני
     * שהסוג נכנס למזהה. לנחש "סרט" אינו מספיק — מספר של סדרה קיים
     * לרוב גם בצד הסרטים, על כותר אחר. לכן שתי הבקשות יוצאות, ומה
     * שחוזר הוא זה שקיים.
     */
    let type: 'movie' | 'tv'
    if (typed) {
      type = typed[1] as 'movie' | 'tv'
    } else {
      const [asMovie, asTv] = await Promise.all([
        this.tmdb.details('movie', tmdbId).catch(() => null),
        this.tmdb.details('tv', tmdbId).catch(() => null)
      ])
      if (!asMovie && !asTv) return null
      type = asMovie ? 'movie' : 'tv'
    }
    const lang = currentLocale()

    const [full, cast, providers, logoPath, trailer] = await Promise.all([
      this.tmdb.details(type, tmdbId).catch(() => null),
      this.tmdb.cast(type, tmdbId).catch(() => []),
      this.tmdb.watchProviders(type, tmdbId, watchRegion()).catch(() => null),
      this.tmdb.logo(type, tmdbId).catch(() => null),
      this.tmdb.trailer(type, tmdbId).catch(() => null)
    ])
    if (!full) return null

    const mine = this.libraryIndex().get(this.key(full.title, full.year))
    const [backdrop, poster, logo] = await Promise.all([
      full.backdropPath ? cacheImage(this.tmdb.imageUrl(full.backdropPath, 'w1280'), `bd${tmdbId}-${lang}`) : null,
      full.posterPath ? cacheImage(this.tmdb.imageUrl(full.posterPath, 'w500'), `p${tmdbId}-${lang}`) : null,
      logoPath ? cacheImage(this.tmdb.imageUrl(logoPath, 'w500'), `lg${tmdbId}-${lang}`) : null
    ])

    const link = async (
      list: Array<{ name: string; logoPath: string | null }>,
      kind: 'flatrate' | 'rent' | 'buy'
    ): Promise<WatchLink[]> =>
      Promise.all(
        list.map(async (p) => ({
          provider: p.name,
          logo: p.logoPath
            ? await cacheImage(this.tmdb.imageUrl(p.logoPath, 'w500'), `pv${p.logoPath.replace(/\W/g, '')}`)
            : null,
          kind,
          url: serviceLink(p.name, full.title),
          signupUrl: signupLink(p.name),
          subscribed: isSubscribed(p.name)
        }))
      )

    const watch = collapseProviders(
      [
        ...(await link(providers?.flatrate ?? [], 'flatrate')),
        ...(await link(providers?.rent ?? [], 'rent')),
        ...(await link(providers?.buy ?? [], 'buy'))
      ],
      (w) => w.provider,
      (w) => w.kind
    )

    return {
      id,
      title: full.title,
      overview: full.overview,
      backdrop,
      poster,
      logo,
      year: full.year,
      rating: full.rating,
      genres: full.genres.slice(0, 4),
      runtimeMinutes: full.runtimeMinutes,
      cast,
      watch,
      fallbackUrl: providers?.link ?? null,
      playable: Boolean(mine),
      itemId: mine,
      trailerKey: trailer?.key ?? null,
      trailerLang: trailer?.language ?? null
    }
  }

  /**
   * השירותים שהופיעו באזור של המשתמש.
   *
   * הרשימה נאספת מהטרנדים שכבר נמשכו, ולא מרשימה קבועה: מה שרלוונטי
   * בצרפת אינו מה שרלוונטי בישראל, ורשימה מקובעת הייתה מציעה
   * שירותים שאינם קיימים שם.
   */
  async knownProviders(): Promise<Array<{ name: string; logo: string | null }>> {
    const seen = new Map<string, string | null>()
    const trending = await this.tmdb.trending(20).catch(() => [])
    for (const r of trending.slice(0, 12)) {
      const p = await this.tmdb.watchProviders(r.type, r.id, watchRegion()).catch(() => null)
      for (const item of [...(p?.flatrate ?? []), ...(p?.rent ?? [])]) {
        if (!seen.has(item.name)) seen.set(item.name, item.logoPath)
      }
    }
    // וריאנט שהבסיס שלו ברשימה אינו בחירה נפרדת: מנוי לבסיס מכסה אותו
    const names = collapseProviders([...seen.keys()], (name) => name)
    return Promise.all(
      [...seen.entries()]
        .filter(([name]) => names.includes(name))
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(async ([name, logoPath]) => ({
          name,
          logo: logoPath
            ? await cacheImage(this.tmdb.imageUrl(logoPath, 'w500'), `pv${logoPath.replace(/\W/g, '')}`)
            : null
        }))
    )
  }

  // ---------- רשימת צפייה ----------

  /**
   * מוסיף או מסיר.
   *
   * פעולה אחת לשני הכיוונים, כי הכפתור בממשק אחד — ושתי פעולות
   * נפרדות היו מאפשרות מצב שבו הכפתור אומר דבר אחד והרשימה אחר.
   */
  toggleWatchlist(entry: Omit<WatchlistEntry, 'addedAt'>): boolean {
    const list = this.listStore.read()
    const without = list.filter((e) => e.id !== entry.id)
    const added = without.length === list.length
    this.listStore.write(added ? [{ ...entry, addedAt: Date.now() }, ...without] : without)
    this.emit('data', this.data())
    return added
  }

  inWatchlist(id: string): boolean {
    return this.listStore.read().some((e) => e.id === id)
  }

  watchlist(): WatchlistEntry[] {
    return this.listStore.read()
  }

  /** הרשימה כשורת כרטיסים */
  private watchlistRow(): HubCard[] {
    return this.listStore
      .read()
      .slice(0, 20)
      .map((e) => ({
        id: e.id,
        title: e.title,
        subtitle: '',
        poster: e.poster,
        year: e.year,
        rating: e.rating,
        quality: null,
        source: e.itemId ? ('local' as const) : ('catalog' as const),
        brand: e.brand,
        playable: Boolean(e.itemId),
        itemId: e.itemId,
        externalUrl: e.externalUrl
      }))
  }

  // ---------- הנתונים ----------

  /** מוגש מיד. מרענן ברקע אם המטמון ישן או בשפה אחרת. */
  data(): HubData {
    const snap = this.snapshot()
    if (!snap.fresh) void this.refresh()
    return snap.data
  }

  /**
   * מה שיש כרגע, בלי לבקש בנייה.
   *
   * ההפרדה הזאת אינה קוסמטית: `data` הייתה קוראת ל-`refresh`, ובזמן
   * בנייה `refresh` הייתה חוזרת ל-`data` — שתיהן סינכרוניות עד
   * ה-await הראשון, ולכן קריאה ל-`data` באמצע בנייה נכנסה לרקורסיה
   * אינסופית והפילה את התהליך הראשי. עכשיו הצומת המשותף אינו מבקש
   * דבר.
   */
  private snapshot(): { data: HubData; fresh: boolean } {
    const cached = this.cache.read()
    const locale = currentLocale()
    const fresh = Boolean(
      cached && cached.locale === locale && Date.now() - cached.builtAt < CACHE_TTL_MS
    )

    /*
     * גם במצב הטעינה השורות עוברות סינון.
     *
     * localRows מחזיר שלוש שורות תמיד, גם ריקות, ובלי הסינון הממשק
     * צייר שלוש כותרות בלי כרטיסים מתחתיהן — בדיוק המסך הריק שהשלד
     * אמור להחליף.
     */
    if (!cached) return { data: { hero: [], rows: buildRows(this.localRows()), loading: true }, fresh }
    // השורות המקומיות תמיד טריות: הן מגיעות מהקטלוג ולא מהרשת
    return { data: { ...cached.data, rows: this.merge(cached.data.rows), loading: !fresh }, fresh }
  }

  /** בונה מחדש מול הרשת. */
  async refresh(): Promise<HubData> {
    if (this.building) return this.snapshot().data
    this.building = true
    // השפה שבה הבנייה יצאה לדרך
    const startedIn = currentLocale()
    try {
      /*
       * ספרייה בלבד: אף בקשה אינה יוצאת.
       *
       * הבדיקה כאן ולא בכל בונה בנפרד, כי זו נקודה אחת שקל לאמת —
       * מצב שנאכף בחמישה מקומות שוכח את השישי.
       */
      const offline = localOnly()
      const [hero, trending, topRated, popularTv, music] = offline
        ? [[], [], [], [], []]
        : await Promise.all([
            this.buildHero(),
            this.buildTrending(),
            this.buildCatalogRow(this.tmdb.topRatedMovies(20)),
            this.buildCatalogRow(this.tmdb.popularTv(20)),
            this.buildMusic()
          ])
      const data: HubData = {
        hero,
        rows: buildRows([
          ...this.localRows().map((r) => ({ key: r.key, cards: r.cards })),
          { key: 'trending' as const, cards: trending },
          { key: 'topRated' as const, cards: topRated },
          { key: 'popularTv' as const, cards: popularTv },
          { key: 'music' as const, cards: music }
        ]),
        loading: false
      }
      /*
       * בנייה שהתחילה בשפה אחת ומסתיימת אחרי החלפת שפה נזרקת.
       *
       * `invalidate` כבר ניקה את המטמון בזמן ההחלפה, אבל הבנייה
       * שהייתה באוויר הספיקה לכתוב מעליו — ומשתמש שהחליף לאיטלקית
       * בשניות הראשונות קיבל ממשק איטלקי עם תקציר בצרפתית. נצפה
       * בצילום מסך, לא נוחש.
       */
      if (currentLocale() !== startedIn) {
        this.building = false
        return await this.refresh()
      }

      this.cache.write({ data, builtAt: Date.now(), locale: startedIn })
      const merged = { ...data, rows: this.merge(data.rows) }
      this.emit('data', merged)
      return merged
    } finally {
      this.building = false
    }
  }

  /** מבטל את המטמון — נקרא בהחלפת שפה, שבה כל הטקסטים משתנים */
  invalidate(): void {
    this.cache.write(null)
  }

  // ---------- בנייה ----------

  /** השורות שנבנות מהקטלוג בלבד, בלי רשת */
  private localRows(): Array<{ key: 'continue' | 'watchlist' | 'recent'; cards: HubCard[] }> {
    const items = this.library.catalog().items
    const progress = this.progressStore.read()
    return [
      { key: 'continue', cards: continueRow(items, progress) },
      { key: 'watchlist', cards: this.watchlistRow() },
      { key: 'recent', cards: recentRow(items, progress) }
    ]
  }

  /** מחליף את השורות המקומיות בגרסה עדכנית, ומשאיר את שורות הרשת */
  private merge(rows: HubData['rows']): HubData['rows'] {
    const local = new Map(this.localRows().map((r) => [r.key, r.cards]))
    const out: HubData['rows'] = []
    for (const key of ['continue', 'watchlist', 'trending', 'topRated', 'popularTv', 'recent', 'music'] as const) {
      const cards = local.get(key as 'continue' | 'watchlist' | 'recent') ?? rows.find((r) => r.key === key)?.cards ?? []
      if (cards.length > 0) out.push({ key, cards })
    }
    return out
  }

  /**
   * הבאנר.
   *
   * נלקח מהטרנדים, אבל רק כותרים שיש להם רקע רחב ולוגו — באנר בלי
   * לוגו נראה כמו תמונה עם כיתוב, לא כמו נטפליקס. הלוגואים נמשכים
   * במקביל כי כל אחד הוא בקשה נפרדת.
   */
  private async buildHero(): Promise<HeroSlide[]> {
    if (!this.tmdb.enabled()) return []
    /*
     * השפה נכנסת למפתח המטמון.
     *
     * בלעדיה כרזה שנשמרה בשפה אחת נשארת לנצח: הקובץ קיים, הבדיקה
     * מוצאת אותו, ואף אחד לא מוריד את הגרסה החדשה. נצפה בפועל —
     * ממשק בערבית עם לוגו בעברית וכרזות בצרפתית.
     */
    const lang = currentLocale()
    const trending = await this.tmdb.trending(14).catch(() => [])
    const inLibrary = this.libraryIndex()

    const slides = await Promise.all(
      trending.slice(0, HERO_COUNT * 2).map(async (r) => {
        const [logoPath, backdrop, trailer] = await Promise.all([
          this.tmdb.logo(r.type, r.id).catch(() => null),
          r.backdropPath ? cacheImage(this.tmdb.imageUrl(r.backdropPath, 'w1280'), `bd${r.id}-${lang}`) : null,
          this.tmdb.trailer(r.type, r.id).catch(() => null)
        ])
        const logo = logoPath ? await cacheImage(this.tmdb.imageUrl(logoPath, 'w500'), `lg${r.id}-${lang}`) : null
        const mine = inLibrary.get(this.key(r.title, r.year))
        const providers = await this.tmdb
          .watchProviders(r.type, r.id, watchRegion())
          .catch(() => null)
        const primaryProvider = providers?.flatrate[0] ?? providers?.rent[0] ?? null
        const subscribed = Boolean(primaryProvider && isSubscribed(primaryProvider.name))
        return {
          id: `tmdb:${r.type}:${r.id}`,
          title: r.title,
          overview: r.overview,
          backdrop,
          logo,
          year: r.year,
          rating: r.rating,
          genres: r.genres.slice(0, 3),
          playable: Boolean(mine),
          itemId: mine,
          externalUrl:
            subscribed && primaryProvider
              ? (serviceLink(primaryProvider.name, r.title) ?? providers?.link ?? undefined)
              : (providers?.link ?? undefined),
          brand: await this.brandOf(primaryProvider),
          subscribed,
          trailerKey: trailer?.key,
          trailerLang: trailer?.language ?? null
        }
      })
    )
    /*
     * שקופית שאין ממנה לאן ללכת אינה נכנסת לבאנר.
     *
     * כותר שאינו בספרייה ואין לו זמינות מציג כפתור ראשי מושבת ודהוי
     * — הדבר הראשון שרואים בתוכנה, ואי אפשר ללחוץ עליו. נצפה בפועל
     * על כותר שטרם יצא.
     */
    const usable = slides.filter((s) => s.backdrop && (s.playable || s.externalUrl || s.trailerKey))
    // אם אין אף כותר שמיש, עדיף באנר עם רקע מאשר מסך ריק
    return (usable.length > 0 ? usable : slides.filter((s) => s.backdrop)).slice(0, HERO_COUNT)
  }

  private async buildTrending(): Promise<HubCard[]> {
    if (!this.tmdb.enabled()) return []
    const lang = currentLocale()
    const trending = await this.tmdb.trending(20).catch(() => [])
    const inLibrary = this.libraryIndex()
    const cards = await Promise.all(
      trending.map(async (r) => {
        const mine = inLibrary.get(this.key(r.title, r.year))
        const provider = mine ? null : await this.providerOf(r.type, r.id)
        const subscribed = Boolean(provider && isSubscribed(provider.name))
        return {
          /*
           * הסוג הוא חלק מהמזהה, ולא רק המספר.
           *
           * ‏TMDB מנהל שני מרחבי מספרים נפרדים, לסרטים ולסדרות, ואותו
           * מספר קיים בשניהם על שני כותרים שונים לגמרי. בלי הסוג
           * כרטיס הפרטים ניחש "סרט": סדרה נפלה ל-404, ומה שגרוע יותר
           * — סדרה שמספרה תפוס גם בצד הסרטים החזירה סרט אחר, עם
           * תקציר ושחקנים שאינם שלה. נצפה על Lanterns ועל Reacher.
           */
          id: `tmdb:${r.type}:${r.id}`,
          title: r.title,
          subtitle: '',
          poster: r.posterPath ? await cacheImage(this.tmdb.imageUrl(r.posterPath, 'w500'), `p${r.id}-${lang}`) : null,
          year: r.year,
          rating: r.rating,
          quality: null,
          source: mine ? ('local' as const) : ('catalog' as const),
          brand: await this.brandOf(provider),
          subscribed,
          playable: Boolean(mine),
          itemId: mine,
          externalUrl: subscribed && provider ? (serviceLink(provider.name, r.title) ?? undefined) : undefined
        }
      })
    )
    return cards.filter((c) => c.poster).slice(0, 10)
  }

  private async buildCatalogRow(
    request: Promise<Array<TmdbResult & { type: 'movie' | 'tv' }>>
  ): Promise<HubCard[]> {
    if (!this.tmdb.enabled()) return []
    const lang = currentLocale()
    const results = await request.catch(() => [])
    const inLibrary = this.libraryIndex()
    return Promise.all(results.map(async (result) => {
      const mine = inLibrary.get(this.key(result.title, result.year))
      return {
        id: `tmdb:${result.type}:${result.id}`,
        title: result.title,
        subtitle: '',
        poster: result.posterPath
          ? await cacheImage(this.tmdb.imageUrl(result.posterPath, 'w500'), `p${result.type}${result.id}-${lang}`)
          : null,
        year: result.year,
        rating: result.rating,
        quality: null,
        source: mine ? ('local' as const) : ('catalog' as const),
        brand: null,
        playable: Boolean(mine),
        itemId: mine
      }
    })).then((cards) => cards.filter((card) => card.poster))
  }

  /** פסקולים: חיפוש קצר ב-Deezer סביב הכותרים שכבר בספרייה */
  private async buildMusic(): Promise<HubCard[]> {
    const items = this.library.catalog().items
    const seeds = [...new Set(items.map((i) => i.meta?.title ?? i.title))].slice(0, 4)
    if (seeds.length === 0) return []
    const results = await Promise.all(
      seeds.map((title) =>
        this.deezer.search(`${title} soundtrack`).catch(() => [])
      )
    )
    /*
     * הכפילות אינה במזהה אלא בעטיפה.
     *
     * חמישה רצועות מאותו פסקול הן חמישה מזהים שונים ואותה תמונה
     * בדיוק, ולכן השורה הראתה חמש פעמים את אותו אלבום. המפתח הוא
     * העטיפה, ובהיעדרה שם הכותר.
     */
    const seen = new Set<string>()
    const out: HubCard[] = []
    for (const list of results) {
      for (const r of list.slice(0, 5)) {
        const key = r.poster ?? r.title.toLowerCase().replace(/\s+/g, ' ').trim()
        if (seen.has(key)) continue
        seen.add(key)
        out.push({
          id: r.id,
          title: r.title,
          subtitle: r.subtitle,
          poster: r.poster,
          year: null,
          rating: 0,
          quality: null,
          source: 'music',
          brand: { name: r.sourceLabel, logo: null },
          playable: Boolean(r.playUri),
          playUri: r.playUri,
          externalUrl: r.externalUrl
        })
      }
    }
    return out.slice(0, 20)
  }

  /**
   * לוגו הפלטפורמה, מוגש דרך המטמון שלנו.
   *
   * הלוגו עצמו נשאר של TMDB — אנחנו רק מקצרים את הדרך אליו כדי
   * שהכרטיס לא יבקש רשת בכל ציור.
   */
  private async brandOf(ref: { name: string; logoPath: string | null } | null): Promise<Brand | null> {
    if (!ref) return null
    const logo = ref.logoPath
      ? await cacheImage(this.tmdb.imageUrl(ref.logoPath, 'w500'), `pv${ref.logoPath.replace(/\W/g, '')}`)
      : null
    return { name: ref.name, logo }
  }

  /** הפלטפורמה הראשית של כותר, לצורך התג על הכרטיס */
  private async providerOf(type: 'movie' | 'tv', id: number) {
    const p = await this.tmdb.watchProviders(type, id, watchRegion()).catch(() => null)
    return p?.flatrate[0] ?? p?.rent[0] ?? p?.buy[0] ?? null
  }

  // ---------- עזר ----------

  private key(title: string, year: number | null): string {
    return `${title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')}|${year ?? ''}`
  }

  /** מיפוי כותר → מזהה פריט, כדי לדעת מה כבר אצלנו */
  private libraryIndex(): Map<string, string> {
    const map = new Map<string, string>()
    for (const item of this.library.catalog().items) {
      const meta = item.meta && !item.meta.notFound ? item.meta : null
      map.set(this.key(meta?.title ?? item.title, meta?.year ?? item.year), item.id)
      if (meta?.originalTitle) map.set(this.key(meta.originalTitle, meta.year), item.id)
    }
    return map
  }
}
