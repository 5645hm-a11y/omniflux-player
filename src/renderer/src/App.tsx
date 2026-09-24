import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useUpdates, useUpdateReady } from './store/updates'
import { usePlayer } from './store/player'
import { useLibrary } from './store/library'
import { useUi, type Route } from './store/ui'
import { Controls } from './components/Controls'
import { PowerPanel } from './components/PowerPanel'
import { Sidebar } from './components/Sidebar'
import { MiniPlayer } from './components/MiniPlayer'
import { Icon, IconButton, WindowControls } from './components/ui'
import { Home } from './screens/Home'
import { Library } from './screens/Library'
import { Drive } from './screens/Drive'
import { Watchlist } from './screens/Watchlist'
import { Search } from './screens/Search'
import { Settings } from './screens/Settings'
import { TitleDetails } from './screens/TitleDetails'
import { NowPlaying } from './screens/NowPlaying'
import { YouTubeDock } from './components/YouTubeDock'
import { listenToYouTube } from './store/youtube'
import { wireQueue } from './store/queue'
import { Music } from './screens/Music'
import { useAmbientFromVideo } from './hooks/useAmbient'
import { useVideoViewport } from './hooks/useVideoViewport'
import { useI18n, useT } from './i18n'

/**
 * המעטפת.
 *
 * החלון הזה שקוף לחלוטין ומתחתיו יושב חלון המנוע. עד עכשיו נגזר
 * מכך שהממשק הוא שכבה דקה שצפה מעל סרט, וכל מסך שנפתח כיסה את
 * הנגן — כלומר כל שיטוט עצר את הצפייה.
 *
 * עכשיו זה הפוך: התוכנה היא בית עם סרגל צד קבוע וסרגל נגן קבוע,
 * והווידאו הוא אורח בתוכה. שני מצבים בלבד:
 *
 *   שיטוט — קרקע אטומה מכסה את המסך, וחלון המנוע יוצא ממנו. הוא
 *           ממשיך לפענח ולהשמיע, וסרגל הנגן מציג את הפריים האחרון
 *           שצולם ממנו.
 *   צפייה — הקרקע נעלמת, חלון המנוע ממלא את החלון, והבקרות צפות.
 *
 * המעבר ביניהם אינו הסתרה והצגה של אלמנטים אלא הזזה אמיתית של
 * חלון, ולכן אין כאן פריים אחד שבו רואים גם וגם.
 */

const SCREENS: Record<Route, () => React.JSX.Element> = {
  home: Home,
  search: Search,
  watchlist: Watchlist,
  music: Music,
  library: Library,
  drive: Drive,
  settings: Settings
}

export default function App(): React.JSX.Element {
  const t = useT()
  const initI18n = useI18n((s) => s.init)
  const i18nReady = useI18n((s) => s.ready)
  const init = usePlayer((s) => s.init)
  const initLibrary = useLibrary((s) => s.init)

  const route = useUi((s) => s.route)
  const immersive = useUi((s) => s.immersive)
  const setImmersive = useUi((s) => s.setImmersive)
  const detailsId = useUi((s) => s.detailsId)
  const closeDetails = useUi((s) => s.closeDetails)
  const power = useUi((s) => s.power)
  const togglePower = useUi((s) => s.togglePower)
  const escape = useUi((s) => s.escape)

  const paused = usePlayer((s) => s.engine.paused)
  const togglePlayback = usePlayer((s) => s.togglePlayback)
  const seekRelative = usePlayer((s) => s.seekRelative)
  const error = usePlayer((s) => s.error)
  const dismissError = usePlayer((s) => s.dismissError)
  const path = usePlayer((s) => s.engine.path)
  const title = usePlayer((s) => s.engine.title)
  const streamCover = usePlayer((s) => s.engine.cover)
  const provider = usePlayer((s) => s.engine.provider)
  const tracks = usePlayer((s) => s.engine.tracks)
  const [idleUi, setIdleUi] = useState(false)
  const [cover, setCover] = useState<string | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [pictureInPicture, setPictureInPicture] = useState(false)

  const toggleFullscreen = (): void => {
    const next = !fullscreen
    if (next && pictureInPicture) setPictureInPicture(false)
    void window.cinema.window.setFullscreen(next).then(() => setFullscreen(next))
  }

  const togglePictureInPicture = (): void => {
    const next = !pictureInPicture
    if (next) {
      setImmersive(true)
      setFullscreen(false)
    }
    void window.cinema.window.setPictureInPicture(next).then(() => setPictureInPicture(next))
  }

  const initUpdates = useUpdates((state) => state.init)
  const updateReady = useUpdateReady()
  const dismissUpdate = useUpdates((state) => state.dismiss)

  useEffect(() => {
    void initI18n()
    void init()
    void initLibrary()
    initUpdates()
    listenToYouTube()
    wireQueue()
  }, [initI18n, init, initLibrary, initUpdates])

  /*
   * מתי זה מוזיקה ולא סרט.
   *
   * המבחן הוא מסלולי הקובץ ולא הסיומת: ‎.mkv יכול להכיל אודיו בלבד,
   * ו-‎.m4a יכול לשאת עטיפה כמסלול וידאו יחיד. עד שהמסלולים נקראים
   * הסיומת משמשת כניחוש ראשוני, כדי שהמסך לא יתחלף אחרי שנייה.
   */
  const audioOnly = useMemo(() => {
    if (!path) return false
    // ‏YouTube נחשב מוזיקה לפריסה: חלון mpv מוסתר, והנגן הגלוי שלו מוצג במקום העטיפה
    if (provider === 'Spotify' || provider === 'YouTube') return true
    if (tracks.length > 0) return !tracks.some((tr) => tr.type === 'video')
    return /\.(mp3|flac|m4a|opus|ogg|wav|aac|wma)$/i.test(path)
  }, [path, tracks, provider])

  const playing = Boolean(path)
  const name = title ?? path?.split(/[/\\]/).pop() ?? null

  /*
   * לאן חלון הווידאו הולך.
   *
   * בצפייה הוא ממלא את החלון. בכל מצב אחר הוא יוצא מהמסך — גם
   * בשיטוט תוך כדי נגינה. הוא ממשיך לפענח ולהשמיע, וסרגל הנגן מציג
   * את הפריים האחרון שהמנוע צילם.
   *
   * נשקלה הזזה אל תוך מרובע קטן בסרגל, וזה עבד למחצה: המלבן נמדד
   * נכון והחלון נחת בדיוק עליו — אבל מה שנראה שם היה זכוכית הסרגל
   * ולא הווידאו. אלמנט שקוף מראה את הרקע של ההורה שלו, וחור אמיתי
   * היה מחייב לנקב מסכה בקרקע, במדרג, בשכבת הרעש ובזכוכית — ארבע
   * שכבות שהיו מאבדות סנכרון בשינוי הפריסה הראשון. החלופה, חלון
   * וידאו שצף מעל, הייתה צפה גם מעל תוכנות אחרות.
   */
  useVideoViewport(playing && immersive ? 'full' : 'hidden')

  // בצפייה הבקרות נעלמות כשלא נוגעים בעכבר, וחוזרות בתזוזה
  useEffect(() => {
    if (!immersive) {
      setIdleUi(false)
      return
    }
    let timer: NodeJS.Timeout
    const wake = (): void => {
      setIdleUi(false)
      clearTimeout(timer)
      timer = setTimeout(() => setIdleUi(true), 3200)
    }
    wake()
    window.addEventListener('pointermove', wake)
    window.addEventListener('keydown', wake)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('pointermove', wake)
      window.removeEventListener('keydown', wake)
    }
  }, [immersive])

  // קיצורי מקלדת של נגן, לא של דפדפן
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
      if (k === 'Escape') {
        if (pictureInPicture) {
          void window.cinema.window.setPictureInPicture(false).then(() => setPictureInPicture(false))
          return
        }
        if (fullscreen) {
          void window.cinema.window.setFullscreen(false).then(() => setFullscreen(false))
          return
        }
        escape()
        return
      }
      if (k === 'k' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        useUi.getState().go('search')
        return
      }
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (k === ' ' || k === 'k') {
        e.preventDefault()
        togglePlayback()
      } else if (k === 'ArrowRight') {
        seekRelative(5)
      }
      else if (k === 'ArrowLeft') {
        seekRelative(-5)
      }
      else if (k === 'f' && playing) {
        setImmersive(true)
        toggleFullscreen()
      }
      else if (k === 'o' && (e.ctrlKey || e.metaKey)) void window.cinema.player.openFile()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [escape, setImmersive, playing, fullscreen, pictureInPicture, paused, seekRelative])

  /*
   * העטיפה מגיעה מהקטלוג לפי הנתיב שמתנגן.
   *
   * הכרזה כבר הורדה בזמן הסריקה, ולכן אין כאן בקשת רשת — רק חיפוש
   * בקטלוג שכבר בזיכרון.
   */
  useEffect(() => {
    if (!path) {
      setCover(null)
      return
    }
    let alive = true
    void window.cinema.library.catalog().then((c) => {
      if (!alive) return
      const hit = c.items.find((i) => i.uri === path || path.endsWith(i.fileName))
      setCover(hit?.meta?.poster ?? null)
    })
    return () => {
      alive = false
    }
  }, [path])

  /*
   * המדיה קובעת את המסך, ולא ההפך.
   *
   * וידאו נפתח בצפייה מלאה; מוזיקה נשארת בסרגל, כי אין לה תמונה
   * שצריכה את כל המסך — מי שרוצה את מסך "מתנגן כעת" לוחץ על העטיפה.
   *
   * שני הכיוונים, ולא רק הכניסה: שיר שנטען בזמן צפייה בסרט החזיר
   * קודם מסך שחור, כי איש לא יצא ממנה. וגם ‎.mkv שמכיל אודיו בלבד
   * מתוקן כאן — הסיומת ניחשה וידאו, והמסלולים גילו אחרת.
   *
   * המצב הנוכחי נקרא ולא נצפה: אילו היה בתלויות, כל קיפול ידני של
   * הסרט לסרגל היה נדחף מיד בחזרה לצפייה.
   */
  useEffect(() => {
    if (!path) return
    const want = !audioOnly
    if (useUi.getState().immersive !== want) setImmersive(want)
  }, [path, audioOnly, setImmersive])

  // התאורה נגזרת מהפריים, ורצה רק בצפייה בפועל
  const ambient = useAmbientFromVideo(playing && !paused && immersive)
  const hideControls = immersive && idleUi && playing

  // עד שהשפה נטענת אין מה לצייר: טקסט שמתחלף נראה כמו תקלה
  if (!i18nReady) return <div className="pointer-events-none h-full w-full" />

  const Screen = SCREENS[route]

  return (
    // pointer-events-none על השורש: מה שאינו רכיב הוא חלון אל הווידאו
    <div
      className="pointer-events-none relative h-full w-full overflow-hidden"
      style={
        {
          '--ambient-1': ambient.primary,
          '--ambient-2': ambient.secondary
        } as React.CSSProperties
      }
    >
      {/* ================= שיטוט ================= */}
      <AnimatePresence>
        {!immersive && (
          <motion.div
            key="shell"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0 z-10"
          >
            {/*
              הקרקע.
              היא זו שמכסה את חלון המנוע בזמן שיטוט, ולכן היא חייבת
              להיות אטומה לחלוטין — כל שקיפות כאן מציצה אל הווידאו.
            */}
            <div className="absolute inset-0 bg-canvas" />
            <div
              className="absolute inset-0 opacity-70"
              style={{
                background:
                  'radial-gradient(90% 55% at 12% -10%, color-mix(in srgb, var(--color-violet) 16%, transparent) 0%, transparent 58%),' +
                  'radial-gradient(70% 45% at 96% 108%, color-mix(in srgb, var(--color-violet) 10%, transparent) 0%, transparent 62%)'
              }}
            />
            <div className="grain-layer pointer-events-none absolute inset-0" />

            <div className="relative flex h-full w-full flex-col gap-3 p-3">
              <div className="flex min-h-0 flex-1 gap-3">
                <Sidebar />

                {/*
                  אזור התוכן.
                  `isolate` יוצר הקשר ערימה משלו, כדי ששכבה פנימית של
                  מסך אחד לא תוכל לצוף מעל מסך אחר.
                */}
                <main className="pointer-events-auto relative isolate min-w-0 flex-1 overflow-hidden rounded-o-xl">
                  <AnimatePresence initial={false}>
                    <motion.div
                      key={route}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                      className="absolute inset-0"
                    >
                      <Screen />
                    </motion.div>
                  </AnimatePresence>
                </main>
              </div>

              <AnimatePresence>
                {playing && (
                  <MiniPlayer
                    key="mini"
                    cover={streamCover ?? cover}
                    audioOnly={audioOnly}
                    onFullscreen={() => {
                      setImmersive(true)
                      if (!fullscreen) toggleFullscreen()
                    }}
                  />
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <YouTubeDock />

      {/* ================= צפייה ================= */}
      {immersive && (
        <div className="absolute inset-0 z-20">
          {/*
            מוזיקה מקבלת מסך משלה: חלון המנוע מוסתר בזמן אודיו, ואין
            מתחת שום דבר להשאיר גלוי.
          */}
          {audioOnly && (
            <div className="absolute inset-0">
              <NowPlaying cover={streamCover ?? cover} />
            </div>
          )}

          {/*
            הצללה מאחורי הסרגלים.
            זכוכית לבדה מספיקה מעל סצנה כהה ומתפרקת מעל סצנה בהירה.
            ההצללה מבטיחה ניגוד קריא מעל כל פריים, ולא רק מעל אלה
            שנוח לבדוק עליהם.
          */}
          {!audioOnly && (
            <>
              <div
                className={`pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-canvas/75 to-transparent transition-opacity duration-normal ${
                  hideControls ? 'opacity-0' : 'opacity-100'
                }`}
              />
              <div
                className={`pointer-events-none absolute inset-x-0 bottom-0 h-52 bg-gradient-to-t from-canvas/85 to-transparent transition-opacity duration-normal ${
                  hideControls ? 'opacity-0' : 'opacity-100'
                }`}
              />
              {/* תאורת אווירה: זוהר בשוליים בצבע הפריים */}
              <div
                className="pointer-events-none absolute inset-0 -z-10 transition-[background] duration-[1600ms] ease-linear"
                style={{
                  background:
                    'radial-gradient(120% 60% at 50% 108%, var(--ambient-1) 0%, transparent 62%),' +
                    'radial-gradient(90% 45% at 8% -8%, var(--ambient-2) 0%, transparent 60%)',
                  opacity: ambient.dark ? 0.5 : 0.32,
                  filter: 'blur(48px) saturate(1.4)'
                }}
              />
            </>
          )}

          {/*
            היציאה מהצפייה.
            כפתור אחד, תמיד באותו מקום, ולעולם לא מתחת לפקדי החלון —
            הם יושבים בפינה הנגדית.
          */}
          <div
            className={`absolute inset-x-3 top-3 flex items-center gap-3 transition duration-normal ease-out ${
              hideControls ? 'pointer-events-none -translate-y-2 opacity-0' : 'pointer-events-auto opacity-100'
            }`}
          >
            <IconButton
              icon="collapse"
              label={t('nav.back')}
              size={17}
              className="glass-thin h-10 w-10"
              onClick={() => {
                if (pictureInPicture) void window.cinema.window.setPictureInPicture(false).then(() => setPictureInPicture(false))
                if (fullscreen) void window.cinema.window.setFullscreen(false).then(() => setFullscreen(false))
                setImmersive(false)
              }}
            />
            {/*
              מה מתנגן.
              בצפייה אין סרגל צד ואין סרגל נגן, ובלי השורה הזאת המסך
              אינו אומר במה צופים — וזה בדיוק מה שנשבר כשהמעטפת
              התהפכה, ומה שבדיקת "הממשק באמת מצויר" תפסה.
            */}
            {name && (
              <span
                dir="auto"
                className="glass-thin drag max-w-[46%] truncate rounded-o-lg px-4 py-2 text-[13px] text-ink/85"
              >
                {name}
              </span>
            )}
          </div>

          <div
            className={`absolute inset-x-3 bottom-3 transition duration-normal ease-out ${
              hideControls ? 'pointer-events-none translate-y-3 opacity-0' : 'pointer-events-auto opacity-100'
            }`}
          >
            {pictureInPicture ? (
              <div className="glass-thin mx-auto flex w-fit items-center gap-1 rounded-full px-2 py-1.5">
                <IconButton icon="back" label={t('player.back10')} size={16} onClick={() => seekRelative(-10)} />
                <IconButton icon={paused ? 'play' : 'pause'} label={paused ? t('player.play') : t('player.pause')} size={18} onClick={togglePlayback} />
                <IconButton icon="forward" label={t('player.forward10')} size={16} onClick={() => seekRelative(10)} />
                <IconButton icon="pip" label={t('player.pictureInPicture')} size={16} active onClick={togglePictureInPicture} />
              </div>
            ) : (
              <Controls
                onPower={togglePower}
                powerOpen={power}
                onFullscreen={toggleFullscreen}
                onPictureInPicture={togglePictureInPicture}
              />
            )}
          </div>

          {power && provider !== 'Spotify' && !pictureInPicture && (
            <div
              className={`absolute bottom-32 start-3 transition duration-normal ease-out ${
                hideControls ? 'pointer-events-none translate-y-3 opacity-0' : 'pointer-events-auto opacity-100'
              }`}
            >
              <PowerPanel onClose={togglePower} />
            </div>
          )}
        </div>
      )}

      {/* ================= שכבות שמעל הכול ================= */}
      <AnimatePresence>
        {detailsId && (
          <motion.div
            key="details"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 z-30"
          >
            <TitleDetails id={detailsId} onClose={closeDetails} />
          </motion.div>
        )}
      </AnimatePresence>

      {/*
        פקדי החלון יושבים מעל כל השכבות ותמיד באותו מקום.
        הם אינם חלק משום מסך, ולכן אף מסך אינו יכול לכסות אותם או
        להציב כפתור ניווט מתחתיהם.

        ימין פיזי, ולא "קצה לוגי".
        אלה פקדים של מערכת ההפעלה ולא תוכן, ובחלון של Windows הם
        תמיד בפינה הימנית העליונה. ממשק בעברית שהיה מזיז אותם שמאלה
        היה החלון היחיד על המסך שסוגרים אותו מהצד השני.
      */}
      {!pictureInPicture && <div className="pointer-events-auto absolute top-0 right-0 z-50" dir="ltr">
        <WindowControls className="glass-thin rounded-bl-o-lg" />
      </div>}

      {/*
        עדכון שירד וממתין.
        הוא מופיע פעם אחת לגרסה, מעל סרגל הנגן, ומציע את הפעולה עצמה
        ולא רק ידיעה. מי שסוגר אותו לא יראה אותה שוב עד הגרסה הבאה,
        והנקודה בסרגל נשארת כתזכורת שקטה.
      */}
      <AnimatePresence>
        {updateReady && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="glass-thin pointer-events-auto absolute bottom-28 left-1/2 z-60 w-[min(92vw,30rem)] -translate-x-1/2 rounded-o-lg px-5 py-4"
          >
            <div className="flex items-center gap-3.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-violet/16 text-violet-bright">
                <Icon name="refresh" size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold">{t('settings.updateReadyTitle', { v: updateReady })}</p>
                <p className="mt-0.5 text-[12px] text-ink-3">{t('settings.updateReadyBody')}</p>
              </div>
              <button
                className="no-drag shrink-0 rounded-o-md bg-arctic px-3.5 py-2 text-[12.5px] font-semibold text-canvas transition-transform duration-fast hover:scale-[1.03] active:scale-95"
                onClick={() => void window.cinema.updates.install()}
              >
                {t('settings.updateRestart')}
              </button>
              <button
                className="no-drag shrink-0 text-ink-3 transition-colors hover:text-ink"
                onClick={dismissUpdate}
                aria-label={t('errors.dismiss')}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <div className="glass-thin pointer-events-auto absolute bottom-28 left-1/2 z-60 max-w-lg -translate-x-1/2 rounded-o-lg px-5 py-3.5 rise-in">
          <div className="flex items-start gap-3">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-crimson" />
            <p className="flex-1 text-[13.5px] leading-relaxed">{error}</p>
            <button
              className="no-drag mt-0.5 text-ink-3 transition-colors hover:text-ink"
              onClick={dismissError}
              aria-label={t('errors.dismiss')}
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
