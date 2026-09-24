import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: ['tests/**/*.spec.ts', 'src/**/__tests__/**/*.spec.ts'],
  timeout: 120_000,
  expect: { timeout: 15_000 },
  // הבדיקות מפעילות את התוכנה ואת המנוע — במקביל הן נלחמות על החלון
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: { trace: 'off' }
})
