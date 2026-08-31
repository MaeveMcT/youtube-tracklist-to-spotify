import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM, VirtualConsole } from "jsdom";

test("closing the card keeps it hidden during subsequent updates", async () => {
  const script = await readFile("dist/content.js", "utf8");
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    runScripts: "outside-only",
    virtualConsole: new VirtualConsole(),
    url: "https://www.youtube.com/watch?v=close-test",
  });

  dom.window.browser = {
    runtime: {
      sendMessage: async (message) =>
        message.type === "tab-session:get" ? { session: null } : { ok: true },
      onMessage: { addListener: () => {} },
    },
  };

  try {
    dom.window.eval(script);
    dom.window.document.querySelector(".tts-close").click();
    await new Promise(resolve => dom.window.setTimeout(resolve, 1100));

    const visiblePanels = [...dom.window.document.querySelectorAll("#tts-panel")]
      .filter(panel => panel.isConnected && !panel.hidden);
    assert.equal(visiblePanels.length, 0);
  } finally {
    dom.window.close();
  }
});

test("a card:show extension message restores a closed card", async () => {
  const script = await readFile("dist/content.js", "utf8");
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    runScripts: "outside-only",
    virtualConsole: new VirtualConsole(),
    url: "https://www.youtube.com/watch?v=show-test",
  });
  let onMessage;

  dom.window.browser = {
    runtime: {
      sendMessage: async (message) =>
        message.type === "tab-session:get" ? { session: null } : { ok: true },
      onMessage: { addListener: listener => { onMessage = listener; } },
    },
  };

  try {
    dom.window.eval(script);
    const panel = dom.window.document.querySelector("#tts-panel");
    panel.querySelector(".tts-close").click();
    assert.equal(panel.hidden, true);

    await onMessage({ type: "card:show" });

    assert.equal(panel.hidden, false);
  } finally {
    dom.window.close();
  }
});

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
      onMessage: { addListener: () => {} },
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
