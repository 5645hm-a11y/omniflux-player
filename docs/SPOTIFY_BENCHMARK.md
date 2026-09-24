# OmniFlux Spotify capability benchmark

Updated: 2026-08-24

## Implemented

| Spotify desktop capability | OmniFlux implementation |
| --- | --- |
| Full Premium playback | Spotify Web Playback SDK on an isolated background `BrowserWindow`, backed by CastLabs ECS/Widevine. The Web API transfers the requested Spotify URI to the embedded device. |
| Background playback | The playback surface uses `backgroundThrottling: false`, remains alive while navigating, and is destroyed on disconnect or application exit. |
| Transport | Play/pause, previous, next, millisecond seek, volume, shuffle, repeat off/all/one. |
| Queue | Read the current queue and add Spotify tracks to it. |
| Personalisation | Current user's short-term Top Tracks via `/me/top/tracks`. |
| Daily mixes | Personal mix/Discover Weekly/Release Radar playlists are selected from `/me/playlists` when Spotify exposes them to the user. |
| Library | Liked Songs, save/remove through the unified 2026 `/me/library` endpoint. |
| Playlists | Private and collaborative playlists plus creation through `POST /me/playlists`. |
| Artists | Followed artists, artist profile, albums and singles. Five artist tracks are selected from exact-artist catalog search. |
| Albums | Cover, artist, release year, full tracklist, per-track duration and calculated total duration. |
| Lyrics | LRCLIB lookup uses Spotify's real title, artist and full duration; synced lines auto-scroll and highlight. |
| Active feedback | Full-duration progress, animated equalizer, active-track highlight and Spotify attribution. |

## Spotify platform changes and honest substitutions

Spotify's February 2026 API migration removed `GET /artists/{id}/top-tracks` and the related-artists endpoint from the supported endpoint set. OmniFlux therefore does not fabricate popularity or related-artist data. Artist highlights use an exact-artist catalog search and are labelled “Artist tracks”, not “Top tracks”.

The general Recommendations and Browse chart surfaces are not part of the post-migration supported endpoint set. OmniFlux uses the authenticated user's Top Items and personal playlists for recommendation shelves, while global music charts remain clearly attributed to Deezer. There is no fake “regional Spotify chart”.

## Runtime requirements

- Full Spotify audio requires a Spotify Premium user and a Spotify application client ID.
- Existing OAuth sessions created before scope version 3 must reconnect once.
- CastLabs ECS downloads/updates the Widevine component on first Spotify playback. That first playback therefore requires network access and may take longer.
- Production distribution of DRM-capable binaries and VMP signing remains subject to CastLabs/Spotify terms. Development binaries are not a substitute for production VMP signing.
- If DRM, Premium entitlement or the SDK is unavailable, OmniFlux reports the entitlement error and offers account/subscription actions. It never silently substitutes a 30-second preview for a requested Spotify track.
- Spotify's published policy says the Web Playback SDK requires Premium and commercial streaming integrations require prior approval. A production release must complete that provider review; the technical integration does not grant distribution rights.
