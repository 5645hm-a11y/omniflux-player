import type { HubCard, HubRow, MediaItem, PlayProgress, Quality } from '../library/types'

/**
 * מסך הבית.
 *
 * ההיגיון כאן טהור: הוא מקבל קטלוג, התקדמות צפייה ותוצאות טרנדים,
 * ומחזיר את השורות שהממשק מצייר. אין כאן רשת, אין קבצים ואין
 * Electron — אותו קובץ ירוץ במובייל.
 *
 * הסדר אינו שרירותי. "המשך צפייה" ראשונה כי היא הכוונה שכבר הובעה,
 * ורק אחריה מגיעות המלצות. מסך שמציע לפני שהוא ממשיך הוא מסך
 * שמתעלם ממה שהמשתמש כבר עשה.
 */

/** רואים בשם הקובץ מה האיכות. אין דרך אחרת בלי לפתוח את הקובץ. */
export function qualityOf(fileName: string): Quality {
  const n = fileName.toLowerCase()
  if (/\b(2160p|4k|uhd)\b/.test(n)) return '4K'
  if (/\b(hdr|dolby\s*vision|dv)\b/.test(n)) return 'HDR'
  if (/\b1080p?\b/.test(n)) return '1080p'
  if (/\b720p?\b/.test(n)) return '720p'
  return null
}

/**
 * כמה נותר לצפות.
 *
 * פריט שנצפה כמעט עד הסוף אינו "להמשך" אלא "נגמר", ופריט שנפתח
 * לרגע אינו התחלה אמיתית. שני הקצוות נחתכים כדי שהשורה תכיל רק
 * מה שבאמת באמצע.
 */
export function isResumable(p: PlayProgress): boolean {
  if (!Number.isFinite(p.duration) || p.duration < 60) return false
  const ratio = p.position / p.duration
  return ratio > 0.02 && ratio < 0.94
}

/** כרטיס מפריט בספרייה */
export function cardOf(item: MediaItem, progress?: PlayProgress): HubCard {
  const meta = item.meta && !item.meta.notFound ? item.meta : null
  return {
    id: `lib:${item.id}`,
    title: meta?.title ?? item.title,
    subtitle: '',
    poster: meta?.poster ?? null,
    year: meta?.year ?? item.year,
    rating: meta?.rating ?? 0,
    quality: qualityOf(item.fileName),
    source: item.source === 'gdrive' ? 'gdrive' : 'local',
    brand: null,
    playable: true,
    itemId: item.id,
    progress: progress && progress.duration > 0 ? progress.position / progress.duration : undefined
  }
}

/**
 * מקבץ פרקים לכותר אחד.
 *
 * בלי זה סדרה בת ארבעים פרקים ממלאת שורה שלמה ודוחקת כל דבר אחר.
 */
function groupSeries(items: MediaItem[]): MediaItem[][] {
  const byKey = new Map<string, MediaItem[]>()
  for (const item of items) {
    const key = item.kind === 'episode' ? `s:${item.title}` : `i:${item.id}`
    const arr = byKey.get(key)
    if (arr) arr.push(item)
    else byKey.set(key, [item])
  }
  return [...byKey.values()]
}

/** "המשך צפייה" — מה שנפתח ולא נגמר, החדש ביותר ראשון */
export function continueRow(items: MediaItem[], progress: Record<string, PlayProgress>): HubCard[] {
  const out: Array<{ card: HubCard; at: number }> = []
  for (const item of items) {
    const p = progress[item.id]
    if (!p || !isResumable(p)) continue
    out.push({ card: cardOf(item, p), at: p.updatedAt })
  }
  return out
    .sort((a, b) => b.at - a.at)
    .slice(0, 20)
    .map((x) => x.card)
}

/** "אחרונים" — מה שנוסף או השתנה לאחרונה, בלי מה שכבר באמצע צפייה */
export function recentRow(
  items: MediaItem[],
  progress: Record<string, PlayProgress>,
  limit = 20
): HubCard[] {
  const inProgress = new Set(
    Object.entries(progress)
      .filter(([, p]) => isResumable(p))
      .map(([id]) => id)
  )
  const groups = groupSeries(items.filter((i) => !inProgress.has(i.id)))
  return groups
    .map((group) => {
      const lead = group.find((i) => i.meta && !i.meta.notFound) ?? group[0]
      const newest = Math.max(...group.map((i) => i.modifiedAt ?? 0))
      const card = cardOf(lead)
      if (group.length > 1) card.episodes = group.length
      return { card, at: newest }
    })
    .sort((a, b) => b.at - a.at)
    .slice(0, limit)
    .map((x) => x.card)
}

/** מרכיב את השורות, ומשמיט שורות ריקות במקום להציג כותרת בלי תוכן */
export function buildRows(rows: Array<{ key: HubRow['key']; cards: HubCard[] }>): HubRow[] {
  return rows.filter((r) => r.cards.length > 0).map((r) => ({ key: r.key, cards: r.cards }))
}
