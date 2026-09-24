import { app } from 'electron'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { OnlineSubtitle } from '../../shared/api'
import type { Http } from '../../legacy_services/ports'
import { extractSubtitleZip, searchSubdl, type SubdlCandidate } from '../../adapters/provider-subdl'

const CACHE_MS = 10 * 60 * 1000
const DOWNLOAD_ORIGIN = 'https://dl.subdl.com'

interface CachedSearch {
  at: number
  results: OnlineSubtitle[]
}

export class OnlineSubtitleService {
  private readonly candidates = new Map<string, SubdlCandidate>()
  private readonly searches = new Map<string, CachedSearch>()

  constructor(private readonly http: Http) {}

  private apiKey(): string {
    const fromProcess = process.env.SUBDL_API_KEY?.trim()
    if (fromProcess) return fromProcess
    if (app.isPackaged) return ''

    try {
      const env = fs.readFileSync(path.join(app.getAppPath(), '.env'), 'utf8')
      for (const line of env.split(/\r?\n/)) {
        const match = /^\s*(?:export\s+)?SUBDL_API_KEY\s*=\s*(.*)\s*$/.exec(line)
        if (!match) continue
        const value = match[1].trim()
        return value.replace(/^(['"])(.*)\1$/, '$2').trim()
      }
    } catch {
      // A missing development .env simply disables the provider.
    }
    return ''
  }

  status(): { name: 'SubDL'; enabled: boolean } {
    return { name: 'SubDL', enabled: this.apiKey().length > 0 }
  }

  async search(mediaPath: string | null, languages: string[]): Promise<OnlineSubtitle[]> {
    const apiKey = this.apiKey()
    if (!apiKey) throw new Error('SUBDL_NOT_CONFIGURED')
    if (!mediaPath) throw new Error('SUBDL_NO_MEDIA')
    const filename = this.filename(mediaPath)
    const cacheKey = `${filename}\0${languages.join(',')}`
    const cached = this.searches.get(cacheKey)
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.results

    const found = await searchSubdl(this.http, apiKey, filename, languages)
    const results = found.map((candidate) => {
      const id = createHash('sha256').update(candidate.downloadPath).digest('hex').slice(0, 24)
      this.candidates.set(id, candidate)
      return {
        id,
        name: candidate.name,
        release: candidate.release,
        language: candidate.language,
        hearingImpaired: candidate.hearingImpaired,
        fps: candidate.fps,
        matchScore: candidate.matchScore
      }
    })
    this.searches.set(cacheKey, { at: Date.now(), results })
    return results
  }

  async download(id: string): Promise<string> {
    if (!/^[a-f0-9]{24}$/.test(id)) throw new Error('SUBDL_INVALID_RESULT')
    const candidate = this.candidates.get(id)
    if (!candidate) throw new Error('SUBDL_RESULT_EXPIRED')
    const targetDirectory = path.join(app.getPath('userData'), 'subtitles')
    await fs.promises.mkdir(targetDirectory, { recursive: true })

    const existing = await this.cachedFile(targetDirectory, id)
    if (existing) return existing
    const response = await this.http(new URL(candidate.downloadPath, DOWNLOAD_ORIGIN), {
      headers: { 'User-Agent': 'OmniFlux Player' }
    })
    if (!response.ok) throw new Error('SUBDL_DOWNLOAD_FAILED')
    const announcedSize = Number(response.headers.get('content-length'))
    if (Number.isFinite(announcedSize) && announcedSize > 25 * 1024 * 1024) {
      throw new Error('SUBDL_ARCHIVE_TOO_LARGE')
    }
    const extracted = extractSubtitleZip(new Uint8Array(await response.arrayBuffer()))
    const ext = path.extname(extracted.name).toLowerCase()
    const target = path.join(targetDirectory, `${id}${ext}`)
    await fs.promises.writeFile(target, extracted.data, { flag: 'wx' }).catch(async (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error
    })
    return target
  }

  private filename(mediaPath: string): string {
    try {
      if (/^https?:\/\//i.test(mediaPath)) return path.basename(new URL(mediaPath).pathname) || 'video'
    } catch {
      // Fall through to local path handling.
    }
    return path.basename(mediaPath) || 'video'
  }

  private async cachedFile(directory: string, id: string): Promise<string | null> {
    for (const ext of ['.srt', '.ass', '.ssa', '.vtt', '.sub']) {
      const candidate = path.join(directory, `${id}${ext}`)
      try {
        await fs.promises.access(candidate, fs.constants.R_OK)
        return candidate
      } catch {
        // Try the next supported extension.
      }
    }
    return null
  }
}
