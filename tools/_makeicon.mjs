import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

/**
 * מייצר את משפחת הסמלים מקונספט המותג המאושר.
 *
 * מקור אחד לכולם — הממשק, חלון Windows, המתקין והאתר — כדי שהסימן לא
 * יתפצל לשתי צורות שנבדלות זו מזו.
 *
 * מה שהיה שבור כאן: קובץ הקונספט אינו אטום. אף פיקסל בו אינו במלוא
 * האטימות — האלפא נע בין 126 ל-236 על פני כל הקנבס, והרקע הכהה הוא
 * ‎rgba(4,4,9,189)‎. הגרסה הקודמת של הכלי העתיקה אותו כמו שהוא וצילמה
 * עם `omitBackground`, ולכן השקיפות החלקית שרדה עד קובץ ה-ICO.
 *
 * ‏Windows מרכיב סמל מעל משטח בהיר — סייר הקבצים, המתקין, חלונית
 * המשימות — ורקע שחור ב-74% אטימות הופך שם לאפור חיוור. זה בדיוק מה
 * שהמשתמש ראה: סמל שנראה כאילו לא התעדכן. נמדד בקובץ ICO שנבנה.
 *
 * לכן שני תוצרים, ולא העתקה אחת:
 *
 *   הסימן לממשק — הרקע הכהה מוסר לגמרי לפי בהירות, ונשאר הגליף בלבד
 *                 על שקיפות אמיתית. הוא יושב על זכוכית כהה, ורקע
 *                 כהה-למחצה מעליה נראה כמו ריבוע מלוכלך.
 *   סמל התוכנה  — הגליף מורכב מעל לוח אובסידיאן אטום עם פינות
 *                 מעוגלות, ונשמר בלי שום שקיפות.
 */

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(root, 'docs', 'brand', 'omniflux-mark-concept-v1.png')
const rendererMark = path.join(root, 'src', 'renderer', 'src', 'assets', 'omniflux-mark.png')
const buildIcon = path.join(root, 'build', 'icon.png')
const siteIcon = path.join(root, 'site', 'assets', 'icon.png')
const previews = path.join(root, 'build', '_icon-preview')

for (const dir of [path.dirname(rendererMark), path.dirname(buildIcon), path.dirname(siteIcon), previews]) {
  fs.mkdirSync(dir, { recursive: true })
}

const dataUri = `data:image/png;base64,${fs.readFileSync(source).toString('base64')}`
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 64, height: 64 }, deviceScaleFactor: 1 })
await page.setContent('<!doctype html><html><body></body></html>')

/**
 * מסיר את הרקע לפי בהירות ומחזיר PNG שקוף.
 *
 * הקונספט הוא ניגוד גבוה — גליף בהיר על שדה כמעט שחור — ולכן הסף
 * הזה חד ואינו זקוק לכוונון: מתחת ל-‎0.16 בהירות זה רקע, מעל ‎0.30 זה
 * הגליף, ובאמצע יש מעבר רך ששומר על הקצוות חלקים.
 */
const cutout = await page.evaluate(async (src) => {
  const img = new Image()
  img.src = src
  await img.decode()
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  const ctx = c.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const data = ctx.getImageData(0, 0, c.width, c.height)
  const p = data.data
  for (let i = 0; i < p.length; i += 4) {
    const lum = (0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2]) / 255
    const a = Math.max(0, Math.min(1, (lum - 0.16) / 0.14))
    p[i + 3] = Math.round(a * 255)
  }
  ctx.putImageData(data, 0, 0)
  return c.toDataURL('image/png')
}, dataUri)

fs.writeFileSync(rendererMark, Buffer.from(cutout.split(',')[1], 'base64'))

/*
 * הלוח תופס 88% מהריבוע ולא את כולו.
 *
 * ‏Windows מציג את הסמל מ-16 ועד 256 פיקסלים ומקצה לו שוליים משלו.
 * סמל שממלא את כל הריבוע נראה גדול מכל שכניו בשורת המשימות.
 */
await page.setContent(`<!doctype html><html><head><style>
  html, body { margin: 0; width: 100vw; height: 100vh; overflow: hidden; background: transparent; }
  .plate {
    position: absolute; inset: 6%;
    border-radius: 22%;
    background: radial-gradient(120% 120% at 30% 12%, #16181e 0%, #08090c 62%);
    display: grid; place-items: center;
  }
  img { display: block; width: 74%; height: 74%; object-fit: contain; }
</style></head><body>
  <div class="plate"><img src="${cutout}" alt=""></div>
</body></html>`)
await page.locator('img').waitFor({ state: 'visible' })

for (const size of [1024, 256, 64, 32, 16]) {
  await page.setViewportSize({ width: size, height: size })
  const target = size === 1024 ? buildIcon : path.join(previews, `icon-${size}.png`)
  /*
   * מסביב ללוח שקוף, והלוח עצמו אטום.
   *
   * זו ההבחנה שהוחמצה קודם: הבעיה מעולם לא הייתה שקיפות בפינות —
   * כך נראה כל סמל מודרני — אלא תוכן שקוף-למחצה. הלוח כאן צבוע
   * בצבעים אטומים, ולכן הוא נשאר אטום גם כשהרקע סביבו נחתך.
   */
  await page.screenshot({ path: target, omitBackground: true })
}

await browser.close()
fs.copyFileSync(buildIcon, siteIcon)
console.log('נוצרה משפחת הסמלים מתוך', path.relative(root, source))
