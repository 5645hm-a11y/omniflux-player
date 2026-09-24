import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string): string => fs.readFileSync(path.join(root, file), 'utf8')

test('optimistic transport mutates UI state before dispatching IPC', () => {
  const store = read('src/renderer/src/store/player.ts')
  const toggle = store.indexOf('togglePlayback: () => {')
  const toggleSet = store.indexOf('set({', toggle)
  const toggleCommand = store.indexOf('window.cinema.spotify.pause()', toggle)
  expect(toggleSet).toBeGreaterThan(toggle)
  expect(toggleSet).toBeLessThan(toggleCommand)

  const seek = store.indexOf('seekTo: (seconds) => {')
  const seekSet = store.indexOf('set({', seek)
  const seekCommand = store.indexOf('window.cinema.spotify.seek', seek)
  expect(seekSet).toBeGreaterThan(seek)
  expect(seekSet).toBeLessThan(seekCommand)
  expect(store).toContain('optimisticPosition')
})

test('Google Drive desktop OAuth uses PKCE, loopback and read-only scope', () => {
  const auth = read('src/main/services/google-drive-auth.ts')
  expect(auth).toContain('https://www.googleapis.com/auth/drive.readonly')
  expect(auth).toContain("code_challenge_method', 'S256'")
  expect(auth).toContain("server.listen(0, '127.0.0.1'")
  expect(auth).toContain("grant_type: 'refresh_token'")
})

/*
 * סימן המפתח הוא מונוגרמה, בלי שם מלא.
 *
 * הגרסה הקודמת נשאה "BUILT BY ALEXANDRE HEYMANN" לרוחב תחתית סרגל
 * הצד — כלומר בכל מסך — וזה ייחוס פומבי ולא חתימה. הבדיקה נועלת את
 * שני התנאים: הקובץ שקוף באמת, ואף שם מלא אינו חוזר לממשק.
 */
test('סימן המפתח שקוף, ואין שם מלא בממשק', () => {
  const mark = fs.readFileSync(path.join(root, 'src/renderer/src/assets/developer-mark.png'))
  // PNG IHDR color type 6 = truecolour with alpha.
  expect(mark.subarray(1, 4).toString('ascii')).toBe('PNG')
  expect(mark[25]).toBe(6)
  expect(read('src/renderer/src/components/Sidebar.tsx')).not.toContain('rounded-o-md bg-white')
  expect(read('src/renderer/src/components/Sidebar.tsx')).toContain('developer-mark.png')
  expect(read('src/renderer/src/screens/Settings.tsx')).toContain('developer-mark.png')
  for (const file of ['src/renderer/src/components/Sidebar.tsx', 'src/renderer/src/screens/Settings.tsx']) {
    expect(read(file)).not.toMatch(/Alexandre|Heymann/i)
  }
})

/*
 * ‏Widevine לפני החלון הראשון — אבל לא לנצח. בפרופיל נקי ההמתנה הייתה בלי
 * גבול, ומשתמש חדש (או מחשב בלי רשת) ראה תוכנה שלא עולה: שלושה תהליכים,
 * אפס חלונות. ההמתנה עכשיו חסומה בעשר שניות.
 */
test('Spotify DRM is awaited before the first BrowserWindow, with a time limit', () => {
  const main = read('src/main/index.ts')
  const drm = main.indexOf('const drmInTime = await Promise.race([')
  const window = main.indexOf('player = new PlayerWindow()')
  expect(drm).toBeGreaterThan(0)
  expect(window).toBeGreaterThan(drm)
  expect(main.slice(drm, drm + 300)).toContain('setTimeout(() => resolve(false), 10_000)')
  expect(read('src/renderer/spotify-player.html')).toContain('frame-src https://*.spotify.com https://sdk.scdn.co')
})

test('music provider visibility follows account connection, and the subscribe CTA lives with the account', () => {
  const main = read('src/main/index.ts')
  const music = read('src/renderer/src/screens/Music.tsx')
  const settings = read('src/renderer/src/screens/Settings.tsx')
  const deezerLogo = read('src/renderer/src/assets/deezer-mark.svg')
  expect(main).toContain('spotifyAuth.isConnected()')
  expect(main).toContain('deezerWebPlayback.isConnected()')
  expect(main).toContain("if (group.key !== 'music') return [group]")
  /*
   * הזמנה למנוי שייכת למסך שבו מנהלים חשבון, פעם אחת, ולא למתחם
   * ההאזנה שבו היא נדחפת לצד כל שיר.
   */
  expect(settings.match(/music\.subscribeDeezer/g)).toHaveLength(1)
  expect(settings.match(/music\.subscribeSpotify/g)).toHaveLength(1)
  expect(music).not.toContain('music.subscribeDeezer')
  expect(deezerLogo).toContain('data:image/png;base64,')
})

/*
 * ‏Spotify דוחה רישיון Widevine לבנייה בלי חתימת VMP לייצור — 500 ב-Electron
 * של הפיתוח, 403 בחבילה שנחתמה לפני ששם קובץ ההפעלה שונה. נמדד מול
 * חשבון אמיתי: אפס צליל בכל שיר. שלושה דברים נועלים כאן את התיקון.
 */
test('Spotify: הבנייה חותמת ומאמתת VMP, והנגן מכריע לפי שרת הרישיונות', () => {
  // החתימה אחרי Authenticode, על החבילה הסופית, ועם אימות שעוצר בנייה
  expect(read('electron-builder.yml')).toMatch(/^afterSign: tools\/vmp-sign\.cjs$/m)
  const hook = read('tools/vmp-sign.cjs')
  expect(hook).toContain("'sign-pkg'")
  expect(hook).toContain("'verify-pkg'")
  expect(hook).toContain('throw new Error')

  // הדחייה נמדדת בסשן, כי הבקשה יוצאת מה-iframe של ה-SDK
  const surface = read('src/main/services/spotify-web-playback.ts')
  expect(surface).toContain("urls: ['https://api.spotify.com/v1/widevine-license/*']")

  // ההתאוששות עוצרת מיד, והדחייה גוברת על "מנגן" של ה-SDK
  const main = read('src/main/index.ts')
  expect(main).toContain('if (spotifyWebPlayback.licenseRejected()) break')
  expect(main).toContain('if (!rejected && live.paused === false && live.positionMs > 0) return')
  expect(main).toContain('markPlaybackFailed(rejected)')
  // שיר שספוטיפיי החליפה בגרסה מקבילה הוא עדיין השיר שלנו
  expect(main).toContain('health.linkedFromUri === uri')
})

test('השהיה אינה "סרק": המנוע מדווח idle-active ולא core-idle', () => {
  const engine = read('src/main/engine/mpv.ts')
  expect(engine).toContain("[9, 'idle-active', 'idle']")
  expect(engine).not.toContain("'core-idle'")
})

test('spotify:play דוחה URI חסר או משובש לפני כל פנייה לשירות', () => {
  const main = read('src/main/index.ts')
  const handler = main.indexOf("ipcMain.handle('spotify:play'")
  const guard = main.indexOf("return { ok: false, reason: 'invalid' }", handler)
  const firstUse = main.indexOf('spotifyWebPlayback.ensureDevice()', handler)
  expect(guard).toBeGreaterThan(handler)
  expect(firstUse).toBeGreaterThan(guard)
})
