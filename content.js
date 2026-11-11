// The Chrome-specific part of the Djot viewer.  If Chrome is showing a Djot
// file as plain text, render it (with render.js) and its Mermaid diagrams.
// For a local file or a file on localhost, render it again whenever it
// changes.  It requires the global `djotViewer` from render.js.

"use strict";

(() => {
  /** A media query that matches a window wide enough for a sidebar. */
  const WIDE_WINDOW = "(min-width: 1200px)";

  /** How often to check whether the file has changed, in milliseconds. */
  const RELOAD_INTERVAL_MS = 1000;

  /**
   * Return the ES module at the given path, which is relative to the
   * extension's root directory, such as "vendor/temml/temml.mjs".  The file
   * must be listed in the manifest's `web_accessible_resources`.
   *
   * @param {string} path - a path within the extension
   * @returns {Promise<object>} a promise of the module
   */
  function load(path) {
    return import(chrome.runtime.getURL(path));
  }

  /**
   * Return the URL-decoded last segment of the page's path, such as
   * "my notes.djot" for ".../my%20notes.djot".
   *
   * @returns {string} the page's file name
   */
  function fileName() {
    const name = location.pathname.split("/").pop();
    try {
      return decodeURIComponent(name);
    } catch {
      // The name is not valid percent-encoded UTF-8.
      return name;
    }
  }

  /** The state of WIDE_WINDOW, which changes as the window is resized. */
  const wideWindow = matchMedia(WIDE_WINDOW);

  /**
   * Open the table of contents in a wide window, where it is a sidebar, and
   * close it in a narrow one, where it is a box above the document.
   */
  function fitTocToWindow() {
    const details = document.querySelector("nav.toc > details");
    if (details) {
      details.open = wideWindow.matches;
    }
  }

  /**
   * Replace each Mermaid code block in the document by the diagram that it
   * describes.  Load Mermaid only if there is a Mermaid block.  If a diagram
   * cannot be rendered, keep its code block and add an error message after
   * it.
   */
  async function renderDiagrams() {
    const blocks = document.querySelectorAll("main.djot pre > code.language-mermaid");
    if (blocks.length === 0) {
      return;
    }
    let mermaid;
    try {
      mermaid = (await load("vendor/mermaid/mermaid.esm.min.mjs")).default;
    } catch (error) {
      console.error("djot-viewer: loading Mermaid failed:", error);
      return;
    }
    mermaid.initialize({
      startOnLoad: false,
      // "strict" encodes HTML in labels and disables click handlers.
      securityLevel: "strict",
      theme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "default",
    });
    let count = 0;
    for (const code of blocks) {
      const pre = code.parentElement;
      const source = code.textContent;
      try {
        // `parse` reports a syntax error without leaving an error diagram in
        // the document, as `render` can.
        await mermaid.parse(source);
        const { svg } = await mermaid.render(`djot-viewer-diagram-${++count}`, source);
        const diagram = document.createElement("div");
        diagram.className = "diagram";
        diagram.innerHTML = svg;
        pre.replaceWith(diagram);
      } catch (error) {
        const message = document.createElement("p");
        message.className = "diagram-error";
        message.textContent = `Diagram error: ${error?.message ?? error}`;
        pre.after(message);
      }
    }
  }

  /**
   * Replace the page's body by the rendering of the given Djot source text,
   * including its diagrams, and keep the page's scroll position.  If the
   * Djot parser fails, log the error to the console and leave the page
   * unchanged.
   *
   * @param {string} source - Djot source text
   * @returns {Promise<boolean>} a promise of true if the page was rendered
   */
  async function renderPage(source) {
    const { scrollX, scrollY } = window;
    try {
      await djotViewer.render(document, source, { fileName: fileName(), load });
    } catch (error) {
      console.error("djot-viewer: rendering failed:", error);
      return false;
    }
    fitTocToWindow();
    window.scrollTo(scrollX, scrollY);
    await renderDiagrams();
    // Diagrams change the height of the content above the scroll position.
    window.scrollTo(scrollX, scrollY);
    return true;
  }

  /**
   * Return true if the page's file is local or on this computer, so that
   * checking it for changes every second costs little.
   *
   * @returns {boolean} true if the page's URL is a file:// URL or names
   *     localhost
   */
  function isLocal() {
    return location.protocol === "file:"
      || ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  }

  /**
   * Return the current contents of the page's file, read again.  Decode it
   * as UTF-8, or as windows-1252 if it is not valid UTF-8, and convert each
   * line ending to "\n", as Chrome's plain-text page does.
   *
   * @returns {Promise<string|null>} a promise of the file's text, or of null
   *     if the server responded with an error status, such as 404 for a
   *     deleted file
   * @throws {Error} if the file cannot be read at all
   */
  async function fetchSource() {
    if (location.protocol === "file:") {
      // Chrome blocks a fetch from a file:// page, so background.js reads the
      // file.  It decodes the text the same way as below.
      const reply = await chrome.runtime.sendMessage({ type: "read-file" });
      if (reply.error !== undefined) {
        throw new Error(reply.error);
      }
      return reply.text;
    }
    const response = await fetch(location.href, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    const bytes = await response.arrayBuffer();
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      text = new TextDecoder("windows-1252").decode(bytes);
    }
    return text.replace(/\r\n?/g, "\n");
  }

  /**
   * Check the page's file for changes every RELOAD_INTERVAL_MS while the tab
   * is visible, and render the page again when the file changes.  If the
   * first check cannot fetch the file, log the error to the console and stop
   * checking.  Later failures, as when a local server restarts, are ignored.
   *
   * @param {string} source - the Djot source text that the page shows now
   */
  async function watchForChanges(source) {
    let shown = source;
    let fetched = false;
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, RELOAD_INTERVAL_MS));
      if (document.visibilityState !== "visible") {
        continue;
      }
      let current;
      try {
        current = await fetchSource();
      } catch (error) {
        if (!fetched) {
          console.error("djot-viewer: automatic reloading is unavailable:", error);
          return;
        }
        continue;
      }
      fetched = true;
      if (current !== null && current !== shown) {
        // If the parser fails, the page keeps its previous rendering.  Do not
        // try that text again until the file changes again.
        shown = current;
        await renderPage(current);
      }
    }
  }

  async function main() {
    // An HTML page, such as a GitHub "blob" page, can also have a URL that
    // ends in ".djot".  Leave it alone.
    if (document.contentType !== "text/plain" && document.contentType !== "text/x-djot") {
      return;
    }
    // Chrome shows a plain-text file as the contents of a <pre>.
    const pre = document.querySelector("body > pre");
    if (!pre) {
      return;
    }
    const source = djotViewer.repairEncoding(pre.textContent, document.characterSet);
    // If rendering fails, the page still shows the plain text.
    if (!(await renderPage(source))) {
      return;
    }
    wideWindow.addEventListener("change", fitTocToWindow);
    if (isLocal()) {
      await watchForChanges(source);
    }
  }

  main();
})();
