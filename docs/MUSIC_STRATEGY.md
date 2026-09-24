# מתחם המוזיקה — ארכיטקטורה, עיצוב והצעת ערך

עודכן: 2026-09-23 · גרסה 2.0.6

המסמך מתעד את ההחלטות מאחורי מתחם המוזיקה, ובעיקר את **הסיבות**:
רוב מה שנראה כאן כמו בחירה עיצובית הוא בפועל מגבלה של ספק, מכסה או
מדיניות, וכדאי לדעת אותה לפני שמשנים.

## 1. מקורות, ומה כל אחד יודע לעשות

| מקור | חיפוש | ניגון | הערות |
|---|---|---|---|
| קבצים מקומיים | סינון מקומי | mpv, שיר מלא, בלי אובדן איכות | תגיות ID3 ועטיפות נקראות בסריקה, רק לקבצים שהשתנו |
| Google Drive | — | mpv דרך מנוע הבלוקים | תגיות אינן נקראות: זה עולה במכסת Drive המשותפת |
| Spotify | קטלוג | Web Playback SDK, מנוי Premium | דורש חתימת VMP לייצור — `tools/vmp-sign.cjs` |
| Deezer | קטלוג | Premium מלא, או 30 שניות | תצוגה מקדימה מסומנת תמיד ככזו |
| YouTube | Data API v3 | נגן מוטמע רשמי, **גלוי** | ר' סעיף 2 |

## 1א. חיפוש רב-ערוצי

חיפוש אחד מול כל המקורות, במקביל, ואיחוד לתוצאה אחת לכל שיר
(`src/shared/music-search.ts` — טהור; `src/renderer/src/lib/unified-search.ts` — הערוצים).

| ערוץ | מתי | עלות |
|---|---|---|
| המחשב והדרייב | מיד, בכל הקשה | אפס — סינון של הקטלוג |
| Spotify + Deezer | אחרי 280ms בלי הקשה | קריאה אחת לכל שירות |
| YouTube מהמטמון | בכל הקשה | אפס — חיפושים קודמים (גם תחילית) |
| YouTube חי | רק ב-Enter | 100 יחידות ממכסה משותפת |

מפתח האיחוד: אמן ראשי ושם בסיסי, מנורמלים ("Yellow - Remastered 2021",
"Umbrella (feat. JAY-Z)" → אותו שיר). קובץ בלי אמן מצטרף לתוצאה עם אותו
שם. העטיפה: הקטלוג (1000px) לפני קובץ ולפני תמונת סרטון.

```ts
interface SourceHit {           // שורה ממקור אחד
  kind: 'local' | 'drive' | 'spotify' | 'deezer' | 'youtube'
  ref: string                   // מזהה בקטלוג / spotify:track:… / מזהה Deezer / videoId
  title: string; artist: string; album?: string | null
  cover?: string | null; durationSec?: number | null
  quality: 'full' | 'preview'   // קטע של 30 שניות — תמיד אחרון
  previewUrl?: string | null
  payload?: unknown             // מה שהמקור צריך כדי לנגן
}

interface MusicHit {            // שיר אחד, מכל המקורות
  key: string                   // "coldplay|yellow"
  title: string; artist: string; album: string | null
  cover: string | null; durationSec: number | null
  sources: SourceHit[]          // לפי העדפה: מקומי, דרייב, Spotify, Deezer, YouTube, קטע
  relevance: number             // 0–1
}
```

בממשק: "התוצאה המובילה" בגדול, ומתחת לכל שיר בורר מקורות — "המחשב",
"הדרייב", "Spotify", "YouTube", "Deezer · 30s". המקור המסומן הוא מה
שלחיצה על השיר מנגנת; לחיצה על אחר מנגנת ממנו. תוצאה ממקור שנכנס לתור
(מקומי, דרייב, YouTube, קטע) מתחילה תור — והתוצאות שאחריה ממשיכות.

## 1ב. מבנה המסך (Layout & State)

```
Music (screens/Music.tsx)          — הרכבה בלבד
├─ header (sticky)                 — כותרת, חיפוש אחד, תור, חשבונות
├─ searching ? SearchResults       — music/SearchResults.tsx
└─ else
   ├─ Hero                         — music/Hero.tsx: פופולרי (YouTube) + חדש (Deezer), מתחלף, נעצר בריחוף
   ├─ Carousel "להמשיך להאזין"     — lib/listening.ts
   ├─ Carousel "בשבילך"            — rankForYou(אוסף + פופולרי + ישנים)
   ├─ PlaylistsCarousel            — music/Playlists.tsx + lib/playlists.ts
   ├─ MoodsAndGenres               — שתי קרוסלות של כרטיסי תמונה
   ├─ Carousel "האוסף שלך"         — ו"הצג הכול" לרשימה המלאה
   ├─ Carousel "יצאו לאחרונה"      — לחיצה = חיפוש אחוד לאלבום
   ├─ TrendingShelf, TopArtists, PlaylistImport
   └─ Spotify (כשמחובר)            — music/Spotify.tsx

מצב: store/queue.ts (תור אחוד) · store/youtube.ts (נגן מוטמע) ·
store/player.ts (מה מתנגן, מכל מקור) · store/ui.ts (useEscapeLayer)
```

## 2. YouTube — מה מותר, ומה עולה

**אין API רשמי ל-YouTube Music.** מה שיש הוא YouTube Data API v3, מסונן
לקטגוריה 10 (Music).

**מכסה:** 10,000 יחידות ביום לפרויקט, משותפות לכל המשתמשים (המפתח צרוב
בתוכנה). חיפוש = 100 יחידות, כל השאר = 1. לכן:

- חיפוש רק בלחיצה מפורשת (Enter או הכפתור), לעולם לא בכל הקשה.
- כל תשובה נשמרת על הדיסק: חיפוש — שבוע, "פופולרי" — שש שעות, פלייליסט — שעה.
- תקרה אישית: 15 חיפושים ביום למשתמש (`DAILY_SEARCHES`).
- ‏`quotaExceeded` מהשרת עוצר הכול עד חצות שעון פסיפיק, ומשאיר רשימות שמורות.
- **להגדלת המכסה:** טופס "YouTube API Services — Audit and Quota Extension"
  במסוף Google Cloud. זו הדרך היחידה להרחיב חיפוש למוצר לכולם.

**מדיניות הנגן:**

- הנגן חייב להיות גלוי, לפחות 200×200. אין משטח נסתר כמו ב-Spotify.
  הכרטיס הצף הוא 400×225; במסך "מתנגן עכשיו" הוא תופס את מקום העטיפה.
- אסור לחלץ שמע בלבד (yt-dlp וכדומה) — זו גם הפרה שמסכנת את הפרויקט
  ב-Google Cloud, שממנו עובד גם Drive.
- אסור לחסום פרסומות. "בלי פרסומות" אינה הבטחה שאפשר לתת על YouTube.
- embed מ-`file://` מציג "שגיאה 153" בלי Referer — `youtube-embed.ts`
  מזהה את הבקשות לפי אתר המוצר.

**מה אין:** המלצות אישיות "מ-YouTube Music" והפלייליסטים הפרטיים של
המשתמש דורשים OAuth עם `youtube.readonly` — הרשאה רגישה שדורשת אימות
אפליקציה. עד אז: פלייליסט ציבורי או לא-רשום לפי קישור, והמלצות מקומיות.

## 3. התור האחוד

`store/queue.ts` — רשימה אחת לשירים מקומיים, מ-YouTube ותצוגות מקדימות.
כל מנוע מדווח "נגמר" בדרך שלו: mpv דרך `eof-reached` (עם `--keep-open`
הוא אינו שולח `end-file` לעולם), YouTube במצב 0. התור מתקדם רק כשהשיר
שנגמר הוא שלו; הפעלה מחוץ לתור מנתקת אותו. סרטון שנחסם להטמעה מדולג.

Spotify אינו בתור הזה בכוונה: יש לו תור בחשבון, וערבוב שני תורים הוא
מה ששבר בעבר את הניגון שלו.

## 4. מבנה המסך

ר' סעיף 1ב. העיקרון: כותרת, שורה; כותרת, שורה — כל מדף הוא קרוסלה אופקית
אחת, והעמוד נקרא בגלילה אחת. הסדר מהקרוב אל הרחוק: מה ששמעת, מה שבשבילך,
מה ששמרת, מה שבמצב רוח, מה שעל המחשב — ורק אחר כך מה שחדש בעולם.

## 5. מנוע ההמלצות

מקומי לחלוטין (`lib/listening.ts`), ומוסבר במשפט:

```
זיקה לאמן = Σ השמעות × 0.5^(ימים מאז / 21) − דילוגים × ½
```

דילוג = החלפת שיר תוך 30 שניות. "בשבילך" מדרג את האוסף, הפופולריים
ושירים ישנים שחזרת אליהם, ומוריד לסוף שיר ששמעת בשעתיים האחרונות.
משתמש חדש מקבל מדף מלא בסדר המקורי. שיר מזוהה לפי אמן ושם מנורמלים —
אותו שיר מקומי ומ-YouTube הוא אותה היסטוריה.

## 6. נכסים ויזואליים

**כרטיסי הקטגוריות** (`src/renderer/src/assets/music-tiles/`, 16 קבצי
WebP, ‏~410KB יחד) נוצרו ב-OpenArt (Nano Banana 2, ‏4:3, ‏1K) כסדרה אחת.
התבנית המשותפת לכל הפרומפטים:

```
<Mood|Genre> tile artwork for a premium dark-mode music app, <category>:
<scene>, <signature accent light>, <atmosphere>, deep dark tones.
Cinematic editorial photography, fine film grain, subject in the upper
two-thirds with the lower third fading to near-black for a title overlay.
No text, no letters, no logos, no watermark, no people.
```

כלל שנלמד: "no logos" אינו מספיק — כרטיס הרוק הראשון יצא עם לוגו של
יצרן מגברים אמיתי. בפרומפט שהחליף אותו: "plain unbranded … blank front
panels … absolutely no text, no script, no brand names". **לבדוק כל
תמונה בגודל מלא לפני שהיא נכנסת למוצר.**

**Unsplash** מתאים לרקעי אווירה, לא לתמונות אמנים (אין שם אמנים, ויש
בעיית זכויות — תמונות אמנים מגיעות מ-Spotify/Deezer). MCP הוא כלי לזמן
העיצוב, לא תלות בזמן ריצה: אוצרים, מורידים, אורזים, ומציגים קרדיט לצלם.
שליפה בזמן ריצה דורשת אישור production של Unsplash, קישור ישיר לתמונה
ודיווח הורדה (`download_location`).

```json
{ "tool": "search_photos", "query": "rain window bokeh night",
  "orientation": "landscape", "color": "black", "per_page": 10 }
```

שאילתות: ריכוז — `minimal desk night lamp`; רגוע — `rooftop blue hour city`;
אנרגיה — `neon light trails long exposure`; שינה — `moonlit window curtains`;
פסקולים — `cinema projector beam haze`; מזרחית — `jerusalem stone golden hour`.

## 7. הצעת ערך

מה שרק OmniFlux עושה, ומה שאסור להבטיח:

- **ספרייה אחת לסרטים, מוזיקה ודרייב** — דרייב כשרת מדיה בלי להקים שרת.
- **איכות מלאה לקבצים שלך** — mpv, אקולייזר, בלי דחיסה נוספת.
- **תור אחד לכל המקורות** — מקומי ו-YouTube ברצף, בלי להחליף אפליקציה.
- **המלצות שנשארות במחשב** — אין פרופיל, אין שרת.
- **עברית תחילה** — RTL, תגיות בעברית, שמונה שפות.
- **לא להבטיח:** "בלי זכויות יוצרים", "בלי פרסומות" (YouTube), או
  Lossless מ-Spotify — אף אחד מאלה אינו נכון.

עקרונות חוויה: הכפתור תמיד אומר את האמת (צליל אמיתי, לא דיווח של SDK);
אין מבוי סתום — לכל שגיאה יש הסבר; מה שאפשר לנגן עכשיו קודם למה שצריך
להגדיר.
