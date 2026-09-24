import { inflateRawSync } from 'node:zlib'
import type { Http } from '../../legacy_services/ports'

const API = 'https://api.subdl.com/api/v2/files/search'
const DOWNLOAD_PREFIX = '/subtitle/'
const SUBTITLE_EXTENSIONS = new Set(['.srt', '.ass', '.ssa', '.vtt', '.sub'])

export interface SubdlCandidate {
  name: string
  release: string
  language: string
  hearingImpaired: boolean
  fps: number | null
  matchScore: number | null
  downloadPath: string
}

type RawSubtitle = Record<string, unknown>

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function numberOrNull(value: unknown): number | null {
  const valueNumber = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(valueNumber) ? valueNumber : null
}

function validDownloadPath(value: unknown): string | null {
  const candidate = text(value)
  if (!candidate.startsWith(DOWNLOAD_PREFIX) || candidate.includes('..') || candidate.includes('\\')) return null
  try {
    const url = new URL(candidate, 'https://dl.subdl.com')
    if (url.origin !== 'https://dl.subdl.com' || !url.pathname.toLowerCase().endsWith('.zip') || url.hash) return null
    if ([...url.searchParams.keys()].some((key) => key !== 'api_key')) return null
    return `${url.pathname}${url.search}`
  } catch {
    return null
  }
}

/** Search by the exact media filename so SubDL can rank release matches. */
export async function searchSubdl(
  http: Http,
  apiKey: string,
  filename: string,
  languages: string[]
): Promise<SubdlCandidate[]> {
  const safeLanguages = [...new Set(languages.map((language) => language.toLowerCase()))]
    .filter((language) => /^[a-z]{2,3}$/.test(language))
    .slice(0, 8)
  const url = new URL(API)
  url.searchParams.set('filename', filename.slice(0, 500))
  if (safeLanguages.length > 0) url.searchParams.set('languages', safeLanguages.join(','))
  url.searchParams.set('subs_per_page', '20')

  const response = await http(url, {
    headers: { Authorization: `Bearer ${apiKey}`, 'User-Agent': 'OmniFlux Player' }
  })
  if (!response.ok) throw new Error('SUBDL_SEARCH_FAILED')
  const body = (await response.json()) as { status?: boolean; subtitles?: RawSubtitle[] }
  if (body.status === false || !Array.isArray(body.subtitles)) return []

  return body.subtitles.flatMap((raw) => {
    const downloadPath = validDownloadPath(raw.url)
    if (!downloadPath) return []
    const release = text(raw.release_name) || text(raw.name) || filename
    return [{
      name: text(raw.name) || release,
      release,
      language: text(raw.language) || text(raw.lang) || 'unknown',
      hearingImpaired: raw.hi === true || raw.hi === 1 || raw.hi === '1',
      fps: numberOrNull(raw.fps ?? raw.framerate),
      matchScore: numberOrNull(raw.match_score),
      downloadPath
    }]
  })
}

export interface ExtractedSubtitle {
  name: string
  data: Buffer
}

function extension(name: string): string {
  const match = /\.[^.\\/]+$/.exec(name)
  return match?.[0].toLowerCase() ?? ''
}

/**
 * Extract the first supported subtitle without trusting entry paths or invoking a shell.
 * SubDL archives are small ZIPs; encrypted, ZIP64 and exotic compression methods are rejected.
 */
export function extractSubtitleZip(bytes: Uint8Array): ExtractedSubtitle {
  const zip = Buffer.from(bytes)
  if (zip.length > 25 * 1024 * 1024) throw new Error('SUBDL_ARCHIVE_TOO_LARGE')

  const start = Math.max(0, zip.length - 65_557)
  let eocd = -1
  for (let offset = zip.length - 22; offset >= start; offset -= 1) {
    if (zip.readUInt32LE(offset) === 0x06054b50) {
      eocd = offset
      break
    }
  }
  if (eocd < 0) throw new Error('SUBDL_INVALID_ARCHIVE')

  const entries = zip.readUInt16LE(eocd + 10)
  let cursor = zip.readUInt32LE(eocd + 16)
  for (let index = 0; index < entries; index += 1) {
    if (cursor + 46 > zip.length || zip.readUInt32LE(cursor) !== 0x02014b50) break
    const flags = zip.readUInt16LE(cursor + 8)
    const method = zip.readUInt16LE(cursor + 10)
    const compressedSize = zip.readUInt32LE(cursor + 20)
    const uncompressedSize = zip.readUInt32LE(cursor + 24)
    const nameLength = zip.readUInt16LE(cursor + 28)
    const extraLength = zip.readUInt16LE(cursor + 30)
    const commentLength = zip.readUInt16LE(cursor + 32)
    const localOffset = zip.readUInt32LE(cursor + 42)
    const nameEnd = cursor + 46 + nameLength
    const name = zip.subarray(cursor + 46, nameEnd).toString((flags & 0x800) !== 0 ? 'utf8' : 'latin1')
    cursor = nameEnd + extraLength + commentLength

    if (!SUBTITLE_EXTENSIONS.has(extension(name)) || uncompressedSize > 10 * 1024 * 1024) continue
    if ((flags & 1) !== 0 || (method !== 0 && method !== 8)) continue
    if (localOffset + 30 > zip.length || zip.readUInt32LE(localOffset) !== 0x04034b50) continue
    const localNameLength = zip.readUInt16LE(localOffset + 26)
    const localExtraLength = zip.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const dataEnd = dataStart + compressedSize
    if (dataEnd > zip.length) continue
    const packed = zip.subarray(dataStart, dataEnd)
    const data = method === 0 ? Buffer.from(packed) : inflateRawSync(packed, { maxOutputLength: 10 * 1024 * 1024 })
    if (data.length !== uncompressedSize) throw new Error('SUBDL_INVALID_ARCHIVE')
    return { name: name.split(/[\\/]/).pop() || `subtitle${extension(name)}`, data }
  }

  throw new Error('SUBDL_NO_SUPPORTED_FILE')
}
