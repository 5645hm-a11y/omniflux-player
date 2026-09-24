# Security Policy

Please **do not** open a public issue for a vulnerability.

Report it privately through [GitHub Security Advisories](https://github.com/5645hm-a11y/omniflux-player/security/advisories/new). Include steps to reproduce, and we'll reply as soon as we can.

Only the latest release is supported.

## Scope notes

- OmniFlux has no server. Reports about the desktop app, its IPC bridge (`src/preload`), the updater and the OAuth flows are all in scope.
- Build-time API identifiers (`MAIN_VITE_*`) are compiled into the app and can be extracted from any desktop binary. That's expected; each one is restricted on the provider's side. Access tokens, refresh tokens and secrets that aren't meant to be public are in scope.
