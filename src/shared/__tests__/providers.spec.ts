import { expect, test } from '@playwright/test'
import { collapseProviders, providerBase, sameProvider } from '../providers'

/**
 * וריאנטים של אותו שירות.
 *
 * כותר בחיפוש הציג "Amazon Prime Video" ולצדו "…with Ads", ו-"HBO Max"
 * ולצדו "…Amazon Channel" — ארבעה תגים לשני שירותים.
 */

test('בסיס השם של וריאנט', () => {
  expect(providerBase('Netflix Standard with Ads')).toBe('Netflix')
  expect(providerBase('Amazon Prime Video with Ads')).toBe('Amazon Prime Video')
  expect(providerBase('HBO Max Amazon Channel')).toBe('HBO Max')
  expect(providerBase('Paramount Plus Apple TV Channel')).toBe('Paramount Plus')
  // שמות שאינם וריאנט נשארים כמו שהם
  expect(providerBase('Apple TV Store')).toBe('Apple TV Store')
  expect(providerBase('Amazon Video')).toBe('Amazon Video')
})

test('וריאנט יורד כשהבסיס באותה רשימה', () => {
  const names = ['Amazon Prime Video', 'HBO Max', 'Amazon Prime Video with Ads', 'HBO Max Amazon Channel']
  expect(collapseProviders(names, (n) => n)).toEqual(['Amazon Prime Video', 'HBO Max'])
})

test('וריאנט שהבסיס שלו חסר נשאר — אסור לאבד את המידע היחיד', () => {
  const names = ['HBO Max Amazon Channel', 'Apple TV Store']
  expect(collapseProviders(names, (n) => n)).toEqual(['HBO Max Amazon Channel', 'Apple TV Store'])
})

test('הקיבוץ לפי סוג: אותו שירות במנוי ובהשכרה אינם כפילות', () => {
  const list = [
    { name: 'Netflix', kind: 'flatrate' },
    { name: 'Netflix Standard with Ads', kind: 'rent' }
  ]
  expect(collapseProviders(list, (w) => w.name, (w) => w.kind)).toHaveLength(2)
})

test('מנוי לשירות מכסה גם את הווריאנטים שלו', () => {
  expect(sameProvider('Netflix', 'Netflix Standard with Ads')).toBe(true)
  expect(sameProvider('netflix', 'NETFLIX')).toBe(true)
  expect(sameProvider('Netflix', 'Disney Plus')).toBe(false)
})
