import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM, VirtualConsole } from "jsdom";

test("the popup can show the card on the active YouTube tab", async () => {
  const [html, script] = await Promise.all([
    readFile("assets/popup.html", "utf8"),
    readFile("dist/popup.js", "utf8"),
  ]);
  const dom = new JSDOM(html, {
    runScripts: "outside-only",
    virtualConsole: new VirtualConsole(),
    url: "moz-extension://tracklist-to-spotify/popup.html",
  });
  const tabMessages = [];

  dom.window.browser = {
    runtime: {
      sendMessage: async message => message.type === "spotify:get-status"
        ? { loggedIn: false, redirectUri: "https://example.test/callback" }
        : { ok: true },
    },
    storage: { local: { get: async () => ({}) } },
    tabs: {
      query: async () => [{ id: 42 }],
      sendMessage: async (tabId, message) => { tabMessages.push({ tabId, message }); },
    },
  };

  try {
    dom.window.eval(script);
    const showCard = dom.window.document.querySelector("#showCard");
    assert.ok(showCard, "popup should offer a Show YouTube card button");

    showCard.click();
    await new Promise(resolve => dom.window.setTimeout(resolve, 0));

    assert.equal(tabMessages.length, 1);
    assert.equal(tabMessages[0].tabId, 42);
    assert.equal(tabMessages[0].message.type, "card:show");
  } finally {
    dom.window.close();
  }
});
