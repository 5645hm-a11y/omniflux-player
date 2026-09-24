import { useState } from 'react'
import { useLibrary } from '../store/library'
import { useT } from '../i18n'
import { Button, Icon } from './ui'

/**
 * מאיפה מגיעים הקבצים.
 *
 * שני מקורות, ולכל אחד מסך משלו בסרגל: תיקייה במחשב, ותיקייה
 * ב-Google Drive. הרכיבים כאן משותפים לשניהם, כי טופס שנכתב פעמיים
 * מתפצל בשינוי הראשון — ואז "הוספת תיקייה" מתנהגת אחרת בשני מקומות
 * שנראים זהים.
 */

export function AddLocal({ size = 'md' }: { size?: 'md' | 'lg' }): React.JSX.Element {
  const t = useT()
  const refresh = useLibrary((s) => s.refreshFolders)
  return (
    <Button
      variant={size === 'lg' ? 'primary' : 'outline'}
      size={size}
      className="self-start"
      onClick={() => void window.cinema.library.addLocalFolder().then(refresh)}
    >
      <Icon name="folder" size={16} />
      {t('library.addLocal')}
    </Button>
  )
}

/**
 * קישור ל-Drive.
 *
 * הקישור נבדק מול Google לפני שהוא נכנס לרשימה, ולכן ההודעה כאן
 * אומרת מה בדיוק נכשל — "לא משותף", "מצביע על קובץ" — ולא "שגיאה".
 */
export function AddDrive(): React.JSX.Element {
  const t = useT()
  const refresh = useLibrary((s) => s.refreshFolders)
  const [link, setLink] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const add = async (): Promise<void> => {
    if (!link.trim() || busy) return
    setBusy(true)
    setMsg(null)
    const res = await window.cinema.library.addDriveFolder(link.trim())
    setMsg(res.ok ? t('library.added') : (res.error ?? t('library.addFailed')))
    if (res.ok) {
      setLink('')
      await refresh()
      void window.cinema.library.scan()
    }
    setBusy(false)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute inset-y-0 start-3 grid place-items-center text-ink-3">
            <Icon name="cloud" size={16} />
          </span>
          <input
            className="w-full rounded-o-md border border-ink/12 bg-surf-1/70 py-2.5 ps-10 pe-3 text-[13px] outline-none transition-colors placeholder:text-ink-3 focus:border-violet/50"
            dir="ltr"
            placeholder={t('library.drivePlaceholder')}
            aria-label={t('library.addDrive')}
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void add()}
          />
        </div>
        <Button variant="outline" onClick={() => void add()} disabled={busy || !link.trim()}>
          {busy ? t('library.checking') : t('library.addDrive')}
        </Button>
      </div>
      {msg && <p className="text-[13px] text-ink-2">{msg}</p>}
    </div>
  )
}

/** התיקיות שכבר ברשימה, כשבבים שאפשר להסיר */
export function FolderChips({ only }: { only?: 'local' | 'gdrive' }): React.JSX.Element {
  const t = useT()
  const all = useLibrary((s) => s.folders)
  const refresh = useLibrary((s) => s.refreshFolders)
  const folders = only ? all.filter((f) => f.source === only) : all
  if (folders.length === 0) return <></>

  return (
    <div className="flex flex-wrap gap-2">
      {folders.map((f) => (
        <span
          key={f.id}
          className="surface group flex items-center gap-2 rounded-full py-1.5 pe-1.5 ps-3 text-[12.5px]"
        >
          <Icon name={f.source === 'gdrive' ? 'cloud' : 'folder'} size={13} className="text-ink-3" />
          <span className="max-w-56 truncate">{f.label}</span>
          <button
            className="grid h-6 w-6 place-items-center rounded-full text-ink-3 transition-colors hover:bg-crimson/20 hover:text-crimson"
            onClick={() => void window.cinema.library.removeFolder(f.id).then(refresh)}
            aria-label={t('library.remove', { name: f.label })}
          >
            <Icon name="close" size={12} />
          </button>
        </span>
      ))}
    </div>
  )
}
