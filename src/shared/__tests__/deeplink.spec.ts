import { expect, test } from '@playwright/test'
import { serviceLink, signupLink } from '../deeplink'

/**
 * קישור ישיר לשירות.
 *
 * ‏TMDB מחזיר קישור אחד — דף JustWatch של הכותר — ולכן לחיצה על
 * "Prime Video" הובילה לאתר צד שלישי במקום לשירות עצמו. כאן נבנית
 * הכתובת אל השירות, וזה מה שהבדיקה שומרת.
 */

test('שירותים מוכרים מקבלים כתובת של עצמם', () => {
  const cases: Array<[string, string]> = [
    ['Netflix', 'netflix.com'],
    ['Amazon Prime Video', 'primevideo.com'],
    ['Apple TV', 'tv.apple.com'],
    ['Disney Plus', 'disneyplus.com'],
    ['HBO Max', 'play.max.com'],
    ['Canal+', 'canalplus.com'],
    ['Molotov TV', 'molotov.tv'],
    ['Google Play Movies', 'play.google.com'],
    ['YouTube', 'youtube.com'],
    ['Crunchyroll', 'crunchyroll.com']
  ]
  for (const [provider, host] of cases) {
    const url = serviceLink(provider, 'The Matrix')
    expect(url, `${provider} לא קיבל קישור`).toBeTruthy()
    expect(url, `${provider} הופנה למקום הלא נכון`).toContain(host)
  }
})

test('אף קישור אינו מפנה ל-TMDB או JustWatch', () => {
  for (const p of ['Netflix', 'Apple TV', 'HBO Max', 'SFR Play']) {
    expect(serviceLink(p, 'Dune')).not.toMatch(/themoviedb|justwatch/i)
  }
})

test('הכותר מקודד לכתובת', () => {
  // רווחים, גרשיים ותווים לא לטיניים חייבים לשרוד את המעבר
  const url = serviceLink('Netflix', "L'Odyssée & co")!
  expect(url).not.toContain(' ')
  expect(url).toContain(encodeURIComponent("L'Odyssée & co"))

  const he = serviceLink('Netflix', 'מטריקס')!
  expect(he).toContain(encodeURIComponent('מטריקס'))
})

test('שירות לא מוכר מחזיר null ולא כתובת שבורה', () => {
  // ‏null אינו כישלון: הממשק נופל אז לקישור של TMDB
  expect(serviceLink('Some Local Service', 'Dune')).toBeNull()
  expect(serviceLink('', 'Dune')).toBeNull()
})

test('ההתאמה אינה תלויה באותיות גדולות', () => {
  expect(serviceLink('netflix', 'x')).toBe(serviceLink('Netflix', 'x'))
  expect(serviceLink('APPLE TV+', 'x')).toContain('tv.apple.com')
})

test('שירותים מרכזיים מקבלים דף הרשמה רשמי', () => {
  expect(signupLink('Netflix')).toContain('netflix.com/signup')
  expect(signupLink('Disney Plus')).toContain('disneyplus.com/sign-up')
  expect(signupLink('Canal+')).toContain('boutique.canalplus.com')
  expect(signupLink('Some Local Service')).toBeNull()
})
