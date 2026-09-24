import { expect, test } from '@playwright/test'
import { memoryKv } from '../../../legacy_services/ports'
import {
  DAILY_SEARCHES, YouTubeProvider, cleanTitle, isoDuration, playlistId, quotaDay,
  type QuotaState, type YouTubeCache
} from '..'

/** שרת YouTube מזויף: סופר קריאות לפי משאב, ומחזיר מה שהוגדר */
function fakeYouTube(opts: { quotaExceeded?: boolean; notEmbeddable?: string[] } = {}) {
  const calls: string[] = []
  const video = (id: string, title: string, channel: string) => ({
    id,
    snippet: { title, channelTitle: channel, thumbnails: { high: { url: `https://i.ytimg.com/${id}.jpg` } } },
    contentDetails: { duration: 'PT3M34S' },
    status: { embeddable: !(opts.notEmbeddable ?? []).includes(id) }
  })
  const http = async (input: string | URL): Promise<Response> => {
    const url = new URL(String(input))
    const resource = url.pathname.split('/').pop()!
    calls.push(resource)
    if (opts.quotaExceeded) {
      return new Response(JSON.stringify({ error: { errors: [{ reason: 'quotaExceeded' }] } }), { status: 403 })
    }
    const body = (() => {
      switch (resource) {
        case 'search':
          return { items: [{ id: { videoId: 'bbbbbbbbbbb' } }, { id: { videoId: 'aaaaaaaaaaa' } }] }
        case 'videos':
          if (url.searchParams.get('chart')) return { items: [video('ccccccccccc', 'Hit Song (Official Video)', 'Star VEVO')] }
          // בכוונה בסדר הפוך מזה של החיפוש
          return { items: url.searchParams.get('id')!.split(',').reverse().map((id) => video(id, `Band - Song ${id.slice(0, 1)} (Official Video)`, 'Band')) }
        case 'playlists':
          return { items: [{ snippet: { title: 'My mix' } }] }
        case 'playlistItems':
          return { items: [{ contentDetails: { videoId: 'aaaaaaaaaaa' } }, { contentDetails: { videoId: 'ddddddddddd' } }] }
        default:
          return {}
      }
    })()
    return new Response(JSON.stringify(body), { status: 200 })
  }
  return { http, calls }
}

function provider(http: (input: string | URL) => Promise<Response>, now = () => Date.UTC(2026, 8, 23, 12)) {
  const cache = memoryKv<YouTubeCache>({})
  const quota = memoryKv<QuotaState>({ day: '', searches: 0, exhausted: false })
  return { yt: new YouTubeProvider({ http, apiKey: 'k', cache, quota, now }), cache, quota }
}

test('שם השיר מנוקה מהרעש של הערוץ', () => {
  expect(cleanTitle('Coldplay - Yellow (Official Video)', 'Coldplay')).toEqual({ artist: 'Coldplay', title: 'Yellow' })
  expect(cleanTitle('Yellow [4K Remaster]', 'Coldplay - Topic')).toEqual({ artist: 'Coldplay', title: 'Yellow' })
  expect(cleanTitle('Hello | Live at Wembley', 'AdeleVEVO')).toEqual({ artist: 'Adele', title: 'Hello' })
  expect(cleanTitle('עומר אדם - תגידי (Prod. by X) (קליפ רשמי)', 'Omer Adam')).toEqual({ artist: 'עומר אדם', title: 'תגידי (Prod. by X)' })
  expect(cleanTitle('Tom &amp; Jerry - It&#39;s On', 'x').title).toBe("It's On")
})

test('משך ISO ומזהה פלייליסט', () => {
  expect(isoDuration('PT3M34S')).toBe(214)
  expect(isoDuration('PT1H2M3S')).toBe(3723)
  expect(isoDuration('P1DT1S')).toBe(86401)
  expect(isoDuration(undefined)).toBe(0)
  expect(playlistId('https://music.youtube.com/playlist?list=PLabcdefghijKLMN')).toBe('PLabcdefghijKLMN')
  expect(playlistId('https://www.youtube.com/watch?v=x&list=RDabcdefghijkl')).toBe('RDabcdefghijkl')
  expect(playlistId('PLabcdefghijKLMN')).toBe('PLabcdefghijKLMN')
  expect(playlistId('not a playlist')).toBeNull()
})

test('המכסה מתאפסת בחצות של קליפורניה, לא של המשתמש', () => {
  // 06:59 UTC = 23:59 בקליפורניה של היום הקודם (שעון קיץ)
  expect(quotaDay(Date.UTC(2026, 8, 23, 6, 59))).toBe('2026-09-22')
  expect(quotaDay(Date.UTC(2026, 8, 23, 7, 1))).toBe('2026-09-23')
})

test('חיפוש שומר את סדר התוצאות, וחיפוש חוזר אינו עולה דבר', async () => {
  const server = fakeYouTube()
  const { yt, quota } = provider(server.http)
  const first = await yt.search('Band')
  expect(first.tracks.map((t) => t.videoId)).toEqual(['bbbbbbbbbbb', 'aaaaaaaaaaa'])
  expect(first.tracks[0]).toMatchObject({ artist: 'Band', title: 'Song b', durationSec: 214 })
  expect(server.calls).toEqual(['search', 'videos'])

  const again = await yt.search('  band ')
  expect(again.reason).toBe('cached')
  expect(server.calls).toHaveLength(2)
  expect(quota.read().searches).toBe(1)
})

test('תקרה אישית לחיפושים: המכסה של כולם אינה מתרוקנת בגלל משתמש אחד', async () => {
  const server = fakeYouTube()
  const { yt } = provider(server.http)
  for (let i = 0; i < DAILY_SEARCHES; i++) await yt.search(`query ${i}`)
  const blocked = await yt.search('one more')
  expect(blocked.reason).toBe('daily-limit')
  expect(server.calls.filter((c) => c === 'search')).toHaveLength(DAILY_SEARCHES)
  expect(yt.status().searchesLeft).toBe(0)
})

test('quotaExceeded מהשרת עוצר הכול עד האיפוס, ומשאיר רשימה ישנה במקום מסך ריק', async () => {
  let now = Date.UTC(2026, 8, 23, 12)
  const ok = fakeYouTube()
  const { yt, cache, quota } = provider(ok.http, () => now)
  await yt.trending('IL')
  expect(Object.keys(cache.read())).toContain('trending:IL')

  // שבע שעות אחר כך הרשימה פגה, והשרת אומר שהמכסה נגמרה
  now += 7 * 60 * 60 * 1000
  const exhausted = fakeYouTube({ quotaExceeded: true })
  const later = new YouTubeProvider({ http: exhausted.http, apiKey: 'k', cache, quota, now: () => now })
  const res = await later.trending('IL')
  expect(res.reason).toBe('quota')
  expect(res.tracks).toHaveLength(1)
  expect(later.status().exhausted).toBe(true)
  expect((await later.search('anything')).reason).toBe('quota')
})

test('סרטון שחסום להטמעה אינו מוצג — הוא לא יתנגן אצלנו', async () => {
  const server = fakeYouTube({ notEmbeddable: ['aaaaaaaaaaa'] })
  const { yt } = provider(server.http)
  const res = await yt.search('Band')
  expect(res.tracks.map((t) => t.videoId)).toEqual(['bbbbbbbbbbb'])
})

test('פלייליסט מקישור: שם, שירים בסדר, ונשמר לשעה', async () => {
  const server = fakeYouTube()
  const { yt } = provider(server.http)
  const res = await yt.playlist('https://music.youtube.com/playlist?list=PLabcdefghijKLMN')
  expect(res.title).toBe('My mix')
  expect(res.tracks.map((t) => t.videoId)).toEqual(['aaaaaaaaaaa', 'ddddddddddd'])
  expect(server.calls).toEqual(['playlists', 'playlistItems', 'videos'])
  expect((await yt.playlist('PLabcdefghijKLMN')).reason).toBe('cached')
  expect((await yt.playlist('nope')).reason).toBe('invalid')
})

test('בלי מפתח — סיבה מפורשת, ואף בקשה לא יוצאת', async () => {
  const server = fakeYouTube()
  const yt = new YouTubeProvider({
    http: server.http, apiKey: '',
    cache: memoryKv<YouTubeCache>({}), quota: memoryKv<QuotaState>({ day: '', searches: 0, exhausted: false })
  })
  expect((await yt.search('x y')).reason).toBe('no-key')
  expect(server.calls).toHaveLength(0)
})

test('רעש בלי סוגריים, כתיב בריטי, ושם ואמן בסדר הפוך', () => {
  expect(cleanTitle('Yellow Lyrics', 'Coldplay')).toEqual({ artist: 'Coldplay', title: 'Yellow' })
  expect(cleanTitle('Fille à Papa ft. La Rvfleuze (Visualiser)', 'Vacra')).toEqual({ artist: 'Vacra', title: 'Fille à Papa ft. La Rvfleuze' })
  expect(cleanTitle('Yellow - Coldplay', 'Coldplay')).toEqual({ artist: 'Coldplay', title: 'Yellow' })
  // כשהחלק השני אינו הערוץ — הסדר הרגיל נשמר
  expect(cleanTitle('Coldplay - Yellow', 'ColdplayVEVO')).toEqual({ artist: 'Coldplay', title: 'Yellow' })
})
