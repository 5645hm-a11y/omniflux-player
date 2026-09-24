import { useState } from 'react'
import type { Card } from '../store/library'
import { useT } from '../i18n'
import { Icon } from './ui'
import placeholder from '../assets/placeholder-v2.png'
import { useUi } from '../store/ui'
import { usePlayer } from '../store/player'

/**
 * כרזה בספרייה.
 *
 * הכרזה היא התוכן. כל שאר האלמנטים — דירוג, שנה, מספר פרקים —
 * נכנסים רק במעבר עכבר, כדי שהרשת במנוחה תהיה קיר של אמנות ולא
 * טבלה של מטא-דאטה.
 */

export function Poster({ card, index }: { card: Card; index: number }): React.JSX.Element {
  const t = useT()
  const [failed, setFailed] = useState(false)
  const art = card.poster && !failed ? card.poster : placeholder
  const sourceLabel = card.source === 'gdrive' ? 'Drive' : t('library.computer')
  const openDetails = useUi((state) => state.openDetails)

  return (
    <button
      className="group flex flex-col gap-2.5 text-start outline-offset-4 rise-in"
      // ההשהיה קצרה ומוגבלת: פריט מאה לא אמור להמתין שתי שניות
      style={{ animationDelay: `${Math.min(index, 24) * 22}ms` }}
      onClick={() => {
        if (card.source === 'gdrive' && card.kind !== 'audio') {
          openDetails(`library:${encodeURIComponent(card.id)}`)
          return
        }
        void window.cinema.player.playItem(card.id).catch(usePlayer.getState().reportError)
      }}
      title={card.title}
    >
      {/*
        אותה התנהגות מיקוד כמו במסך הבית: הגדלה של 6% ב-180ms, על
        transform בלבד — הכרטיס עובר לפני שכניו ואינו דוחף אותם.
      */}
      <div className="card-lift group-hover:card-lift-on relative aspect-[2/3] w-full overflow-hidden rounded-o-lg bg-surf-1">
        <img
          src={art}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />

        {/* בלי כרזה אמיתית — הכותרת עצמה על הזכוכית המצוירת */}
        {art === placeholder && (
          <span className="absolute inset-0 grid place-items-center p-4">
            <span className="line-clamp-4 text-center text-[13px] leading-snug font-medium text-ink/85">
              {card.title}
            </span>
          </span>
        )}

        {/* תג מקור מינימלי: אייקון שקוף למחצה, לא מלבן עם מילה */}
        <span className="absolute end-2 top-2 flex items-center gap-1">
          {card.episodes > 1 && (
            <span className="rounded-o-sm bg-canvas/70 px-1.5 py-0.5 text-[10px] font-semibold backdrop-blur-md">
              {card.episodes}
            </span>
          )}
          <span
            title={sourceLabel}
            aria-label={sourceLabel}
            className="grid h-[22px] w-[22px] place-items-center rounded-o-sm bg-canvas/45 text-ink/70 backdrop-blur-md"
          >
            <Icon name={card.source === 'gdrive' ? 'cloud' : 'screen'} size={12} />
          </span>
        </span>

        <div className="scrim-bottom pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-normal group-hover:opacity-100" />

        <span className="pointer-events-none absolute inset-x-0 bottom-0 flex translate-y-2 items-center gap-2 p-2.5 opacity-0 transition duration-normal ease-out group-hover:translate-y-0 group-hover:opacity-100">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-arctic text-canvas shadow-e2">
            <Icon name="play" size={14} fill />
          </span>
          {card.rating > 0 && (
            <span className="flex items-center gap-0.5 text-[11px] font-semibold text-ink tabular-nums">
              <Icon name="star" size={10} fill />
              {card.rating.toFixed(1)}
            </span>
          )}
          <span className="ms-auto text-[11.5px] text-ink/70 tabular-nums">{card.year ?? ''}</span>
        </span>
      </div>

      <div className="min-w-0 px-0.5">
        {/*
          dir="auto" נותן לכל כותר את הכיוון שלו.
          בלעדיו כותר לטיני בממשק ימין-שמאל נחתך מההתחלה
          ("...night : Le Chevalier noir") במקום מהסוף.
        */}
        <div dir="auto" className="truncate text-[13.5px] font-medium">
          {card.title}
        </div>
        <div className="text-[12px] text-ink-3 tabular-nums">{card.year ?? ''}</div>
      </div>
    </button>
  )
}
