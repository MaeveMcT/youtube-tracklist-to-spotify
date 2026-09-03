import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM, VirtualConsole } from "jsdom";

async function loadBackground(searchItems) {
  const script = await readFile("dist/background.js", "utf8");
  const dom = new JSDOM("<!doctype html>", {
    runScripts: "outside-only",
    virtualConsole: new VirtualConsole(),
    url: "moz-extension://youtube-tracklist-to-spotify/background.html",
  });
  let onMessage;
  dom.window.Headers = Headers;
  dom.window.fetch = async () => new Response(JSON.stringify({ tracks: { items: searchItems } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
  dom.window.browser = {
    tabs: { onRemoved: { addListener: () => {} } },
    runtime: { onMessage: { addListener: listener => { onMessage = listener; } } },
    identity: { getRedirectURL: () => "https://example.test/callback" },
    storage: {
      local: {
        get: async () => ({
          spotifyClientId: "client-id",
          spotifyTokens: { access_token: "token", expires_at: Date.now() + 60_000 },
        }),
      },
    },
  };
  dom.window.eval(script);
  return { dom, sendMessage: message => onMessage(message, {}) };
}

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
