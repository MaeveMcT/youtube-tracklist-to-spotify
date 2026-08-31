# Tracklist → Spotify (Firefox MVP)

**Version 0.1.3:** fixes timestamp detection when the first timestamp appears later in a line, such as `Trackliste 0:07 Artist - Track`. It retains v0.1.2 per-tab sessions and v0.1.1 explicit timestamp-range/Markdown-link parsing.

A Firefox extension that detects timestamped DJ-set tracklists on the YouTube video currently open, shows the track corresponding to the current playback time, searches Spotify for it, and adds it to a user-selected playlist.

## What it detects

The content script dynamically scans the current YouTube page for timestamped lists in:

- the video description / description metadata
- YouTube chapter panels
- loaded comments

It chooses the strongest coherent timestamp list and updates the current track every second. YouTube single-page navigation is handled, so switching to another video triggers a new scan.

This MVP does **not** yet call external tracklist databases. If a tracklist is only present in a comment, that comment must have been loaded by YouTube (scroll the comments if needed).

## Build and install temporarily in Firefox

Requires Node.js 20.19 or newer, npm, and Firefox 140 or newer.

```bash
npm ci
npm run check
npm run build
```

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on…**.
3. Choose `dist/manifest.json`.
4. Open the extension popup once and copy the **Redirect URI** it shows.

Temporary extensions disappear when Firefox restarts. See `BUILD.md` for development, packaging, and AMO submission instructions.

## Spotify setup

1. Create an app in the Spotify Developer Dashboard.
2. Copy its **Client ID** into the extension popup.
3. Copy the extension's displayed **Redirect URI** into the Spotify app's Redirect URIs allowlist **exactly**.
4. Save the Spotify app settings.
5. Back in Firefox, click **Connect Spotify**.
6. Choose your destination playlist.

The extension uses Authorization Code + PKCE. No Spotify client secret is stored in the extension.

Requested scopes:

- `playlist-read-private`
- `playlist-modify-private`
- `playlist-modify-public`

## Using it

Open a YouTube DJ set. A small panel appears at the lower-right of the page. When a timestamped tracklist is detected it shows:

- number of tracks detected
- source (description / chapters / comments)
- current track name
- current track time range
- **Add current track to Spotify** button

On click, the background script searches Spotify and only auto-adds when its simple artist/title match score is above the built-in confidence threshold.

## Known MVP limitations

- Tracklist extraction is DOM-based, so YouTube markup changes can require selector updates.
- Comments that YouTube has not loaded cannot be scanned.
- Multiple competing community tracklists may still be imperfectly ranked.
- Bootlegs, mashups, IDs, aliases, and spelling differences can produce no match or a low-confidence match.
- Low-confidence matches are deliberately not auto-added.
- Spotify Development Mode/account restrictions may apply to your Spotify developer app.

## Project layout

- `src/*.ts` — TypeScript content, background, and popup entry points
- `assets/` — Firefox manifest, HTML, CSS, and icon
- `scripts/` — build and AMO source-packaging scripts
- `dist/` — generated temporary add-on (not committed)
- `BUILD.md` — build, testing, packaging, and submission instructions
- `PRIVACY.md` — extension privacy policy and AMO disclosure details
- `AMO.md` — listing/reviewer notes and release checklist
