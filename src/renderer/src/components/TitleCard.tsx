import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import type { HubCard } from '@shared/api'
import { useT } from '../i18n'
import { useUi } from '../store/ui'
import { activate } from '../lib/activate'
import { BrandTag, Icon, QualityTag } from './ui'
import { MusicProviderBadge } from './MusicProviderBadge'
import placeholder from '../assets/placeholder-v2.png'

/**
 * כרטיס כותר.
 *
 * אותו כרטיס בדיוק במסך הבית, ברשימה ובכל שורה אחרת. כרטיס שנכתב
 * פעמיים מתפצל בשינוי הראשון, והמשתמש רואה שתי התנהגויות שונות
 * לאותו דבר.
 */

export function TitleCard({ card, index }: { card: HubCard; index: number }): React.JSX.Element {
  const t = useT()
  const onDetails = useUi((s) => s.openDetails)
  const [failed, setFailed] = useState(false)
  const [listed, setListed] = useState(false)
  const art = card.poster && !failed ? card.poster : placeholder

  useEffect(() => {
    void window.cinema.hub.inWatchlist(card.id).then(setListed)
  }, [card.id])

  const go = (): void => {
    void activate(card).then((r) => {
      // כותר שאין לו יעד ישיר נפתח ככרטיס פרטים, לא בדפדפן
      if (!r.ok && r.reason === 'needs-details') onDetails(card.id)
    })
  }

  const toggle = (): void => {
    void window.cinema.hub
      .toggleWatchlist({
        id: card.id,
        title: card.title,
        poster: card.poster,
        year: card.year,
        rating: card.rating,
        itemId: card.itemId,
        externalUrl: card.externalUrl,
        brand: card.brand
      })
      .then(setListed)
  }

  /*
   * מקור מקומי מסומן באייקון ולא במילה.
   *
   * "Ordinateur" הוא מלבן שיושב על הכרזה ומסתיר אותה, וגם אינו מוסיף
   * מידע שהמשתמש לא יודע. אייקון קטן ושקוף למחצה אומר את אותו דבר
   * ומשאיר את האמנות גלויה.
   */
  const localIcon = card.source === 'local' ? 'screen' : card.source === 'gdrive' ? 'cloud' : null
  const localLabel =
    card.source === 'local' ? t('library.computer') : card.source === 'gdrive' ? 'Drive' : ''

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: Math.min(index, 10) * 0.03, ease: [0.16, 1, 0.3, 1] }}
      className="group relative w-[172px] shrink-0 snap-start"
    >
      {/* ‏aria-label: התוכן של הכפתור הוא הדירוג ותג האיכות, ו-title אינו נחשב שם כשיש תוכן — קורא מסך הכריז "7.4, כפתור" במקום שם הכותר */}
      <button onClick={go} title={card.title} aria-label={card.title} className="block w-full text-start outline-offset-4">
        <div className="card-lift group-hover:card-lift-on relative aspect-[2/3] w-full overflow-hidden rounded-o-lg bg-surf-1">
          <img
            src={art}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
            onError={() => setFailed(true)}
          />

          {art === placeholder && (
            <span className="absolute inset-0 grid place-items-center p-4">
              <span className="line-clamp-4 text-center text-[12.5px] leading-snug font-medium text-ink/85">
                {card.title}
              </span>
            </span>
          )}

          <span className="absolute end-2 top-2 flex items-center gap-1">
            {card.source === 'music' && card.brand ? (
              <MusicProviderBadge provider={card.brand.name} compact />
            ) : card.brand ? (
              <BrandTag brand={card.brand} />
            ) : (
              localIcon && (
                <span
                  title={localLabel}
                  aria-label={localLabel}
                  className="grid h-[22px] w-[22px] place-items-center rounded-o-sm bg-canvas/45 text-ink/70 backdrop-blur-md"
                >
                  <Icon name={localIcon} size={12} />
                </span>
              )
            )}
          </span>

          {card.subscribed && (
            <span className="absolute inset-x-2 bottom-2 z-10 rounded-full border border-mint/45 bg-canvas/75 px-2 py-1 text-center text-[10px] font-semibold text-mint shadow-e1 backdrop-blur-md">
              {t('subs.included')}
            </span>
          )}

          <div className="scrim-bottom pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-normal group-hover:opacity-100" />

          {/* הפעולות נכנסות רק במעבר עכבר, כדי שהרשת במנוחה תהיה אמנות */}
          <span className={`pointer-events-none absolute inset-x-0 flex translate-y-2 items-end gap-2 p-2.5 opacity-0 transition duration-normal ease-out group-hover:translate-y-0 group-hover:opacity-100 ${card.subscribed ? 'bottom-9' : 'bottom-0'}`}>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-arctic text-canvas shadow-e2">
              <Icon name={card.source === 'music' ? 'sound' : 'play'} size={14} fill={card.source !== 'music'} />
            </span>
            <span className="flex flex-1 flex-wrap items-center gap-1.5">
              {card.quality && <QualityTag value={card.quality} />}
              {card.rating > 0 && (
                <span className="flex items-center gap-0.5 text-[11px] font-semibold text-ink tabular-nums">
                  <Icon name="star" size={10} fill />
                  {card.rating.toFixed(1)}
                </span>
              )}
            </span>
          </span>

          {/*
            פס ההתקדמות אינו נעלם במעבר עכבר — הוא הסיבה שהכרטיס
            נמצא בשורה הזאת מלכתחילה.
          */}
          {card.progress !== undefined && card.progress > 0 && (
            <span className="absolute inset-x-0 bottom-0 h-[3px] bg-canvas/70">
              <span
                className="block h-full bg-violet-bright"
                style={{ width: `${Math.min(100, card.progress * 100)}%` }}
              />
            </span>
          )}
        </div>
      </button>

      {/* מחוץ לכפתור הנגינה: כפתור בתוך כפתור אינו HTML תקין */}
      <button
        onClick={toggle}
        aria-label={t('hub.watchlist')}
        title={t('hub.watchlist')}
        className={`no-drag absolute start-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full backdrop-blur-md transition duration-fast ${
          listed
            ? 'bg-arctic text-canvas opacity-100'
            : 'bg-canvas/70 text-ink opacity-0 group-hover:opacity-100 hover:bg-canvas/90'
        }`}
      >
        <Icon name={listed ? 'check' : 'plus'} size={15} strokeWidth={2.1} />
      </button>

      <div className="mt-2.5 min-w-0 px-0.5">
        <div dir="auto" className="truncate text-[12.5px] font-medium">
          {card.title}
        </div>
        <div dir="auto" className="truncate text-[11.5px] text-ink-3 tabular-nums">
          {card.subtitle || card.year || ''}
        </div>
      </div>
    </motion.div>
  )
}

export function CardSkeleton(): React.JSX.Element {
  return (
    <div className="w-[172px] shrink-0">
      <div className="skeleton aspect-[2/3] w-full rounded-o-lg" />
      <div className="skeleton mt-2.5 h-3 w-4/5 rounded-o-xs" />
      <div className="skeleton mt-1.5 h-2.5 w-2/5 rounded-o-xs" />
    </div>
  )
}
