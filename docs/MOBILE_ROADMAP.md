# OmniFlux למובייל — ניתוח ותוכנית

עודכן: 2026-09-23

## השורה התחתונה

**React Native (Expo, Development Build)**, עם שימוש חוזר בכל הלוגיקה
הטהורה של הפרויקט, וממשק חדש שנבנה למגע. לא Capacitor ולא PWA — וזה לא
עניין של טעם, אלא של שלושה דברים שהמחשב עושה ושבדפדפן בטלפון אי אפשר:

1. **מנוע הניגון הוא mpv, תהליך נפרד.** אין תהליכים במובייל. צריך נגן
   מערכת: ExoPlayer/Media3 באנדרואיד, AVPlayer ב-iOS.
2. **ניגון ברקע ובקרות מסך נעילה.** ב-iOS, שמע מתוך WebView נעצר כשהמסך
   ננעל או כשהאפליקציה יורדת לרקע. זה חייב סשן שמע מקורי.
3. **Spotify.** ה-Web Playback SDK אינו נתמך בדפדפני מובייל. במובייל
   Spotify עובד רק דרך ה-SDK המקורי שלהם (App Remote), שמנגן *באפליקציית
   Spotify* ושולט בה מרחוק.

Capacitor היה שומר את הממשק כמו שהוא — אבל כל אחד משלושת אלה היה דורש
תוסף מקורי בכל זאת, ומעל WebView שאינו מתאים לתור ארוך ברקע. React Native
נותן את שלושתם כספריות קיימות, ואת TypeScript שהקוד כבר כתוב בו.

## מה עובר כמו שהוא

הקוד נכתב מראש עם הזרקת תלויות (`src/legacy_services/ports.ts`: `Http`,
`Kv`) — בדיוק כדי שיעבור למובייל. נבדק:

| מודול | מצב |
|---|---|
| `src/shared/music-search.ts` — חיפוש אחוד | טהור, עובר כמו שהוא |
| `src/shared/track.ts`, `src/shared/i18n/*` (8 שפות) | טהורים |
| `src/adapters/provider-youtube`, `provider-deezer`, `provider-tmdb`, `provider-lyrics`, `provider-subdl` | מקבלים `http` מוזרק — עוברים |
| `src/core/library`, `src/core/search`, `src/core/hub` | טהורים |
| `src/legacy_services/*` (שמות עבריים, ניקוי שמות, כרזות) | מוזרקים — עוברים |
| `src/renderer/src/lib/listening.ts`, `playlists.ts` | תלויים ב-`localStorage` — להחליף ב-`Kv` (MMKV) |
| `store/queue.ts`, `store/player.ts` (zustand) | הלוגיקה עוברת; הקריאות ל-`window.cinema` מוחלפות בשכבת נגן |

## מה נכתב מחדש

| רכיב | במחשב | במובייל |
|---|---|---|
| נגן שמע ווידאו | mpv | `react-native-track-player` (שמע, תור, רקע, מסך נעילה) + `react-native-video` (סרטים) |
| הזרמה מהדרייב | מנוע בלוקים ב-Node ושרת loopback | Range עם כותרת Authorization ישירות לנגן — ExoPlayer ו-AVPlayer תומכים; מטמון: `ExoPlayer SimpleCache` / `AVAssetDownloadURLSession` |
| Spotify | Web Playback SDK במשטח נסתר | Spotify iOS/Android SDK (App Remote) — מנגן באפליקציית Spotify |
| YouTube | iframe גלוי | `react-native-youtube-iframe` — גלוי, אותה מדיניות. אין שמע ברקע מ-YouTube (מדיניות, לא מגבלה טכנית) |
| Deezer | JS SDK | קטעים דרך הנגן הרגיל; מלא — דורש את ה-SDK המקורי של Deezer |
| סריקת קבצים | `fs` | אנדרואיד: MediaStore; iOS: ספריית המוזיקה (MPMediaLibrary — רק קבצים לא מוגנים) ותיקיית Files של האפליקציה |
| תגיות | `music-metadata` | MediaStore מחזיר תגיות; ב-iOS — AVAsset metadata |
| ממשק | React + Tailwind | React Native + NativeWind (אותם שמות מחלקות, אותם אסימונים) |

## מאפייני מובייל — ההחלטות

**ניגון ברקע ומסך נעילה.** `react-native-track-player` מריץ שירות מדיה
(Android: `MediaSessionService`, foreground service עם התראה; iOS: `AVAudioSession`
בקטגוריית playback + `UIBackgroundModes: audio`). התור האחוד (`queue.ts`)
ממופה לתור של הנגן, ובקרות המסך הנעול — הבא/הקודם/השהיה/דילוג — מגיעות
כאירועים. אותו כלל כמו במחשב: "מתנגן" נמדד מהנגן, לא מהממשק.

**הרשאות.** אנדרואיד 13+: `READ_MEDIA_AUDIO` ו-`READ_MEDIA_VIDEO` (לא
`READ_EXTERNAL_STORAGE`); `POST_NOTIFICATIONS` להתראת הניגון. iOS:
`NSAppleMusicUsageDescription` לספריית המוזיקה. בקשה ברגע שצריך — לא בפתיחה.

**סוללה.**
- הורדה מראש רק ב-Wi-Fi ובטעינה (`NetInfo` + מצב סוללה); הרקע אינו מוריד.
- מטמון של הדרייב עם תקרה (כמו במחשב — 4GB) וניקוי LRU.
- אין "תאורת אווירה" מפריימים בזמן ניגון ברקע (צילום מסך כל 1.6 שניות).
- YouTube אינו מתנגן ברקע בכלל (מדיניות) — אין בזבוז.
- ההמלצות מחושבות בפתיחה, לא ברקע.

**רשת סלולרית.** איכות וידאו אוטומטית לפי סוג החיבור; אזהרה לפני סרט של
ג'יגה ב-4G.

## מפת דרכים

| שלב | מה | יוצא ממנו |
|---|---|---|
| **0 — הכנה** (שבוע) | Monorepo: `packages/core` (shared, core, adapters, legacy_services) נצרך גם מהמחשב וגם מהמובייל. בדיקות היחידה הקיימות רצות על החבילה | המחשב ממשיך לעבוד בלי שינוי, והלוגיקה חיה במקום אחד |
| **1 — שמע מקומי** (2–3 שבועות) | Expo Dev Build, `track-player`, סריקת MediaStore, התור האחוד, מסך מוזיקה ב-RN, ניגון ברקע ומסך נעילה | אפליקציה שמנגנת את המוזיקה שבטלפון, ברקע |
| **2 — דרייב** (2 שבועות) | התחברות Google (PKCE כמו במחשב), הזרמה ב-Range עם אסימון, מטמון, סרטים ב-`react-native-video` | הספרייה מהדרייב, שמע ווידאו |
| **3 — שירותים** (2–3 שבועות) | YouTube (iframe גלוי, אותו ספק), Deezer (קטעים), חיפוש אחוד | אותו חיפוש כמו במחשב |
| **4 — Spotify** (2 שבועות + אישור) | App Remote SDK; דורש אפליקציית Spotify מותקנת ואישור של Spotify | שיר מ-Spotify מתוך האפליקציה |
| **5 — שחרור** | TestFlight ו-Play Internal Testing, בדיקות על מכשירים אמיתיים (לא אמולטור — השמע ברקע שונה), מדיניות פרטיות, טפסי הרשאות בחנויות | גרסת בטא |

סיכונים שכדאי לדעת מראש:
- **App Store**: אפליקציה שמנגנת מ-YouTube ומ-Drive של צד שלישי תיבחן
  בקפידה על זכויות. ההסבר צריך להיות מוכן: המשתמש מנגן את הקבצים שלו,
  ו-YouTube מתנגן בנגן הרשמי בלבד.
- **Spotify** דורש אישור מסחרי לשילוב — אותה דרישה כמו במחשב.
- **iOS וקבצים מקומיים**: אין גישה חופשית למערכת הקבצים. מוזיקה נכנסת
  דרך "שיתוף אל" או תיקיית האפליקציה ב-Files.
