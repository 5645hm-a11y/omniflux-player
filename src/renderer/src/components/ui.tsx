import { useState } from 'react'
import {
  Play,
  Pause,
  Rewind,
  FastForward,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Search,
  LayoutGrid,
  Settings2,
  SlidersHorizontal,
  X,
  Minus,
  Square,
  Folder,
  Cloud,
  Check,
  ChevronRight,
  Plus,
  Star,
  RefreshCw,
  Camera,
  ExternalLink,
  Info,
  Captions,
  AudioLines,
  Disc3,
  Monitor,
  Home as HomeIcon,
  Globe,
  Bookmark,
  Maximize2,
  Minimize2,
  PictureInPicture2,
  ChevronLeft,
  Shuffle,
  Repeat2,
  ListMusic,
  Heart,
  Trash2,
  ListPlus,
  Sparkles,
  type LucideIcon
} from 'lucide-react'

/**
 * אבני הבניין של הממשק.
 *
 * האייקונים מגיעים מ-Lucide ולא מנתיבים שצוירו ביד. ההבדל אינו
 * נוחות: לסט אחיד יש רשת אחת, עובי קו אחד וסיומי קו אחידים, ואילו
 * נתיבים שנכתבים אחד-אחד נבדלים זה מזה בחצי פיקסל — וזה בדיוק מה
 * שגורם לשורת כפתורים להיראות חובבנית.
 *
 * עובי הקו דק מברירת המחדל (1.6 במקום 2), כי הממשק כהה: קו עבה על
 * רקע כהה נראה כבד, והאייקון אמור ללוות את הטקסט ולא להתחרות בו.
 */

const ICONS = {
  play: Play,
  pause: Pause,
  back: Rewind,
  forward: FastForward,
  prev: SkipBack,
  next: SkipForward,
  sound: Volume2,
  mute: VolumeX,
  search: Search,
  library: LayoutGrid,
  home: HomeIcon,
  settings: Settings2,
  sliders: SlidersHorizontal,
  close: X,
  minimize: Minus,
  maximize: Square,
  folder: Folder,
  cloud: Cloud,
  check: Check,
  chevron: ChevronRight,
  plus: Plus,
  star: Star,
  refresh: RefreshCw,
  camera: Camera,
  external: ExternalLink,
  info: Info,
  captions: Captions,
  audio: AudioLines,
  music: Disc3,
  screen: Monitor,
  globe: Globe,
  bookmark: Bookmark,
  expand: Maximize2,
  collapse: Minimize2,
  pip: PictureInPicture2,
  chevronBack: ChevronLeft,
  shuffle: Shuffle,
  repeat: Repeat2,
  queue: ListMusic,
  heart: Heart,
  trash: Trash2,
  listPlus: ListPlus,
  sparkles: Sparkles
} satisfies Record<string, LucideIcon>

export type IconName = keyof typeof ICONS

export function Icon({
  name,
  size = 20,
  className = '',
  strokeWidth = 1.6,
  fill = false
}: {
  name: IconName
  size?: number
  className?: string
  strokeWidth?: number
  /** סמלי נגינה מלאים — משולש חלול נראה כמו כפתור כבוי */
  fill?: boolean
}): React.JSX.Element {
  const Glyph = ICONS[name]
  return (
    <Glyph
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden="true"
      fill={fill ? 'currentColor' : 'none'}
    />
  )
}

type Variant = 'primary' | 'glass' | 'ghost' | 'outline'

const VARIANTS: Record<Variant, string> = {
  /*
   * פעולה ראשית אחת למסך.
   *
   * מילוי לבן, וזו הבחירה המרכזית של השפה: לבן הוא הצבע היחיד שאינו
   * מתנגש עם אף כרזה, ולכן הוא זה שנושא את הפעולה החשובה. הזהב
   * הקודם נפל בדיוק על טווח הגוונים של חלק גדול מהכרזות.
   */
  primary:
    'bg-arctic text-canvas font-semibold shadow-e2 hover:bg-white hover:-translate-y-px active:translate-y-0',
  /* פעולה משנית על גבי תמונה — זכוכית ולא מסגרת, כדי שהתמונה תישאר נראית */
  glass: 'glass-ultrathin text-ink font-semibold hover:bg-ink/16 hover:-translate-y-px',
  ghost: 'text-ink/80 hover:bg-ink/10 hover:text-ink',
  outline: 'border border-ink/15 text-ink/90 hover:border-ink/30 hover:bg-ink/6'
}

export function Button({
  variant = 'ghost',
  size = 'md',
  className = '',
  children,
  ...rest
}: {
  variant?: Variant
  size?: 'sm' | 'md' | 'lg'
} & React.ButtonHTMLAttributes<HTMLButtonElement>): React.JSX.Element {
  const sizes = {
    sm: 'h-9 px-3.5 text-[12.5px] rounded-o-md gap-1.5',
    md: 'h-10 px-5 text-[13.5px] rounded-o-md gap-2',
    lg: 'h-12 px-7 text-[15px] rounded-o-lg gap-2.5'
  }
  return (
    <button
      className={`no-drag inline-flex items-center justify-center font-medium transition duration-fast ease-out disabled:pointer-events-none disabled:opacity-40 ${sizes[size]} ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

export function IconButton({
  icon,
  label,
  size = 19,
  active = false,
  className = '',
  ...rest
}: {
  icon: IconName
  label: string
  size?: number
  active?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>): React.JSX.Element {
  return (
    <button
      aria-label={label}
      title={label}
      className={`no-drag grid h-10 w-10 shrink-0 place-items-center rounded-o-md transition duration-fast ease-out disabled:pointer-events-none disabled:opacity-35 ${
        active ? 'bg-violet/18 text-violet-bright' : 'text-ink/70 hover:bg-ink/10 hover:text-ink'
      } ${className}`}
      {...rest}
    >
      <Icon name={icon} size={size} />
    </button>
  )
}

/** תג קטן — ספירה, זמינות, סוג מקור. */
export function Pill({
  children,
  tone = 'neutral',
  className = ''
}: {
  children: React.ReactNode
  tone?: 'neutral' | 'violet' | 'mint'
  className?: string
}): React.JSX.Element {
  const tones = {
    neutral: 'border-ink/15 text-ink-2',
    violet: 'border-violet/50 text-violet-bright',
    mint: 'border-mint/45 text-mint'
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

/**
 * תג איכות.
 *
 * נקרא מיד ובלי לחשוב, ולכן הוא אותיות רישיות קטנות עם ריווח —
 * הצורה שבה תעשיית הווידאו מסמנת את זה מאז DVD.
 */
export function QualityTag({ value }: { value: string }): React.JSX.Element {
  return (
    <span className="rounded-o-xs border border-ink/25 px-1.5 py-px text-[9.5px] font-bold tracking-[0.09em] text-ink/85 uppercase">
      {value}
    </span>
  )
}

/**
 * תג פלטפורמה.
 *
 * הלוגו הרשמי כשיש, ושם כשאין. אלה סימנים מסחריים שמוגשים מ-TMDB,
 * ולכן הם מוצגים כמו שהם — בלי צביעה, בלי עיוות ובלי חיתוך.
 */
export function BrandTag({
  brand,
  className = ''
}: {
  brand: { name: string; logo: string | null } | null
  className?: string
}): React.JSX.Element | null {
  if (!brand) return null
  if (brand.logo) {
    return (
      <span
        className={`grid h-[22px] w-[22px] place-items-center overflow-hidden rounded-o-sm bg-canvas/55 backdrop-blur-md ${className}`}
        title={brand.name}
      >
        <img src={brand.logo} alt={brand.name} className="h-full w-full object-cover" />
      </span>
    )
  }
  return (
    <span
      className={`rounded-o-sm bg-canvas/70 px-1.5 py-0.5 text-[10px] font-semibold backdrop-blur-md ${className}`}
    >
      {brand.name}
    </span>
  )
}

/**
 * פקדי החלון.
 *
 * קבוצה אחת ויחידה, שמורכבת תמיד ויושבת מעל הכול. קודם הם ישבו
 * בתוך שורת הכותרת, וזו הוסתרה במסך הבית ב-opacity אפס — אבל
 * `pointer-events-auto` שעליה ביטל את ה-`none` של ההורה, והכפתורים
 * הבלתי נראים המשיכו לתפוס לחיצות. שלושת אייקוני הניווט של מסך
 * הבית ישבו בדיוק מתחתיהם, ולכן "הגדרות" סגר את התוכנה.
 *
 * ההפרדה כאן אינה סגנון אלא הכלל: פקדי חלון לחוד, ניווט לחוד,
 * ואף פעם לא באותו מקום על המסך.
 */
export function WindowControls({ className = '' }: { className?: string }): React.JSX.Element {
  const [max, setMax] = useState(false)
  const cell =
    'no-drag grid h-8 w-11 place-items-center text-ink/60 transition-colors duration-fast hover:bg-ink/12 hover:text-ink'

  return (
    <div className={`no-drag flex items-center ${className}`}>
      <button className={cell} onClick={() => void window.cinema.window.minimize()} aria-label="Minimize" title="Minimize">
        <Icon name="minimize" size={13} />
      </button>
      <button
        className={cell}
        onClick={() => void window.cinema.window.maximize().then(setMax)}
        aria-label={max ? 'Restore' : 'Maximize'}
        title={max ? 'Restore' : 'Maximize'}
      >
        <Icon name="maximize" size={11} />
      </button>
      <button
        className={`${cell} hover:bg-crimson hover:text-white`}
        onClick={() => void window.cinema.window.close()}
        aria-label="Close"
        title="Close"
      >
        <Icon name="close" size={13} />
      </button>
    </div>
  )
}

/** לוגו הטקסט. מופיע בכמה מקומות וחייב להיראות זהה בכולם. */
export function Wordmark({ size = 19 }: { size?: number }): React.JSX.Element {
  return (
    <span
      className="font-display font-extrabold select-none"
      style={{ fontSize: size, letterSpacing: '-0.035em' }}
      // השם נשאר לטיני וזהה בכל שפה, גם בממשק ימין-שמאל
      dir="ltr"
    >
      Omni<span className="text-violet-bright">Flux</span>
    </span>
  )
}
