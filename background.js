// The Djot viewer's service worker.  It reads a local file again for
// content.js, which checks whether the file has changed.  content.js cannot
// read it itself:  Chrome blocks a fetch from a file:// page, even one made
// by an extension's content script, but it allows a fetch from the
// extension's service worker if "Allow access to file URLs" is on.

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

// Reply to a request from content.js with the current bytes of the file that
// the requesting page shows.  The reply is {bytes}, as from byteString, on
// success, or {error} with a message.  The file to read is the requesting
// page's own URL, never one in the message, so that a page cannot use this
// to read other files.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "read-file") {
    return false;
  }
  const url = sender.url;
  if (!url || !url.startsWith("file:")) {
    sendResponse({ error: `not a file:// page: ${url}` });
    return false;
  }
  fetch(url, { cache: "no-store" })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`status ${response.status} reading ${url}`);
      }
      return response.arrayBuffer();
    })
    .then(
      (buffer) => sendResponse({ bytes: byteString(buffer) }),
      (error) => sendResponse({ error: String(error) }),
    );
  // The response is sent asynchronously.
  return true;
});
