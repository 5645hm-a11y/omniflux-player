import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { readAudioTags, tagAudio } from '../services/audio-tags'
import { audioStamp } from '../../core/library'
import type { MediaItem } from '../../core/library/types'

/**
 * תגיות אמיתיות מקובץ אמיתי: ה-mpv של הפרויקט מקודד MP3 קצר עם
 * תגיות, ו-music-metadata קורא אותן. אין כאן זיוף של הפורמט.
 */

const root = process.cwd()
const mpv = path.join(root, 'resources', 'engine', 'mpv.exe')
let dir = ''
let file = ''

test.beforeAll(() => {
  test.skip(!fs.existsSync(mpv), 'מנוע הנגינה חסר — הרץ npm run engine')
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-tags-'))
  file = path.join(dir, 'שיר.mp3')
  execFileSync(mpv, [
    '--no-config', 'av://lavfi:sine=frequency=440:duration=2', `--o=${file}`,
    '--oset-metadata=title="שיר הבדיקה",artist="להקת הבדיקה",album="אלבום",genre="Mizrahi",date="2024"'
  ], { stdio: 'ignore' })
})

test.afterAll(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true })
})

test('שם, אמן, אלבום, ז׳אנר ושנה נקראים מהקובץ — גם בעברית', async () => {
  const tags = await readAudioTags(file, 's', dir)
  expect(tags).toMatchObject({ title: 'שיר הבדיקה', artist: 'להקת הבדיקה', album: 'אלבום', genre: 'Mizrahi', year: 2024 })
})

test('קובץ פגום אינו מפיל את הסריקה — נשאר בלי תגיות, עם החותמת', async () => {
  const broken = path.join(dir, 'broken.mp3')
  fs.writeFileSync(broken, 'not audio at all')
  const tags = await readAudioTags(broken, 'stamp-1', dir)
  expect(tags.stamp).toBe('stamp-1')
  expect(tags.title).toBeNull()
})

test('קובץ שלא השתנה אינו נקרא שוב', async () => {
  const stat = fs.statSync(file)
  const item = {
    id: file, source: 'local', uri: file, fileName: 'שיר.mp3', sizeBytes: stat.size, modifiedAt: stat.mtimeMs,
    root: dir, trail: [], kind: 'audio', title: 'x', year: null, season: null, episode: null, meta: null
  } as MediaItem
  const first = await tagAudio([item], dir)
  expect(first[0].audio?.stamp).toBe(audioStamp(item))
  // אותה חותמת — אותו מערך, בלי קריאה אחת לקובץ
  const second = await tagAudio(first, dir)
  expect(second).toBe(first)
})
