import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'

// טרמינל של VS Code יורש ELECTRON_RUN_AS_NODE=1, ואז Electron עולה
// כ-Node רגיל ו-require('electron') מחזיר נתיב במקום את ה-API
delete process.env.ELECTRON_RUN_AS_NODE

const alias = {
  '@': resolve(__dirname, 'src/renderer/src'),
  '@shared': resolve(__dirname, 'src/shared'),
  '@legacy': resolve(__dirname, 'src/legacy_services')
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: { rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') } } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: { rollupOptions: { input: { index: resolve(__dirname, 'src/preload/index.ts') } } }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: { alias },
    plugins: [react(), tailwind()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          spotifyPlayer: resolve(__dirname, 'src/renderer/spotify-player.html'),
          deezerPlayer: resolve(__dirname, 'src/renderer/deezer-player.html'),
          deezerChannel: resolve(__dirname, 'src/renderer/deezer-channel.html')
        }
      }
    }
  }
})
