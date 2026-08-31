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

test("adds one tracklist control before settings without disturbing other extensions", async () => {
  const script = await readFile("dist/content.js", "utf8");
  const dom = new JSDOM(`<!doctype html><html><body>
    <div class="ytp-right-controls">
      <button id="other-extension-control"></button>
      <button class="ytp-settings-button"></button>
    </div>
  </body></html>`, {
    runScripts: "outside-only",
    virtualConsole: new VirtualConsole(),
    url: "https://www.youtube.com/watch?v=controls-test",
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
    const controls = dom.window.document.querySelector(".ytp-right-controls");
    const tracklistControls = controls.querySelectorAll("#tts-player-button");

    assert.equal(tracklistControls.length, 1);
    assert.equal(controls.querySelector("#other-extension-control").isConnected, true);
    assert.equal(tracklistControls[0].nextElementSibling.className, "ytp-settings-button");
  } finally {
    dom.window.close();
  }
});

test("the player control toggles the tracklist card", async () => {
  const script = await readFile("dist/content.js", "utf8");
  const dom = new JSDOM(`<!doctype html><html><body>
    <div class="ytp-right-controls"><button class="ytp-settings-button"></button></div>
  </body></html>`, {
    runScripts: "outside-only",
    virtualConsole: new VirtualConsole(),
    url: "https://www.youtube.com/watch?v=toggle-test",
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
    const button = dom.window.document.querySelector("#tts-player-button");
    const panel = dom.window.document.querySelector("#tts-panel");

    button.click();
    assert.equal(panel.hidden, true);
    button.click();
    assert.equal(panel.hidden, false);
  } finally {
    dom.window.close();
  }
});

test("restores the player control when YouTube rebuilds its controls", async () => {
  const script = await readFile("dist/content.js", "utf8");
  const dom = new JSDOM(`<!doctype html><html><body>
    <div class="ytp-right-controls"><button class="ytp-settings-button"></button></div>
  </body></html>`, {
    runScripts: "outside-only",
    virtualConsole: new VirtualConsole(),
    url: "https://www.youtube.com/watch?v=rebuilt-controls-test",
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
    dom.window.document.querySelector(".ytp-right-controls").outerHTML = `
      <div class="ytp-right-controls">
        <button id="another-extension-control"></button>
        <button class="ytp-settings-button"></button>
      </div>`;
    await new Promise(resolve => dom.window.setTimeout(resolve, 0));

    const controls = dom.window.document.querySelector(".ytp-right-controls");
    assert.equal(dom.window.document.querySelectorAll("#tts-player-button").length, 1);
    assert.equal(controls.querySelector("#another-extension-control").isConnected, true);
    assert.equal(controls.querySelector("#tts-player-button").nextElementSibling.className, "ytp-settings-button");
  } finally {
    dom.window.close();
  }
});

test("reloading rewires a stale player control without duplicating it", async () => {
  const script = await readFile("dist/content.js", "utf8");
  const dom = new JSDOM(`<!doctype html><html><body>
    <div class="ytp-right-controls"><button class="ytp-settings-button"></button></div>
  </body></html>`, {
    runScripts: "outside-only",
    virtualConsole: new VirtualConsole(),
    url: "https://www.youtube.com/watch?v=control-reload-test",
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
    const oldButton = dom.window.document.querySelector("#tts-player-button");
    oldButton.replaceWith(oldButton.cloneNode(true)); // stale DOM without its old context listener

    delete dom.window.__tracklistToSpotifyLoaded;
    dom.window.eval(script);

    const buttons = dom.window.document.querySelectorAll("#tts-player-button");
    const panel = dom.window.document.querySelector("#tts-panel");
    assert.equal(buttons.length, 1);
    buttons[0].click();
    assert.equal(panel.hidden, true);
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
