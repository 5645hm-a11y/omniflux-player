import type { RawMedia } from '../../core/library/types'
import { isMedia } from '../../core/library'

/**
 * סריקת תיקייה מקומית.
 *
 * מערכת הקבצים מוזרקת. במחשב זה `node:fs`, ובמובייל יהיה מתאם אחר —
 * הלוגיקה כאן, שהיא ההחלטה מה נחשב מדיה ואיך נבנה המסלול, אינה
 * יודעת על אף אחד מהם.
 */

export interface DirEntry {
  name: string
  isDirectory: boolean
}

export interface FileSystemPort {
  readDir: (path: string) => Promise<DirEntry[]>
  stat: (path: string) => Promise<{ size: number; modifiedAt: number } | null>
  join: (...parts: string[]) => string
}

export interface ScanOptions {
  /** עומק מרבי. תיקיות מדיה אינן עמוקות, וקינון אינסופי הוא לולאה. */
  maxDepth?: number
  /** נקרא לכל תיקייה, כדי שהממשק יראה שמשהו קורה */
  onProgress?: (folder: string, found: number) => void
  signal?: { canceled: boolean }
}

/** תיקיות שאין טעם להיכנס אליהן */
const SKIP = /^(\$RECYCLE\.BIN|System Volume Information|node_modules|\.git|\.cache|AppData)$/i

export async function scanLocalFolder(
  fs: FileSystemPort,
  root: string,
  opts: ScanOptions = {}
): Promise<RawMedia[]> {
  const maxDepth = opts.maxDepth ?? 8
  const out: RawMedia[] = []

  async function walk(dir: string, trail: string[], depth: number): Promise<void> {
    if (opts.signal?.canceled || depth > maxDepth) return

    let entries: DirEntry[]
    try {
      entries = await fs.readDir(dir)
    } catch {
      // תיקייה בלי הרשאה, או כונן שנותק — מדלגים ולא מפילים סריקה
      return
    }

    opts.onProgress?.(trail.at(-1) ?? root, out.length)

    for (const entry of entries) {
      if (opts.signal?.canceled) return
      if (entry.name.startsWith('.') || SKIP.test(entry.name)) continue
      const full = fs.join(dir, entry.name)

      if (entry.isDirectory) {
        await walk(full, [...trail, entry.name], depth + 1)
        continue
      }
      if (!isMedia(entry.name)) continue

      const info = await fs.stat(full).catch(() => null)
      out.push({
        id: `local:${full}`,
        source: 'local',
        uri: full,
        fileName: entry.name,
        sizeBytes: info?.size,
        modifiedAt: info?.modifiedAt,
        root,
        trail
      })
    }
  }

  await walk(root, [], 0)
  return out
}
