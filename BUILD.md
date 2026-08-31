# Build, development, and AMO submission

## Requirements and build environment

- [Node.js](https://nodejs.org/en/download) 24.x
- npm 11.x (included with Node.js 24)
- [Firefox](https://www.firefox.com/) 140 or newer for desktop testing
- [`zip`](https://infozip.sourceforge.net/) (only for the AMO source archive)

Release artifacts are built on macOS 26.5 ARM64 with Node.js 24.20.0 and npm 11.19.0. The build uses no OS-specific inputs and is also intended to reproduce in Mozilla's documented Ubuntu 24.04 ARM64 reviewer environment with Node.js 24 and npm 11. Firefox for Android is not currently supported or tested.

## Reproducible setup and checks

```bash
npm ci
npm run check
```

`npm run check` type-checks the TypeScript, builds `dist/`, and runs Mozilla's `web-ext lint` against the built extension.

## Load as a temporary add-on

```bash
npm run build
```

Then open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on…**, and select `dist/manifest.json`. After rebuilding, click **Reload** on that page.

Useful development commands:

```bash
npm run watch   # rebuild TypeScript when a source file changes
npm start       # build and launch a Firefox profile with web-ext
```

Static extension files live in `assets/`; TypeScript lives in `src/`. The build copies static files and emits reviewable, non-minified JavaScript into `dist/`.

## Create AMO upload archives

```bash
npm run package
npm run package:source
```

The signed-add-on candidate and its corresponding source archive are written to `web-ext-artifacts/`. `manifest.json` is at the root of the add-on ZIP. The source archive includes the lockfile and these instructions so an AMO reviewer can reproduce the submitted code with:

```bash
npm ci
npm run build
```

The resulting `dist/` files must match the files in the submitted extension archive byte-for-byte.

Before submitting a release:

1. Keep the versions in `package.json` and `assets/manifest.json` identical.
2. Run `npm ci && npm run check` from a clean checkout.
3. Test Spotify login, playlist loading, track search, and adding a track in Firefox.
4. Test YouTube single-page navigation and description/chapter/comment tracklists.
5. Run both packaging commands and inspect both archives.
6. Upload the extension ZIP to AMO and attach the source ZIP when requested.
7. Complete AMO's data disclosures consistently with `PRIVACY.md` and the manifest categories.
8. Supply listing copy, screenshots, support/contact links, and a hosted privacy-policy URL.

Do not commit `dist/`, `web-ext-artifacts/`, credentials, OAuth tokens, or a Spotify client secret.
