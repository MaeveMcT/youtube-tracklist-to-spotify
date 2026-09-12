import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM, VirtualConsole } from "jsdom";

test("positions a new card above YouTube's fullscreen controls", async () => {
  const css = await readFile("assets/content.css", "utf8");
  const dom = new JSDOM(`<!doctype html><html><head><style>${css}</style></head><body><div id="tts-panel"></div></body></html>`);

  try {
    assert.equal(dom.window.getComputedStyle(dom.window.document.querySelector("#tts-panel")).bottom, "72px");
  } finally {
    dom.window.close();
  }
});

test("detects documented timestamp formats from YouTube metadata", async () => {
  const script = await readFile("dist/content.js", "utf8");
  const dom = new JSDOM("<!doctype html><html><head><meta name=\"description\"></head><body><video></video></body></html>", {
    runScripts: "outside-only",
    virtualConsole: new VirtualConsole(),
    url: "https://www.youtube.com/watch?v=parser-test",
  });
  dom.window.document.querySelector("meta[name='description']").content = [
    "Trackliste 0:07 Artist One - Track One",
    "[1:00](https://youtube.com/watch?v=parser-test&t=60s) - [2:00](https://youtube.com/watch?v=parser-test&t=120s) - Artist Two - Track Two",
    "2:00 Artist Three - Track Three",
  ].join("\n");
  dom.window.browser = {
    runtime: {
      sendMessage: async (message) =>
        message.type === "tab-session:get" ? { session: null } : { ok: true },
      onMessage: { addListener: () => {} },
    },
  };
  Object.defineProperty(dom.window.document.querySelector("video"), "currentTime", { value: 130, configurable: true });

  try {
    dom.window.eval(script);
    await new Promise(resolve => dom.window.setTimeout(resolve, 500));

    assert.equal(dom.window.document.querySelector(".tts-track").textContent, "Artist Three - Track Three");
    assert.equal(dom.window.document.querySelector(".tts-detail").textContent, "2:00 · track 3/3");
    assert.equal(dom.window.document.querySelector(".tts-status"), null);
    assert.doesNotMatch(dom.window.document.querySelector("#tts-panel").textContent, /YouTube Tracklist to Spotify/);
  } finally {
    dom.window.close();
  }
});

test("detects mashup subtracks with inherited and explicit cue timestamps", async () => {
  const script = await readFile("dist/content.js", "utf8");
  const dom = new JSDOM("<!doctype html><html><head><meta name=\"description\"></head><body><video></video></body></html>", {
    runScripts: "outside-only",
    virtualConsole: new VirtualConsole(),
    url: "https://www.youtube.com/watch?v=subtrack-test",
  });
  dom.window.document.querySelector("meta[name='description']").content = [
    "20:10 - 23:06 – Headhunterz & Vertile – Before I Wake (Headhunterz Meme Edit)",
    "→ w/ Before I Wake (Dimension X Kick Edit) @ 21:32",
    "23:06 - 25:33 – Porter Robinson ft. Bright Lights – Language",
    "→ w/ Zedd ft. Foxes – Clarity (Acappella)",
    "→ w/ Dimitri Vegas & Like Mike & Martin Garrix – Tremor (Sub Zero Project Remix) @ 24:46",
    "→ w/ David Guetta vs. Benny Benassi – Satisfaction (Hardwell & Maddix Remix / Sub Zero Project Psycho Edit) @ 25:06",
  ].join("\n");
  const video = dom.window.document.querySelector("video");
  Object.defineProperty(video, "currentTime", { value: 24 * 60 + 50, configurable: true });
  dom.window.browser = {
    runtime: {
      sendMessage: async message => message.type === "tab-session:get" ? { session: null } : { ok: true },
      onMessage: { addListener: () => {} },
    },
  };

  try {
    dom.window.eval(script);
    await new Promise(resolve => dom.window.setTimeout(resolve, 1100));

    assert.match(dom.window.document.querySelector(".tts-track").textContent, /Tremor/);
    assert.match(dom.window.document.querySelector(".tts-detail").textContent, /track 5\/6/);
  } finally {
    dom.window.close();
  }
});

test("merges newly loaded comment tracklists with tracks already detected", async () => {
  const script = await readFile("dist/content.js", "utf8");
  const dom = new JSDOM(`<!doctype html><html><body>
    <div id="comments"><ytd-comment-thread-renderer><div id="content-text">
      0:00 Artist One - Track One
      1:00 Artist Two - Track Two
    </div></ytd-comment-thread-renderer></div>
    <video></video>
  </body></html>`, {
    runScripts: "outside-only",
    virtualConsole: new VirtualConsole(),
    url: "https://www.youtube.com/watch?v=comment-merge-test",
  });
  dom.window.browser = {
    runtime: {
      sendMessage: async message => message.type === "tab-session:get" ? { session: null } : { ok: true },
      onMessage: { addListener: () => {} },
    },
  };

  try {
    dom.window.eval(script);
    await new Promise(resolve => dom.window.setTimeout(resolve, 500));
    assert.match(dom.window.document.querySelector(".tts-detail").textContent, /track 1\/2/);

    dom.window.document.querySelector("#comments").insertAdjacentHTML("beforeend", `
      <ytd-comment-thread-renderer><div id="content-text">
        2:00 Artist Three - Track Three
        3:00 Artist Four - Track Four
      </div></ytd-comment-thread-renderer>`);
    dom.window.document.querySelector("ytd-comment-thread-renderer").remove();
    await new Promise(resolve => dom.window.setTimeout(resolve, 2000));

    assert.match(dom.window.document.querySelector(".tts-detail").textContent, /track 1\/4/);
    assert.equal(dom.window.document.querySelector(".tts-track").textContent, "Artist One - Track One");
  } finally {
    dom.window.close();
  }
});

test("offers to add a low-confidence Spotify match anyway", async () => {
  const script = await readFile("dist/content.js", "utf8");
  const dom = new JSDOM(`<!doctype html><html><head>
    <meta name="description" content="0:00 Artist - Track One&#10;1:00 Artist - Track Two">
  </head><body><video></video></body></html>`, {
    runScripts: "outside-only",
    virtualConsole: new VirtualConsole(),
    url: "https://www.youtube.com/watch?v=low-confidence-test",
  });
  const video = dom.window.document.querySelector("video");
  Object.defineProperty(video, "currentTime", { value: 0, writable: true, configurable: true });
  const messages = [];
  dom.window.browser = {
    runtime: {
      sendMessage: async message => {
        messages.push(message);
        if (message.type === "tab-session:get") return { session: null };
        if (message.type === "spotify:search-track") return {
          best: { uri: "spotify:track:low", name: "Possible Track", artists: "Possible Artist", score: 0.4 },
        };
        if (message.type === "spotify:add-track") return { playlistName: "DJ Sets" };
        return { ok: true };
      },
      onMessage: { addListener: () => {} },
    },
  };

  try {
    dom.window.eval(script);
    await new Promise(resolve => dom.window.setTimeout(resolve, 500));
    const button = dom.window.document.querySelector(".tts-add");

    button.click();
    await new Promise(resolve => dom.window.setTimeout(resolve, 0));
    assert.match(button.textContent, /Add Possible Track anyway/);
    assert.equal(messages.some(message => message.type === "spotify:add-track"), false);

    button.click();
    await new Promise(resolve => dom.window.setTimeout(resolve, 0));
    assert.equal(messages.find(message => message.type === "spotify:add-track")?.uri, "spotify:track:low");
    assert.match(dom.window.document.querySelector(".tts-feedback").textContent, /Added Possible Artist/);

    video.currentTime = 61;
    await new Promise(resolve => dom.window.setTimeout(resolve, 1100));
    assert.equal(dom.window.document.querySelector(".tts-feedback").textContent, "");
  } finally {
    dom.window.close();
  }
});

test("adds to a chosen playlist and changes the default from the card", async () => {
  const script = await readFile("dist/content.js", "utf8");
  const dom = new JSDOM(`<!doctype html><html><head>
    <meta name="description" content="0:00 Artist - Track One&#10;1:00 Artist - Track Two">
  </head><body><video></video></body></html>`, {
    runScripts: "outside-only",
    virtualConsole: new VirtualConsole(),
    url: "https://www.youtube.com/watch?v=playlist-card-test",
  });
  const messages = [];
  dom.window.browser = {
    runtime: {
      sendMessage: async message => {
        messages.push(message);
        if (message.type === "tab-session:get") return { session: null };
        if (message.type === "spotify:get-status") return {
          loggedIn: true, playlistId: "playlist-1", playlistName: "Default Mixes",
        };
        if (message.type === "spotify:get-playlists") return { playlists: [
          { id: "playlist-1", name: "Default Mixes" },
          { id: "playlist-2", name: "Friday Set" },
        ] };
        if (message.type === "spotify:search-track") return {
          best: { uri: "spotify:track:one", name: "Track One", artists: "Artist", score: 1 },
        };
        if (message.type === "spotify:add-track") return {
          ok: true, duplicate: false, playlistId: message.playlistId, playlistName: message.playlistName,
        };
        return { ok: true };
      },
      onMessage: { addListener: () => {} },
    },
  };

  try {
    dom.window.eval(script);
    await new Promise(resolve => dom.window.setTimeout(resolve, 500));
    dom.window.document.querySelector(".tts-add-to").click();
    await new Promise(resolve => dom.window.setTimeout(resolve, 0));

    const select = dom.window.document.querySelector("#tts-playlist-select");
    select.value = "playlist-2";
    select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    dom.window.document.querySelector(".tts-add-selected").click();
    await new Promise(resolve => dom.window.setTimeout(resolve, 0));

    const addMessage = messages.find(message => message.type === "spotify:add-track");
    assert.equal(addMessage.playlistId, "playlist-2");
    assert.equal(addMessage.playlistName, "Friday Set");

    dom.window.document.querySelector(".tts-set-default").click();
    await new Promise(resolve => dom.window.setTimeout(resolve, 0));
    const setMessage = messages.find(message => message.type === "spotify:set-playlist");
    assert.equal(setMessage.playlistId, "playlist-2");
    assert.match(dom.window.document.querySelector(".tts-add").textContent, /Friday Set/);
  } finally {
    dom.window.close();
  }
});

test("requires confirmation before adding a duplicate track", async () => {
  const script = await readFile("dist/content.js", "utf8");
  const dom = new JSDOM(`<!doctype html><html><head>
    <meta name="description" content="0:00 Artist - Track One&#10;1:00 Artist - Track Two">
  </head><body><video></video></body></html>`, {
    runScripts: "outside-only",
    virtualConsole: new VirtualConsole(),
    url: "https://www.youtube.com/watch?v=duplicate-test",
  });
  const addMessages = [];
  dom.window.browser = {
    runtime: {
      sendMessage: async message => {
        if (message.type === "tab-session:get") return { session: null };
        if (message.type === "spotify:search-track") return {
          best: { uri: "spotify:track:duplicate", name: "Track One", artists: "Artist", score: 1 },
        };
        if (message.type === "spotify:add-track") {
          addMessages.push(message);
          return message.allowDuplicate
            ? { ok: true, duplicate: false, playlistName: "DJ Sets" }
            : { ok: false, duplicate: true, playlistName: "DJ Sets" };
        }
        return { ok: true };
      },
      onMessage: { addListener: () => {} },
    },
  };

  try {
    dom.window.eval(script);
    await new Promise(resolve => dom.window.setTimeout(resolve, 500));
    const button = dom.window.document.querySelector(".tts-add");

    button.click();
    await new Promise(resolve => dom.window.setTimeout(resolve, 0));
    assert.equal(button.textContent, "Add duplicate anyway");
    assert.match(dom.window.document.querySelector(".tts-feedback").textContent, /already in DJ Sets/);
    assert.equal(addMessages[0].allowDuplicate, false);

    button.click();
    await new Promise(resolve => dom.window.setTimeout(resolve, 0));
    assert.equal(addMessages[1].allowDuplicate, true);
    assert.match(dom.window.document.querySelector(".tts-feedback").textContent, /✓ Added/);
  } finally {
    dom.window.close();
  }
});

test("drags the card by its header so it can be moved away from player controls", async () => {
  const script = await readFile("dist/content.js", "utf8");
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    runScripts: "outside-only",
    virtualConsole: new VirtualConsole(),
    url: "https://www.youtube.com/watch?v=drag-test",
  });
  dom.window.browser = {
    runtime: {
      sendMessage: async message => message.type === "tab-session:get" ? { session: null } : { ok: true },
      onMessage: { addListener: () => {} },
    },
  };

  try {
    dom.window.eval(script);
    const panel = dom.window.document.querySelector("#tts-panel");
    const handle = panel.querySelector(".tts-head");
    panel.getBoundingClientRect = () => ({
      left: 100, top: 100, right: 430, bottom: 300, width: 330, height: 200, x: 100, y: 100,
      toJSON: () => ({}),
    });

    handle.dispatchEvent(new dom.window.MouseEvent("pointerdown", { bubbles: true, clientX: 120, clientY: 120 }));
    handle.dispatchEvent(new dom.window.MouseEvent("pointermove", { bubbles: true, clientX: 300, clientY: 260 }));
    handle.dispatchEvent(new dom.window.MouseEvent("pointerup", { bubbles: true, clientX: 300, clientY: 260 }));

    assert.equal(panel.style.left, "280px");
    assert.equal(panel.style.top, "240px");
    assert.equal(panel.style.right, "auto");
    assert.equal(panel.style.bottom, "auto");
  } finally {
    dom.window.close();
  }
});

test("resizes the card by dragging its corners", async () => {
  const script = await readFile("dist/content.js", "utf8");
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    runScripts: "outside-only",
    virtualConsole: new VirtualConsole(),
    url: "https://www.youtube.com/watch?v=resize-test",
  });
  dom.window.browser = {
    runtime: {
      sendMessage: async message => message.type === "tab-session:get" ? { session: null } : { ok: true },
      onMessage: { addListener: () => {} },
    },
  };

  try {
    dom.window.eval(script);
    const panel = dom.window.document.querySelector("#tts-panel");
    panel.getBoundingClientRect = () => ({
      left: 100, top: 100, right: 430, bottom: 300, width: 330, height: 200, x: 100, y: 100,
      toJSON: () => ({}),
    });
    const handle = panel.querySelector(".tts-resize-nw");

    handle.dispatchEvent(new dom.window.MouseEvent("pointerdown", { bubbles: true, clientX: 100, clientY: 100 }));
    handle.dispatchEvent(new dom.window.MouseEvent("pointermove", { bubbles: true, clientX: 60, clientY: 70 }));
    handle.dispatchEvent(new dom.window.MouseEvent("pointerup", { bubbles: true, clientX: 60, clientY: 70 }));

    assert.equal(panel.style.width, "370px");
    assert.equal(panel.style.height, "230px");
    assert.equal(panel.style.left, "60px");
    assert.equal(panel.style.top, "70px");
  } finally {
    dom.window.close();
  }
});

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
