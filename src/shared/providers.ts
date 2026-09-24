/**
 * וריאנטים של אותו שירות.
 *
 * ‏TMDB מחזיר את אותו שירות בכמה שמות: "Amazon Prime Video" ולצדו
 * "Amazon Prime Video with Ads", "HBO Max" ולצדו "HBO Max Amazon
 * Channel". כותר בחיפוש הציג כך ארבעה תגים לשני שירותים, ומנוי
 * ל-"Netflix" לא סימן כ"כלול" כותר שזמין ב-"Netflix Standard with Ads".
 */

const VARIANT =
  /\s+(?:(?:standard|basic|premium)\s+)?with\s+ads$|\s+(?:amazon|apple\s+tv|roku\s+premium)\s+channel$/i

/** "Netflix Standard with Ads" → "Netflix" · "HBO Max Amazon Channel" → "HBO Max" */
export function providerBase(name: string): string {
  return name.replace(VARIANT, '').trim()
}

const key = (name: string): string => providerBase(name).toLowerCase().replace(/\s+/g, ' ')

/**
 * מסיר וריאנט רק כשהשירות הבסיסי מופיע באותה רשימה.
 *
 * וריאנט שהבסיס שלו חסר נשאר — "HBO Max Amazon Channel" לבדו הוא
 * עדיין המידע היחיד על איפה לצפות, ואסור לאבד אותו. הקיבוץ הוא לפי
 * סוג (מנוי, השכרה, קנייה), כי שירות במנוי ואותו שירות בהשכרה הם שני
 * דברים שונים.
 */
export function collapseProviders<T>(list: T[], nameOf: (item: T) => string, kindOf: (item: T) => string = () => ''): T[] {
  const bases = new Set(list.filter((item) => providerBase(nameOf(item)) === nameOf(item)).map((item) => `${kindOf(item)}|${key(nameOf(item))}`))
  return list.filter((item) => {
    const name = nameOf(item)
    if (providerBase(name) === name) return true
    return !bases.has(`${kindOf(item)}|${key(name)}`)
  })
}

/** אותו שירות, גם אם אחד מהשמות הוא וריאנט */
export function sameProvider(a: string, b: string): boolean {
  return key(a) === key(b)
}
