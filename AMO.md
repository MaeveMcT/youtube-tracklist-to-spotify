# AMO listing notes

## Suggested summary

Detect timestamped tracklists on YouTube DJ sets and add the currently playing track to a Spotify playlist.

YouTube Tracklist to Spotify is not affiliated with, endorsed by, or sponsored by YouTube or Spotify.

## Suggested description

YouTube Tracklist to Spotify detects timestamped tracklists in YouTube video descriptions, chapters, and loaded comments. Its YouTube player button opens a card showing the track at the current playback position. When you click **Add current track to Spotify**, the add-on sends that track's artist/title text directly to Spotify to find a match and add it to your chosen playlist.

Setup requires your own Spotify developer Client ID and Spotify account. Spotify authentication tokens are sent only to Spotify and stored locally in Firefox. YouTube tracklist parsing happens locally; the developer does not receive browsing data, credentials, analytics, or track searches. See the [privacy policy](https://github.com/MaeveMcT/youtube-tracklist-to-spotify/blob/main/PRIVACY.md) for details.

## Reviewer notes

- All executable source is in `src/` and is written in TypeScript.
- `scripts/build.mjs` uses esbuild only to transpile and bundle the three entry points. Output is not minified and no remote code is loaded.
- Reproduce the submitted files with Node.js 24 and npm 11 by running `npm ci && npm run build`.
- Spotify authorization uses Authorization Code with PKCE; the add-on never asks for a client secret.
- YouTube text is parsed locally. Track search text is sent to Spotify only after the user clicks the add button.
- The extension makes network requests only to the hosts listed in `host_permissions`.

## Reviewer test procedure

1. Build and load `dist/manifest.json` in Firefox 140 or newer.
2. Open the extension popup and copy its redirect URI into a Spotify developer app.
3. Enter the app's public Client ID, connect the Spotify account that owns that developer app, and choose an editable playlist.
4. Open the public YouTube test video supplied in the private AMO reviewer notes.
5. Confirm that the card detects its timestamped tracklist, follows playback, and adds the current track to the chosen playlist.

This is a bring-your-own-account integration: the add-on developer does not operate a Spotify app, user service, or shared test account. Each user—including a reviewer—creates their own Spotify developer app and authenticates their own Spotify account. A Spotify client secret is neither needed nor accepted. The AMO submission should explain this architecture and provide the stable public test-video URL, but should not contain Spotify credentials. If a reviewer cannot use a third-party account, ask them to contact the developer through the AMO review thread so an alternative test can be coordinated.

## Data disclosure

Declare authentication information and website content as required data. Authentication tokens and YouTube-derived artist/title text are transmitted directly to Spotify for user-requested authentication, track search, and playlist operations. The artist/title is website content, not a search term entered by the user. The developer does not receive data. Use `PRIVACY.md` as the policy text and ensure the hosted listing policy remains identical.

## Release checklist

- The final extension ID is `youtube-tracklist-to-spotify@extension.local`; changing it changes the Spotify redirect URI and Firefox storage identity.
- Use `https://github.com/MaeveMcT/youtube-tracklist-to-spotify/blob/main/PRIVACY.md` as the hosted privacy-policy URL.
- Explain the bring-your-own-Spotify-account flow and add a stable public YouTube test video to the private AMO reviewer notes.
- Confirm name/trademark presentation and listing artwork.
- Select Firefox desktop only; Firefox for Android is not currently supported or tested.
- Add at least one tested screenshot and complete AMO categories/tags.
- Upload both archives from `web-ext-artifacts/` when source submission is requested.
