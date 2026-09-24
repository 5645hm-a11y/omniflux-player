import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { SurfaceOrigin } from '../services/surface-origin'

/**
 * המקור המקומי שמגיש את משטחי הניגון.
 *
 * הוא קיים כדי שדף הניגון לא ייטען מ-file://: שם אין לו מקור, ובקשות
 * המדיה של Spotify ו-Deezer נדחות ב-CORS — כל שיר נכשל והשירים
 * מתחלפים לבדם בשקט. כאן נבדק מה שחשוב בו: שהוא מגיש את הדף, שהוא
 * נותן לו מקור אמיתי, ושהוא לא מגיש שום דבר אחר.
 */

function makeRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-origin-'))
  fs.writeFileSync(path.join(dir, 'spotify-player.html'), '<!doctype html><html><body>surface</body></html>', 'utf8')
  fs.mkdirSync(path.join(dir, 'assets'))
  fs.writeFileSync(path.join(dir, 'assets', 'player.js'), 'export const ok = true', 'utf8')
  fs.writeFileSync(path.join(dir, 'secret.env'), 'TOKEN=נסתר', 'utf8')
  return dir
}

test('הדף מוגש ממקור אמיתי על הלולאה המקומית', async () => {
  const root = makeRoot()
  const origin = new SurfaceOrigin(root)
  const base = await origin.url()

  expect(base.startsWith('http://127.0.0.1:'), `כתובת: ${base}`).toBe(true)
  const response = await fetch(`${base}spotify-player.html`)
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toContain('text/html')
  expect(await response.text()).toContain('surface')

  const asset = await fetch(`${base}assets/player.js`)
  expect(asset.status).toBe(200)
  expect(asset.headers.get('content-type')).toContain('javascript')

  origin.close()
  fs.rmSync(root, { recursive: true, force: true })
})

test('בלי האסימון בנתיב אין תשובה, וגם לא מחוץ לתיקייה', async () => {
  const root = makeRoot()
  const origin = new SurfaceOrigin(root)
  const base = await origin.url()
  const port = new URL(base).port

  // אותו שרת, בלי האסימון
  expect((await fetch(`http://127.0.0.1:${port}/spotify-player.html`)).status).toBe(404)
  // יציאה מהתיקייה
  expect((await fetch(`${base}../../../package.json`)).status).toBe(404)
  // סיומת שאינה ברשימה, גם כשהקובץ קיים
  expect((await fetch(`${base}secret.env`)).status).toBe(404)
  // קובץ שאינו קיים
  expect((await fetch(`${base}missing.html`)).status).toBe(404)

  origin.close()
  fs.rmSync(root, { recursive: true, force: true })
})

test('קריאה חוזרת מחזירה את אותה כתובת ולא מרימה שרת שני', async () => {
  const root = makeRoot()
  const origin = new SurfaceOrigin(root)
  const [a, b] = await Promise.all([origin.url(), origin.url()])
  expect(a).toBe(b)
  expect(await origin.url()).toBe(a)
  origin.close()
  fs.rmSync(root, { recursive: true, force: true })
})
