import { expect, test } from '@playwright/test'
import { parseTrackTitle, stripExtension } from '../track'

/**
 * שם הרצועה.
 *
 * mpv מדווח את שם הקובץ ככותרת כשאין תגיות — כולל הסיומת. נצפה
 * בפועל: חיפוש מילים ל-"Yellow.mp3" החזיר ריק, והמסך הציג את
 * הסיומת כשם השיר.
 */

test('הסיומת יורדת', () => {
  expect(stripExtension('Yellow.mp3')).toBe('Yellow')
  expect(stripExtension('film.mkv')).toBe('film')
  expect(stripExtension('סרט עברי.mp4')).toBe('סרט עברי')
})

test('שם בלי סיומת נשאר כמו שהוא', () => {
  expect(stripExtension('Yellow')).toBe('Yellow')
  // "mp3" באמצע השם אינו סיומת
  expect(stripExtension('The mp3 Song')).toBe('The mp3 Song')
})

test('נקודה בשם אינה נחתכת', () => {
  expect(stripExtension('Track No. 5')).toBe('Track No. 5')
})

test('פיצול אמן ושיר', () => {
  expect(parseTrackTitle('Coldplay - Yellow.mp3')).toEqual({ artist: 'Coldplay', track: 'Yellow' })
})

test('מקף ארוך נתמך גם הוא', () => {
  expect(parseTrackTitle('Queen – Bohemian Rhapsody')).toEqual({
    artist: 'Queen',
    track: 'Bohemian Rhapsody'
  })
})

test('בלי מפריד — הכול הוא שם הרצועה', () => {
  expect(parseTrackTitle('Yellow.mp3')).toEqual({ artist: '', track: 'Yellow' })
})

test('מקף בתוך שם אינו מפריד', () => {
  // "Spider-Man" אינו אמן בשם Spider
  expect(parseTrackTitle('Spider-Man Theme.mp3')).toEqual({ artist: '', track: 'Spider-Man Theme' })
})

test('מספר רצועה מוביל אינו אמן', () => {
  expect(parseTrackTitle('03 - Yellow.mp3')).toEqual({ artist: '', track: 'Yellow' })
  expect(parseTrackTitle('03 - Coldplay - Yellow.mp3')).toEqual({
    artist: 'Coldplay',
    track: 'Yellow'
  })
})

test('שם עברי עובר שלם', () => {
  expect(parseTrackTitle('אהוד בנאי - עיר מקלט.mp3')).toEqual({
    artist: 'אהוד בנאי',
    track: 'עיר מקלט'
  })
})
