import { motion } from 'motion/react'
import { createPortal } from 'react-dom'
import { trailerUrl } from '@shared/trailer'
import { useI18n, useT } from '../i18n'
import { IconButton } from './ui'

export function TrailerPlayer({
  trailerKey,
  trailerLang,
  title,
  onClose
}: {
  trailerKey: string
  /** שפת האודיו של הטריילר, כפי ש-TMDB סימן אותה */
  trailerLang?: string | null
  title: string
  onClose: () => void
}): React.JSX.Element | null {
  const t = useT()
  const locale = useI18n((s) => s.locale)
  if (!/^[\w-]{6,32}$/.test(trailerKey)) return null

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] grid place-items-center bg-canvas/88 p-6 backdrop-blur-xl"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="glass-regular relative aspect-video w-full max-w-5xl overflow-hidden rounded-o-2xl shadow-e4">
        <IconButton
          icon="close"
          label={t('nav.close')}
          onClick={onClose}
          className="absolute end-3 top-3 z-10 bg-canvas/75"
        />
        <iframe
          src={trailerUrl(trailerKey, locale, trailerLang)}
          title={`${t('details.trailer')} — ${title}`}
          className="h-full w-full border-0"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    </motion.div>,
    document.body
  )
}
