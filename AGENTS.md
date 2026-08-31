# Repository guidance

## Scope

This repository builds a Firefox Manifest V3 extension for desktop Firefox 140+. TypeScript source lives in `src/`; static extension files live in `assets/`. `scripts/build.mjs` produces the loadable extension in `dist/`.

Treat `dist/`, `web-ext-artifacts/`, and `node_modules/` as generated content. Change their source files instead.

## Workflow

1. Read the relevant source and its existing tests before editing.
2. Keep changes narrow; preserve YouTube single-page navigation, extension-reload cleanup, and coexistence with controls injected by other extensions.
3. Add or update a behavior-level test for regressions. Tests should exercise rendered DOM or extension-message boundaries rather than private implementation details.
4. Run `npm run check`. Work is complete when TypeScript, Node tests, and `web-ext lint` all pass with no findings.

Use Node.js 24 and npm 11. Load `dist/manifest.json` from `about:debugging` for manual testing.

## Architecture constraints

- `src/content.ts` parses tracklists, tracks playback, and owns the YouTube card/player control.
- `src/background.ts` owns Spotify OAuth, tokens, API requests, playlist selection, and tab sessions.
- `src/popup.ts` owns setup and restoration of the YouTube card.
- Keep the extension self-contained: executable code ships in the package; network requests go only to declared HTTPS Spotify endpoints.
- Keep permissions minimal. A new permission needs a concrete runtime use and corresponding AMO disclosure.
- Preserve the extension ID `youtube-tracklist-to-spotify@extension.local`; changing it changes Firefox storage identity and Spotify redirect URIs.

## Privacy and Spotify

The integration is bring-your-own-account. Users provide a public Spotify Client ID and authenticate with Authorization Code plus PKCE. The extension never requests or stores a Spotify client secret.

YouTube tracklist text is processed locally. Artist/title text is sent to Spotify only after the user explicitly clicks the add control. Authentication tokens and website content are the required Firefox data categories. Keep `assets/manifest.json`, `PRIVACY.md`, and `AMO.md` consistent whenever data handling changes.

Store credentials and OAuth tokens only in Firefox extension storage. Keep secrets, tokens, local `.env` files, and reviewer credentials out of Git and build archives.

## Release and AMO

When changing a release version, update both `package.json` and `assets/manifest.json`.

For build, packaging, or source-reproduction work, read `BUILD.md` completely. For AMO listing, reviewer instructions, data disclosures, or publication work, read `AMO.md` and `PRIVACY.md` completely.

Before submission, run the release checks and generate both archives:

```bash
npm run check
npm run package
npm run package:source
```

The extension archive and matching reviewer source archive are written to `web-ext-artifacts/` and remain untracked.
