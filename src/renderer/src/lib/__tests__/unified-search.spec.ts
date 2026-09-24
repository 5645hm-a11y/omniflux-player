import { expect, test } from '@playwright/test'
import { aggregate } from '@shared/music-search'
import type { SearchResult, YouTubeTrack } from '@shared/api'
import { catalogHits, libraryHits, queueItemFor, youTubeHits } from '../unified-search'
import type { Card } from '../../store/library'

const card = (id: string, source: 'local' | 'gdrive', fileName: string, audio?: Card['items'][number]['audio']): Card => ({
  id, title: fileName, year: null, poster: null, kind: 'audio', rating: 0, episodes: 0, source,
  items: [{ id, source, uri: `/${fileName}`, fileName, root: '/', trail: [], kind: 'audio', title: fileName, year: null, season: null, episode: null, meta: null, audio }]
})

const result = (over: Partial<SearchResult>): SearchResult => ({
  id: 'x', origin: 'music', title: 'Yellow', subtitle: 'Coldplay · Parachutes', poster: 'cover.jpg', year: null, rating: 0, playable: true, ...over
}) as SearchResult

test('האוסף: תגיות קודמות לשם הקובץ, והדרייב מסומן כדרייב', () => {
  const hits = libraryHits([
    card('a', 'local', 'track01.mp3', { stamp: 's', title: 'Yellow', artist: 'Coldplay', album: 'Parachutes', year: 2000, genre: 'Rock', track: 5, durationSec: 269, cover: 'art://c.jpg' }),
    card('b', 'gdrive', 'Coldplay - Fix You.mp3')
  ])
  expect(hits[0]).toMatchObject({ kind: 'local', title: 'Yellow', artist: 'Coldplay', album: 'Parachutes', cover: 'art://c.jpg' })
  expect(hits[1]).toMatchObject({ kind: 'drive', title: 'Fix You', artist: 'Coldplay' })
})

test('הקטלוג: Spotify מלא, Deezer — קטע של 30 שניות בלי מנוי ומלא עם מנוי', () => {
  const rows = [
    result({ id: 'spotify:1', playUri: 'spotify:track:1', sourceLabel: 'Spotify' }),
    result({ id: 'deezer:2', providerTrackId: '2', playUri: 'https://cdn/preview.mp3', sourceLabel: 'Deezer' })
  ]
  const free = catalogHits(rows, false)
  expect(free.map((h) => `${h.kind}:${h.quality}`)).toEqual(['spotify:full', 'deezer:preview'])
  expect(free[0]).toMatchObject({ artist: 'Coldplay', album: 'Parachutes' })
  expect(catalogHits(rows, true)[1].quality).toBe('full')
})

test('מה נכנס לתור: מקומי, דרייב, YouTube וקטע — Spotify ו-Deezer מלא מתנגנים בנגנים שלהם', () => {
  const yt: YouTubeTrack = { videoId: 'abcdefghijk', title: 'Yellow', artist: 'Coldplay', channel: 'Coldplay', thumbnail: 't.jpg', durationSec: 269 }
  const [song] = aggregate('yellow', [
    ...libraryHits([card('d', 'gdrive', 'Coldplay - Yellow.mp3')]),
    ...catalogHits([
      result({ id: 'spotify:1', playUri: 'spotify:track:1', sourceLabel: 'Spotify' }),
      result({ id: 'deezer:2', providerTrackId: '2', playUri: 'https://cdn/p.mp3', sourceLabel: 'Deezer' })
    ], false),
    ...youTubeHits([yt])
  ])
  const byKind = Object.fromEntries(song.sources.map((s) => [s.kind, queueItemFor(song, s)]))
  expect(byKind.drive).toMatchObject({ source: 'drive', ref: 'd' })
  expect(byKind.youtube).toMatchObject({ source: 'youtube', ref: 'abcdefghijk' })
  expect(byKind.deezer).toMatchObject({ source: 'preview', ref: 'https://cdn/p.mp3' })
  expect(byKind.spotify).toBeNull()
  // העטיפה של התוצאה — מהקטלוג, לא מתמונת הסרטון
  expect(song.cover).toBe('cover.jpg')
})
