# AMO listing notes

## Suggested summary

Detect timestamped tracklists on YouTube DJ sets and add the currently playing track to a Spotify playlist.

YouTube Tracklist to Spotify is not affiliated with, endorsed by, or sponsored by YouTube or Spotify.

## Reviewer notes

- All executable source is in `src/` and is written in TypeScript.
- `scripts/build.mjs` uses esbuild only to transpile and bundle the three entry points. Output is not minified and no remote code is loaded.
- Reproduce the submitted files with `npm ci && npm run build`.
- Spotify authorization uses Authorization Code with PKCE; the add-on never asks for a client secret.
- YouTube text is parsed locally. Track search text is sent to Spotify only after the user clicks the add button.
- The extension makes network requests only to the hosts listed in `host_permissions`.

## Data disclosure

Declare authentication information, search terms, and website content as required data. Their transmission is necessary for user-requested Spotify authentication, track search, and playlist operations. The developer does not receive data. Use `PRIVACY.md` as the policy text and ensure the hosted listing policy remains identical.

## Release checklist

- The final extension ID is `youtube-tracklist-to-spotify@extension.local`; changing it changes the Spotify redirect URI and Firefox storage identity.
- Replace the placeholder contact sentence in `PRIVACY.md` with the actual public repository/support link.
- Confirm name/trademark presentation and listing artwork.
- Add at least one tested screenshot and complete AMO categories/tags.
- Upload both archives from `web-ext-artifacts/` when source submission is requested.
