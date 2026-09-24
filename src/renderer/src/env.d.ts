/// <reference types="vite/client" />
import type { CinemaApi } from '@shared/api'

declare global {
  interface Window {
    cinema: CinemaApi
  }
}
