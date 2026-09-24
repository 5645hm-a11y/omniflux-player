import { expect, test } from '@playwright/test'
import { TmdbProvider } from '..'
import { trailerUrl } from '../../../shared/trailer'

/**
 * הטריילר בשפת הממשק.
 *
 * TMDB מקבל `include_video_language` ומחזיר בבקשה אחת את כל השפות
 * שביקשנו. הבחירה היא אצלנו: שפת הממשק קודם, אחר כך אנגלית — ורק
 * בתוך כל שפה רשמי לפני לא רשמי וטריילר לפני טיזר.
 */

const VIDEOS = [
  { key: 'en-trailer', site: 'YouTube', type: 'Trailer', official: true, iso_639_1: 'en', published_at: '2026-01-01' },
  { key: 'fr-teaser', site: 'YouTube', type: 'Teaser', official: true, iso_639_1: 'fr', published_at: '2026-01-02' },
  { key: 'fr-trailer', site: 'YouTube', type: 'Trailer', official: true, iso_639_1: 'fr', published_at: '2025-06-01' },
  { key: 'fr-fan', site: 'YouTube', type: 'Trailer', official: false, iso_639_1: 'fr', published_at: '2026-02-01' },
  { key: 'vimeo', site: 'Vimeo', type: 'Trailer', official: true, iso_639_1: 'fr' }
]

function fake(results: unknown[]): { http: (input: URL | RequestInfo) => Promise<Response>; requests: string[] } {
  const requests: string[] = []
  return {
    requests,
    http: async (input) => {
      requests.push(String(input))
      return Response.json({ results })
    }
  }
}

test('טריילר בשפת הממשק גובר על אנגלית, גם כשהאנגלי חדש יותר', async () => {
  const { http, requests } = fake(VIDEOS)
  const provider = new TmdbProvider(http, 'key', () => 'fr-FR')
  await expect(provider.trailer('movie', 42)).resolves.toEqual({ key: 'fr-trailer', language: 'fr' })

  // בקשה אחת, עם שלוש קבוצות שפה — לא שתי בקשות ברצף
  expect(requests).toHaveLength(1)
  const url = new URL(requests[0])
  expect(url.pathname).toBe('/3/movie/42/videos')
  expect(url.searchParams.get('include_video_language')).toBe('fr,en,null')
})

test('בלי טריילר בשפת הממשק — אנגלית, והשפה חוזרת כדי להדליק כתוביות', async () => {
  const { http } = fake(VIDEOS.filter((v) => v.iso_639_1 !== 'fr'))
  const provider = new TmdbProvider(http, 'key', () => 'he-IL')
  await expect(provider.trailer('movie', 42)).resolves.toEqual({ key: 'en-trailer', language: 'en' })
})

test('בתוך אותה שפה: רשמי לפני מעריצים, טריילר לפני טיזר', async () => {
  const { http } = fake(VIDEOS)
  const provider = new TmdbProvider(http, 'key', () => 'fr-FR')
  const chosen = await provider.trailer('movie', 42)
  expect(chosen?.key, 'לא טיזר ולא סרטון מעריצים').toBe('fr-trailer')
})

test('ממשק באנגלית אינו מבקש את האנגלית פעמיים', async () => {
  const { http, requests } = fake(VIDEOS)
  const provider = new TmdbProvider(http, 'key', () => 'en-US')
  await provider.trailer('tv', 7)
  expect(new URL(requests[0]).searchParams.get('include_video_language')).toBe('en,null')
})

test('אין טריילר ב-YouTube — null, ולא קריסה', async () => {
  const { http } = fake([{ key: 'v', site: 'Vimeo', type: 'Trailer', iso_639_1: 'en' }])
  const provider = new TmdbProvider(http, 'key', () => 'fr-FR')
  await expect(provider.trailer('movie', 1)).resolves.toBeNull()
})

// ---------- הנגן ----------

test('נגן YouTube נפתח בשפת הממשק', () => {
  const url = new URL(trailerUrl('abc123', 'he', 'he'))
  expect(url.searchParams.get('hl')).toBe('he')
  expect(url.searchParams.get('cc_lang_pref')).toBe('he')
})

test('טריילר בשפת הממשק — בלי כתוביות כפולות', () => {
  const url = new URL(trailerUrl('abc123', 'fr', 'fr'))
  expect(url.searchParams.has('cc_load_policy')).toBe(false)
})

test('טריילר אנגלי בממשק עברי — כתוביות בעברית נדלקות מיד', () => {
  const url = new URL(trailerUrl('abc123', 'he', 'en'))
  expect(url.searchParams.get('cc_load_policy')).toBe('1')
  expect(url.searchParams.get('cc_lang_pref')).toBe('he')
})

test('טריילר שלא סומן בשפה — כתוביות נדלקות, ליתר ביטחון', () => {
  const url = new URL(trailerUrl('abc123', 'ar', null))
  expect(url.searchParams.get('cc_load_policy')).toBe('1')
})
