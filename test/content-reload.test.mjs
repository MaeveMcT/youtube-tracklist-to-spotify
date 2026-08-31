import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM, VirtualConsole } from "jsdom";

test("reloading the content script leaves only one injected panel", async () => {
  const script = await readFile("dist/content.js", "utf8");
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    runScripts: "outside-only",
    virtualConsole: new VirtualConsole(),
    url: "https://www.youtube.com/watch?v=reload-test",
  });

  dom.window.browser = {
    runtime: {
      sendMessage: async (message) =>
        message.type === "tab-session:get" ? { session: null } : { ok: true },
    },
  };

  try {
    dom.window.eval(script);
    assert.equal(dom.window.document.querySelectorAll("#tts-panel").length, 1);

    // Extension reloads create a fresh isolated JS world while leaving nodes that
    // the previous content script injected into the page DOM.
    delete dom.window.__tracklistToSpotifyLoaded;
    dom.window.eval(script);

    assert.equal(dom.window.document.querySelectorAll("#tts-panel").length, 1);
  } finally {
    dom.window.close();
  }
});
