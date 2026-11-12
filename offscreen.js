// The script of the Djot viewer's offscreen document.  It reads a local file
// for background.js, which explains why background.js cannot read the file
// itself.

"use strict";

/**
 * Return the given bytes as a string with one character per byte, U+0000 to
 * U+00FF.  Extension messages are JSON, which cannot hold bytes directly.
 *
 * @param {ArrayBuffer} buffer - a sequence of bytes, such as the contents of
 *     a file
 * @returns {string} the bytes as characters
 */
function byteString(buffer) {
  const bytes = new Uint8Array(buffer);
  // String.fromCharCode takes the bytes as arguments, so pass them in chunks
  // that stay under the engine's limit on the number of arguments.
  const chunk = 0x8000;
  let result = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    result += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return result;
}

/** The URL of the extension's service worker, the only sender of requests. */
const SERVICE_WORKER_URL = chrome.runtime.getURL("background.js");

// Reply to a request from background.js with the current bytes of the file
// whose file:// URL the message gives.  The reply is {bytes}, as from
// byteString, on success, or {error} with a message.  This ignores a request
// from any other sender, such as a content script, so that a page cannot use
// this to read other files.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "offscreen-read-file" || sender.url !== SERVICE_WORKER_URL) {
    return false;
  }
  const url = message.url;
  if (typeof url !== "string" || !url.startsWith("file:")) {
    sendResponse({ error: `not a file:// URL: ${url}` });
    return false;
  }
  fetch(url, { cache: "no-store" })
    .then((response) => response.arrayBuffer())
    .then(
      (buffer) => sendResponse({ bytes: byteString(buffer) }),
      (error) => sendResponse({ error: String(error) }),
    );
  // The response is sent asynchronously.
  return true;
});
