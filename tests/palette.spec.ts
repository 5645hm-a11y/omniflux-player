import { test, expect } from '@playwright/test'
import { paletteFrom, NEUTRAL } from '../src/renderer/src/lib/palette'

/**
 * חילוץ צבע לתאורת האווירה.
 *
 * לוגיקה טהורה, ולכן נבדקת בלי אפליקציה. הכלל שנבדק כאן הוא העיקר:
 * תאורה טובה לוקחת את הצבע ה*מאפיין*, לא את הממוצע. ממוצע של פריים
 * צבעוני הוא תמיד אפור בוצי.
 */

/** בונה מפת פיקסלים מרשימת צבעים, בחלקים שווים */
function pixels(colours: Array<[number, number, number]>, count = 400): Uint8ClampedArray {
  const data = new Uint8ClampedArray(count * 4)
  for (let i = 0; i < count; i++) {
    const c = colours[i % colours.length]!
    data[i * 4] = c[0]
    data[i * 4 + 1] = c[1]
    data[i * 4 + 2] = c[2]
    data[i * 4 + 3] = 255
  }
  return data
}

const rgb = (s: string): [number, number, number] => {
  const m = /rgb\((\d+) (\d+) (\d+)\)/.exec(s)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0]
}

test('צבע דומיננטי אחד מזוהה', () => {
  const p = paletteFrom(pixels([[200, 30, 30]]), 20, 20)
  const [r, g, b] = rgb(p.primary)
  expect(r, `התקבל ${p.primary}`).toBeGreaterThan(150)
  expect(r).toBeGreaterThan(g + 80)
  expect(r).toBeGreaterThan(b + 80)
})

test('הרוב השחור אינו מטביע את הצבע', () => {
  // תשעים אחוז שחור ועשרה כחול — התאורה חייבת לצאת כחולה
  const dark: Array<[number, number, number]> = Array(9).fill([8, 8, 10])
  const p = paletteFrom(pixels([...dark, [40, 90, 220]]), 20, 20)
  const [r, g, b] = rgb(p.primary)
  expect(b, `התקבל ${p.primary}`).toBeGreaterThan(120)
  expect(b).toBeGreaterThan(r + 60)
  void g
})

test('פריים חי מסומן כלא-כהה, ופריים אפל ככהה', () => {
  expect(paletteFrom(pixels([[240, 200, 120]]), 20, 20).dark).toBe(false)
  expect(paletteFrom(pixels([[12, 10, 14]]), 20, 20).dark).toBe(true)
})

test('תמונה חסרת גוון נופלת לצבע ברירת המחדל', () => {
  // אפור טהור — אין שום גוון לחלץ, ואסור להמציא אחד
  const p = paletteFrom(pixels([[128, 128, 128]]), 20, 20)
  expect(p.primary).toBe(NEUTRAL.primary)
})

test('שני גוונים שונים מחזירים ראשי ומשני נבדלים', () => {
  const p = paletteFrom(pixels([[220, 40, 40], [40, 60, 220]]), 20, 20)
  expect(p.primary).not.toBe(p.secondary)
})
