import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

test('Windows exposes only the branded OmniFlux taskbar window', () => {
  const main = fs.readFileSync(path.join(root, 'src/main/index.ts'), 'utf8')
  const playerWindow = fs.readFileSync(path.join(root, 'src/main/window/player.ts'), 'utf8')
  const mpv = fs.readFileSync(path.join(root, 'src/main/engine/mpv.ts'), 'utf8')
  const builder = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8')
  const spotifyPlayback = fs.readFileSync(path.join(root, 'src/main/services/spotify-web-playback.ts'), 'utf8')
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { devDependencies: { electron: string } }

  expect(main).toContain("app.setAppUserModelId('com.avisharabi.omniflux')")
  expect(playerWindow).toContain("path.join(process.resourcesPath, 'app-icon.png')")
  expect(playerWindow).toContain('icon,')
  expect(mpv).toContain("'--show-in-taskbar=no'")
  expect(builder).toContain('to: app-icon.png')
  expect(spotifyPlayback).toContain('skipTaskbar: true')
  expect(spotifyPlayback).toContain('nodeIntegration: false')
  expect(spotifyPlayback).toContain('sandbox: true')
  expect(spotifyPlayback).toContain('plugins: true')
  expect(main).toContain('components.whenReady()')
  expect(pkg.devDependencies.electron).toContain('castlabs/electron-releases')
})
