import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM, VirtualConsole } from "jsdom";

async function loadBackground(searchItems, options = {}) {
  const script = await readFile("dist/background.js", "utf8");
  const dom = new JSDOM("<!doctype html>", {
    runScripts: "outside-only",
    virtualConsole: new VirtualConsole(),
    url: "moz-extension://youtube-tracklist-to-spotify/background.html",
  });
  let onMessage;
  dom.window.Headers = Headers;
  dom.window.fetch = options.fetch || (async () => new Response(JSON.stringify({ tracks: { items: searchItems } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  }));
  dom.window.browser = {
    tabs: { onRemoved: { addListener: () => {} } },
    runtime: { onMessage: { addListener: listener => { onMessage = listener; } } },
    identity: { getRedirectURL: () => "https://example.test/callback" },
    storage: {
      local: {
        get: async () => ({
          spotifyClientId: "client-id",
          spotifyTokens: { access_token: "token", expires_at: Date.now() + 60_000 },
          ...options.storage,
        }),
      },
    },
  };
  dom.window.eval(script);
  return { dom, sendMessage: message => onMessage(message, {}) };
}

test("checks a playlist for duplicates before adding a track", async () => {
  let postCount = 0;
  const { dom, sendMessage } = await loadBackground([], {
    storage: { spotifyPlaylistId: "playlist-id", spotifyPlaylistName: "DJ Sets" },
    fetch: async (url, init = {}) => {
      if (init.method === "POST") postCount++;
      if (init.method !== "POST") {
        assert.match(url, /fields=items\(item\(uri\)\)%2Cnext/);
      }
      const body = init.method === "POST"
        ? { snapshot_id: "snapshot" }
        : { items: [{ item: { uri: "spotify:track:duplicate" } }], next: null };
      return new Response(JSON.stringify(body), { status: 200 });
    },
  });

  try {
    const duplicate = await sendMessage({ type: "spotify:add-track", uri: "spotify:track:duplicate" });
    assert.equal(duplicate.duplicate, true);
    assert.equal(postCount, 0);

    const added = await sendMessage({
      type: "spotify:add-track",
      uri: "spotify:track:duplicate",
      allowDuplicate: true,
    });
    assert.equal(added.duplicate, false);
    assert.equal(postCount, 1);
  } finally {
    dom.window.close();
  }
});

test("marks a base track as low confidence when the requested remix is unavailable", async () => {
  const { dom, sendMessage } = await loadBackground([{
    uri: "spotify:track:base",
    id: "base",
    name: "Before I Wake",
    artists: [{ name: "Headhunterz" }, { name: "Vertile" }],
    album: { name: "Before I Wake" },
    external_urls: { spotify: "https://open.spotify.com/track/base" },
  }]);

  try {
    const result = await sendMessage({
      type: "spotify:search-track",
      track: {
        raw: "Headhunterz & Vertile - Before I Wake (Dimension X Kick Edit)",
        artist: "Headhunterz & Vertile",
        title: "Before I Wake (Dimension X Kick Edit)",
      },
    });

    assert.ok(result.best.score < 0.55, `expected low confidence, got ${result.best.score}`);
  } finally {
    dom.window.close();
  }
});
