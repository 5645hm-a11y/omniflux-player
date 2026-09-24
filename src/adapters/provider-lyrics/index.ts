import type { Http } from '../../legacy_services/ports'

/**
 * מילים מסונכרנות.
 *
 * המקור הוא LRCLIB — פתוח, בלי מפתח ובלי הרשמה, ומחזיר פורמט LRC
 * סטנדרטי. אין כאן שמירה של מילים אצלנו: הן מוגשות מהמקור בכל
 * פעם, כמו כל שאר המטא-דאטה.
 */

const API = 'https://lrclib.net/api/get'

export interface LyricLine {
  /** שנייה שבה השורה מתחילה */
  at: number
  text: string
}

export interface Lyrics {
  synced: boolean
  lines: LyricLine[]
}

let http: Http | null = null

export function configure(deps: { http: Http }): void {
  http = deps.http
}

/**
 * מפרק LRC לשורות עם זמנים.
 *
 * הפורמט מרשה כמה חותמות זמן לאותה שורה — פזמון שחוזר נכתב פעם
 * אחת עם כמה תגים, ולכן כל תג מייצר שורה משלו.
 */
export function parseLrc(text: string): LyricLine[] {
  const out: LyricLine[] = []
  for (const raw of text.split('\n')) {
    const stamps = [...raw.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)]
    if (stamps.length === 0) continue
    const body = raw.replace(/\[[^\]]*\]/g, '').trim()
    // שורה ריקה היא הפסקה מוזיקלית, ומשמשת לניקוי המסך בזמן הנכון
    for (const m of stamps) {
      const min = Number(m[1])
      const sec = Number(m[2])
      const frac = m[3] ? Number(m[3].padEnd(3, '0')) / 1000 : 0
      out.push({ at: min * 60 + sec + frac, text: body })
    }
  }
  return out.sort((a, b) => a.at - b.at)
}

/** השורה הפעילה בזמן נתון, או ‎-1 לפני שהראשונה מתחילה. */
export function lineAt(lines: LyricLine[], seconds: number): number {
  let lo = 0
  let hi = lines.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].at <= seconds) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return found
}

/**
 * מחפש מילים לרצועה.
 *
 * האורך נשלח כדי שהשרת יבחר את ההקלטה הנכונה: לאותו שיר יש גרסת
 * אלבום, גרסת רדיו וגרסה חיה, והזמנים שונים בכל אחת.
 */
export async function lyricsFor(
  artist: string,
  track: string,
  durationSeconds: number
): Promise<Lyrics | null> {
  if (!http || !artist || !track) return null
  const url = new URL(API)
  url.searchParams.set('artist_name', artist)
  url.searchParams.set('track_name', track)
  if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
    url.searchParams.set('duration', String(Math.round(durationSeconds)))
  }

  try {
    const res = await http(url, { headers: { 'User-Agent': 'OmniFlux Player' } })
    if (!res.ok) return null
    const body = (await res.json()) as { syncedLyrics?: string | null; plainLyrics?: string | null }
    if (body.syncedLyrics) {
      const lines = parseLrc(body.syncedLyrics)
      if (lines.length > 0) return { synced: true, lines }
    }
    if (body.plainLyrics) {
      const lines = body.plainLyrics
        .split('\n')
        .map((text) => ({ at: 0, text: text.trim() }))
        .filter((l) => l.text)
      if (lines.length > 0) return { synced: false, lines }
    }
    return null
  } catch {
    return null
  }
}
