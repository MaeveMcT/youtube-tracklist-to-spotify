(() => {
  type TrackEntry = {
    seconds: number;
    timestamp: string;
    endSeconds: number | null;
    endTimestamp: string | null;
    raw: string;
    artist: string;
    title: string;
  };

  const extensionWindow = window as typeof window & { __tracklistToSpotifyLoaded?: boolean };
  if (extensionWindow.__tracklistToSpotifyLoaded) return;
  extensionWindow.__tracklistToSpotifyLoaded = true;

  const state = {
    videoId: null,
    tracklist: [],
    source: "",
    currentTrack: null,
    panel: null,
    trackEl: null,
    detailEl: null,
    addBtn: null,
    addToBtn: null,
    playlistPicker: null,
    playlistSelect: null,
    playlistAddBtn: null,
    defaultPlaylist: null,
    playlistsLoaded: false,
    playerButton: null,
    rescanTimer: null,
    lastHref: location.href,
    lastPublishedSignature: "",
    pendingMatch: null,
    pendingDuplicate: null,
    addedFeedbackTrackRaw: null
  };

  const SOURCE_SELECTORS = [
    ["description", "#description-inline-expander, ytd-text-inline-expander#description-inline-expander, #description ytd-text-inline-expander, #description"],
    ["chapters", "ytd-macro-markers-list-renderer, ytd-engagement-panel-section-list-renderer[target-id*='chapters']"],
    ["comments", "ytd-comment-thread-renderer #content-text, ytd-comment-view-model #content-text"]
  ];
  const SOURCE_MUTATION_SELECTOR = SOURCE_SELECTORS.map(([, selector]) => selector).join(",");

  function videoIdFromUrl() {
    try { return new URL(location.href).searchParams.get("v"); } catch { return null; }
  }

  function parseTimestamp(ts) {
    const parts = ts.split(":").map(Number);
    if (parts.some(Number.isNaN)) return null;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return null;
  }

  function parseTrackLine(line): TrackEntry | null {
    // YouTube descriptions can expose timestamps as Markdown-style links, e.g.
    // [39:44](https://youtube.com/watch?...&t=2384s) - [41:04](...) - Artist - Track.
    // Reduce timestamp links to their visible timestamp before parsing so URL/end-time
    // material never contaminates the Spotify search text.
    let normalized = String(line || "")
      .replace(/\[((?:\d{1,2}:)?\d{1,2}:\d{2})\]\(https?:\/\/[^)]+\)/gi, "$1")
      .replace(/\s+/g, " ")
      .trim();

    const timestamp = "((?:\\d{1,2}:)?\\d{1,2}:\\d{2})";
    const separator = "\\s*(?:[-–—|•·]\\s*)";

    // Some descriptions put a label before the first timestamp on the same line, e.g.
    // "Trackliste 0:07 Artist - Track". Find the first valid timestamp token anywhere
    // in the line, then discard only the prefix before it.
    const firstTimestamp = normalized.match(new RegExp(`(?:^|\\s)${timestamp}(?=\\s|[-–—|•·:]|$)`));
    if (!firstTimestamp) return null;
    const timestampOffset = firstTimestamp.index + firstTimestamp[0].length - firstTimestamp[1].length;
    normalized = normalized.slice(timestampOffset).trim();

    // Explicit time range: START - END - Artist - Track
    // START is the track start; END is retained for display/debugging only.
    let m = normalized.match(new RegExp(`^${timestamp}${separator}${timestamp}${separator}(.+?)\\s*$`));
    let startTs, endTs = null, raw;
    if (m) {
      startTs = m[1];
      endTs = m[2];
      raw = m[3].trim();
    } else {
      // Single timestamp: START - Artist - Track
      m = normalized.match(new RegExp(`^${timestamp}\\s*(?:(?:[-–—|•·:]\\s*)?)(.+?)\\s*$`));
      if (!m) return null;
      startTs = m[1];
      raw = m[2].trim();
    }

    const seconds = parseTimestamp(startTs);
    const endSeconds = endTs ? parseTimestamp(endTs) : null;
    raw = raw.replace(/^[-–—|•·:]\s*/, "").trim();
    raw = raw.replace(/\s+(?:https?:\/\/\S+)$/i, "").trim();
    if (seconds == null || !raw || raw.length > 240) return null;
    if (endSeconds != null && endSeconds < seconds) return null;

    let artist = "", title = raw;
    const sep = raw.match(/^(.{1,100}?)\s+(?:[-–—]\s+|\|\s+)(.+)$/);
    if (sep) { artist = sep[1].trim(); title = sep[2].trim(); }
    return { seconds, timestamp: startTs, endSeconds, endTimestamp: endTs, raw, artist, title };
  }

  function parseBlock(text, source) {
    const lines = String(text || "").split(/\n+/).map(s => s.trim()).filter(Boolean);
    const entries: TrackEntry[] = [];
    let previousTimestamp = null;
    for (const line of lines) {
      let e = parseTrackLine(line);
      if (!e && previousTimestamp && /^(?:[→↳➜]|(?:[-–—]>?))?\s*(?:w\/|with)\s+/i.test(line)) {
        const subtrack = line
          .replace(/^(?:[→↳➜]|(?:[-–—]>?))?\s*(?:w\/|with)\s+/i, "")
          .trim();
        const cue = subtrack.match(/\s+@\s*((?:\d{1,2}:)?\d{1,2}:\d{2})\s*$/);
        const timestamp = cue?.[1] || previousTimestamp;
        const raw = cue ? subtrack.slice(0, cue.index).trim() : subtrack;
        e = parseTrackLine(`${timestamp} ${raw}`);
      }
      if (e) {
        entries.push(e);
        previousTimestamp = e.timestamp;
      }
    }
    const unique = new Map();
    for (const e of entries) {
      const key = `${e.seconds}\n${e.raw.toLowerCase()}`;
      if (!unique.has(key)) unique.set(key, e);
    }
    const out = [...unique.values()].sort((a, b) => a.seconds - b.seconds);
    return { source, entries: out };
  }

  function descriptionFromMeta() {
    const el = document.querySelector<HTMLMetaElement>("meta[name='description']");
    return el?.content || "";
  }

  function collectCandidates() {
    const candidates = [];
    const meta = parseBlock(descriptionFromMeta(), "description metadata");
    if (meta.entries.length >= 2) candidates.push(meta);

    for (const [source, selector] of SOURCE_SELECTORS) {
      const nodes = [...document.querySelectorAll<HTMLElement>(selector)];
      if (source === "comments") {
        for (const node of nodes.slice(0, 100)) {
          const c = parseBlock(node.innerText || node.textContent, source);
          if (c.entries.length >= 2) candidates.push(c);
        }
      } else {
        for (const node of nodes.slice(0, 10)) {
          const c = parseBlock(node.innerText || node.textContent, source);
          if (c.entries.length >= 2) candidates.push(c);
        }
      }
    }
    return candidates;
  }

  function mutationTouchesTracklist(records) {
    const touchesSource = (node) => {
      const element = node instanceof Element ? node : node.parentElement;
      return Boolean(element && (
        element.matches(SOURCE_MUTATION_SELECTOR) ||
        element.closest(SOURCE_MUTATION_SELECTOR) ||
        element.querySelector(SOURCE_MUTATION_SELECTOR)
      ));
    };
    return records.some(record =>
      touchesSource(record.target) || [...record.addedNodes].some(touchesSource)
    );
  }

  function scoreCandidate(c) {
    const count = c.entries.length;
    const monotonic = c.entries.every((e, i) => i === 0 || e.seconds >= c.entries[i - 1].seconds);
    const sourceBonus = c.source.startsWith("description") ? 80 : c.source === "chapters" ? 70 : 30;
    const duration = document.querySelector("video")?.duration || 0;
    const coverage = duration && c.entries.length ? Math.min(30, (c.entries[c.entries.length - 1].seconds / duration) * 30) : 0;
    return count * 10 + sourceBonus + coverage + (monotonic ? 20 : 0);
  }

  function mergeCompatible(best, candidates) {
    // Prefer one coherent list. Add candidates that extend it with a disjoint time
    // range, or that share enough timestamps to look like the same list.
    const entryKey = (e: TrackEntry) => `${e.seconds}\n${e.raw.toLowerCase()}`;
    const map = new Map<string, TrackEntry>(best.entries.map(e => [entryKey(e), e]));
    const knownSeconds = new Set<number>(best.entries.map(e => e.seconds));
    for (const c of candidates) {
      if (c === best || !c.entries.length) continue;
      const candidateSeconds = new Set<number>(c.entries.map(e => e.seconds));
      const overlap = [...candidateSeconds].filter(seconds => knownSeconds.has(seconds)).length;
      const knownRange = [...knownSeconds].sort((a, b) => a - b);
      const candidateRange = [...candidateSeconds].sort((a, b) => a - b);
      const rangesAreDisjoint = candidateRange[candidateRange.length - 1] < knownRange[0]
        || candidateRange[0] > knownRange[knownRange.length - 1];
      const enoughOverlap = overlap >= Math.min(3, Math.ceil(candidateSeconds.size * 0.25));
      if (!rangesAreDisjoint && !enoughOverlap) continue;

      for (const e of c.entries) {
        if (!map.has(entryKey(e))) map.set(entryKey(e), e);
        knownSeconds.add(e.seconds);
      }
    }
    return [...map.values()].sort((a, b) => a.seconds - b.seconds);
  }

  function sessionSnapshot() {
    return {
      videoId: state.videoId,
      href: location.href,
      source: state.source,
      tracklist: state.tracklist,
      currentTrack: state.currentTrack
    };
  }

  function publishTabSession(force = false) {
    if (!state.videoId) return;
    const signature = JSON.stringify([
      state.videoId,
      state.source,
      state.tracklist.length,
      state.currentTrack?.seconds ?? null,
      state.currentTrack?.raw ?? ""
    ]);
    if (!force && signature === state.lastPublishedSignature) return;
    state.lastPublishedSignature = signature;
    browser.runtime.sendMessage({ type: "tab-session:update", session: sessionSnapshot() }).catch(() => {});
  }

  async function restoreTabSession() {
    if (!state.videoId) return;
    try {
      const result = await browser.runtime.sendMessage({ type: "tab-session:get", videoId: state.videoId });
      const saved = result?.session;
      if (!saved || saved.videoId !== state.videoId) return;
      state.tracklist = Array.isArray(saved.tracklist) ? saved.tracklist : [];
      state.source = saved.source || "";
      state.currentTrack = saved.currentTrack || null;
      updateUI();
    } catch {}
  }

  function discoverTracklist() {
    const candidates = collectCandidates();
    if (state.tracklist.length) {
      candidates.push({ source: state.source || "previous scan", entries: state.tracklist });
    }
    if (!candidates.length) {
      state.tracklist = [];
      state.source = "";
      updateUI();
      publishTabSession(true);
      return;
    }
    candidates.sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
    const best = candidates[0];
    state.tracklist = mergeCompatible(best, candidates);
    state.source = best.source;
    updateCurrentTrack();
    publishTabSession(true);
  }

  function getCurrent(seconds) {
    const list = state.tracklist;
    if (!list.length) return null;
    let lo = 0, hi = list.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].seconds <= seconds) { ans = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    if (ans < 0) return null;
    const e = list[ans];
    return { ...e, index: ans, nextSeconds: list[ans + 1]?.seconds ?? null };
  }

  function ensurePlayerButton() {
    if (state.playerButton?.isConnected) return;
    document.querySelectorAll("#tts-player-button").forEach(button => button.remove());

    const settings = document.querySelector(".ytp-settings-button");
    const controls = settings?.parentElement || document.querySelector(".ytp-right-controls");
    if (!controls) return;

    const button = document.createElement("button");
    button.id = "tts-player-button";
    button.className = "ytp-button";
    button.type = "button";
    button.title = "Toggle YouTube Tracklist to Spotify card";
    button.setAttribute("aria-label", "Toggle YouTube Tracklist to Spotify card");
    button.setAttribute("aria-controls", "tts-panel");
    button.setAttribute("aria-expanded", "true");
    button.innerHTML = `
      <svg viewBox="4 4 30 30" aria-hidden="true">
        <path fill="currentColor" d="M12 25a4 4 0 1 1-2-3.46V10l16-3v14a4 4 0 1 1-2-3.46v-6.9l-12 2.25V25Z"/>
      </svg>
    `;
    button.addEventListener("click", () => {
      ensurePanel();
      state.panel.hidden = !state.panel.hidden;
      button.setAttribute("aria-expanded", String(!state.panel.hidden));
    });
    controls.insertBefore(button, settings || null);
    state.playerButton = button;
  }

  function makePanelDraggable(panel: HTMLElement, handle: HTMLElement) {
    let drag: { pointerId: number; offsetX: number; offsetY: number; width: number; height: number } | null = null;

    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || (event.target instanceof Element && event.target.closest("button"))) return;
      const rect = panel.getBoundingClientRect();
      drag = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        width: rect.width,
        height: rect.height
      };
      panel.style.left = `${rect.left}px`;
      panel.style.top = `${rect.top}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      handle.classList.add("tts-dragging");
      handle.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });

    handle.addEventListener("pointermove", (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const left = Math.max(0, Math.min(window.innerWidth - drag.width, event.clientX - drag.offsetX));
      const top = Math.max(0, Math.min(window.innerHeight - drag.height, event.clientY - drag.offsetY));
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    });

    const finishDragging = (event: PointerEvent) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      handle.releasePointerCapture?.(event.pointerId);
      handle.classList.remove("tts-dragging");
      drag = null;
    };
    handle.addEventListener("pointerup", finishDragging);
    handle.addEventListener("pointercancel", finishDragging);
  }

  function makePanelResizable(panel: HTMLElement) {
    const minimumWidth = 260;
    const minimumHeight = 160;

    for (const corner of ["nw", "ne", "sw", "se"]) {
      const handle = panel.querySelector<HTMLElement>(`.tts-resize-${corner}`);
      let resize: {
        pointerId: number;
        startX: number;
        startY: number;
        left: number;
        top: number;
        width: number;
        height: number;
      } | null = null;

      handle.addEventListener("pointerdown", event => {
        if (event.button !== 0) return;
        const rect = panel.getBoundingClientRect();
        resize = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height
        };
        panel.style.left = `${rect.left}px`;
        panel.style.top = `${rect.top}px`;
        panel.style.right = "auto";
        panel.style.bottom = "auto";
        handle.setPointerCapture?.(event.pointerId);
        event.preventDefault();
      });

      handle.addEventListener("pointermove", event => {
        if (!resize || resize.pointerId !== event.pointerId) return;
        const dx = event.clientX - resize.startX;
        const dy = event.clientY - resize.startY;
        const west = corner.includes("w");
        const north = corner.includes("n");
        const width = Math.max(minimumWidth, resize.width + (west ? -dx : dx));
        const height = Math.max(minimumHeight, resize.height + (north ? -dy : dy));
        panel.style.width = `${width}px`;
        panel.style.height = `${height}px`;
        panel.style.left = `${west ? resize.left + resize.width - width : resize.left}px`;
        panel.style.top = `${north ? resize.top + resize.height - height : resize.top}px`;
      });

      const finishResizing = (event: PointerEvent) => {
        if (!resize || resize.pointerId !== event.pointerId) return;
        handle.releasePointerCapture?.(event.pointerId);
        resize = null;
      };
      handle.addEventListener("pointerup", finishResizing);
      handle.addEventListener("pointercancel", finishResizing);
    }
  }

  function ensurePanel() {
    if (state.panel?.isConnected) return;

    // Reloading an extension destroys its content-script context, but Firefox can
    // leave DOM nodes injected by that context on the page. Remove those stale
    // panels before wiring a fresh one to this context.
    document.querySelectorAll("#tts-panel").forEach(panel => panel.remove());

    const panel = document.createElement("div");
    panel.id = "tts-panel";
    panel.innerHTML = `
      <div class="tts-content">
      <div class="tts-head" aria-label="Drag card">
        <div class="tts-track">No tracklist yet</div>
        <button class="tts-close" title="Hide">×</button>
      </div>
      <div class="tts-detail"></div>
      <button class="tts-add" disabled>Add current track</button>
      <button class="tts-add-to" disabled>Add current track to…</button>
      <div class="tts-playlist-picker" hidden>
        <label for="tts-playlist-select">Spotify playlist</label>
        <div class="tts-playlist-row">
          <select id="tts-playlist-select"><option value="">Loading playlists…</option></select>
          <button class="tts-refresh-playlists" type="button" title="Refresh playlists" aria-label="Refresh Spotify playlists">↻</button>
        </div>
        <div class="tts-playlist-actions">
          <button class="tts-add-selected" type="button" disabled>Add to selected</button>
          <button class="tts-set-default" type="button" disabled>Set as default</button>
        </div>
        <div class="tts-playlist-status" aria-live="polite"></div>
      </div>
      <div class="tts-feedback" aria-live="polite"></div>
      </div>
      <span class="tts-resize-handle tts-resize-nw" aria-hidden="true"></span>
      <span class="tts-resize-handle tts-resize-ne" aria-hidden="true"></span>
      <span class="tts-resize-handle tts-resize-sw" aria-hidden="true"></span>
      <span class="tts-resize-handle tts-resize-se" aria-hidden="true"></span>
    `;
    document.documentElement.appendChild(panel);
    state.panel = panel;
    state.trackEl = panel.querySelector(".tts-track");
    state.detailEl = panel.querySelector(".tts-detail");
    state.addBtn = panel.querySelector(".tts-add");
    state.addToBtn = panel.querySelector(".tts-add-to");
    state.playlistPicker = panel.querySelector(".tts-playlist-picker");
    state.playlistSelect = panel.querySelector("#tts-playlist-select");
    state.playlistAddBtn = panel.querySelector(".tts-add-selected");
    makePanelDraggable(panel, panel.querySelector<HTMLElement>(".tts-head"));
    makePanelResizable(panel);
    panel.querySelector(".tts-close").addEventListener("click", () => {
      panel.hidden = true;
    });
    state.addBtn.addEventListener("click", () => addCurrentTrack());
    state.addToBtn.addEventListener("click", async () => {
      state.playlistPicker.hidden = !state.playlistPicker.hidden;
      if (!state.playlistPicker.hidden && !state.playlistsLoaded) await loadPlaylistPicker();
    });
    state.playlistSelect.addEventListener("change", updatePlaylistActions);
    panel.querySelector(".tts-refresh-playlists").addEventListener("click", () => loadPlaylistPicker(true));
    panel.querySelector(".tts-set-default").addEventListener("click", setSelectedPlaylistAsDefault);
    state.playlistAddBtn.addEventListener("click", () => {
      const destination = selectedPlaylist();
      if (destination) addCurrentTrack(destination);
    });
  }

  function selectedPlaylist() {
    const option = state.playlistSelect?.selectedOptions[0];
    return option?.value ? { id: option.value, name: option.textContent || "playlist" } : null;
  }

  function updatePlaylistActions() {
    const selected = selectedPlaylist();
    state.playlistAddBtn.disabled = !selected || !state.currentTrack;
    state.panel.querySelector(".tts-set-default").disabled = !selected;
    const pendingDuplicate = state.pendingDuplicate;
    const pendingMatch = state.pendingMatch;
    state.playlistAddBtn.textContent = selected
      && pendingDuplicate?.trackRaw === state.currentTrack?.raw
      && pendingDuplicate.playlistId === selected.id
      ? "Add duplicate anyway"
      : selected
        && pendingMatch?.trackRaw === state.currentTrack?.raw
        && pendingMatch.playlistId === selected.id
        ? `Add ${pendingMatch.name} anyway`
        : "Add to selected";
  }

  async function loadPlaylistPicker(forceRefresh = false) {
    const statusEl = state.panel.querySelector(".tts-playlist-status");
    statusEl.textContent = forceRefresh ? "Refreshing playlists…" : "Loading playlists…";
    try {
      const [data, status] = await Promise.all([
        browser.runtime.sendMessage({ type: "spotify:get-playlists", forceRefresh }),
        browser.runtime.sendMessage({ type: "spotify:get-status" })
      ]);
      state.defaultPlaylist = status.playlistId
        ? { id: status.playlistId, name: status.playlistName || "playlist" }
        : null;
      state.playlistSelect.innerHTML = '<option value="">Choose a playlist…</option>';
      for (const playlist of data.playlists || []) {
        const option = document.createElement("option");
        option.value = playlist.id;
        option.textContent = playlist.name;
        if (playlist.id === status.playlistId) option.selected = true;
        state.playlistSelect.appendChild(option);
      }
      state.playlistsLoaded = true;
      statusEl.textContent = state.defaultPlaylist
        ? `Default: ${state.defaultPlaylist.name}`
        : `${data.playlists?.length || 0} playlists found · choose a default`;
      updatePlaylistActions();
      updateUI();
    } catch (err) {
      statusEl.textContent = `⚠ ${err?.message || err}`;
    }
  }

  async function setSelectedPlaylistAsDefault() {
    const destination = selectedPlaylist();
    if (!destination) return;
    const statusEl = state.panel.querySelector(".tts-playlist-status");
    try {
      await browser.runtime.sendMessage({
        type: "spotify:set-playlist",
        playlistId: destination.id,
        playlistName: destination.name
      });
      state.defaultPlaylist = destination;
      statusEl.textContent = `✓ Default: ${destination.name}`;
      updateUI();
    } catch (err) {
      statusEl.textContent = `⚠ ${err?.message || err}`;
    }
  }

  function updateCurrentTrack() {
    const video = document.querySelector("video");
    state.currentTrack = video ? getCurrent(video.currentTime || 0) : null;
    if (state.addedFeedbackTrackRaw && state.currentTrack?.raw !== state.addedFeedbackTrackRaw) {
      state.panel?.querySelector(".tts-feedback").replaceChildren();
      state.addedFeedbackTrackRaw = null;
    }
    updateUI();
    publishTabSession();
  }

  function updateUI() {
    ensurePanel();
    const count = state.tracklist.length;
    if (!state.currentTrack) {
      state.trackEl.textContent = count ? "Before first timestamp" : "Scroll comments or open the description, then rescan";
      state.detailEl.textContent = "";
      state.addBtn.disabled = true;
      state.addToBtn.disabled = true;
      updatePlaylistActions();
      return;
    }
    const t = state.currentTrack;
    state.trackEl.textContent = t.raw;
    state.detailEl.textContent = `${formatTime(t.seconds)} · track ${t.index + 1}/${count}`;
    state.addBtn.disabled = false;
    state.addToBtn.disabled = false;
    updatePlaylistActions();
    state.addBtn.textContent = state.pendingDuplicate?.trackRaw === t.raw && state.pendingDuplicate.defaultDestination
      ? "Add duplicate anyway"
      : state.pendingMatch?.trackRaw === t.raw && !state.pendingMatch.playlistId
        ? `Add ${state.pendingMatch.name} anyway`
        : state.defaultPlaylist
          ? `Add current track to ${state.defaultPlaylist.name}`
          : "Add current track to Spotify";
  }

  async function addMatchedTrack(match, feedback, allowDuplicate = false) {
    const actionButton = match.defaultDestination || !match.playlistId
      ? state.addBtn
      : state.playlistAddBtn;
    actionButton.disabled = true;
    actionButton.textContent = `Adding ${match.name}…`;
    const added = await browser.runtime.sendMessage({
      type: "spotify:add-track",
      uri: match.uri,
      allowDuplicate,
      playlistId: match.playlistId || undefined,
      playlistName: match.playlistName || undefined
    });
    if (added.duplicate) {
      state.pendingDuplicate = {
        ...match,
        trackRaw: state.currentTrack.raw,
        playlistId: added.playlistId,
        playlistName: added.playlistName,
        defaultDestination: !match.playlistId
      };
      feedback.textContent = `⚠ ${match.artists} — ${match.name} is already in ${added.playlistName}.`;
      actionButton.textContent = "Add duplicate anyway";
      actionButton.disabled = false;
      return;
    }
    feedback.textContent = `✓ Added ${match.artists} — ${match.name} to ${added.playlistName}`;
    state.addedFeedbackTrackRaw = state.currentTrack.raw;
    state.pendingMatch = null;
    state.pendingDuplicate = null;
    actionButton.textContent = "Added ✓";
    setTimeout(() => { updateUI(); }, 1800);
  }

  async function addCurrentTrack(destination = null) {
    const feedback = state.panel.querySelector(".tts-feedback");
    const t = state.currentTrack;
    if (!t) return;
    const actionButton = destination ? state.playlistAddBtn : state.addBtn;
    try {
      const targetsDestination = pending => destination
        ? pending?.playlistId === destination.id
        : pending?.defaultDestination || !pending?.playlistId;
      if (state.pendingDuplicate?.trackRaw === t.raw && targetsDestination(state.pendingDuplicate)) {
        await addMatchedTrack(state.pendingDuplicate, feedback, true);
        return;
      }
      if (state.pendingMatch?.trackRaw === t.raw && targetsDestination(state.pendingMatch)) {
        await addMatchedTrack(state.pendingMatch, feedback);
        return;
      }
      state.pendingMatch = null;
      actionButton.disabled = true;
      actionButton.textContent = "Finding on Spotify…";
      feedback.textContent = "";
      const result = await browser.runtime.sendMessage({ type: "spotify:search-track", track: t });
      const best = result?.best;
      if (!best) throw new Error("No Spotify match found for this track.");
      const targetedMatch = destination
        ? { ...best, playlistId: destination.id, playlistName: destination.name }
        : best;
      if ((best.score ?? 0) < 0.55) {
        state.pendingMatch = { ...targetedMatch, trackRaw: t.raw };
        feedback.textContent = `⚠ Low-confidence match: ${best.artists} — ${best.name}. Check it, then add anyway if correct.`;
        actionButton.textContent = `Add ${best.name} anyway`;
        actionButton.disabled = false;
        return;
      }
      await addMatchedTrack(targetedMatch, feedback);
    } catch (err) {
      state.pendingMatch = null;
      state.pendingDuplicate = null;
      feedback.textContent = `⚠ ${err?.message || err}`;
      actionButton.textContent = destination ? "Add to selected" : "Add current track to Spotify";
      actionButton.disabled = false;
    }
  }

  function formatTime(sec) {
    sec = Math.max(0, Math.floor(Number(sec) || 0));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
  }

  function scheduleRescan(delay = 700) {
    clearTimeout(state.rescanTimer);
    state.rescanTimer = setTimeout(discoverTracklist, delay);
  }

  function resetForNavigation(rescanDelay) {
    state.lastHref = location.href;
    state.videoId = videoIdFromUrl();
    state.tracklist = [];
    state.source = "";
    state.currentTrack = null;
    state.lastPublishedSignature = "";
    state.pendingMatch = null;
    state.pendingDuplicate = null;
    state.addedFeedbackTrackRaw = null;
    state.panel?.querySelector(".tts-feedback").replaceChildren();
    browser.runtime.sendMessage({ type: "tab-session:clear" }).catch(() => {});
    scheduleRescan(rescanDelay);
  }

  browser.runtime.onMessage.addListener(async (message) => {
    if (message?.type !== "card:show") return undefined;
    ensurePanel();
    state.panel.hidden = false;
    updateUI();
    return { ok: true };
  });

  const observer = new MutationObserver((records) => {
    ensurePlayerButton();
    if (location.href !== state.lastHref) {
      resetForNavigation(900);
      return;
    }
    if (!state.tracklist.length || mutationTouchesTracklist(records)) scheduleRescan(900);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  setInterval(() => {
    if (location.href !== state.lastHref) resetForNavigation(500);
    updateCurrentTrack();
  }, 1000);

  state.videoId = videoIdFromUrl();
  ensurePlayerButton();
  ensurePanel();
  restoreTabSession().finally(() => scheduleRescan(400));
})();
