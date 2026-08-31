# Privacy policy

YouTube Tracklist to Spotify does not send data to the extension developer and does not use analytics, advertising, or tracking.

## Data handled by the extension

The extension processes timestamped text visible on supported YouTube video pages. This processing happens locally in Firefox. When the user explicitly asks to find or add a track, the relevant artist/title search text is sent directly to Spotify's Web API.

The extension uses Spotify OAuth. The Spotify client ID, OAuth access/refresh tokens, and selected playlist are stored locally using Firefox extension storage. Authentication tokens are sent only to Spotify to authorize API requests. No Spotify client secret is requested or stored.

The extension declares `authenticationInfo`, `searchTerms`, and `websiteContent` data-collection categories because those values must be transmitted to Spotify for its user-requested search, authentication, and playlist features. Spotify handles that data under its own privacy policy.

## Retention and sharing

The developer receives, retains, sells, or shares none of this data. Local settings remain in Firefox until the user disconnects Spotify, clears extension data, or removes the extension. Spotify's retention is governed by Spotify's policies.

## Contact

For privacy questions, open an issue in the project's public source repository.
