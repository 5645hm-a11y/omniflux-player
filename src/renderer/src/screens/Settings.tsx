import { useEffect, useState } from 'react'
import { LOCALES } from '@shared/i18n'
import type { ProviderAccount, SpotifyDevice, UpdateStatus } from '@shared/api'
import { useI18n, useT } from '../i18n'
import { Button, Icon, Pill } from '../components/ui'
import { ScreenHeader } from '../components/ScreenHeader'
import { LegalModal } from '../components/LegalModal'
import developerMark from '../assets/developer-mark.png'
import tmdbLogo from '../assets/tmdb-approved.svg'
import { MusicProviderBadge } from '../components/MusicProviderBadge'

/**
 * ההגדרות.
 *
 * שלושה דברים בלבד, ובכוונה: שפה, נגן ברירת מחדל, ועדכונים. כל שאר
 * ההתנהגות נגזרת מהקובץ שמנוגן ולא מהעדפה שצריך לכוון.
 */

function Section({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[12px] font-semibold tracking-[0.08em] text-ink-3 uppercase">{title}</h2>
      {children}
    </section>
  )
}

/**
 * חיבור חשבון Spotify.
 *
 * ההסבר אינו קישוט: המשתמש מצפה שלחיצה על שיר תשמיע אותו כאן,
 * והיא לא. עדיף לומר את זה מראש מאשר להשאיר אותו מול כפתור
 * שנראה שבור.
 */
function AccountHub(): React.JSX.Element {
  const t = useT()
  const [accounts, setAccounts] = useState<ProviderAccount[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [devices, setDevices] = useState<SpotifyDevice[]>([])

  const refresh = (): void => {
    void Promise.all([
      window.cinema.spotify.account(),
      window.cinema.deezer.account(),
      window.cinema.library.driveAccount()
    ]).then((next) => {
      setAccounts(next)
      if (next[0].connected) void window.cinema.spotify.devices().then(setDevices)
      else setDevices([])
    })
  }

  useEffect(refresh, [])

  const tierLabel = (account: ProviderAccount): string => {
    if (!account.connected) return t('accounts.disconnected')
    if (account.tier === 'premium') return t('accounts.premium')
    if (account.tier === 'free') return t('accounts.free')
    if (account.tier === 'storage') return t('accounts.storage')
    return t('accounts.connected')
  }

  const connect = async (provider: ProviderAccount['provider']): Promise<void> => {
    setBusy(provider)
    try {
      if (provider === 'spotify') await window.cinema.spotify.connect()
      else if (provider === 'deezer') await window.cinema.deezer.connect()
      else await window.cinema.library.connectDrive()
    } finally {
      setBusy(null)
      refresh()
    }
  }

  const disconnect = async (provider: ProviderAccount['provider']): Promise<void> => {
    setBusy(provider)
    try {
      if (provider === 'spotify') await window.cinema.spotify.disconnect()
      else if (provider === 'deezer') await window.cinema.deezer.disconnect()
      else await window.cinema.library.disconnectDrive()
    } finally {
      setBusy(null)
      refresh()
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] leading-relaxed text-ink-2">{t('accounts.hint')}</p>
      {accounts.map((account) => (
        <div key={account.provider} className="glass-ultrathin flex items-center gap-4 rounded-o-lg px-5 py-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-o-lg bg-ink/7">
            {account.provider === 'google-drive' ? <Icon name="cloud" size={20} /> : <MusicProviderBadge provider={account.provider === 'spotify' ? 'Spotify' : 'Deezer'} compact />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-semibold">{account.provider === 'google-drive' ? 'Google Drive' : account.provider === 'spotify' ? 'Spotify' : 'Deezer'}</span>
              <Pill tone={account.connected ? 'mint' : 'neutral'}>{tierLabel(account)}</Pill>
            </div>
            <p className="mt-1 truncate text-[12px] text-ink-3">
              {account.displayName ?? (account.configured ? t('accounts.ready') : t('accounts.notConfigured'))}
            </p>
            {account.provider === 'spotify' && devices.length > 0 && (
              <p className="mt-1 text-[11px] text-ink-3">{devices.map((device) => device.name).join(' · ')}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/*
              הרשמה לשירות שייכת למקום שבו החשבון מנוהל.
              קודם היא ישבה במתחם המוזיקה, לצד כל שיר, ודחפה מנוי בתוך
              מסך שנועד להאזנה. כאן היא תשובה לשאלה שהמשתמש כבר שואל.
            */}
            {account.provider !== 'google-drive' && account.tier !== 'premium' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void window.cinema.search.openExternal(
                  account.provider === 'spotify'
                    ? 'https://www.spotify.com/premium/'
                    : 'https://www.deezer.com/offers'
                )}
              >
                {account.provider === 'spotify' ? t('music.subscribeSpotify') : t('music.subscribeDeezer')}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={busy === account.provider || !account.configured}
              onClick={() => void (account.connected ? disconnect(account.provider) : connect(account.provider))}
            >
              {account.connected ? t('accounts.disconnect') : t('accounts.connect')}
            </Button>
          </div>
        </div>
      ))}
      {accounts.length === 0 && <div className="skeleton h-24 rounded-o-lg" />}
    </div>
  )
}

/**
 * המנויים של המשתמש.
 *
 * הרשימה מוצעת לפי מה שבאמת מופיע באזור שלו ולא לפי רשימה קבועה —
 * שירות שאינו קיים במדינה שלו אינו בחירה שצריך להציג.
 */
function Subscriptions(): React.JSX.Element {
  const t = useT()
  const [available, setAvailable] = useState<Array<{ name: string; logo: string | null }>>([])
  const [mine, setMine] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void Promise.all([window.cinema.subscriptions.available(), window.cinema.subscriptions.list()]).then(
      ([a, m]) => {
        setAvailable(a)
        setMine(m)
        setLoading(false)
      }
    )
  }, [])

  const has = (name: string): boolean => mine.some((s) => s.toLowerCase() === name.toLowerCase())

  const toggle = (name: string): void => {
    void window.cinema.subscriptions.toggle(name).then((added) => {
      setMine((prev) => (added ? [...prev, name] : prev.filter((s) => s.toLowerCase() !== name.toLowerCase())))
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] leading-relaxed text-ink-2">{t('subs.hint')}</p>
      {loading ? (
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className="skeleton h-10 w-32 rounded-o-lg" />
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {available.map((p) => (
            <button
              key={p.name}
              onClick={() => toggle(p.name)}
              aria-pressed={has(p.name)}
              className={`no-drag flex items-center gap-2 rounded-o-lg border py-2 pe-3.5 ps-2 text-[13px] transition duration-fast ${
                has(p.name)
                  ? 'border-mint/50 bg-mint/12 text-mint'
                  : 'border-ink/12 text-ink/85 hover:border-ink/25 hover:bg-ink/6'
              }`}
            >
              {p.logo ? (
                <img src={p.logo} alt="" className="h-6 w-6 rounded-o-sm object-cover" />
              ) : (
                <span className="grid h-6 w-6 place-items-center rounded-o-sm bg-ink/10">
                  <Icon name="globe" size={12} />
                </span>
              )}
              {p.name}
              {has(p.name) && <Icon name="check" size={13} strokeWidth={2.2} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * ספרייה בלבד.
 *
 * מתג אחד שמכבה כל תוכן שמגיע מהרשת: הבאנר, הטרנדים, קטלוג המוזיקה
 * ותוצאות הסטרימינג בחיפוש. מה שנשאר הוא מה שהמשתמש הוסיף בעצמו.
 *
 * המצב נשמר בתהליך הראשי ולא בממשק, כי גם מסך הבית וגם החיפוש
 * נבנים שם — ושתי נקודות אמת היו נותנות מסך בית מסונן וחיפוש שממשיך
 * לצאת לרשת.
 */
function LocalOnly(): React.JSX.Element {
  const t = useT()
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void window.cinema.app.localOnly().then(setOn)
  }, [])

  const toggle = async (): Promise<void> => {
    if (busy) return
    const next = !on
    setBusy(true)
    // המצב מוצג מיד, אבל הבנייה מחדש של מסך הבית לוקחת רגע
    setOn(next)
    try {
      await window.cinema.app.setLocalOnly(next)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="glass-ultrathin flex items-start gap-4 rounded-o-lg px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-relaxed text-ink-2">{t('settings.localOnlyHint')}</p>
      </div>
      <button
        role="switch"
        aria-checked={on}
        aria-label={t('settings.localOnly')}
        disabled={busy}
        onClick={() => void toggle()}
        className={`no-drag relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors duration-normal disabled:opacity-60 ${
          on ? 'bg-violet' : 'bg-ink/20'
        }`}
      >
        {/*
          הידית נעה בכיוון הלוגי, ולכן היא נוסעת ימינה בממשק
          ימין-שמאל — מתג שנדלק לצד ההתחלה נקרא כמכובה.
        */}
        {/*
          הידית זזה ב-translate ולא ב-start: שינוי של start הוא שינוי
          פריסה בכל פריים. ב-RTL הכיוון מתהפך — מתג שנדלק לצד ההתחלה
          נקרא כמכובה.
        */}
        <span
          className={`absolute start-1 top-1 h-4 w-4 rounded-full bg-arctic shadow-e1 transition-transform duration-fast ease-spring ${
            on ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}

/**
 * ‏1536 → "1.5 KB", בפורמט המספרים של שפת הממשק.
 *
 * בצרפתית היחידה היא אוקטט: o, Ko, Mo, Go. "4 GB" בממשק צרפתי הוא
 * בדיוק הסוג של פרט שמסגיר תרגום שנעשה מבחוץ.
 */
function bytesLabel(bytes: number, locale: string): string {
  const units = locale.startsWith('fr') ? ['o', 'Ko', 'Mo', 'Go', 'To'] : ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  const digits = value >= 100 || unit === 0 ? 0 : 1
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value)} ${units[unit]}`
}

/**
 * מטמון הדרייב.
 *
 * מטמון שאי אפשר לראות ואי אפשר לנקות הוא דיסק שמתמלא בלי הסבר.
 * כאן רואים כמה הוא תופס מול התקרה, ואפשר לפנות בלחיצה.
 */
function DriveCache(): React.JSX.Element {
  const t = useT()
  const locale = useI18n((s) => s.locale)
  const [info, setInfo] = useState<{ bytes: number; limitBytes: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [cleared, setCleared] = useState(false)

  const refresh = (): void => {
    void window.cinema.library.driveCacheInfo().then(setInfo)
  }
  useEffect(refresh, [])

  const clear = async (): Promise<void> => {
    setBusy(true)
    try {
      await window.cinema.library.clearDriveCache()
      setCleared(true)
      refresh()
    } finally {
      setBusy(false)
    }
  }

  const pct = info && info.limitBytes > 0 ? Math.min(100, (info.bytes / info.limitBytes) * 100) : 0

  return (
    <div className="glass-ultrathin flex flex-col gap-4 rounded-o-lg px-5 py-4">
      <p className="text-[13px] leading-relaxed text-ink-2">{t('settings.driveCacheHint')}</p>
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 text-[12.5px] text-ink-3 tabular-nums">
            {info
              ? t('settings.driveCacheSize', {
                  used: bytesLabel(info.bytes, locale),
                  limit: bytesLabel(info.limitBytes, locale)
                })
              : '—'}
          </div>
          <div
            className="h-[4px] overflow-hidden rounded-full bg-ink/12"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct)}
          >
            <div className="h-full w-full bg-violet transition-transform duration-normal ease-out ltr:origin-left rtl:origin-right" style={{ transform: `scaleX(${pct / 100})` }} />
          </div>
        </div>
        <Button variant="outline" size="sm" disabled={busy || !info || info.bytes === 0} onClick={() => void clear()}>
          {cleared && info?.bytes === 0 ? t('settings.driveCacheCleared') : t('settings.driveCacheClear')}
        </Button>
      </div>
    </div>
  )
}

function Updates(): React.JSX.Element {
  const t = useT()
  const [state, setState] = useState<UpdateStatus>({ status: 'idle' })

  useEffect(() => {
    void window.cinema.updates.state().then(setState)
    return window.cinema.updates.onState(setState)
  }, [])

  const line = (): string => {
    switch (state.status) {
      case 'checking':
        return t('search.searching')
      case 'available':
        return t('settings.updateAvailable', { v: state.version })
      case 'downloading':
        return t('settings.updateDownloading', { pct: Math.round(state.percent) })
      case 'ready':
        return t('settings.updateReady')
      case 'error':
        return state.message
      default:
        return t('settings.updateNone')
    }
  }

  return (
    <div className="glass-ultrathin flex items-center gap-4 rounded-o-lg px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px]">{line()}</div>
      </div>
      {state.status === 'ready' ? (
        <Button variant="primary" size="sm" onClick={() => void window.cinema.updates.install()}>
          {t('settings.updateRestart')}
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          disabled={state.status === 'checking' || state.status === 'downloading'}
          onClick={() => void window.cinema.updates.check().then(setState)}
        >
          {t('settings.checkUpdates')}
        </Button>
      )}
    </div>
  )
}

export function Settings(): React.JSX.Element {
  const t = useT()
  const locale = useI18n((s) => s.locale)
  const setLocale = useI18n((s) => s.setLocale)
  const [version, setVersion] = useState('')
  const [legal, setLegal] = useState<'terms' | 'privacy' | null>(null)

  useEffect(() => {
    void window.cinema.app.version().then(setVersion)
  }, [])

  return (
    <div className="pointer-events-auto absolute inset-0 flex flex-col bg-canvas">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-surf-1 to-transparent opacity-70" />

      <ScreenHeader title={t('settings.title')} />

      <div className="relative z-10 flex-1 overflow-y-auto px-8 pb-10">
        <div className="mx-auto flex max-w-2xl flex-col gap-10">
          <Section title={t('settings.language')}>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {LOCALES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => void setLocale(l.code)}
                  className={`no-drag flex items-center justify-between gap-2 rounded-o-lg border px-4 py-3 text-start transition duration-fast ease-out ${
                    locale === l.code
                      ? 'border-violet/55 bg-violet/14 text-violet-bright'
                      : 'border-ink/12 text-ink/85 hover:border-ink/25 hover:bg-ink/6'
                  }`}
                >
                  {/* שם השפה נכתב תמיד בכיוון שלה, גם בממשק בכיוון אחר */}
                  <span className="text-[14px] font-medium" dir={l.dir}>
                    {l.native}
                  </span>
                  {locale === l.code && <Icon name="check" size={15} />}
                </button>
              ))}
            </div>
            <p className="text-[12.5px] text-ink-3">{t('settings.languageHint')}</p>
          </Section>

          <Section title={t('settings.defaultPlayer')}>
            <div className="glass-ultrathin flex flex-col gap-4 rounded-o-lg px-5 py-4">
              <p className="text-[13px] leading-relaxed text-ink-2">{t('settings.defaultPlayerHint')}</p>
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => void window.cinema.app.openDefaultAppsSettings()}
              >
                <Icon name="external" size={15} />
                {t('settings.defaultPlayerAction')}
              </Button>
            </div>
          </Section>

          <Section title={t('settings.localOnly')}>
            <LocalOnly />
          </Section>

          <Section title={t('settings.driveCache')}>
            <DriveCache />
          </Section>

          <Section title={t('subs.title')}>
            <Subscriptions />
          </Section>

          <Section title={t('accounts.title')}>
            <AccountHub />
          </Section>

          <Section title={t('settings.about')}>
            <div className="flex items-center gap-3">
              <img src={developerMark} alt="" aria-hidden="true" className="h-10 w-auto opacity-70" />
              <span className="text-[12.5px] text-ink-3">{t('settings.developer')}</span>
            </div>
            <Updates />
            <p className="text-[12.5px] text-ink-3">
              {version ? t('settings.version', { v: version }) : ''}
            </p>
            {/*
              ייחוס חובה לפי תנאי השימוש של TMDB: אזכור JustWatch עבור
              נתוני הזמינות, והצהרה שהתוכנה אינה מאושרת על ידי TMDB.
              מקומו כאן קבוע — זה מסך ה"אודות" שהתנאים מדברים עליו.
            */}
            <div className="glass-ultrathin rounded-o-lg px-5 py-4">
              <img src={tmdbLogo} alt="TMDB" className="mb-3 h-auto w-32" />
              <p className="max-w-prose text-[12px] leading-relaxed text-ink-3">
                {t('legal.attribution')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setLegal('terms')}>{t('legal.terms')}</Button>
              <Button variant="outline" size="sm" onClick={() => setLegal('privacy')}>{t('legal.privacy')}</Button>
            </div>
          </Section>
        </div>
      </div>
      {legal && <LegalModal kind={legal} onClose={() => setLegal(null)} />}
    </div>
  )
}
