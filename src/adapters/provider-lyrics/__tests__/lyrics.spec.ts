import { expect, test } from '@playwright/test'
import { lineAt, parseLrc } from '../index'

/**
 * פירוק LRC.
 *
 * הפורמט נראה פשוט עד שנתקלים בו: יש חותמות בשתי ספרות ובשלוש,
 * מפריד נקודה ומפריד נקודתיים, וכמה חותמות לאותה שורה כשהפזמון
 * חוזר. שורה שמתפרקת לא נכון מציגה את המילים בזמן הלא נכון —
 * וזה גרוע יותר מלא להציג בכלל.
 */

test('חותמת זמן בסיסית', () => {
  const lines = parseLrc('[00:35.66] Look at the stars')
  expect(lines).toEqual([{ at: 35.66, text: 'Look at the stars' }])
})

test('דקות מתורגמות לשניות', () => {
  expect(parseLrc('[02:07.50] x')[0].at).toBeCloseTo(127.5, 2)
  expect(parseLrc('[10:00.00] y')[0].at).toBe(600)
})

test('מאיות ואלפיות שתיהן נתמכות', () => {
  expect(parseLrc('[00:01.5] a')[0].at).toBeCloseTo(1.5, 3)
  expect(parseLrc('[00:01.05] b')[0].at).toBeCloseTo(1.05, 3)
  expect(parseLrc('[00:01.005] c')[0].at).toBeCloseTo(1.005, 3)
})

test('מפריד נקודתיים במקום נקודה', () => {
  expect(parseLrc('[00:12:30] z')[0].at).toBeCloseTo(12.3, 2)
})

test('פזמון עם כמה חותמות מייצר שורה לכל חותמת', () => {
  const lines = parseLrc('[00:10.00][01:20.00][02:30.00] Chorus')
  expect(lines.map((l) => l.at)).toEqual([10, 80, 150])
  expect(new Set(lines.map((l) => l.text))).toEqual(new Set(['Chorus']))
})

test('התוצאה ממוינת לפי זמן גם כשהקלט אינו', () => {
  const lines = parseLrc('[00:30.00] second\n[00:10.00] first')
  expect(lines.map((l) => l.text)).toEqual(['first', 'second'])
})

test('שורות מטא-דאטה אינן נחשבות למילים', () => {
  // [ar:] ו-[ti:] אינם חותמות זמן ואסור שייכנסו כשורות
  const lines = parseLrc('[ar:Coldplay]\n[ti:Yellow]\n[00:35.66] Look at the stars')
  expect(lines).toHaveLength(1)
  expect(lines[0].text).toBe('Look at the stars')
})

test('הפסקה מוזיקלית נשמרת כשורה ריקה', () => {
  // בלעדיה המילים הקודמות נשארות על המסך לאורך כל הסולו
  const lines = parseLrc('[00:10.00] sing\n[00:20.00] ')
  expect(lines).toHaveLength(2)
  expect(lines[1].text).toBe('')
})

test('טקסט בלי חותמת נזרק', () => {
  expect(parseLrc('just a line\nanother')).toEqual([])
})

/** איתור השורה הפעילה */
const SAMPLE = parseLrc('[00:10.00] one\n[00:20.00] two\n[00:30.00] three')

test('לפני השורה הראשונה אין שורה פעילה', () => {
  expect(lineAt(SAMPLE, 0)).toBe(-1)
  expect(lineAt(SAMPLE, 9.99)).toBe(-1)
})

test('השורה הפעילה היא האחרונה שכבר התחילה', () => {
  expect(lineAt(SAMPLE, 10)).toBe(0)
  expect(lineAt(SAMPLE, 19.9)).toBe(0)
  expect(lineAt(SAMPLE, 20)).toBe(1)
  expect(lineAt(SAMPLE, 999)).toBe(2)
})

test('החיפוש עובד על מילים ארוכות', () => {
  const many = Array.from({ length: 500 }, (_, i) => `[${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}.00] line ${i}`)
  const lines = parseLrc(many.join('\n'))
  expect(lines).toHaveLength(500)
  expect(lines[lineAt(lines, 250)].text).toBe('line 250')
})
