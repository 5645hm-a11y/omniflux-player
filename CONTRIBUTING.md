# Contributing to OmniFlux

Thanks for helping! Bug reports, translations and pull requests are all welcome.

## Before you start

- Open an issue first for anything larger than a small fix, so we can agree on the approach.
- Set up the project with the steps in the [README](README.md#build-from-source). Every API key is optional.

## Making a change

1. Branch from `main`.
2. Match the style of the code around you. TypeScript is strict. Comments explain *why*, not what, and most of the existing ones are in Hebrew; English is fine for new code.
3. Build, then test. The Playwright tests run against `out/`, so a stale build hides real results:
   ```sh
   npx electron-vite build
   npm run typecheck
   npm test
   ```
4. For playback changes, also run the live check, which measures real audio output: `node tools/qa/live-regression.cjs` (see [docs/QA_CHECKLIST.md](docs/QA_CHECKLIST.md)).
5. Open a pull request that says what changed and how you tested it.

## Translations

The UI strings live in `src/shared/i18n/locales/`. `fr.ts` is the source type, so a missing key in any other locale is a type error. The tests also flag untranslated keys.

## Never commit

- `.env` or any key, token or secret.
- Media files: `*.mp4` and `*.mkv` are already ignored.

By contributing, you agree that your contribution is licensed under the [GPL-3.0](LICENSE).
