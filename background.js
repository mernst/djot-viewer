// The Djot viewer's service worker.  It gets the current bytes of a local
// file for content.js, which checks whether the file has changed.  content.js
// cannot read the file itself:  Chrome blocks a fetch from a file:// page,
// even one made by an extension's content script.
//
// The service worker does not read the file either; it asks an offscreen
// document (offscreen.html) to read it, and passes the reply on to
// content.js.  Even when "Allow access to file URLs" is on, a fetch of a
// file:// URL from the service worker sometimes fails, most often after
// Chrome stops the idle service worker (as when the Djot page's tab is hidden
// for about 30 seconds) and starts it again.  A fetch from an offscreen
// document does not fail that way.

"use strict";

/** The URL of the offscreen document, relative to the extension's root. */
const OFFSCREEN_URL = "offscreen.html";

/**
 * How long the offscreen document stays open after the last request, in
 * milliseconds.  It is shorter than the 30 seconds after which Chrome stops
 * an idle service worker, so that the timer fires before the service worker
 * stops.
 */
const OFFSCREEN_IDLE_MS = 20000;

/**
 * How long to wait before asking the offscreen document again after a
 * request to it failed, in milliseconds.  A document that is still loading
 * has no listener yet.
 */
const RETRY_DELAY_MS = 100;

/**
 * True if this service worker has made sure that the offscreen document
 * exists, and has not closed it since.  It saves a call to
 * chrome.offscreen.hasDocument for each request.
 */
let offscreenReady = false;

/**
 * A promise that settles when the last queued creation or closing of the
 * offscreen document has finished.  Each such operation waits for the
 * previous one, so that one request does not create the document while
 * another request creates or closes it.  Chrome forbids a second offscreen
 * document.
 *
 * @type {Promise<void>}
 */
let offscreenQueue = Promise.resolve();

/**
 * The timer that closes the offscreen document when no request has arrived
 * for OFFSCREEN_IDLE_MS, or undefined if none is pending.
 *
 * @type {number|undefined}
 */
let idleTimer;

/**
 * Run the given operation on the offscreen document after every operation
 * queued before it has finished.
 *
 * @param {function(): Promise<void>} operation - a creation or closing of the
 *     offscreen document
 * @returns {Promise<void>} a promise that the operation has finished
 */
function enqueueOffscreenOperation(operation) {
  const result = offscreenQueue.then(operation);
  // A failure belongs to the caller of this operation, not to later ones.
  offscreenQueue = result.catch(() => {});
  return result;
}

/**
 * Create the offscreen document, unless it exists already.
 *
 * @returns {Promise<void>} a promise that the offscreen document exists
 */
async function ensureOffscreenDocument() {
  if (offscreenReady) {
    return;
  }
  await enqueueOffscreenOperation(async () => {
    if (offscreenReady) {
      return;
    }
    if (!(await chrome.offscreen.hasDocument())) {
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_URL,
        // No reason names reading a local file.  BLOBS is the closest:  the
        // document reads the file's bytes.
        reasons: ["BLOBS"],
        justification:
          "Read the bytes of a local Djot file (a file:// URL) that a tab shows, "
          + "to check whether the file has changed.  A service worker's fetch of "
          + "a file:// URL is unreliable.",
      });
    }
    offscreenReady = true;
  });
}

/**
 * Close the offscreen document, if it exists.
 *
 * @returns {Promise<void>} a promise that the offscreen document does not
 *     exist
 */
function closeOffscreenDocument() {
  // A request that arrives from now on queues its creation of the document
  // after this closing.
  offscreenReady = false;
  return enqueueOffscreenOperation(async () => {
    if (await chrome.offscreen.hasDocument()) {
      await chrome.offscreen.closeDocument();
    }
  });
}

/**
 * Close the offscreen document after OFFSCREEN_IDLE_MS, unless another
 * request arrives first.  The document is needed only while a Djot page's tab
 * is visible, because content.js does not check for changes in a hidden tab.
 */
function restartIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = undefined;
    closeOffscreenDocument().catch((error) => {
      console.error("djot-viewer: cannot close the offscreen document:", error);
    });
  }, OFFSCREEN_IDLE_MS);
}

/**
 * Return the offscreen document's reply to a request to read the given file.
 *
 * @param {string} url - a file:// URL
 * @returns {Promise<object>} a promise of the reply:  {bytes} or {error}, as
 *     content.js expects
 */
async function readFile(url) {
  const message = { type: "offscreen-read-file", url };
  await ensureOffscreenDocument();
  try {
    return await chrome.runtime.sendMessage(message);
  } catch {
    // The offscreen document is closed or is still loading.  It is closed if
    // Chrome closed it or if it was closed during the request; it is still
    // loading if Chrome stopped this service worker while it was creating the
    // document.
    offscreenReady = false;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    await ensureOffscreenDocument();
    return await chrome.runtime.sendMessage(message);
  }
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
  restartIdleTimer();
  readFile(url).then(
    (reply) => sendResponse(reply ?? { error: "no reply from the offscreen document" }),
    (error) => sendResponse({ error: String(error) }),
  );
  // The response is sent asynchronously.
  return true;
});
