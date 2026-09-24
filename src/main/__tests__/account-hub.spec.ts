import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string): string => fs.readFileSync(path.join(root, file), 'utf8')

test('Spotify requests playback, profile and device control scopes', () => {
  const source = read('src/main/services/spotify-auth.ts')
  for (const scope of ['streaming', 'user-read-email', 'user-read-private', 'user-read-playback-state', 'user-modify-playback-state']) {
    expect(source).toContain(`'${scope}'`)
  }
  expect(source).toContain("fetch('https://api.spotify.com/v1/me'")
  expect(source).toContain("profile.product === 'premium'")
})

/*
 * הסדר הפוך מבעבר, ובכוונה. העברה ואחריה ניגון הן שתי פקודות שמגיעות
 * למכשיר כמעט יחד: נמדד מול בנייה חתומה ו-Premium — state_conflict,
 * ה-SDK מאפס את הנגן ואינו מוריד שמע, ואין צליל. ניגון עם device_id
 * לבדו מפעיל את המכשיר; העברה רק כשהוא עונה 404.
 */
test('Spotify dispatches the track with device_id first, and transfers only after a 404', () => {
  const source = read('src/main/services/spotify-connect.ts')
  const firstPlay = source.indexOf('let res = await start()')
  const notFound = source.indexOf('if (res?.status === 404) {', firstPlay)
  const transfer = source.indexOf("const transfer = await call('/me/player'")
  expect(source).toContain("call(`/me/player/play?device_id=")
  expect(firstPlay).toBeGreaterThan(0)
  expect(notFound).toBeGreaterThan(firstPlay)
  expect(transfer).toBeGreaterThan(notFound)
  expect(source).toContain('device_ids: [target]')
})

test('Deezer SDK stays isolated and only enables on-demand full tracks for Premium', () => {
  const html = read('src/renderer/deezer-player.html')
  const renderer = read('src/renderer/src/deezer-player.ts')
  const main = read('src/main/services/deezer-web-playback.ts')
  expect(html).toContain('https://e-cdns-files.dzcdn.net')
  expect(renderer).toContain('DZ!.init')
  expect(renderer).toContain('player.playTracks')
  expect(renderer).toContain("account.tier !== 'premium'")
  expect(renderer).toContain("perms: 'basic_access,email,offline_access'")
  expect(main).toContain("partition: 'persist:omniflux-deezer'")
  expect(main).toContain('skipTaskbar: true')
})

test('Google Drive exposes explicit account controls while keeping readonly PKCE', () => {
  const auth = read('src/main/services/google-drive-auth.ts')
  const main = read('src/main/index.ts')
  const preload = read('src/preload/index.ts')
  expect(auth).toContain('https://www.googleapis.com/auth/drive.readonly')
  expect(auth).toContain("code_challenge_method', 'S256'")
  expect(main).toContain("ipcMain.handle('library:connectDrive'")
  expect(main).toContain("ipcMain.handle('library:disconnectDrive'")
  expect(preload).toContain("ipcRenderer.invoke('library:driveAccount')")
})

test('music routing prefers Deezer SDK for Premium and labels preview fallback', () => {
  const activate = read('src/renderer/src/lib/activate.ts')
  // ההודעה עברה לתוצאות החיפוש האחוד — שם בוחרים מקור, ושם קטע של 30 שניות מסומן
  const music = read('src/renderer/src/components/music/SearchResults.tsx')
  expect(activate).toContain("account?.connected && account.tier === 'premium'")
  expect(activate).toContain('window.cinema.deezer.play(target.providerTrackId)')
  expect(activate).toContain("reason: account?.connected ? 'preview-only' : 'login-for-full'")
  expect(music).toContain("t('accounts.loginFull')")
  expect(music).toContain("source.quality === 'preview'")
})
