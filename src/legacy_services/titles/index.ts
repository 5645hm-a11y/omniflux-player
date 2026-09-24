/**
 * ניקוי שמות קבצים ותיקיות מהדרייב.
 *
 * השמות במאגר מגיעים בכל צורה אפשרית:
 *   "1080p BluRay 2016 זירה מדיה לה לה לנד.mp4"
 *   "American.Psycho.2000.720p.BrRip.x264.mp4"
 *   "1080_BluRay_האנה_מונטנה_הסרט_2009_קינג_סרט.mp4"
 *   "ביג מאמא  😌 הועלה ע''י אוהב לעזור"
 * המטרה: לחלץ שם נקי + שנה, כדי שאפשר יהיה למצוא כרזה רשמית ב-TMDB.
 *
 * הערה חשובה: \b ב-JavaScript מבוסס על [A-Za-z0-9_] בלבד, ולכן הוא **לא** עובד
 * מול אותיות עבריות. כל התבניות בעברית כאן משתמשות ב-lookaround מפורש.
 */

const HEB = '\\u0590-\\u05FF'
const HEB_RE = /[֐-׿]/

const EMOJI =
  /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{200D}\u{20E3}]/gu

/**
 * ביטויים של מעלים / קבוצות ריפ — נמחקים לגמרי.
 * הסדר חשוב: קודם התבניות שבולעות עד סוף השם, אחרת תבנית צרה יותר
 * תיקח את "הועלה ע״י" ותשאיר את שם המעלה בתוך הכותרת.
 */
const UPLOADER_PHRASES: RegExp[] = [
  // קבוצת ההפצה "סרטים השחר" מופיעה בסוף שמות Drive ואינה חלק משם הכותר.
  /(^|[\s._-])סרטים[\s._-]+השחר(?=[\s._-]|$)/g,
  // חתימה בסוף השם: "הועלה ע״י צוות אריאל בטלגרם @goinen"
  /\s*הועלה\s.*$/,
  // גם בלי "הועלה" לפניו, וגם עם גרש כפול: "מתעדכן ע''י מני"
  /\s*ע["'׳״]{1,2}\s*י\s.*$/,
  /הועלה\s*ע["'׳״]{0,2}\s*י/g,
  /הועלה\s*על\s*ידי/g,
  /אוהב\s*לעזור/g,
  // קבוצות ריפ בעברית נקראות כמעט תמיד "<שם> מדיה"
  // בלי ספרות בשם הקבוצה, אחרת "פ1 מדיה" בולע את מספר הפרק שלפניו
  /(^|\s)[^\s\d]{2,12}\s*מדיה(?=\s|$)/g,
  /קינג\s*סרט(?:ים)?/g,
  /סרטי\s*ישראל/g,
  /תרגום\s*מובנה/g,
  /כתוביות\s*מובנות/g,
  /באיכות\s*גבוהה/g,
  /(^|\s)מדובב(?:\s*לעברית)?(?=\s|$)/g,
  /(^|\s)מתורגם(?=\s|$)/g,
  /(^|\s)דיבוב\s*עברי(?=\s|$)/g,
  /(^|\s)(?:ללא|עם)\s*תרגום(?=\s|$)/g,
  // סטטוס שהמעלה מוסיף לסדרות רצות — לא חלק מהשם
  /(^|\s)מתעדכן(?:\s*כל\s*\S+)?(?=\s|$)/g,
  /(^|\s)עונה\s*מלאה(?=\s|$)/g,
  // מספר עונה שכתוב במילים. המספר האמיתי מגיע מתיקיות העונה, לא מהשם,
  // ו"חיי עם משפחת וולטר עונה שלוש" צריך להתאים לסדרה עצמה.
  /(^|\s)עונה\s+(?:ראשונה|שני[יה]ה|שלישית|רביעית|חמישית|שישית|שביעית|שמינית|תשיעית|עשירית|אחת|שתיים|שתים|שלוש|ארבע|חמש|שש|שבע|שמונה|תשע|עשר)(?=\s|$)/g,
  /(^|\s)כל\s*הפרקים(?=\s|$)/g,
  // "ת.מ" / "ת מ" — קיצור של תרגום מובנה
  /(^|\s)ת\.?\s?מ(?=\s|$)/g,
  // קבוצות ריפ שקוראות לעצמן "<שם> סרטים"
  /(^|\s)[^\s\d]{2,12}\s*סרטים(?=\s|$)/g,
  // "סרטים וסדרות בדרייב or" — שם ערוץ שלם, כולל הכינוי שאחריו
  /(^|\s)סרטים\s*ו?סדרות\s*ב\S+(\s+\S{1,10})?\s*$/,
  /(^|\s)ו?סדרות\s*ב(?:דרייב|דריב|טלגרם|טלגראם)\s*\S{0,10}\s*$/g,
  // "ע״י חיה" אחרי שהגרשיים כבר נוקו והפכו ל"עי"
  /(^|\s)עי\s+\S{2,12}\s*$/,
  // תגית קהל, לא חלק מהשם: "התביעה - סרט לנשים"
  /(^|\s)סרט(?:ים)?\s*לנשים(?=\s|$)/g,
  /(^|\s)לנשים\s*בלבד(?=\s|$)/g,
  /(^|\s)לגברים\s*בלבד(?=\s|$)/g,
  // כינוי מעלה בסגנון "Amsi77" — אותיות לועזיות ואחריהן ספרות
  /(^|\s)[A-Za-z]{3,}\d{1,4}(?=\s|$)/g,
  // שמות המעלים החוזרים במאגרים. רק בקצוות ועם מפריד, כדי ש"אייל"
  // או "מני" בתוך שם אמיתי לא ייעלמו.
  /^(?:שבי\s*גוזלן|חננאל(?:\s*ס)?|אוהב\s*לעזור|זירה\s*מדיה|שימי|אייל|מני)\s*[-–—.:]\s*/,
  /\s+(?:שבי\s*גוזלן|חננאל(?:\s*ס)?|אוהב\s*לעזור|זירה\s*מדיה|שימי|אייל|מני)\s*$/,
  // "גוזלן אלירן", "גוזלן שבי" — שם משפחה ואחריו שם פרטי של המעלה
  /(^|\s)גוזלן\s+\S{2,10}(?=\s|$)/g,
  // ערוצים ותגיות שאותרו במאגר. אלה אינם חלק משום שם סרט.
  /(^|\s)לולו\s*סרטים(?=\s|$)/g,
  /(^|\s)יהודה\s*מנוחה\s*פוקס(?=\s|$)/g,
  /(^|\s)אוצר\s*סיפורי\s*ל?\s*באנימציה(?=\s|$)/g,
  /(^|\s)גל\s*פז(?=\s|$)/g,
  /(^|\s)סיפורי\s*צדיקים(?=\s|$)/g,
  /(^|\s)סרט(?:ים)?\s*(?:חרדי|דתי)(?:ים)?(?=\s|$)/g,
  /(^|\s)ו?סדרות\s*בדריי?ב\s*\S{0,10}(?=\s|$)/g,
  /(^|\s)ו?סדרות(?=\s|$)/g,
  /(^|\s)לבנות\s*בלבד(?=\s|$)/g,
  // שם הערוץ "אייל סרטים חדשים וישנים" — "אייל סרטים" נופל בכלל שמעליו
  /(^|\s)חדשים\s*ו?\s*ישנים(?=\s|$)/g,
  // "ת" יתומה בסוף, שנשארת מ"ת.מ" כשהנקודה כבר הפכה לרווח
  /\s+ת\s*$/,
  // "ז.מ" / "ז מ" — קיצור של זירה מדיה
  new RegExp(`(^|[\\s])ז\\.?\\s?מ(?=[\\s]|$)`, 'g'),
  // קיצורי מעלים באותה צורה: "ק.ס", "דב.ס", "נ.מ"
  /(^|\s)(?:ק|נ|ל)\.?\s?[מס](?=\s|$)/g,
  /(^|\s)דב\.?\s?ס(?=\s|$)/g,
  /(^|\s)דב\s*סרטים(?=\s|$)/g,
  // שאריות של גרשיים בודדים בסוף
  new RegExp(`(?<=[${HEB}])\\s*["'׳״]{2,}\\s*(?=[${HEB}]|$)`, 'g')
]

/**
 * תבניות איכות/קודק/מקור מורכבות. רצות לפני שהנקודות הופכות לרווחים,
 * כדי ש-"H.264-HBRW" ו-"AAC5.1" ייתפסו כיחידה אחת.
 */
const RELEASE_PATTERNS: RegExp[] = [
  /\b[xh]\.?26[45](?:[-\s][A-Za-z0-9]{2,12})?\b/gi,
  /\bHEVC\b/gi,
  /\bXVID\b/gi,
  /\bDIVX\b/gi,
  /\b(?:AAC|AC3|EAC3|DDP|DTS(?:-?HD)?|TrueHD|Atmos|FLAC|OPUS)(?:[.\s-]?\d(?:[.\s]\d)?)?\b/gi,
  /\bDD[P+]?\s?\d(?:\.\d)?\b/gi,
  /\bWEB[-.\s]?DL\b/gi,
  /\bWEB[-.\s]?Rip\b/gi,
  /\bBlu[-.\s]?Ray\b/gi,
  // "BIuRay" — I גדולה במקום l קטנה, שגיאת הקלדה שחוזרת במאגר
  /\bB[lI1]u?e?[-.\s]?Ray\b/gi,
  /\bBl?[uv]e?[-.\s]?Ray\b/gi,
  /\bB[RD][-.\s]?Rip\b/gi,
  /\bHD[-.\s]?(?:TV|Rip|CAM)\b/gi,
  /\bDVD[-.\s]?(?:Rip|Scr|R)\b/gi,
  /\bCAM[-.\s]?Rip\b/gi,
  // גם "72P" — שגיאת הקלדה נפוצה ל-720p בשמות קבצים
  /(?<![a-z])\d{2,4}p\b/gi,
  /\b10[-.\s]?bit\b/gi,
  /\bHi10P\b/gi,
  /\bHDR10?\+?\b/gi,
  /\bDolby[-.\s]?Vision\b/gi,
  /\b(?:NF|AMZN|DSNP|HMAX|ATVP|iP)\b/g,
  /\b(?:YTS|YIFY|RARBG|EVO|FGT|NTb|TGx|GalaxyRG)(?:\.[A-Z]{2,3})?\b/gi,
  /\bREMUX\b/gi
]

/** אסימונים בודדים שנמחקים. שמור על הרשימה שמרנית — מחיקה של מילה אמיתית מהכותרת גרועה בהרבה משארית זבל. */
const JUNK_TOKENS = new Set([
  '480','576','720','1080','1440','2160','4320','2k','4k','8k','uhd',
  'bluray','blueray','brrip','bdrip','webrip','webdl','web','hdtv','pdtv','dvdrip','dvdscr','hdrip',
  'x264','x265','h264','h265','avc','hevc','xvid','divx','10bit','8bit','hi10p',
  'aac','ac3','eac3','ddp','dts','truehd','atmos','remux',
  'hdr','sdr','proper','repack','unrated','uncut','remastered','imax',
  'internal','multi','dual','subs','subbed','dubbed','hebsub','hebsubs','hebdub','heb',
  'yts','yify','rarbg','evo','fgt','ntb','tgx','edith','hbrw','amzn','dsnp','hmax','atvp'
])

const PATTERNS = {
  sxxexx: /\bS(\d{1,2})[\s._-]*E(\d{1,3})\b/i,
  xTimesY: /\b(\d{1,2})x(\d{1,3})\b/i,
  hebSeasonEp: /עונה\s*(\d{1,2})[^\d]{0,12}?פרק\s*(\d{1,3})/,
  /** הקיצור הנפוץ במאגר: "ע1 פ14" = עונה 1 פרק 14 */
  hebShortSeasonEp: /(^|\s)ע["'׳״]?\s?(\d{1,2})\s*פ["'׳״]?\s?(\d{1,3})(?=\s|$)/,
  hebEp: /פרק\s*(\d{1,3})/,
  /** "פ7" בודד */
  hebShortEp: /(^|\s)פ["'׳״]?\s?(\d{1,3})(?=\s|$)/,
  hebSeason: /עונה\s*(\d{1,2})/,
  /** "ע2" בודד */
  hebShortSeason: /(^|\s)ע["'׳״]?\s?(\d{1,2})(?=\s|$)/,
  engSeason: /\bseason\s*(\d{1,2})\b/i,
  engEp: /\bE(?:p(?:isode)?)?[\s._-]?(\d{1,3})\b/i,
  hebPart: /חלק\s*(\d{1,2})/,
  /** "האירי ח1" = חלק 1 */
  hebShortPart: /(^|\s)ח["'׳״]?\s?(\d{1,2})(?=\s|$)/,
  /** "המופע ח״ב" / "חלק ג" — חלק במספור באותיות */
  hebLetterPart: /(^|\s)ח(?:לק)?["'׳״]?\s?([אבגדהוזחט])(?=\s|$)/
}

/**
 * קבצים שהורדו מטלגרם/וואטסאפ נושאים שם אוטומטי שאין בו שום מידע:
 *   video_2026-07-01_04-27-13_7662522514228117772.mp4
 * אין טעם לנסות להתאים אותם למאגר סרטים — עדיף להציג תאריך קריא.
 */
const AUTO_NAME =
  /^(?:video|vid|img|photo|whatsapp\s*video|document)[_\- ]?(\d{4})-(\d{2})-(\d{2})[_\- ](\d{2})[-:](\d{2})[-:](\d{2})(?:[_\- ]\d+)?$/i

const MONTHS_HE = [
  'ינואר','פברואר','מרץ','אפריל','מאי','יוני',
  'יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'
]

export interface ParsedTitle {
  /** שם נקי לחיפוש ב-TMDB */
  title: string
  /** שם לתצוגה (כולל "חלק N" אם היה) */
  display: string
  year: number | null
  season: number | null
  episode: number | null
  part: number | null
  hebrew: boolean
  /** שם אוטומטי של טלגרם/וואטסאפ — אין מה לחפש עליו במאגר */
  autoNamed: boolean
}

export function stripExtension(name: string): string {
  return name.replace(/\.[a-z0-9]{2,4}$/i, '')
}

function tidy(s: string): string {
  return (
    s
      // גרשיים בתוך מילה הם חלק מראשי תיבות בעברית: הפלמ''ח → הפלמ״ח.
      // בלי זה המילה נשברת לשתיים ואי אפשר למצוא אותה בשום מאגר.
      .replace(/(?<=[֐-׿])["'׳״]{2}(?=[֐-׿])/g, '״')
      .replace(/["'׳״]{2,}/g, ' ')
    .replace(/[-–—_]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
      .replace(/^[\s\-–—.,:;'"׳״+|]+|[\s\-–—.,:;'"׳״+|]+$/g, '')
      .trim()
  )
}

/** אותיות עבריות כמספרים: א=1 … ט=9. משמש ל"חלק ג" ול"ח״ב" */
const HE_LETTER_NUM: Record<string, number> = {
  א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9
}

/**
 * שאריות לועזיות אחרי שם עברי. שתי צורות נפוצות במאגר:
 *   "לוחם המדבר lohem hamidbar"  — תעתיק של אותו שם
 *   "... DDP5 1 H"               — יתום של H.264 אחרי פירוק הקודק
 *
 * דורש שתי מילים לפחות בתעתיק, כדי ש"דור ה v" יישאר שלם.
 */
function stripLatinNoise(s: string): string {
  if (!HEB_RE.test(s)) return s
  // היתום נמחק ראשון, אחרת הוא חוסם את זיהוי התעתיק שלפניו
  const out = s
    .replace(/\s+[A-Z]\s*$/, '')
    .replace(/\s+[a-z]+(?:\s+[a-z]+)+\s*$/, '')
    .trim()
  return out || s
}

function stripJunkTokens(s: string): string {
  const parts = s.split(/\s+/).filter(Boolean)
  const kept: string[] = []
  for (const p of parts) {
    const bare = p.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    if (!bare) continue
    if (JUNK_TOKENS.has(bare.toLowerCase())) continue
    kept.push(bare)
  }
  // רשת ביטחון: אם הניקוי מחק הכול, מחזירים את המקור
  return kept.length ? kept.join(' ') : s
}

/**
 * מוציא את השנה ומנקה **את כל** מופעיה. שם כמו
 * "Escape room 2019 Amsi77 -חדר בריחה 2019" מכיל אותה פעמיים,
 * והשארת אחת מהן בכותרת מקלקלת את החיפוש.
 */
function extractYear(s: string): { text: string; year: number | null } {
  const re = /(?<!\d)((?:19|20)\d{2})(?!\d)/g
  const matches = [...s.matchAll(re)]
  if (matches.length === 0) return { text: s, year: null }

  const maxYear = new Date().getFullYear() + 2
  const valid = matches.map((m) => Number(m[1])).filter((y) => y >= 1900 && y <= maxYear)
  if (valid.length === 0) return { text: s, year: null }

  const text = s.replace(re, (m) => {
    const y = Number(m)
    return y >= 1900 && y <= maxYear ? ' ' : m
  })
  // אם השנה הייתה כל השם — משאירים אותו
  if (!tidy(stripJunkTokens(text))) return { text: s, year: null }
  // מעדיפים את המופע האחרון, שבדרך כלל צמוד לשם ולא לאיכות
  return { text, year: valid[valid.length - 1] }
}

export function isHebrewText(s: string): boolean {
  return HEB_RE.test(s)
}

/** מנקה שם של קובץ וידאו או תיקייה ומחזיר את מרכיביו */
export function parseName(rawName: string, opts: { isFolder?: boolean } = {}): ParsedTitle {
  let s = opts.isFolder ? rawName : stripExtension(rawName)

  const auto = s.trim().match(AUTO_NAME)
  if (auto) {
    const [, y, mo, d, h, mi] = auto
    const label = `סרטון · ${Number(d)} ב${MONTHS_HE[Number(mo) - 1]} ${y}, ${h}:${mi}`
    return {
      title: label,
      display: label,
      year: null,
      season: null,
      episode: null,
      part: null,
      hebrew: true,
      autoNamed: true
    }
  }

  s = s.replace(EMOJI, ' ')
  s = s.replace(/[_[\]{}()]/g, ' ')
  for (const re of RELEASE_PATTERNS) s = s.replace(re, ' ')
  for (const re of UPLOADER_PHRASES) s = s.replace(re, ' ')
  // נקודות הופכות לרווחים רק כשהן לא בין שתי ספרות
  s = s.replace(/(?<!\d)\.|\.(?!\d)/g, ' ')

  let season: number | null = null
  let episode: number | null = null

  const se = s.match(PATTERNS.sxxexx)
  if (se) {
    season = Number(se[1])
    episode = Number(se[2])
    s = s.replace(PATTERNS.sxxexx, ' ')
  }
  if (season === null) {
    const hx = s.match(PATTERNS.hebSeasonEp)
    if (hx) {
      season = Number(hx[1])
      episode = Number(hx[2])
      s = s.replace(PATTERNS.hebSeasonEp, ' ')
    }
  }
  if (season === null) {
    const hs = s.match(PATTERNS.hebShortSeasonEp)
    if (hs) {
      season = Number(hs[2])
      episode = Number(hs[3])
      s = s.replace(PATTERNS.hebShortSeasonEp, ' ')
    }
  }
  if (season === null) {
    const xy = s.match(PATTERNS.xTimesY)
    if (xy) {
      season = Number(xy[1])
      episode = Number(xy[2])
      s = s.replace(PATTERNS.xTimesY, ' ')
    }
  }
  if (season === null) {
    const hs = s.match(PATTERNS.hebSeason)
    if (hs) {
      season = Number(hs[1])
      s = s.replace(PATTERNS.hebSeason, ' ')
    } else {
      const es = s.match(PATTERNS.engSeason)
      if (es) {
        season = Number(es[1])
        s = s.replace(PATTERNS.engSeason, ' ')
      }
    }
  }
  if (season === null) {
    const shortSeason = s.match(PATTERNS.hebShortSeason)
    if (shortSeason) {
      season = Number(shortSeason[2])
      s = s.replace(PATTERNS.hebShortSeason, ' ')
    }
  }
  if (episode === null) {
    const he = s.match(PATTERNS.hebEp)
    if (he) {
      episode = Number(he[1])
      s = s.replace(PATTERNS.hebEp, ' ')
    }
  }
  if (episode === null) {
    const shortEp = s.match(PATTERNS.hebShortEp)
    if (shortEp) {
      episode = Number(shortEp[2])
      s = s.replace(PATTERNS.hebShortEp, ' ')
    }
  }

  const partMatch = s.match(PATTERNS.hebPart)
  let part = partMatch ? Number(partMatch[1]) : null
  if (partMatch) s = s.replace(PATTERNS.hebPart, ' ')
  if (part === null) {
    const shortPart = s.match(PATTERNS.hebShortPart)
    if (shortPart) {
      part = Number(shortPart[2])
      s = s.replace(PATTERNS.hebShortPart, ' ')
    }
  }
  if (part === null) {
    const letterPart = s.match(PATTERNS.hebLetterPart)
    if (letterPart) {
      part = HE_LETTER_NUM[letterPart[2]] ?? null
      if (part !== null) s = s.replace(PATTERNS.hebLetterPart, ' ')
    }
  }

  const yr = extractYear(s)
  s = tidy(stripLatinNoise(stripJunkTokens(yr.text)))

  if (/^\d{1,3}$/.test(s) && episode === null) {
    episode = Number(s)
    s = ''
  }

  const display = part !== null && s ? `${s} חלק ${part}` : s

  return {
    title: s,
    display,
    year: yr.year,
    season,
    episode,
    part,
    hebrew: isHebrewText(s),
    autoNamed: false
  }
}

/** שם סדרה מתוך שם תיקייה */
export function parseSeriesFolder(name: string): { title: string; year: number | null } {
  const p = parseName(name, { isFolder: true })
  const fallback = tidy(name.replace(EMOJI, ' '))
  return { title: p.title || fallback, year: p.year }
}

/** מספר עונה מתוך שם תיקיית עונה. null אם זו לא תיקיית עונה. */
/** מספרי עונה שכתובים במילים — "עונה שלוש" נפוץ לא פחות מ"עונה 3" */
const SEASON_WORDS: Record<string, number> = {
  ראשונה: 1,
  אחת: 1,
  שנייה: 2,
  שניה: 2,
  שתיים: 2,
  שתים: 2,
  שלישית: 3,
  שלוש: 3,
  רביעית: 4,
  ארבע: 4,
  חמישית: 5,
  חמש: 5,
  שישית: 6,
  שש: 6,
  שביעית: 7,
  שבע: 7,
  שמינית: 8,
  שמונה: 8,
  תשיעית: 9,
  תשע: 9,
  עשירית: 10,
  עשר: 10
}

export function parseSeasonFolder(name: string): { number: number | null; name: string } {
  const clean = tidy(name.replace(EMOJI, ' '))
  const heb = clean.match(/עונה\s*(\d{1,2})/)
  if (heb) return { number: Number(heb[1]), name: clean }
  const word = clean.match(/עונה\s+(\S+)/)
  if (word && SEASON_WORDS[word[1]]) return { number: SEASON_WORDS[word[1]], name: clean }
  const eng = clean.match(/\bseason\s*(\d{1,2})\b/i)
  if (eng) return { number: Number(eng[1]), name: clean }
  const s = clean.match(/^S(\d{1,2})$/i)
  if (s) return { number: Number(s[1]), name: clean }
  const onlyNum = clean.match(/^(\d{1,2})$/)
  if (onlyNum) return { number: Number(onlyNum[1]), name: clean }
  return { number: null, name: clean }
}

/** מספר פרק מתוך שם קובץ, כולל נפילה לתבנית E05 */
export function parseEpisodeNumber(parsed: ParsedTitle, rawName: string): number | null {
  if (parsed.episode !== null) return parsed.episode
  const m = stripExtension(rawName).match(PATTERNS.engEp)
  if (m) return Number(m[1])
  const lead = stripExtension(rawName).match(/^\s*(\d{1,3})\s*[-–.\s]/)
  if (lead) return Number(lead[1])
  return null
}

/** האם התיקייה נראית כמו תיקיית שנה ("2026") ולא כמו שם של סדרת סרטים */
export function isYearFolder(name: string): boolean {
  return /^\s*(19|20)\d{2}\s*$/.test(name)
}

/** מפתח נורמלי להשוואת כותרות (חיפוש, דה-דופליקציה) */
export function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[֑-ׇ]/g, '') // ניקוד
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}
