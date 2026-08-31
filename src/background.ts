const SPOTIFY_ACCOUNTS = "https://accounts.spotify.com";
const SPOTIFY_API = "https://api.spotify.com/v1";
const SCOPES = [
  "playlist-read-private",
  "playlist-modify-private",
  "playlist-modify-public"
].join(" ");

const tabSessions = new Map();

browser.tabs.onRemoved.addListener((tabId) => {
  tabSessions.delete(tabId);
});

browser.runtime.onMessage.addListener(async (message, sender) => {
  const tabId = sender?.tab?.id;
  switch (message?.type) {
    case "tab-session:get": return getTabSession(tabId, message.videoId);
    case "tab-session:update": return updateTabSession(tabId, message.session);
    case "tab-session:clear": return clearTabSession(tabId);
    case "spotify:get-status": return getStatus();
    case "spotify:set-client-id": return setClientId(message.clientId);
    case "spotify:login": return spotifyLogin();
    case "spotify:logout": return spotifyLogout();
    case "spotify:get-playlists": return getPlaylists();
    case "spotify:set-playlist": return setPlaylist(message.playlistId, message.playlistName);
    case "spotify:search-track": return searchTrack(message.track);
    case "spotify:add-track": return addTrack(message.uri);
    case "spotify:get-redirect-uri": return { redirectUri: browser.identity.getRedirectURL() };
    default: return undefined;
  }
});

function getTabSession(tabId, videoId) {
  if (tabId == null) return { session: null };
  const session = tabSessions.get(tabId) || null;
  if (!session) return { session: null };
  if (videoId && session.videoId !== videoId) return { session: null };
  return { session };
}

function updateTabSession(tabId, session) {
  if (tabId == null || !session?.videoId) return { ok: false };
  tabSessions.set(tabId, {
    videoId: session.videoId,
    tracklist: Array.isArray(session.tracklist) ? session.tracklist : [],
    source: session.source || "",
    currentTrack: session.currentTrack || null,
    href: session.href || "",
    updatedAt: Date.now()
  });
  return { ok: true };
}

function clearTabSession(tabId) {
  if (tabId != null) tabSessions.delete(tabId);
  return { ok: true };
}

async function setClientId(clientId) {
  clientId = String(clientId || "").trim();
  if (!clientId) throw new Error("Enter your Spotify Client ID.");
  await browser.storage.local.set({ spotifyClientId: clientId });
  return { ok: true };
}

async function getStatus() {
  const data = await browser.storage.local.get([
    "spotifyClientId", "spotifyTokens", "spotifyPlaylistId", "spotifyPlaylistName"
  ]);
  return {
    hasClientId: Boolean(data.spotifyClientId),
    loggedIn: Boolean(data.spotifyTokens?.refresh_token || data.spotifyTokens?.access_token),
    playlistId: data.spotifyPlaylistId || null,
    playlistName: data.spotifyPlaylistName || null,
    redirectUri: browser.identity.getRedirectURL()
  };
}

async function spotifyLogin() {
  const { spotifyClientId } = await browser.storage.local.get("spotifyClientId");
  if (!spotifyClientId) throw new Error("Save a Spotify Client ID first.");

  const redirectUri = browser.identity.getRedirectURL();
  const verifier = randomString(64);
  const challenge = await sha256Base64Url(verifier);
  const state = randomString(24);
  await browser.storage.local.set({ spotifyPkceVerifier: verifier, spotifyOauthState: state });

  const params = new URLSearchParams({
    client_id: spotifyClientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SCOPES,
    code_challenge_method: "S256",
    code_challenge: challenge,
    state,
    show_dialog: "true"
  });

  const responseUrl = await browser.identity.launchWebAuthFlow({
    url: `${SPOTIFY_ACCOUNTS}/authorize?${params}`,
    interactive: true
  });

  if (!responseUrl) throw new Error("Spotify login did not return a callback URL.");
  const callback = new URL(responseUrl);
  const error = callback.searchParams.get("error");
  if (error) throw new Error(`Spotify authorization failed: ${error}`);
  const code = callback.searchParams.get("code");
  const returnedState = callback.searchParams.get("state");

  const stored = await browser.storage.local.get(["spotifyPkceVerifier", "spotifyOauthState"]);
  if (!code || returnedState !== stored.spotifyOauthState) throw new Error("Spotify OAuth state check failed.");

  const tokenResponse = await fetch(`${SPOTIFY_ACCOUNTS}/api/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: spotifyClientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: stored.spotifyPkceVerifier
    })
  });
  const tokenBody = await tokenResponse.json();
  if (!tokenResponse.ok) throw new Error(tokenBody.error_description || tokenBody.error || "Spotify token exchange failed.");

  await saveTokens(tokenBody);
  await browser.storage.local.remove(["spotifyPkceVerifier", "spotifyOauthState"]);
  return { ok: true };
}

async function spotifyLogout() {
  await browser.storage.local.remove(["spotifyTokens", "spotifyPlaylistId", "spotifyPlaylistName"]);
  return { ok: true };
}

async function saveTokens(body, oldRefreshToken = null) {
  const tokens = {
    access_token: body.access_token,
    refresh_token: body.refresh_token || oldRefreshToken,
    expires_at: Date.now() + Math.max(30, Number(body.expires_in || 3600) - 60) * 1000
  };
  await browser.storage.local.set({ spotifyTokens: tokens });
  return tokens;
}

async function getAccessToken() {
  const { spotifyClientId, spotifyTokens } = await browser.storage.local.get(["spotifyClientId", "spotifyTokens"]);
  if (!spotifyClientId || !spotifyTokens) throw new Error("Connect Spotify first.");
  if (spotifyTokens.access_token && Date.now() < (spotifyTokens.expires_at || 0)) return spotifyTokens.access_token;
  if (!spotifyTokens.refresh_token) throw new Error("Spotify session expired. Connect again.");

  const res = await fetch(`${SPOTIFY_ACCOUNTS}/api/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: spotifyClientId,
      grant_type: "refresh_token",
      refresh_token: spotifyTokens.refresh_token
    })
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error_description || body.error || "Could not refresh Spotify session.");
  const updated = await saveTokens(body, spotifyTokens.refresh_token);
  return updated.access_token;
}

async function spotifyFetch(path, options: RequestInit = {}) {
  const token = await getAccessToken();
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(`${SPOTIFY_API}${path}`, { ...options, headers });
  let body = null;
  const text = await res.text();
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  if (!res.ok) {
    const message = body?.error?.message || body?.error_description || `Spotify API error ${res.status}`;
    throw new Error(message);
  }
  return body;
}

async function getPlaylists() {
  const all = [];
  let offset = 0;
  for (let page = 0; page < 20; page++) {
    const body = await spotifyFetch(`/me/playlists?limit=50&offset=${offset}`);
    for (const p of body?.items || []) {
      if (p?.id) all.push({ id: p.id, name: p.name, owner: p.owner?.display_name || "", collaborative: Boolean(p.collaborative) });
    }
    if (!body?.next) break;
    offset += 50;
  }
  return { playlists: all };
}

async function setPlaylist(playlistId, playlistName) {
  if (!playlistId) throw new Error("Choose a playlist.");
  await browser.storage.local.set({ spotifyPlaylistId: playlistId, spotifyPlaylistName: playlistName || "" });
  return { ok: true };
}

function cleanSearchText(s) {
  return String(s || "")
    .replace(/\b(?:official\s+)?(?:music\s+)?video\b/ig, " ")
    .replace(/\[(?:[^\]]+)\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripVersionSuffix(s) {
  return s.replace(/\s*[\[(](?:[^\])]*(?:bootleg|mashup|live edit|edit|refix|re-fixx|rekick|remix|vip|version)[^\])]*)[\])]/ig, " ").replace(/\s+/g, " ").trim();
}

async function searchTrack(track) {
  if (!track?.raw) throw new Error("No current track was detected.");
  const artist = cleanSearchText(track.artist || "");
  const title = cleanSearchText(track.title || track.raw);
  const searches = [];
  if (artist && title) searches.push(`track:${title} artist:${artist}`);
  if (artist && title) searches.push(`${artist} ${title}`);
  const stripped = stripVersionSuffix(title);
  if (artist && stripped && stripped !== title) searches.push(`${artist} ${stripped}`);
  searches.push(cleanSearchText(track.raw));

  const seen = new Set();
  const candidates = [];
  for (const q of searches) {
    if (!q || seen.has(q.toLowerCase())) continue;
    seen.add(q.toLowerCase());
    const body = await spotifyFetch(`/search?type=track&limit=5&q=${encodeURIComponent(q)}`);
    for (const item of body?.tracks?.items || []) {
      if (!item?.uri || candidates.some(c => c.uri === item.uri)) continue;
      candidates.push({
        uri: item.uri,
        id: item.id,
        name: item.name,
        artists: (item.artists || []).map(a => a.name).join(", "),
        album: item.album?.name || "",
        url: item.external_urls?.spotify || `https://open.spotify.com/track/${item.id}`,
        score: scoreCandidate(track, item)
      });
    }
    if (candidates.some(c => c.score >= 0.9)) break;
  }
  candidates.sort((a, b) => b.score - a.score);
  return { candidates: candidates.slice(0, 5), best: candidates[0] || null };
}

function norm(s) {
  return String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
}
function tokens(s) { return new Set(norm(s).split(/\s+/).filter(Boolean)); }
function overlap(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let hit = 0; for (const x of A) if (B.has(x)) hit++;
  return hit / Math.max(A.size, B.size);
}
function scoreCandidate(track, item) {
  const itemArtists = (item.artists || []).map(a => a.name).join(" ");
  const titleScore = overlap(track.title || track.raw, item.name);
  const artistScore = track.artist ? overlap(track.artist, itemArtists) : 0.5;
  return Math.min(1, titleScore * 0.68 + artistScore * 0.32);
}

async function addTrack(uri) {
  const { spotifyPlaylistId, spotifyPlaylistName } = await browser.storage.local.get(["spotifyPlaylistId", "spotifyPlaylistName"]);
  if (!spotifyPlaylistId) throw new Error("Choose a Spotify playlist in the extension popup first.");
  if (!uri) throw new Error("No Spotify track selected.");
  await spotifyFetch(`/playlists/${encodeURIComponent(spotifyPlaylistId)}/items`, {
    method: "POST",
    body: JSON.stringify({ uris: [uri] })
  });
  return { ok: true, playlistName: spotifyPlaylistName || "playlist" };
}

function randomString(length) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, b => chars[b % chars.length]).join("");
}
async function sha256Base64Url(input) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  const bytes = new Uint8Array(digest);
  let binary = ""; for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
