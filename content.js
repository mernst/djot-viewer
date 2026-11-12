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
   * The longest time between checks of the file, in milliseconds.  After each
   * consecutive check that cannot read the file, the time until the next
   * check doubles, up to this limit.
   */
  const MAX_RELOAD_INTERVAL_MS = 30000;

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

  /** The state of the dark color scheme, which the user can change. */
  const darkScheme = matchMedia("(prefers-color-scheme: dark)");

  /** A promise that resolves when the last queued task is done. */
  let queue = Promise.resolve();

  /**
   * Run the given task after every task that was queued before it, so that
   * two tasks that change the page never overlap.  If the task fails, log
   * the error to the console.
   *
   * @param {function(): Promise<void>} task - a task that changes the page
   * @returns {Promise<void>} a promise that resolves when the task is done,
   *     whether or not it failed
   */
  function enqueue(task) {
    queue = queue
      .then(task)
      .catch((error) => console.error("djot-viewer: updating the page failed:", error));
    return queue;
  }

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

  /** The number of diagrams rendered so far, which makes each id unique. */
  let diagramCount = 0;

  /**
   * A promise of the Mermaid module, or null if it has not been loaded or if
   * loading it failed.
   */
  let mermaidPromise = null;

  /**
   * Return the Mermaid theme for the current color scheme.
   *
   * @returns {string} "dark" or "default"
   */
  function mermaidTheme() {
    return darkScheme.matches ? "dark" : "default";
  }

  /**
   * Return the Mermaid module, initialized with the given theme.  Load it the
   * first time, and again after a failure to load it.
   *
   * @param {string} theme - a Mermaid theme, such as "dark"
   * @returns {Promise<object>} a promise of the Mermaid module
   */
  async function loadMermaid(theme) {
    mermaidPromise ??= load("vendor/mermaid/mermaid.esm.min.mjs");
    let mermaid;
    try {
      mermaid = (await mermaidPromise).default;
    } catch (error) {
      // Try again next time, as when the page is rendered again.
      mermaidPromise = null;
      throw error;
    }
    // Initialize on every call, so that diagrams drawn after a change of
    // color scheme use the new scheme's theme.
    mermaid.initialize({
      startOnLoad: false,
      // "strict" encodes HTML in labels and disables click handlers.
      securityLevel: "strict",
      theme,
    });
    return mermaid;
  }

  /**
   * Return a new div.diagram element that shows the diagram that the given
   * Mermaid source text describes.  The element records `source` and `theme`
   * in its `data-source` and `data-theme` attributes, so that
   * `redrawDiagrams` can draw it again.
   *
   * @param {object} mermaid - the Mermaid module, as `loadMermaid` returns it
   * @param {string} theme - the theme that `mermaid` is initialized with
   * @param {string} source - a Mermaid source text
   * @returns {Promise<Element>} a promise of the element
   * @throws {Error} if Mermaid cannot render `source`
   */
  async function drawDiagram(mermaid, theme, source) {
    // `parse` reports a syntax error without leaving an error diagram in the
    // document, as `render` can.
    await mermaid.parse(source);
    // Each id is new, because Mermaid removes any element that already has
    // the id, such as a diagram that the page still shows.
    const { svg } = await mermaid.render(`djot-viewer-diagram-${++diagramCount}`, source);
    const diagram = document.createElement("div");
    diagram.className = "diagram";
    diagram.dataset.source = source;
    diagram.dataset.theme = theme;
    diagram.innerHTML = svg;
    return diagram;
  }

  /**
   * Replace each Mermaid code block in the given element by the diagram that
   * it describes.  The element need not be in the document.  Load Mermaid
   * only if there is a Mermaid block.  If a diagram cannot be rendered, keep
   * its code block and add an error message after it.
   *
   * @param {Element} main - an element that holds a rendered document
   */
  async function renderDiagrams(main) {
    const blocks = main.querySelectorAll("pre > code.language-mermaid");
    if (blocks.length === 0) {
      return;
    }
    const theme = mermaidTheme();
    let mermaid;
    try {
      mermaid = await loadMermaid(theme);
    } catch (error) {
      console.error("djot-viewer: loading Mermaid failed:", error);
      return;
    }
    for (const code of blocks) {
      const pre = code.parentElement;
      try {
        pre.replaceWith(await drawDiagram(mermaid, theme, code.textContent));
      } catch (error) {
        const message = document.createElement("p");
        message.className = "diagram-error";
        message.textContent = `Diagram error: ${error?.message ?? error}`;
        pre.after(message);
      }
    }
  }

  /**
   * Draw again, in place, each diagram in the page whose theme differs from
   * the current color scheme's.  The rest of the page follows the color
   * scheme through CSS, but a diagram keeps the theme that it was drawn
   * with.  If a diagram cannot be drawn again, keep it and log the error to
   * the console.
   */
  async function redrawDiagrams() {
    const theme = mermaidTheme();
    const stale = [...document.querySelectorAll("main.djot div.diagram")]
      .filter((diagram) => diagram.dataset.theme !== theme);
    if (stale.length === 0) {
      return;
    }
    let mermaid;
    try {
      mermaid = await loadMermaid(theme);
    } catch (error) {
      console.error("djot-viewer: loading Mermaid failed:", error);
      return;
    }
    for (const diagram of stale) {
      try {
        diagram.replaceWith(await drawDiagram(mermaid, theme, diagram.dataset.source));
      } catch (error) {
        console.error("djot-viewer: drawing a diagram again failed:", error);
      }
    }
  }

  /**
   * Return the rendering of the given Djot source text, as
   * `djotViewer.build` does, or null if the Djot parser fails.  In that case,
   * log the error to the console.
   *
   * @param {string} source - a Djot source text
   * @returns {Promise<object|null>} a promise of the rendering, or of null
   */
  async function build(source) {
    try {
      return await djotViewer.build(document, source, { fileName: fileName(), load });
    } catch (error) {
      console.error("djot-viewer: rendering failed:", error);
      return null;
    }
  }

  /**
   * Scroll to the element that the URL's fragment names, as in
   * "notes.djot#Results".  The browser looked for it before the page was
   * rendered, when the plain text had no such element.
   */
  function scrollToFragment() {
    const fragment = location.hash.slice(1);
    if (!fragment) {
      return;
    }
    let id;
    try {
      id = decodeURIComponent(fragment);
    } catch {
      // The fragment is not valid percent-encoded UTF-8.
      id = fragment;
    }
    document.getElementById(id)?.scrollIntoView();
  }

  /**
   * Replace the page's body by the rendering of the given Djot source text,
   * at the page's current scroll position.  The page changes only once, when
   * the rendering is complete, including its diagrams.  If the Djot parser
   * fails, log the error to the console and leave the page unchanged.
   *
   * @param {string} source - a Djot source text
   */
  async function rerender(source) {
    const rendering = await build(source);
    if (!rendering) {
      return;
    }
    await renderDiagrams(rendering.main);
    const { scrollX, scrollY } = window;
    // Keep the table of contents open or closed, as the user left it.
    // Otherwise, the content below it would move, and restoring the scroll
    // position would show different text.
    const tocWasOpen = document.querySelector("nav.toc > details")?.open;
    djotViewer.show(document, rendering);
    const toc = document.querySelector("nav.toc > details");
    if (toc && tocWasOpen !== undefined) {
      toc.open = tocWasOpen;
    } else {
      fitTocToWindow();
    }
    window.scrollTo(scrollX, scrollY);
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
   * The bytes of a version of the page's file:  for a file:// page, a string
   * with one character (U+0000 to U+00FF) per byte, as background.js sends
   * them; otherwise, a Uint8Array.
   *
   * @typedef {string|Uint8Array} FileBytes
   */

  /**
   * Return the current bytes of the page's file.
   *
   * @returns {Promise<FileBytes|null>} a promise of the file's bytes, or of
   *     null if the server responded with an error status, such as 404 for a
   *     deleted file
   * @throws {Error} if the file cannot be read at all, or if background.js
   *     does not reply with the bytes of a file:// page's file
   */
  async function fetchBytes() {
    if (location.protocol === "file:") {
      // Chrome blocks a fetch from a file:// page, so background.js reads the
      // file.
      const reply = await chrome.runtime.sendMessage({ type: "read-file" });
      // Any other reply is a failure.  Treating it as the file's bytes would
      // show an empty document.
      if (typeof reply?.bytes !== "string") {
        throw new Error(
          reply?.error ?? `unexpected reply from background.js: ${JSON.stringify(reply)}`,
        );
      }
      return reply.bytes;
    }
    const response = await fetch(location.href, { cache: "no-store" });
    return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
  }

  /**
   * Return true if the given versions of the page's file have the same bytes.
   *
   * @param {FileBytes} a - a version of the file
   * @param {FileBytes} b - another version of the file, from the same page
   * @returns {boolean} true if `a` and `b` have the same bytes
   */
  function sameBytes(a, b) {
    if (typeof a === "string") {
      return a === b;
    }
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Return the text of the given bytes of the page's file, decoded as Chrome
   * decoded the page when it loaded:  with the page's encoding, repaired as
   * the initial rendering repairs it, and with each line ending converted to
   * "\n", as Chrome's plain-text page does.
   *
   * @param {FileBytes} fileBytes - a version of the page's file
   * @returns {string} the file's text
   */
  function decode(fileBytes) {
    const bytes = typeof fileBytes === "string"
      ? Uint8Array.from(fileBytes, (c) => c.charCodeAt(0))
      : fileBytes;
    let decoder;
    try {
      decoder = new TextDecoder(document.characterSet);
    } catch {
      // TextDecoder does not support the page's encoding.
      decoder = new TextDecoder();
    }
    const text = decoder.decode(bytes).replace(/\r\n?/g, "\n");
    return djotViewer.repairEncoding(text, document.characterSet);
  }

  /**
   * Check the page's file for changes every RELOAD_INTERVAL_MS while the tab
   * is visible, and render the page again when the file changes.  If a check
   * cannot read the file, as when a local server restarts or an editor
   * replaces the file, try again later, waiting twice as long after each
   * consecutive failure, up to MAX_RELOAD_INTERVAL_MS.  Log the first failure
   * of each run of failures to the console.  Stop when the extension is
   * reloaded or removed.
   *
   * @param {string} source - a Djot source text, which the page shows now
   */
  async function watchForChanges(source) {
    // The text that the page shows, or that the parser failed on.
    let shown = source;
    let interval = RELOAD_INTERVAL_MS;
    // The bytes that the last check read, or null before the first check.
    // Decoding and comparing text costs more than comparing bytes, so a check
    // decodes the file only if its bytes changed.
    let previous = null;
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, interval));
      if (!chrome.runtime?.id) {
        // The extension was reloaded or removed, so this script can no longer
        // reach background.js or load libraries.  The page keeps its
        // rendering until the user reloads the tab.
        return;
      }
      if (document.visibilityState !== "visible") {
        continue;
      }
      let bytes;
      try {
        bytes = await fetchBytes();
      } catch (error) {
        if (interval === RELOAD_INTERVAL_MS) {
          console.error("djot-viewer: cannot check the file for changes; will keep trying:", error);
        }
        interval = Math.min(2 * interval, MAX_RELOAD_INTERVAL_MS);
        continue;
      }
      interval = RELOAD_INTERVAL_MS;
      if (bytes === null || (previous !== null && sameBytes(bytes, previous))) {
        continue;
      }
      previous = bytes;
      const current = decode(bytes);
      if (current !== shown) {
        // If the parser fails, the page keeps its previous rendering.  Do not
        // try that text again until the file changes again.
        shown = current;
        await enqueue(() => rerender(current));
      }
    }
  }

  async function main() {
    // An HTML page, such as a GitHub "blob" page, can also have a URL that
    // ends in ".djot".  Leave it alone.  Chrome shows other text types, such
    // as text/plain or text/x-djot, as plain text.
    const type = document.contentType;
    if (!type.startsWith("text/") || type === "text/html") {
      return;
    }
    // Chrome shows a plain-text file as the contents of a <pre>.
    const pre = document.querySelector("body > pre");
    if (!pre) {
      return;
    }
    const source = djotViewer.repairEncoding(pre.textContent, document.characterSet);
    const rendering = await build(source);
    if (!rendering) {
      // The page still shows the plain text.
      return;
    }
    // Show the page before rendering diagrams, because Mermaid is slow to
    // load.  As each diagram appears, Chrome's scroll anchoring keeps the
    // visible text in place.
    djotViewer.show(document, rendering);
    djotViewer.addIcon(document);
    fitTocToWindow();
    scrollToFragment();
    wideWindow.addEventListener("change", fitTocToWindow);
    // A change of color scheme while diagrams are being drawn is handled
    // after they are drawn, because tasks in the queue never overlap.
    darkScheme.addEventListener("change", () => enqueue(redrawDiagrams));
    enqueue(() => renderDiagrams(rendering.main));
    if (isLocal()) {
      await watchForChanges(source);
    }
  }

  main();
})();
