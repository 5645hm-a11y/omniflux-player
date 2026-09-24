import { useMemo } from 'react'
import { create } from 'zustand'
import type { Catalog, LibraryFolder, MediaItem, ScanProgress } from '@shared/api'

/**
 * הספרייה בממשק.
 *
 * הקטלוג מגיע כמו שהוא מהתהליך הראשי. כל גזירה ממנו — קיבוץ סדרות,
 * סינון, חיפוש — נעשית ב-useMemo ולא בסלקטור, כי סלקטור שמחזיר מערך
 * חדש בכל קריאה מפיל את React ללולאת רינדור.
 */

export interface Card {
  /** מזהה הפריט המייצג */
  id: string
  title: string
  year: number | null
  poster: string | null
  kind: MediaItem['kind']
  rating: number
  /** לסדרה: כמה פרקים מתחתיה */
  episodes: number
  /** מאיפה הקובץ — קובע את תג המקור על הכרטיס */
  source: MediaItem['source']
  items: MediaItem[]
}

interface Store {
  catalog: Catalog | null
  folders: LibraryFolder[]
  progress: ScanProgress | null
  scanning: boolean
  query: string

  init: () => Promise<void>
  refreshFolders: () => Promise<void>
  setQuery: (q: string) => void
  scan: (force?: boolean) => Promise<void>
}

export const useLibrary = create<Store>((set, get) => ({
  catalog: null,
  folders: [],
  progress: null,
  scanning: false,
  query: '',

  async init() {
    const [catalog, folders, scanning] = await Promise.all([
      window.cinema.library.catalog(),
      window.cinema.library.folders(),
      window.cinema.library.scanning()
    ])
    set({ catalog, folders, scanning })

    window.cinema.library.onCatalog((c) => set({ catalog: c }))
    window.cinema.library.onProgress((p) => {
      set({ progress: p, scanning: p.phase === 'listing' || p.phase === 'identifying' })
      if (p.phase === 'done' || p.phase === 'error') void get().refreshFolders()
    })
  },

  async refreshFolders() {
    set({ folders: await window.cinema.library.folders() })
  },

  setQuery: (query) => set({ query }),

  async scan(force = false) {
    if (get().scanning) return
    set({ scanning: true })
    await window.cinema.library.scan({ force })
  }
}))

/**
 * פריטים → כרטיסים.
 *
 * פרקים של אותה סדרה מתקבצים לכרטיס אחד. בלי זה סדרה בת שישים פרקים
 * הייתה שישים כרטיסים, והספרייה הייתה בלתי שמישה.
 */
export function useCards(): Card[] {
  const items = useLibrary((s) => s.catalog?.items)
  const query = useLibrary((s) => s.query)

  return useMemo(() => {
    if (!items) return []
    const groups = new Map<string, MediaItem[]>()
    for (const item of items) {
      const key =
        item.kind === 'episode'
          ? `series|${item.title.toLowerCase()}`
          : `${item.kind}|${item.title.toLowerCase()}|${item.year ?? ''}`
      const arr = groups.get(key)
      if (arr) arr.push(item)
      else groups.set(key, [item])
    }

    const cards: Card[] = []
    for (const group of groups.values()) {
      // הפריט עם המטא-דאטה הטובה ביותר מייצג את הקבוצה
      const lead = group.find((i) => i.meta && !i.meta.notFound) ?? group[0]
      if (!lead) continue
      const meta = lead.meta
      cards.push({
        id: lead.id,
        title: meta && !meta.notFound ? meta.title : lead.title,
        year: meta?.year ?? lead.year,
        poster: meta?.poster ?? null,
        kind: lead.kind,
        rating: meta?.rating ?? 0,
        episodes: lead.kind === 'episode' ? group.length : 0,
        source: lead.source,
        items: group
      })
    }

    const q = query.trim().toLowerCase()
    const filtered = q
      ? cards.filter(
          (c) =>
            c.title.toLowerCase().includes(q) ||
            c.items.some((i) => i.fileName.toLowerCase().includes(q))
        )
      : cards

    return filtered.sort((a, b) => a.title.localeCompare(b.title, 'he'))
  }, [items, query])
}
