import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { parseFile } from 'music-metadata'
import { audioStamp } from '../../core/library'
import type { AudioTags, MediaItem } from '../../core/library/types'

/**
 * תגיות מתוך קבצי שמע מקומיים: שם, אמן, אלבום, שנה, ז'אנר, ועטיפה.
 *
 * עד עכשיו השם והאמן נגזרו משם הקובץ בלבד ("Artist - Title.mp3"),
 * ולקבצים לא הייתה עטיפה בכלל — טור של ריבועים ריקים. רוב קבצי השמע
 * נושאים את כל זה בתוכם; כאן זה נקרא.
 *
 * ‏`duration: false` — חישוב משך מדויק דורש לעבור על כל הקובץ; מה
 * שבכותרת מספיק לתצוגה, ו-mpv מדווח את המשך האמיתי כשמנגנים.
 * עטיפה נשמרת פעם אחת לפי התוכן שלה: אלבום של שנים-עשר שירים עם אותה
 * עטיפה הוא קובץ אחד בתיקיית art, לא שנים-עשר.
 */

const MAX_COVER_BYTES = 5 * 1024 * 1024
const PARALLEL = 4

export async function readAudioTags(file: string, stamp: string, artDir: string): Promise<AudioTags> {
  const empty: AudioTags = {
    stamp, title: null, artist: null, album: null, year: null, genre: null, track: null, durationSec: null, cover: null
  }
  try {
    const { common, format } = await parseFile(file, { duration: false, skipCovers: false })
    const clean = (value: string | undefined | null, max = 200): string | null => {
      const text = value?.replace(/\0/g, '').trim()
      return text ? text.slice(0, max) : null
    }
    let cover: string | null = null
    const picture = common.picture?.find((p) => /front/i.test(p.type ?? '')) ?? common.picture?.[0]
    if (picture && picture.data.length > 256 && picture.data.length <= MAX_COVER_BYTES) {
      const ext = /png/i.test(picture.format) ? 'png' : 'jpg'
      const name = `cover-${crypto.createHash('sha1').update(picture.data).digest('hex').slice(0, 20)}.${ext}`
      const target = path.join(artDir, name)
      if (!fs.existsSync(target)) await fs.promises.writeFile(target, picture.data)
      cover = `art://${name}`
    }
    return {
      stamp,
      title: clean(common.title),
      artist: clean(common.artist ?? common.albumartist),
      album: clean(common.album),
      year: typeof common.year === 'number' && common.year > 1000 ? common.year : null,
      genre: clean(common.genre?.[0], 60),
      track: typeof common.track?.no === 'number' ? common.track.no : null,
      durationSec: typeof format.duration === 'number' && Number.isFinite(format.duration) ? Math.round(format.duration) : null,
      cover
    }
  } catch {
    // קובץ פגום או פורמט לא נתמך: נשאר עם השם מהקובץ, ולא ננסה שוב עד שישתנה
    return empty
  }
}

/**
 * קריאת התגיות לכל קובץ שמע מקומי שעדיין אין לו, או שהשתנה.
 *
 * דרייב אינו כאן: קריאת תגיות שם דורשת להוריד חלק מכל קובץ, וזה עולה
 * במכסה המשותפת של Google — מחיר גבוה מדי בשביל עטיפה.
 */
export async function tagAudio(
  items: MediaItem[],
  artDir: string,
  opts: { signal?: { canceled: boolean }; onProgress?: (done: number, total: number) => void } = {}
): Promise<MediaItem[]> {
  const todo = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.kind === 'audio' && item.source === 'local' && item.audio?.stamp !== audioStamp(item))
  if (todo.length === 0) return items
  const out = [...items]
  let done = 0
  let cursor = 0
  const worker = async (): Promise<void> => {
    while (cursor < todo.length && !opts.signal?.canceled) {
      const { item, index } = todo[cursor++]
      out[index] = { ...item, audio: await readAudioTags(item.uri, audioStamp(item), artDir) }
      opts.onProgress?.(++done, todo.length)
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker))
  return out
}
