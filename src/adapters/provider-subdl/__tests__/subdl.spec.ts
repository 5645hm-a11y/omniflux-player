import { expect, test } from '@playwright/test'
import { extractSubtitleZip, searchSubdl } from '../index'
import type { Http } from '../../../legacy_services/ports'

test('SubDL search authenticates in a header and normalizes safe results', async () => {
  let requestedUrl = ''
  let authorization = ''
  const http: Http = async (url, init) => {
    requestedUrl = String(url)
    authorization = new Headers(init?.headers).get('authorization') ?? ''
    return new Response(JSON.stringify({
      status: true,
      subtitles: [{
        release_name: 'Film.2026.1080p.WEB-DL',
        name: 'Film.en.srt',
        language: 'EN',
        hi: true,
        fps: '23.976',
        match_score: 0.94,
        url: '/subtitle/1234-release.zip?api_key=signed-download-token'
      }]
    }))
  }

  const results = await searchSubdl(http, 'private-key', 'Film.2026.mkv', ['EN', 'en', 'he'])
  expect(authorization).toBe('Bearer private-key')
  expect(requestedUrl).not.toContain('private-key')
  expect(new URL(requestedUrl).searchParams.get('languages')).toBe('en,he')
  expect(results).toEqual([{
    name: 'Film.en.srt',
    release: 'Film.2026.1080p.WEB-DL',
    language: 'EN',
    hearingImpaired: true,
    fps: 23.976,
    matchScore: 0.94,
    downloadPath: '/subtitle/1234-release.zip?api_key=signed-download-token'
  }])
})

test('SubDL search drops download paths outside the provider archive namespace', async () => {
  const http: Http = async () => new Response(JSON.stringify({
    status: true,
    subtitles: [
      { release_name: 'unsafe', url: 'https://example.com/subtitle.zip' },
      { release_name: 'traversal', url: '/subtitle/../secret.zip' },
      { release_name: 'unexpected query', url: '/subtitle/release.zip?redirect=example.com' }
    ]
  }))
  await expect(searchSubdl(http, 'key', 'Film.mkv', ['en'])).resolves.toEqual([])
})

function storedZip(name: string, contents: string): Buffer {
  const filename = Buffer.from(name)
  const data = Buffer.from(contents)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(0, 8)
  local.writeUInt32LE(data.length, 18)
  local.writeUInt32LE(data.length, 22)
  local.writeUInt16LE(filename.length, 26)

  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(0, 10)
  central.writeUInt32LE(data.length, 20)
  central.writeUInt32LE(data.length, 24)
  central.writeUInt16LE(filename.length, 28)
  central.writeUInt32LE(0, 42)

  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(1, 8)
  eocd.writeUInt16LE(1, 10)
  eocd.writeUInt32LE(central.length + filename.length, 12)
  eocd.writeUInt32LE(local.length + filename.length + data.length, 16)
  return Buffer.concat([local, filename, data, central, filename, eocd])
}

test('subtitle ZIP extraction accepts a supported file and strips entry directories', () => {
  const extracted = extractSubtitleZip(storedZip('../../release.srt', '1\n00:00:01,000 --> 00:00:02,000\nHello'))
  expect(extracted.name).toBe('release.srt')
  expect(extracted.data.toString()).toContain('Hello')
})

test('subtitle ZIP extraction rejects unsupported payloads', () => {
  expect(() => extractSubtitleZip(storedZip('payload.exe', 'nope'))).toThrow('SUBDL_NO_SUPPORTED_FILE')
})
