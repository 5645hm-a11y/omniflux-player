import { expect, test } from '@playwright/test'
import { DriveSource } from '../index'
import type { Http } from '../../../legacy_services/ports'

test('Drive metadata requests accept an asynchronous OAuth bearer token', async () => {
  let authorization = ''
  const http: Http = async (_url, init) => {
    authorization = new Headers(init?.headers).get('authorization') ?? ''
    return new Response(JSON.stringify({ id: 'folder-id', name: 'Films', mimeType: 'application/vnd.google-apps.folder' }))
  }
  const drive = new DriveSource({
    http,
    apiKey: 'public-key',
    authHeader: async () => 'Bearer private-token'
  })

  await expect(drive.verify('folder-id')).resolves.toEqual({ ok: true, name: 'Films' })
  expect(authorization).toBe('Bearer private-token')
})

test('Drive scan emits the direct alt=media URL without putting OAuth tokens in it', async () => {
  const http: Http = async () => new Response(JSON.stringify({
    files: [{ id: 'video-file-id', name: 'Film.2026.1080p.mkv', mimeType: 'video/x-matroska' }]
  }))
  const drive = new DriveSource({ http, apiKey: 'public-key' })
  const items = await drive.scan('folder-id')

  expect(items).toHaveLength(1)
  const url = new URL(items[0].uri)
  expect(url.origin).toBe('https://www.googleapis.com')
  expect(url.pathname).toBe('/drive/v3/files/video-file-id')
  expect(url.searchParams.get('alt')).toBe('media')
  expect(url.searchParams.get('key')).toBe('public-key')
  expect(items[0].uri).not.toContain('private-token')
})

/*
 * האסימון נשאר בתהליך הראשי.
 *
 * ההתנהגות עצמה נבדקת מול שרת מזויף ב-drive-engine.spec.ts. כאן
 * נועלים רק את גבולות האבטחה: השרת המקומי מאזין ל-127.0.0.1 בלבד,
 * האסימון עובר בכותרת ולא בכתובת, ואף אחד מהם אינו מגיע ל-mpv או
 * לממשק.
 */
test('Drive playback keeps OAuth in the main process and listens on loopback only', async () => {
  const fs = await import('node:fs')
  const path = await import('node:path')
  const root = process.cwd()
  const library = fs.readFileSync(path.join(root, 'src/main/services/library.ts'), 'utf8')
  const engine = fs.readFileSync(path.join(root, 'src/main/services/drive-engine.ts'), 'utf8')
  const mpv = fs.readFileSync(path.join(root, 'src/main/engine/mpv.ts'), 'utf8')
  expect(library).toContain('this.driveStream.open(item.uri)')
  expect(engine).toContain("server.listen(0, '127.0.0.1'")
  expect(engine).toContain('Authorization: `Bearer ${token}`')
  // האסימון לעולם אינו פרמטר בכתובת — כתובות נרשמות ביומנים ובהיסטוריה
  expect(engine).not.toMatch(/searchParams\.set\(['"]access_token/)
  expect(library).toContain("t('status.driveQuota')")
  expect(mpv).toContain("this.set('http-header-fields', headers.join(','))")
  expect(mpv).toContain('never exposed through EngineState')
})
