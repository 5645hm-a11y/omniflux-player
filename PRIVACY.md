# Privacy Policy

_Last updated: September 24, 2026_

OmniFlux Player is a desktop app. **It has no server and no user accounts of its own, and it collects no analytics or telemetry.** Everything it stores stays on your computer, in `%APPDATA%\OmniFlux Player`.

## What stays on your computer

- Your library catalog: folder paths, file names, and the posters and details fetched for them.
- Settings, playlists, listening history and recommendations. History and recommendations are computed locally and never uploaded.
- Sign-in tokens for services you connect (Google Drive, Spotify, Deezer). They are used only to talk to that service directly.
- A cache of parts of Drive files you have watched. You can clear it in Settings.

## What is sent to third parties, and why

OmniFlux talks directly to these services. Each one's own privacy policy applies.

| Service | What is sent | When |
|---|---|---|
| **TMDB** (themoviedb.org) | Titles and years parsed from your file names; your search queries | Building the library, the home screen, and search |
| **Wikipedia / Wikidata** | Titles, for Hebrew names and posters | Building the library |
| **Groq** (api.groq.com) | File names the app could not parse on its own | Building the library, only if enabled at build time |
| **Google Drive** | Read-only requests for folders you add | Only after you connect Drive |
| **YouTube** (Google) | Your music search queries; video playback in the official embedded player | Searching or playing YouTube |
| **Deezer** | Music search queries; 30-second preview playback | Music search |
| **Spotify** | Search queries and playback commands | Only after you connect Spotify |
| **SubDL**, **LRCLIB** | The title of what you're playing | When you look for subtitles or lyrics |
| **GitHub** | A request for the latest version | Checking for updates |

With **Local content only** (Settings) on, OmniFlux stops sending searches, and shows only what you added yourself.

## Google user data

When you connect Google Drive, OmniFlux asks for `drive.readonly`. It uses it only to list and stream the media files in folders you choose. That data is never sent anywhere except between your computer and Google, is never stored on any server, is never used for advertising, and is never shared with or sold to anyone. OmniFlux's use of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

To revoke access at any time, disconnect in Settings or go to [myaccount.google.com/permissions](https://myaccount.google.com/permissions).

## Children

OmniFlux is not directed at children under 13 and does not knowingly collect data from anyone.

## Contact

Questions: open an issue at [github.com/5645hm-a11y/omniflux-player/issues](https://github.com/5645hm-a11y/omniflux-player/issues).
