# Privacy policy

YouTube Tracklist to Spotify does not send data to the extension developer and does not use analytics, advertising, or tracking.

## Data handled by the extension

The extension processes timestamped text visible on supported YouTube video pages. This processing happens locally in Firefox. When the user explicitly asks to find or add a track, the relevant artist/title search text is sent directly to Spotify's Web API.

The extension uses Spotify OAuth. The Spotify client ID, OAuth access/refresh tokens, and selected playlist are stored locally using Firefox extension storage. Authentication tokens are sent only to Spotify to authorize API requests. No Spotify client secret is requested or stored.

The extension declares `authenticationInfo` and `websiteContent` data-collection categories because authentication tokens and artist/title text must be transmitted to Spotify for its user-requested authentication, search, and playlist features. The artist/title text is classified as website content because it is extracted from YouTube rather than entered into a browser or search engine. Spotify handles data under its [privacy policy](https://www.spotify.com/legal/privacy-policy/).

## Retention and sharing

The developer receives, retains, sells, or shares none of this data. Disconnecting Spotify removes OAuth tokens and the selected playlist; the client ID remains locally stored for reuse. All local extension data can be removed by clearing extension data or uninstalling the extension. Spotify's retention is governed by Spotify's policies.

## Contact

For privacy questions, [open an issue in the public source repository](https://github.com/MaeveMcT/youtube-tracklist-to-spotify/issues).
