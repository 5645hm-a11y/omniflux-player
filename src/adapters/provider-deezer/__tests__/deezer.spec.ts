import { expect, test } from '@playwright/test'
import { DeezerProvider } from '../index'
import type { Http } from '../../../legacy_services/ports'

test('Deezer discovery maps chart tracks, artists and albums into shared cards', async () => {
  const http: Http = async () => new Response(JSON.stringify({
    tracks: { data: [{
      id: 1,
      title: 'Track',
      link: 'https://deezer.com/track/1',
      duration: 30,
      preview: 'https://preview.dzcdn.net/1.mp3',
      artist: { name: 'Artist' },
      album: { title: 'Album', cover_medium: 'https://example.com/cover.jpg' }
    }] },
    artists: { data: [{ id: 2, name: 'Artist', link: 'https://deezer.com/artist/2', picture_medium: null, nb_fan: 10 }] },
    albums: { data: [{ id: 3, title: 'Album', link: 'https://deezer.com/album/3', cover_medium: null, artist: { name: 'Artist' } }] }
  }))
  const result = await new DeezerProvider(http).discovery()
  expect(result.tracks[0]).toMatchObject({ playable: true, sourceLabel: 'Deezer' })
  expect(result.artists[0]).toMatchObject({ title: 'Artist', playable: false })
  expect(result.albums[0]).toMatchObject({ title: 'Album', playable: false })
})

test('אלבומים חדשים: כש-releases ריק באזור — הבחירה של העורכים', async () => {
  const calls: string[] = []
  const http = async (input: string | URL): Promise<Response> => {
    const url = String(input)
    calls.push(new URL(url).pathname)
    const data = url.includes('/releases')
      ? []
      : [{ id: 7, title: 'Fresh', link: 'https://deezer.com/album/7', cover_medium: 'm.jpg', cover_xl: 'xl.jpg', artist: { name: 'Band' } }]
    return new Response(JSON.stringify({ data, total: data.length }), { status: 200 })
  }
  const releases = await new DeezerProvider(http).newReleases(5)
  expect(calls).toEqual(['/editorial/0/releases', '/editorial/0/selection'])
  expect(releases).toEqual([{ id: 'deezer:album:7', title: 'Fresh', artist: 'Band', cover: 'xl.jpg', releaseDate: null, link: 'https://deezer.com/album/7' }])
})
