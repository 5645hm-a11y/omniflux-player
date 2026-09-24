import { motion } from 'motion/react'
import { useUi, type Route } from '../store/ui'
import { useT } from '../i18n'
import { Icon, Wordmark, type IconName } from './ui'
import { Mark } from './Mark'
import type { Key } from '@shared/i18n'
import developerMark from '../assets/developer-mark.png'
import { useUpdatePending } from '../store/updates'

/**
 * סרגל הצד.
 *
 * הוא הדבר היחיד שלא זז. כל שאר המסך מתחלף, והוא נשאר — וזה מה
 * שהופך אוסף של מסכים לתוכנה אחת: המשתמש תמיד יודע איפה הוא, ותמיד
 * במרחק לחיצה אחת מכל מקום אחר.
 *
 * שישה יעדים ולא יותר. סרגל שמתחיל לצבור פריטים נהיה תפריט, ותפריט
 * צריך קריאה — סרגל טוב נקרא בזווית העין.
 *
 * הסימון הפעיל אינו רקע שמופיע ונעלם אלא גלולה אחת שנעה בין
 * הפריטים (`layoutId`), כי תנועה מספרת מאיפה לאן — והבהוב לא.
 */

interface Dest {
  route: Route
  icon: IconName
  label: Key
}

const DESTS: readonly Dest[] = [
  { route: 'home', icon: 'home', label: 'hub.home' },
  { route: 'search', icon: 'search', label: 'nav.search' },
  { route: 'watchlist', icon: 'bookmark', label: 'hub.watchlist' },
  { route: 'music', icon: 'music', label: 'nav.music' },
  { route: 'library', icon: 'library', label: 'nav.library' },
  { route: 'drive', icon: 'cloud', label: 'library.drive' },
  { route: 'settings', icon: 'settings', label: 'nav.settings' }
]

function NavButton({ dest }: { dest: Dest }): React.JSX.Element {
  const t = useT()
  const updatePending = useUpdatePending()
  const badge = dest.route === 'settings' && updatePending
  const active = useUi((s) => s.route === dest.route)
  const go = useUi((s) => s.go)
  const label = t(dest.label)

  return (
    <button
      onClick={() => go(dest.route)}
      title={label}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={`no-drag group relative flex h-11 w-full items-center gap-3.5 rounded-o-lg px-3.5 transition-colors duration-fast ${
        active ? 'text-ink' : 'text-ink-2 hover:text-ink'
      }`}
    >
      {active && (
        <motion.span
          layoutId="nav-pill"
          transition={{ type: 'spring', stiffness: 520, damping: 40, mass: 0.8 }}
          className="absolute inset-0 -z-10 rounded-o-lg bg-ink/10 shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]"
        />
      )}
      {/*
        קו המיקוד בקצה. הוא נשען על הכיוון הלוגי (`start`) ולכן עובר
        מאליו לצד הימני בממשק ימין-שמאל.
      */}
      <span
        className={`absolute inset-y-2.5 start-0 w-[3px] rounded-full bg-violet-bright transition duration-normal ease-out ${
          active ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <Icon
        name={dest.icon}
        size={19}
        strokeWidth={active ? 2 : 1.6}
        className="shrink-0 transition-transform duration-fast group-hover:scale-110"
      />
      <span className="truncate text-[13.5px] font-medium">{label}</span>
      {/*
        סימון שקט: יש גרסה חדשה.
        בלעדיו אפשר היה לדעת על עדכון רק בכניסה להגדרות, כלומר רק במקרה.
      */}
      {badge && <span className="ms-auto h-2 w-2 shrink-0 rounded-full bg-violet-bright" aria-hidden />}
    </button>
  )
}

export function Sidebar(): React.JSX.Element {
  return (
    /*
     * `drag` על הסרגל עצמו ו-`no-drag` על הכפתורים: כל השטח הריק
     * שלו הוא ידית לגרירת החלון, וזה שטח גדול — מה שפותר את הבעיה
     * שחלון בלי מסגרת קשה לתפוס.
     */
    <nav className="drag glass-thin pointer-events-auto relative flex h-full w-[240px] shrink-0 flex-col gap-1.5 overflow-hidden rounded-o-xl px-4 py-5 rtl:pt-12">
      <div className="mb-6 flex items-center gap-2.5 px-1.5">
        {/* הסימן תמיד לצד השם — כך הוא נלמד, וכך הוא מזוהה לבדו בשורת המשימות */}
        <Mark size={34} />
        <Wordmark size={19} />
      </div>

      {DESTS.map((d) => (
        <NavButton key={d.route} dest={d} />
      ))}

      <div className="flex-1" />

      {/*
        סימן המפתח.
        מונוגרמה בלבד, בלי שם מלא: זו חתימה ולא כותרת, והיא אמורה
        להיקרא בזווית העין ולא להתחרות בניווט. לכן היא קטנה, מרוסנת
        בשקיפות, ומתבהרת רק במעבר עכבר.
      */}
      <div className="no-drag flex justify-center border-t border-ink/8 pt-4 pb-1">
        <img
          src={developerMark}
          alt=""
          aria-hidden="true"
          className="h-7 w-auto opacity-45 transition-opacity duration-normal hover:opacity-80"
        />
      </div>

      {/*
        הרעש בתחתית הסרגל. שכבה דקה שנותנת לזכוכית מרקם של חומר
        במקום מדרג נקי, ואינה תופסת לחיצות.
      */}
      <div className="grain-layer pointer-events-none absolute inset-0 rounded-o-xl" />
    </nav>
  )
}
