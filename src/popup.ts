const $ = (s) => document.querySelector(s);
const clientId = $("#clientId"), redirectUri = $("#redirectUri"), connect = $("#connect"), logout = $("#logout");
const authStatus = $("#authStatus"), playlist = $("#playlist"), playlistStatus = $("#playlistStatus");
const showCard = $("#showCard"), cardStatus = $("#cardStatus");

init().catch(showError);

showCard.addEventListener("click", async () => {
  cardStatus.textContent = "";
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id == null) throw new Error("No active tab found.");
    await browser.tabs.sendMessage(tab.id, { type: "card:show" });
    cardStatus.textContent = "✓ Card shown on this YouTube tab";
  } catch {
    cardStatus.textContent = "⚠ Open a supported YouTube video first.";
  }
});

async function init() {
  const status = await browser.runtime.sendMessage({ type: "spotify:get-status" });
  redirectUri.value = status.redirectUri || "";
  const stored = await browser.storage.local.get("spotifyClientId");
  clientId.value = stored.spotifyClientId || "";
  authStatus.textContent = status.loggedIn ? "✓ Spotify connected" : "Spotify not connected";
  connect.textContent = status.loggedIn ? "Reconnect Spotify" : "Connect Spotify";
  logout.disabled = !status.loggedIn;
  if (status.loggedIn) await loadPlaylists(status.playlistId);
}

$("#saveClient").addEventListener("click", async () => {
  try { await browser.runtime.sendMessage({ type:"spotify:set-client-id", clientId:clientId.value }); authStatus.textContent="Client ID saved."; }
  catch (e) { showError(e); }
});

$("#copyRedirect").addEventListener("click", async () => {
  await navigator.clipboard.writeText(redirectUri.value);
  authStatus.textContent = "Redirect URI copied.";
});

connect.addEventListener("click", async () => {
  try {
    connect.disabled = true; authStatus.textContent = "Opening Spotify…";
    if (clientId.value.trim()) await browser.runtime.sendMessage({ type:"spotify:set-client-id", clientId:clientId.value });
    await browser.runtime.sendMessage({ type:"spotify:login" });
    authStatus.textContent = "✓ Spotify connected"; logout.disabled = false;
    await loadPlaylists();
  } catch (e) { showError(e); }
  finally { connect.disabled = false; }
});

logout.addEventListener("click", async () => {
  await browser.runtime.sendMessage({ type:"spotify:logout" });
  authStatus.textContent = "Spotify disconnected";
  playlist.innerHTML = '<option value="">Connect Spotify first</option>';
  logout.disabled = true;
});

$("#refresh").addEventListener("click", () => loadPlaylists().catch(showError));
playlist.addEventListener("change", async () => {
  const opt = playlist.selectedOptions[0];
  if (!opt?.value) return;
  await browser.runtime.sendMessage({ type:"spotify:set-playlist", playlistId:opt.value, playlistName:opt.textContent });
  playlistStatus.textContent = `✓ Saving to ${opt.textContent}`;
});

async function loadPlaylists(selectedId = null) {
  playlistStatus.textContent = "Loading playlists…";
  const data = await browser.runtime.sendMessage({ type:"spotify:get-playlists" });
  const status = await browser.runtime.sendMessage({ type:"spotify:get-status" });
  selectedId = selectedId || status.playlistId;
  playlist.innerHTML = '<option value="">Choose a playlist…</option>';
  for (const p of data.playlists || []) {
    const opt = document.createElement("option"); opt.value = p.id; opt.textContent = p.name;
    if (p.id === selectedId) opt.selected = true;
    playlist.appendChild(opt);
  }
  playlistStatus.textContent = selectedId && status.playlistName ? `✓ Saving to ${status.playlistName}` : `${data.playlists?.length || 0} playlists found`;
}

function showError(err) { authStatus.textContent = `⚠ ${err?.message || err}`; }
