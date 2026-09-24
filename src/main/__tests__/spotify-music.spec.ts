import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

test('Spotify track metadata uses full duration and URI rather than preview audio', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/main/services/spotify-music.ts'), 'utf8')
  expect(source).toContain('durationMs: Math.max(0, value.duration_ms ?? 0)')
  expect(source).toContain('uri,')
  expect(source).not.toContain('preview_url')
})

test('Spotify integration uses the post-February-2026 endpoints', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/main/services/spotify-music.ts'), 'utf8')
  expect(source).toContain("'/me/playlists?limit=10'")
  expect(source).toContain("'/me/top/tracks?time_range=short_term&limit=10'")
  expect(source).toContain("call('/me/library'")
  expect(source).toContain("call('/me/playlists'")
  expect(source).not.toContain('/artists/${id}/top-tracks')
  expect(source).not.toContain('/related-artists')
})

test('full playback exposes queue, shuffle, repeat and transport controls', () => {
  const connect = fs.readFileSync(path.join(process.cwd(), 'src/main/services/spotify-connect.ts'), 'utf8')
  const player = fs.readFileSync(path.join(process.cwd(), 'src/renderer/src/components/MiniPlayer.tsx'), 'utf8')
  const store = fs.readFileSync(path.join(process.cwd(), 'src/renderer/src/store/player.ts'), 'utf8')
  const sdk = fs.readFileSync(path.join(process.cwd(), 'src/renderer/src/spotify-player.ts'), 'utf8')
  for (const endpoint of ['/me/player/queue', '/me/player/shuffle', '/me/player/repeat', '/me/player/next', '/me/player/previous']) {
    expect(connect).toContain(endpoint)
  }
  expect(store).toContain("window.cinema.spotify.next()")
  expect(player).toContain("skip('next')")
  expect(player).toContain('window.cinema.spotify.repeat(next)')
  expect(player).toContain('window.cinema.spotify.shuffle')
  expect(sdk).toContain("name: 'OmniFlux Player'")
  expect(sdk).toContain('player.nextTrack()')
  expect(sdk).toContain('player.resume()')
  expect(sdk).toContain('player.seek(')
})

test('Spotify playback always targets the embedded OmniFlux device', () => {
  const main = fs.readFileSync(path.join(process.cwd(), 'src/main/index.ts'), 'utf8')
  expect(main).toContain("const embedded = await spotifyWebPlayback.ensureDevice()")
  expect(main).toContain("name: 'OmniFlux Player', type: 'Computer', active: true")
})

/**
 * ‏activateElement הוא מסלול אסור.
 *
 * הוא נועד לעקוף חסימת הפעלה אוטומטית בעזרת מגע של המשתמש, ובמשטח
 * נסתר אין מגע — ולכן הוא נכשל תמיד, ה-SDK פלט אירוע פנימי שאיש לא
 * נרשם אליו, ולולאת ההודעות שלו מתה. התוצאה אצל המשתמש: הנגן שלנו
 * לא נרשם כמכשיר, הניגון נשלח למכשיר אחר בחשבון, והשירים התחלפו
 * לבדם בשקט מוחלט. במקומו יש autoplayPolicy בחלון עצמו.
 */
test('the hidden surface never reaches for activateElement', () => {
  const sdk = fs.readFileSync(path.join(process.cwd(), 'src/renderer/src/spotify-player.ts'), 'utf8')
  const main = fs.readFileSync(path.join(process.cwd(), 'src/main/index.ts'), 'utf8')
  const service = fs.readFileSync(path.join(process.cwd(), 'src/main/services/spotify-web-playback.ts'), 'utf8')
  expect(sdk).not.toContain('activateElement()')
  expect(main).not.toContain("control('activate')")
  expect(service).toContain("autoplayPolicy: 'no-user-gesture-required'")
  // ואירוע פנימי לא מוכר לעולם לא יפיל שוב את הנגן
  expect(sdk).toContain('function guardSdkEvents')
})

/**
 * המשטח חייב מקור אמיתי.
 *
 * דף שנטען מ-file:// הוא "מקור אפס", ובקשות המדיה של ה-SDK נדחות אז
 * ב-CORS: כל שיר נכשל בטעינה וספוטיפיי מדלגת לבא אחריו. זה לא נראה
 * בפיתוח, כי שם הדף מגיע משרת Vite — רק המשתמש הארוז נפגע.
 */
test('the hidden surfaces are served from a real local origin, not from a file', () => {
  const spotify = fs.readFileSync(path.join(process.cwd(), 'src/main/services/spotify-web-playback.ts'), 'utf8')
  const deezer = fs.readFileSync(path.join(process.cwd(), 'src/main/services/deezer-web-playback.ts'), 'utf8')
  for (const source of [spotify, deezer]) {
    expect(source).toContain('SurfaceOrigin')
    expect(source).not.toContain('win.loadFile(')
  }
})

/**
 * שיר אחד יוצא לספוטיפיי, לא רשימה.
 *
 * כשנשלחה רשימה, כישלון רגעי בהתחלת הניגון טופל על ידי ספוטיפיי כמו
 * סוף שיר: היא עברה לבא בתור, וכך בלחיצה אחת התחלפו חמישה שירים
 * לבדם, כולם ב-0:00 ובלי צליל. עם שיר אחד אין לאן לדלג, ויש מה
 * לתקן — וההתאוששות היא שמחזירה אותו לחיים.
 */
test('selecting a track sends that track alone, with a recovery path behind it', () => {
  const main = fs.readFileSync(path.join(process.cwd(), 'src/main/index.ts'), 'utf8')
  const sdk = fs.readFileSync(path.join(process.cwd(), 'src/renderer/src/spotify-player.ts'), 'utf8')
  expect(main).toContain('await spotifyConnect.play(uri, embedded)')
  expect(main).toContain('void recoverPlayback(')
  expect(main).toContain('async function recoverPlayback(')
  // ההתאוששות היא השהיה ואז המשך; "המשך" לבדו נמדד כחסר תועלת
  expect(main).toContain("spotifyWebPlayback.control('pause')")
  expect(main).toContain("spotifyWebPlayback.control('resume')")
  expect(sdk).toContain("player.addListener('playback_error'")
  expect(sdk).toContain("player.addListener('player_state_changed'")
})
