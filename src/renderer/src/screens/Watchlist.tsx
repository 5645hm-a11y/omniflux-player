import { useEffect, useState } from 'react'
import type { HubData } from '@shared/api'
import { useT } from '../i18n'
import { useUi } from '../store/ui'
import { Button, Icon } from '../components/ui'
import { ScreenHeader } from '../components/ScreenHeader'
import { TitleCard, CardSkeleton } from '../components/TitleCard'

/**
 * הרשימה.
 *
 * עד עכשיו היא הייתה שורה אחת בין שורות במסך הבית, ונדחקה מטה ככל
 * שנוספו שורות. רשימה שהמשתמש בנה בעצמו היא הדבר האישי היחיד
 * בתוכנה, ולכן יש לה יעד משלה בסרגל.
 *
 * הנתונים מגיעים מאותו מקור כמו מסך הבית — שורת `watchlist` — ולא
 * מקריאה נפרדת. שני מקורות לאותו מידע נפרדים זה מזה בשינוי הראשון.
 */
export function Watchlist(): React.JSX.Element {
  const t = useT()
  const go = useUi((s) => s.go)
  const [data, setData] = useState<HubData>({ hero: [], rows: [], loading: true })

  useEffect(() => {
    void window.cinema.hub.data().then(setData)
    return window.cinema.hub.onData(setData)
  }, [])

  const cards = data.rows.find((r) => r.key === 'watchlist')?.cards ?? []

  return (
    <div className="pointer-events-auto absolute inset-0 flex flex-col bg-canvas">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-surf-1 to-transparent opacity-70" />

      <ScreenHeader
        title={t('hub.watchlist')}
        subtitle={cards.length > 0 ? t('library.count', { titles: cards.length, files: cards.length }) : undefined}
      />

      <div className="relative z-10 flex-1 overflow-y-auto px-8 pb-10">
        {data.loading && cards.length === 0 ? (
          <div className="flex flex-wrap gap-5">
            {Array.from({ length: 6 }, (_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : cards.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(172px,1fr))] gap-x-5 gap-y-8">
            {cards.map((card, i) => (
              <TitleCard key={card.id} card={card} index={i} />
            ))}
          </div>
        ) : (
          /*
           * ריק שאומר מה לעשות.
           *
           * "אין פריטים" הוא מבוי סתום. הסימן שמופיע על כל כרטיס הוא
           * זה שמוסיף לכאן, ולכן הוא מצויר כאן — כדי שהמשתמש יזהה
           * אותו כשייתקל בו.
           */
          <div className="mx-auto mt-24 flex max-w-md flex-col items-center gap-6 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-ink/6 text-ink-3">
              <Icon name="bookmark" size={26} />
            </span>
            <p className="text-[14.5px] leading-relaxed text-ink-2">{t('hub.watchlistEmpty')}</p>
            <Button variant="primary" onClick={() => go('search')}>
              <Icon name="search" size={16} />
              {t('nav.search')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
