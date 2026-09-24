/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly MAIN_VITE_TMDB_KEY?: string
  readonly MAIN_VITE_GOOGLE_API_KEY?: string
  readonly MAIN_VITE_GOOGLE_CLIENT_ID?: string
  readonly MAIN_VITE_GOOGLE_CLIENT_SECRET?: string
  readonly MAIN_VITE_GOOGLE_CSE_ID?: string
  readonly MAIN_VITE_GROQ_KEY?: string
  readonly MAIN_VITE_SPOTIFY_CLIENT_ID?: string
  readonly MAIN_VITE_DEEZER_APP_ID?: string
  readonly MAIN_VITE_YOUTUBE_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
