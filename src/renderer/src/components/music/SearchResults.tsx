import { useState } from 'react'
import { motion } from 'motion/react'
import type { MusicHit, MusicSourceKind, SourceHit } from '@shared/music-search'
import type { Key } from '@shared/i18n'
import { useT } from '../../i18n'
import { useQueue } from '../../store/queue'
import { usePlayer } from '../../store/player'
import { playSource, queueItemFor, type UnifiedSearch } from '../../lib/unified-search'
import { reasonKey } from '../../lib/activate'
import { youTubeReason } from '../MusicShelves'
import { clock } from '../Controls'
import { Button, Icon, IconButton } from '../ui'
import { MusicProviderBadge } from '../MusicProviderBadge'
import { Equalizer } from '../Motion'
import { pickPlaylist } from './Playlists'

/**
 * תוצאות החיפוש האחוד.
 *
 * כל שורה היא שיר אחד — לא "Yellow" חמש פעמים — ומתחתיו המקורות שיש
 * לו. הראשון מסומן: זה מה שלחיצה על השיר מנגנת (מה שכבר שלך קודם, קטע
 * של 30 שניות אחרון). לחיצה על מקור אחר מנגנת ממנו, בלי תפריט ובלי
 * חיפוש שני. בראש — "התוצאה המובילה" בגדול, כמו ב-Apple Music.
 */

const SOURCE_LABEL: Record<MusicSourceKind, Key> = {
  local: 'music.sourceLocal',
  drive: 'music.sourceDrive',
  spotify: 'music.sourceSpotify',
  deezer: 'music.sourceDeezer',
  youtube: 'music.sourceYouTube'
}

function SourceChip({ source, primary, onPick }: { source: SourceHit; primary: boolean; onPick: () => void }): React.JSX.Element {
  const t = useT()
  const badge = source.kind === 'spotify' ? 'Spotify' : source.kind === 'deezer' ? 'Deezer' : source.kind === 'youtube' ? 'YouTube' : null
  return (
    <button
      onClick={(event) => { event.stopPropagation(); onPick() }}
      title={t('music.playFrom', { source: t(SOURCE_LABEL[source.kind]) })}
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors duration-fast active:scale-95 ${
        primary ? 'bg-violet/18 text-violet-bright ring-1 ring-violet/40' : 'bg-ink/8 text-ink-2 hover:bg-ink/14 hover:text-ink'
      }`}
    >
      {badge ? <MusicProviderBadge provider={badge} compact /> : <Icon name={source.kind === 'drive' ? 'cloud' : 'screen'} size={12} />}
      {t(SOURCE_LABEL[source.kind])}
      {source.quality === 'preview' && <span className="text-ink-3">· 30s</span>}
    </button>
  )
}

function useIsPlaying(hit: MusicHit): { active: boolean; paused: boolean } {
  const current = useQueue((s) => (s.active ? s.items[s.index] : null))
  const paused = usePlayer((s) => s.engine.paused)
  return { active: Boolean(current && hit.sources.some((src) => src.ref === current.ref)), paused }
}

export function SearchResults({
  search,
  deezerPremium,
  youtubeLeft
}: {
  search: UnifiedSearch
  deezerPremium: boolean
  youtubeLeft: number | null
}): React.JSX.Element {
  const t = useT()
  const [note, setNote] = useState<string | null>(null)
  const { hits, busy, youtube } = search

  const play = (hit: MusicHit, source: SourceHit, index: number): void => {
    setNote(null)
    void playSource(hit, source, hits.slice(index + 1), { deezerPremium }).then((result) => {
      if (!result.ok) setNote(t(reasonKey(result.reason)))
      // ‏Deezer בלי מנוי: מתנגן קטע, ואומרים למה — לא משאירים לנחש
      else if (result.reason === 'preview-only' || result.reason === 'login-for-full') setNote(t('accounts.loginFull'))
    })
  }
  const queueable = (hit: MusicHit): SourceHit | undefined => hit.sources.find((s) => queueItemFor(hit, s))

  const [top, ...rest] = hits
  const ytWhy = youTubeReason(youtube?.reason)

  return (
    <div className="flex flex-col gap-8">
      {note && <p role="status" className="rounded-o-lg bg-crimson/12 px-4 py-2.5 text-[13px] text-crimson">{note}</p>}

      {top && <TopResult hit={top} onPlay={(source) => play(top, source, 0)} />}

      {rest.length > 0 && (
        <section className="flex flex-col gap-1">
          <h2 className="font-display mb-2 text-[20px] font-bold tracking-tight">{t('music.songs')}</h2>
          {rest.map((hit, i) => {
            const index = i + 1
            return (
              <ResultRow
                key={hit.key}
                hit={hit}
                index={index}
                onPlay={(source) => play(hit, source, index)}
                onQueue={() => {
                  const source = queueable(hit)
                  const item = source && queueItemFor(hit, source)
                  if (item) useQueue.getState().enqueue([item])
                }}
                onPlaylist={() => {
                  const source = queueable(hit)
                  const item = source && queueItemFor(hit, source)
                  if (item) pickPlaylist([item])
                }}
                canQueue={Boolean(queueable(hit))}
              />
            )
          })}
        </section>
      )}

      {!busy && hits.length === 0 && <p className="py-10 text-center text-[14px] text-ink-3">{t('music.empty')}</p>}

      {/* YouTube חי — רק בבקשה: כל חיפוש עולה ממכסה שכל המשתמשים חולקים */}
      {youtubeLeft !== null && !youtube && (
        <div className="glass-ultrathin flex flex-wrap items-center gap-3 rounded-o-xl px-4 py-3">
          <MusicProviderBadge provider="YouTube" />
          <span className="flex-1 text-[13px] text-ink-2">{t('music.youtubeMore', { n: youtubeLeft })}</span>
          <Button variant="outline" onClick={search.submitYouTube} disabled={youtubeLeft === 0 || busy}>
            <Icon name="search" size={13} />{t('youtube.search')}
          </Button>
        </div>
      )}
      {ytWhy && <p className="text-[12.5px] text-ink-3">{t(ytWhy)}</p>}
    </div>
  )
}

function TopResult({ hit, onPlay }: { hit: MusicHit; onPlay: (source: SourceHit) => void }): React.JSX.Element {
  const t = useT()
  const { active, paused } = useIsPlaying(hit)
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-thin group relative flex items-center gap-6 overflow-hidden rounded-o-2xl p-6"
    >
      {hit.cover && <img src={hit.cover} alt="" className="absolute inset-0 -z-10 h-full w-full scale-125 object-cover opacity-25 blur-3xl" />}
      <button onClick={() => onPlay(hit.sources[0])} className="relative h-36 w-36 shrink-0 overflow-hidden rounded-o-xl bg-surf-2 shadow-e3" aria-label={`${t('player.play')} · ${hit.title}`}>
        {hit.cover ? <img src={hit.cover} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-ink-3"><Icon name="music" size={40} /></span>}
        <span className="absolute inset-0 grid place-items-center bg-canvas/30 opacity-0 transition-opacity duration-fast group-hover:opacity-100">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-arctic text-canvas shadow-e3"><Icon name="play" size={18} fill /></span>
        </span>
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="text-[11.5px] font-semibold tracking-[0.06em] text-ink-3 uppercase">{t('music.topResult')}</span>
        <h2 dir="auto" className="font-display flex items-center gap-3 truncate text-[30px] leading-tight font-extrabold">
          {active && <Equalizer active={!paused} />}
          <span className="truncate">{hit.title}</span>
        </h2>
        <p dir="auto" className="truncate text-[14px] text-ink-2">
          {[hit.artist, hit.album, hit.durationSec ? clock(hit.durationSec) : null].filter(Boolean).join(' · ')}
        </p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {hit.sources.map((source, i) => <SourceChip key={source.kind} source={source} primary={i === 0} onPick={() => onPlay(source)} />)}
        </div>
      </div>
    </motion.section>
  )
}

function ResultRow({
  hit,
  index,
  onPlay,
  onQueue,
  onPlaylist,
  canQueue
}: {
  hit: MusicHit
  index: number
  onPlay: (source: SourceHit) => void
  onQueue: () => void
  onPlaylist: () => void
  canQueue: boolean
}): React.JSX.Element {
  const t = useT()
  const { active, paused } = useIsPlaying(hit)
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: Math.min(index, 12) * 0.02 }}
      onClick={() => onPlay(hit.sources[0])}
      className={`group grid cursor-pointer grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-4 rounded-o-lg px-3 py-2 transition-colors duration-fast ${
        active ? 'bg-violet/12 ring-1 ring-violet/35' : 'hover:bg-ink/6'
      }`}
    >
      <span className="relative h-13 w-13 overflow-hidden rounded-o-md bg-surf-2" style={{ height: 52, width: 52 }}>
        {hit.cover ? <img src={hit.cover} alt="" loading="lazy" className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-ink-3"><Icon name="music" size={18} /></span>}
        {active && <span className="absolute inset-0 grid place-items-center bg-canvas/50"><Equalizer active={!paused} /></span>}
      </span>
      <span className="min-w-0">
        <span dir="auto" className="block truncate text-[14px] font-semibold">{hit.title}</span>
        <span dir="auto" className="block truncate text-[12px] text-ink-3">
          {[hit.artist, hit.album].filter(Boolean).join(' · ')}
        </span>
        <span className="mt-1.5 flex flex-wrap gap-1.5">
          {hit.sources.map((source, i) => <SourceChip key={source.kind} source={source} primary={i === 0} onPick={() => onPlay(source)} />)}
        </span>
      </span>
      <span className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
        {hit.durationSec ? <span className="me-2 text-[12px] text-ink-3 tabular-nums">{clock(hit.durationSec)}</span> : null}
        {canQueue && (
          <>
            <IconButton icon="plus" label={t('music.addQueue')} size={15} className="h-8 w-8 opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={onQueue} />
            <IconButton icon="listPlus" label={t('music.addToPlaylist')} size={15} className="h-8 w-8 opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={onPlaylist} />
          </>
        )}
      </span>
    </motion.div>
  )
}
