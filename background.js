// The Djot viewer's service worker.  It rereads a local file for content.js,
// which checks whether the file has changed.  content.js cannot read it
// itself:  Chrome blocks a fetch from a file:// page, even one made by an
// extension's content script.
//
// The service worker does not read the file either; an offscreen document
// (offscreen.html) does.  Even when "Allow access to file URLs" is on, a
// fetch of a file:// URL from the service worker sometimes fails, most often
// after Chrome stops the idle service worker (as when the Djot page's tab is
// hidden for about 30 seconds) and starts it again.  A fetch from an
// offscreen document does not fail that way.

"use strict";

/** The URL of the offscreen document, relative to the extension's root. */
const OFFSCREEN_URL = "offscreen.html";

/**
 * A promise that the offscreen document will exist, while this service
 * worker is creating it; otherwise null.  It keeps two concurrent requests
 * from both creating the document, which Chrome forbids.
 *
 * @type {Promise<void>|null}
 */
let creatingOffscreen = null;

/**
 * Create the offscreen document, unless it exists already.
 *
 * @returns {Promise<void>} a promise that the offscreen document exists
 */
async function ensureOffscreenDocument() {
  if (creatingOffscreen === null) {
    if (await chrome.offscreen.hasDocument()) {
      return;
    }
    // Another request might have started creating the document while this
    // one awaited hasDocument.
    creatingOffscreen ??= chrome.offscreen
      .createDocument({
        url: OFFSCREEN_URL,
        // No reason names reading a file.  BLOBS is the closest:  the
        // document reads the file's bytes.
        reasons: ["BLOBS"],
        justification: "Reread a local Djot file to check whether it changed.",
      })
      .finally(() => {
        creatingOffscreen = null;
      });
  }
  await creatingOffscreen;
}

// Reply to a request from content.js with the current bytes of the file that
// the requesting page shows.  The reply is {bytes} on success, where bytes is
// a string with one character (U+0000 to U+00FF) per byte, or {error} with a
// message.  The file to read is the requesting page's own URL, never one in
// the message, so that a page cannot use this to read other files.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "read-file") {
    return false;
  }
  const url = sender.url;
  if (!url || !url.startsWith("file:")) {
    sendResponse({ error: `not a file:// page: ${url}` });
    return false;
  }
  ensureOffscreenDocument()
    .then(() => chrome.runtime.sendMessage({ type: "offscreen-read-file", url }))
    .then(
      (reply) => sendResponse(reply ?? { error: "no reply from the offscreen document" }),
      (error) => sendResponse({ error: String(error) }),
    );
  // The response is sent asynchronously.
  return true;
});
