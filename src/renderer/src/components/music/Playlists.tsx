import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { create } from 'zustand'
import { motion } from 'motion/react'
import { useT } from '../../i18n'
import { queueKey, useQueue, type QueueItem } from '../../store/queue'
import {
  addToPlaylist, createPlaylist, deletePlaylist, onPlaylistsChange, playlists, removeFromPlaylist, renamePlaylist,
  type Playlist, type StoredItem
} from '../../lib/playlists'
import { Button, Icon, IconButton } from '../ui'
import { MusicProviderBadge } from '../MusicProviderBadge'
import { Carousel } from './Carousel'
import { useEscapeLayer } from '../../store/ui'

/**
 * הפלייליסטים של המשתמש: שמירה, בחירה, ניגון.
 *
 * הבוחר ("הוסף לפלייליסט") הוא אחד לכל המתחם — כרטיס, תוצאת חיפוש
 * והתור פותחים את אותו חלון — כדי שהפעולה תיראה ותתנהג אותו דבר בכל
 * מקום שבו שיר מופיע.
 */

export function usePlaylists(): Playlist[] {
  const [list, setList] = useState(playlists)
  useEffect(() => onPlaylistsChange(() => setList(playlists())), [])
  return list
}

const usePicker = create<{ items: Array<QueueItem | StoredItem> | null; open: (items: Array<QueueItem | StoredItem>) => void; close: () => void }>((set) => ({
  items: null,
  open: (items) => set({ items }),
  close: () => set({ items: null })
}))

/** פותח את בוחר הפלייליסט לשירים האלה */
export const pickPlaylist = (items: Array<QueueItem | StoredItem>): void => usePicker.getState().open(items)

const fresh = (items: StoredItem[]): QueueItem[] => items.map((item) => ({ ...item, key: queueKey() }))

/** עד ארבע עטיפות בפסיפס — כמו פלייליסט ב-Spotify — או צבע, כשאין אף אחת */
function Mosaic({ playlist, className = '' }: { playlist: Playlist; className?: string }): React.JSX.Element {
  const covers = [...new Set(playlist.items.map((i) => i.cover).filter((c): c is string => Boolean(c)))].slice(0, 4)
  return (
    <span className={`relative grid overflow-hidden rounded-o-lg bg-gradient-to-br from-violet/60 to-surf-2 ${covers.length >= 4 ? 'grid-cols-2' : ''} ${className}`}>
      {covers.length >= 4
        ? covers.map((cover) => <img key={cover} src={cover} alt="" className="aspect-square h-full w-full object-cover" />)
        : covers[0]
          ? <img src={covers[0]} alt="" className="h-full w-full object-cover" />
          : <span className="grid place-items-center text-white/80"><Icon name="music" size={34} strokeWidth={1.3} /></span>}
    </span>
  )
}

export function PlaylistsCarousel({ onOpen }: { onOpen: (id: string) => void }): React.JSX.Element {
  const t = useT()
  const list = usePlaylists()
  const queue = useQueue((s) => s.items)
  const create = (): void => {
    const name = t('music.newPlaylistName', { n: list.length + 1 })
    const made = createPlaylist(name, queue)
    if (made) onOpen(made.id)
  }
  return (
    <Carousel title={t('music.playlistsTitle')} itemWidth={168}>
      <button onClick={create} className="group flex w-full flex-col gap-2.5 text-start">
        <span className="grid aspect-square w-full place-items-center rounded-o-lg border border-dashed border-ink/20 text-ink-3 transition-colors duration-fast group-hover:border-violet/60 group-hover:text-violet-bright">
          <Icon name="plus" size={30} />
        </span>
        <span className="text-[13.5px] font-semibold">{t('music.newPlaylist')}</span>
      </button>
      {list.map((playlist) => (
        <button key={playlist.id} onClick={() => onOpen(playlist.id)} className="group flex w-full flex-col gap-2.5 text-start">
          <Mosaic playlist={playlist} className="card-lift group-hover:card-lift-on aspect-square w-full" />
          <span className="min-w-0">
            <span dir="auto" className="block truncate text-[13.5px] font-semibold">{playlist.name}</span>
            <span className="block text-[11.5px] text-ink-3">{t('music.trackCount', { n: playlist.items.length })}</span>
          </span>
        </button>
      ))}
    </Carousel>
  )
}

export function PlaylistView({ id, onClose }: { id: string; onClose: () => void }): React.JSX.Element | null {
  const t = useT()
  const list = usePlaylists()
  const playlist = list.find((p) => p.id === id)
  const [name, setName] = useState(playlist?.name ?? '')
  useEffect(() => setName(playlist?.name ?? ''), [playlist?.name])
  useEscapeLayer(onClose)
  if (!playlist) return null

  const play = (shuffle = false): void => {
    const items = fresh(playlist.items)
    if (shuffle) {
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[items[i], items[j]] = [items[j], items[i]]
      }
    }
    useQueue.getState().playList(items, 0)
  }

  return createPortal(
    <div className="fixed inset-0 z-[120] grid place-items-center bg-canvas/80 p-8 backdrop-blur-xl" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="glass-thick flex max-h-[82vh] w-full max-w-3xl flex-col gap-5 overflow-hidden rounded-o-2xl p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-end gap-5">
          <Mosaic playlist={playlist} className="h-36 w-36 shrink-0 shadow-e4" />
          <div className="min-w-0 flex-1">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => name.trim() && name !== playlist.name && renamePlaylist(playlist.id, name)}
              onKeyDown={(event) => event.key === 'Enter' && (event.target as HTMLInputElement).blur()}
              aria-label={t('music.renamePlaylist')}
              dir="auto"
              className="font-display w-full rounded-o-md bg-transparent text-[30px] font-extrabold outline-none focus:bg-ink/6"
            />
            <p className="mt-1 text-[13px] text-ink-3">{t('music.trackCount', { n: playlist.items.length })}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button variant="primary" onClick={() => play()} disabled={playlist.items.length === 0}><Icon name="play" size={13} fill />{t('music.playAll')}</Button>
              <Button variant="outline" onClick={() => play(true)} disabled={playlist.items.length < 2}><Icon name="shuffle" size={13} />{t('music.shuffle')}</Button>
              <span className="flex-1" />
              <IconButton icon="trash" label={t('music.deletePlaylist')} onClick={() => { deletePlaylist(playlist.id); onClose() }} />
            </div>
          </div>
          <IconButton icon="close" label={t('nav.close')} onClick={onClose} className="self-start" />
        </div>
        {playlist.items.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-ink-3">{t('music.playlistEmpty')}</p>
        ) : (
          <div className="-mx-2 overflow-y-auto px-2">
            {playlist.items.map((item, index) => (
              <div key={`${item.source}:${item.ref}`} className="group grid grid-cols-[28px_44px_minmax(0,1fr)_auto] items-center gap-3 rounded-o-lg px-2 py-1.5 hover:bg-ink/6">
                <span className="text-center text-[12px] text-ink-3 tabular-nums">{index + 1}</span>
                <button onClick={() => useQueue.getState().playList(fresh(playlist.items), index)} className="h-11 w-11 overflow-hidden rounded-o-md bg-surf-2" aria-label={`${t('player.play')} · ${item.title}`}>
                  {item.cover ? <img src={item.cover} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-ink-3"><Icon name="music" size={16} /></span>}
                </button>
                <button onClick={() => useQueue.getState().playList(fresh(playlist.items), index)} className="min-w-0 text-start">
                  <span dir="auto" className="block truncate text-[13.5px] font-semibold">{item.title}</span>
                  <span className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
                    {item.source === 'youtube' && <MusicProviderBadge provider="YouTube" compact />}
                    <span dir="auto" className="truncate">{item.artist}</span>
                  </span>
                </button>
                <IconButton icon="close" label={t('music.removeFromQueue')} size={14} className="h-8 w-8 opacity-0 group-hover:opacity-100 focus:opacity-100"
                  onClick={() => removeFromPlaylist(playlist.id, index)} />
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>,
    document.body
  )
}

/** "הוסף לפלייליסט" — חלון אחד לכל המתחם */
export function PlaylistPicker(): React.JSX.Element | null {
  const t = useT()
  const items = usePicker((s) => s.items)
  const close = usePicker((s) => s.close)
  const list = usePlaylists()
  const [name, setName] = useState('')
  const [note, setNote] = useState<string | null>(null)
  useEffect(() => {
    setName('')
    setNote(null)
  }, [items])
  useEscapeLayer(close, Boolean(items))
  if (!items) return null

  const done = (ok: boolean, playlistName: string): void => {
    if (!ok) {
      setNote(t('music.playlistNotSaved'))
      return
    }
    setNote(t('music.playlistSaved', { name: playlistName }))
    window.setTimeout(close, 700)
  }

  return createPortal(
    <div className="fixed inset-0 z-[130] grid place-items-center bg-canvas/70 p-8 backdrop-blur-md" onClick={close}>
      <div className="glass-thick flex w-full max-w-sm flex-col gap-3 rounded-o-2xl p-5" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center">
          <h2 className="font-display flex-1 text-[18px] font-bold">{t('music.addToPlaylist')}</h2>
          <IconButton icon="close" label={t('nav.close')} onClick={close} />
        </div>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && name.trim() && done(Boolean(createPlaylist(name, items)), name.trim())}
            placeholder={t('music.newPlaylist')}
            aria-label={t('music.newPlaylist')}
            dir="auto"
            className="h-10 min-w-0 flex-1 rounded-o-md border border-ink/10 bg-ink/5 px-3 text-[13px] outline-none focus:border-violet/55"
          />
          <Button variant="outline" disabled={!name.trim()} onClick={() => done(Boolean(createPlaylist(name, items)), name.trim())}>
            <Icon name="plus" size={13} />
          </Button>
        </div>
        <div className="flex max-h-72 flex-col overflow-y-auto">
          {list.map((playlist) => (
            <button key={playlist.id} onClick={() => done(addToPlaylist(playlist.id, items), playlist.name)}
              className="flex items-center gap-3 rounded-o-lg px-2 py-2 text-start hover:bg-ink/8">
              <Mosaic playlist={playlist} className="h-10 w-10 shrink-0" />
              <span dir="auto" className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{playlist.name}</span>
              <span className="text-[11.5px] text-ink-3 tabular-nums">{playlist.items.length}</span>
            </button>
          ))}
        </div>
        {note && <p role="status" className="text-center text-[12.5px] text-ink-2">{note}</p>}
      </div>
    </div>,
    document.body
  )
}
