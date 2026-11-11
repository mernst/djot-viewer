// The Djot viewer's service worker.  It reads a local file again for
// content.js, which checks whether the file has changed.  content.js cannot
// read it itself:  Chrome blocks a fetch from a file:// page, even one made
// by an extension's content script, but it allows a fetch from the
// extension's service worker if "Allow access to file URLs" is on.

"use strict";

/**
 * Return the text of the given bytes:  decoded as UTF-8, or as windows-1252
 * if they are not valid UTF-8, with each line ending converted to "\n", as
 * Chrome's plain-text page does.
 *
 * @param {ArrayBuffer} bytes - the contents of a file
 * @returns {string} the file's text
 */
function decode(bytes) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("windows-1252").decode(bytes);
  }
  return text.replace(/\r\n?/g, "\n");
}

// Reply to a request from content.js with the current text of the file that
// the requesting page shows.  The reply is {text} on success, or {error} with
// a message.  The file to read is the requesting page's own URL, never one in
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
  fetch(url, { cache: "no-store" })
    .then((response) => response.arrayBuffer())
    .then(
      (bytes) => sendResponse({ text: decode(bytes) }),
      (error) => sendResponse({ error: String(error) }),
    );
  // The response is sent asynchronously.
  return true;
});
