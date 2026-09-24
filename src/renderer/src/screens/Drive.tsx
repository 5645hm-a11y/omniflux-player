import { useMemo } from 'react'
import { useCards, useLibrary } from '../store/library'
import { useT } from '../i18n'
import { Icon, IconButton, Pill } from '../components/ui'
import { ScreenHeader } from '../components/ScreenHeader'
import { Poster } from '../components/Poster'
import { AddDrive, FolderChips } from '../components/Sources'

/**
 * Google Drive.
 *
 * הדיסק בענן הוא מקור שווה-מעמד לתיקייה במחשב, ולכן יש לו יעד משלו
 * ולא לשונית בתוך הספרייה: מי שכל הספרייה שלו בענן לא צריך לעבור
 * דרך מסך שמדבר על תיקיות מקומיות.
 *
 * מה שנדרש מהמשתמש הוא קישור אחד. השיתוף חייב להיות "כל מי שיש לו
 * הקישור" — וזו בדיוק ההודעה שחוזרת כשהוא אינו.
 */
export function Drive(): React.JSX.Element {
  const t = useT()
  const cards = useCards()
  const folders = useLibrary((s) => s.folders)
  const scanning = useLibrary((s) => s.scanning)
  const scan = useLibrary((s) => s.scan)

  const drive = useMemo(() => cards.filter((c) => c.source === 'gdrive'), [cards])
  const connected = folders.filter((f) => f.source === 'gdrive').length

  return (
    <div className="pointer-events-auto absolute inset-0 flex flex-col bg-canvas">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-surf-1 to-transparent opacity-70" />

      <ScreenHeader
        title="Google Drive"
        subtitle={connected > 0 ? t('library.count', { titles: drive.length, files: connected }) : undefined}
        actions={
          <IconButton
            icon="refresh"
            label={scanning ? t('library.scanning') : t('library.scan')}
            size={17}
            onClick={() => void scan()}
            disabled={scanning}
            className={scanning ? 'animate-spin' : ''}
          />
        }
      />

      <div className="relative z-10 flex-1 overflow-y-auto px-8 pb-10">
        <div className="mx-auto flex max-w-3xl flex-col gap-5 pb-8">
          <AddDrive />
          <FolderChips only="gdrive" />
        </div>

        {drive.length > 0 ? (
          <>
            <div className="mb-5 flex items-center gap-3">
              <h2 className="font-display text-[15px] font-bold">{t('library.title')}</h2>
              <Pill>{t('library.count', { titles: drive.length, files: drive.length })}</Pill>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(166px,1fr))] gap-x-5 gap-y-10">
              {drive.map((card, i) => (
                <Poster key={card.id} card={card} index={i} />
              ))}
            </div>
          </>
        ) : (
          <div className="mx-auto mt-12 flex max-w-md flex-col items-center gap-5 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-ink/6 text-ink-3">
              <Icon name="cloud" size={26} />
            </span>
            <p className="text-[14px] leading-relaxed text-ink-2">
              {scanning ? t('library.scanning') : t('library.emptyBody')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
