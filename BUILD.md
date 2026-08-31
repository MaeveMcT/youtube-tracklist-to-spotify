# Build and install instructions

## Requirements

- Firefox
- A Spotify Developer app / Client ID
- `zip` if you want to create an install archive from the command line

No Node.js, npm, bundler, transpiler, or build step is required. This extension is plain HTML/CSS/JavaScript.

## Development install in Firefox

1. Download and unzip the source folder.
2. Open Firefox and go to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…**.
4. Select the `manifest.json` file in the source folder.
5. Open a YouTube video/set and click the extension icon.
6. Configure the Spotify Client ID and redirect URI as described in `README.md`.

When you edit `content.js`, `background.js`, `popup.js`, CSS, or HTML, return to `about:debugging` and click **Reload** for the extension.

## Create a correctly structured ZIP

The important rule is that `manifest.json` must be at the root of the ZIP, not inside a parent directory.

From inside the source directory:

```bash
cd tracklist-to-spotify-firefox-source-v0.1.2
zip -r ../tracklist-to-spotify-firefox-v0.1.2.zip \
  manifest.json \
  background.js \
  content.js \
  content.css \
  popup.html \
  popup.js \
  popup.css \
  README.md
```

Verify the ZIP layout:

```bash
unzip -l ../tracklist-to-spotify-firefox-v0.1.2.zip
```

You should see `manifest.json` directly in the archive root.

## Optional validation

Validate JSON:

```bash
python3 -m json.tool manifest.json >/dev/null
```

Check JavaScript syntax if Node.js is installed:

```bash
node --check background.js
node --check content.js
node --check popup.js
```

## Spotify setup

1. Create an app in the Spotify Developer Dashboard.
2. Enable Web API access.
3. Load the extension once and copy the exact Redirect URI shown in its popup.
4. Add that exact URI to the Spotify app's Redirect URIs.
5. Copy the Spotify Client ID into the extension popup.
6. Click **Connect Spotify** and approve access.
7. Choose a target playlist.

The extension uses Authorization Code with PKCE, so no Spotify Client Secret is stored in the extension.

## Project structure

```text
manifest.json    Firefox extension manifest
background.js    Spotify OAuth/API calls and per-tab session state
content.js       YouTube detection, tracklist parsing, timestamp matching, UI
content.css      Injected YouTube card/button styling
popup.html       Extension settings popup
popup.js         Spotify connection and playlist selection UI
popup.css        Popup styling
README.md        Usage/setup overview
BUILD.md         These build instructions
```

## Parser regression cases (v0.1.3)

The parser now accepts a timestamp later in a line, for example:

```text
Trackliste 0:07 Headhunterz & Vertile - Before I Wake
```

It still supports explicit timestamp ranges and Markdown-linked YouTube timestamps.
