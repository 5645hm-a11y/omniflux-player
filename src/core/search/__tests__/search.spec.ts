import { expect, test } from '@playwright/test'
import { attachMusicFallbacks, searchLibrary } from '../index'
import type { MediaItem } from '../../library/types'
import type { SearchResult } from '../types'

function music(provider: 'Spotify' | 'Deezer', title: string, artist: string, uri: string): SearchResult {
  return {
    id: `${provider}:${title}`,
    origin: 'music',
    title,
    subtitle: `${artist} · Album`,
    poster: null,
    year: null,
    rating: 0,
    playable: true,
    playUri: uri,
    sourceLabel: provider
  }
}

test('Spotify results receive the matching Deezer preview as a transparent fallback', () => {
  const spotify = music('Spotify', 'The Sound of Silence', 'Disturbed', 'spotify:track:1')
  const deezer = music('Deezer', 'The Sound of Silence', 'Disturbed', 'https://preview.dzcdn.net/1.mp3')
  expect(attachMusicFallbacks([spotify], [deezer])[0].fallbackPlayUri).toBe(deezer.playUri)
})

test('a different artist is not attached as a playback fallback', () => {
  const spotify = music('Spotify', 'Home', 'Artist A', 'spotify:track:1')
  const deezer = music('Deezer', 'Home', 'Artist B', 'https://preview.dzcdn.net/2.mp3')
  expect(attachMusicFallbacks([spotify], [deezer])[0].fallbackPlayUri).toBeUndefined()
})

test('local search tolerates a small spelling mistake', () => {
  const item = {
    id: 'mentalist',
    source: 'local',
    uri: 'C:/Media/The Mentalist.mkv',
    fileName: 'The Mentalist.mkv',
    root: 'C:/Media',
    trail: [],
    kind: 'episode',
    title: 'The Mentalist',
    year: 2008,
    season: 1,
    episode: 1,
    meta: null
  } satisfies MediaItem
  const results = searchLibrary([item], 'mentlist', { local: 'Computer', episodes: (count) => `${count}` })
  expect(results).toHaveLength(1)
})
