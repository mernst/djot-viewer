// The rendering pipeline of the Djot viewer.  It needs no Chrome API, so the
// Node tests (test/render.test.mjs) can run it with jsdom.
//
// This is a plain script, not an ES module, because content scripts that a
// manifest lists cannot be ES modules.  It requires the globals `djot` (from
// vendor/djot/djot.js) and `DOMPurify` (from vendor/dompurify/purify.min.js),
// and it defines the global `djotViewer`.

"use strict";

globalThis.djotViewer = (() => {
  // The characters that the WHATWG windows-1252 decoder produces for bytes
  // 0x80-0x9F, the only bytes whose characters differ from their byte values.
  // For example, byte 0x80 decodes to "€" (U+20AC), not to U+0080.
  const WINDOWS_1252_HIGH = new TextDecoder("windows-1252").decode(
    Uint8Array.from({ length: 32 }, (_, i) => 0x80 + i),
  );

  /** Maps each character in WINDOWS_1252_HIGH to the byte that it decodes from. */
  const WINDOWS_1252_HIGH_BYTES = new Map(
    [...WINDOWS_1252_HIGH].map((c, i) => [c, 0x80 + i]),
  );

  /** The minimum number of headings of levels 1-3 for a table of contents. */
  const TOC_MIN_HEADINGS = 3;

  /**
   * The URL of the page's icon:  the letters "dj" on a transparent
   * background, black in the light color scheme and white in the dark one.
   */
  const FAVICON = "data:image/svg+xml,"
    + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
        + "<style>@media (prefers-color-scheme: dark) { text { fill: #fff; } }</style>"
        + '<text x="16" y="22" font-family="Arial,Helvetica,sans-serif" font-size="21"'
        + ' font-weight="bold" text-anchor="middle" fill="#000">dj</text></svg>',
    );

  // DOMPurify removes an id that is also the name of a property of `document`
  // or of a form, such as "title", because such an id on an element such as
  // <img> or <object> overrides that property ("DOM clobbering").  An id on a
  // <section> cannot override a property, so keep it:  djot.js puts each
  // heading's identifier on the heading's <section>, and the table of
  // contents links to it.
  DOMPurify.addHook("uponSanitizeAttribute", (node, data) => {
    if (node.nodeName === "SECTION" && data.attrName === "id") {
      data.forceKeepAttr = true;
    }
  });

  /**
   * Return the given text, repaired if it was decoded with the wrong
   * encoding.  If `characterSet` is windows-1252, but the bytes that the text
   * was decoded from are valid UTF-8, return the text decoded as UTF-8.
   * Otherwise, return the text unchanged.
   *
   * @param {string} text - a string that was decoded from bytes
   * @param {string} characterSet - the encoding that the text was decoded
   *     with, as `document.characterSet` reports it, such as "windows-1252"
   *     or "UTF-8"
   * @returns {string} the repaired text
   */
  function repairEncoding(text, characterSet) {
    if (characterSet.toLowerCase() !== "windows-1252" || /^[\0-\x7f]*$/.test(text)) {
      return text;
    }
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      const byte = WINDOWS_1252_HIGH_BYTES.get(text[i])
        ?? (code < 0x80 || (code >= 0xa0 && code <= 0xff) ? code : undefined);
      if (byte === undefined) {
        // The windows-1252 decoder cannot produce this character.
        return text;
      }
      bytes[i] = byte;
    }
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      // The bytes are not UTF-8, so the file really is windows-1252 or Latin-1.
      return text;
    }
  }

  /**
   * A rendered Djot document that is not yet in a page.
   *
   * @typedef {object} Rendering
   * @property {string} title - the document's title, such as "My notes"
   * @property {Element} main - the `<main class="djot">` element that holds
   *     the rendered document
   * @property {Element[]} nodes - the elements that become the page's body:
   *     the table of contents (if there is one) and `main`
   */

  /**
   * Return the rendering of the given Djot source text, without changing the
   * given document.  The rendering is sanitized, and it includes rendered
   * math, syntax highlighting, and a table of contents.  Mermaid diagrams are
   * left as code blocks.
   *
   * If the Djot parser fails, throw.  If math, highlighting, or the table of
   * contents fails, log the error to the console and return a rendering
   * without that feature.
   *
   * @param {Document} document - a document, which creates the rendering's
   *     elements
   * @param {string} source - Djot source text
   * @param {object} options - options
   * @param {string} options.fileName - the title to use if the source has no
   *     level-1 heading, such as "my notes.djot"
   * @param {function(string): Promise<object>} options.load - a function that
   *     takes the path of an ES module relative to the extension's root
   *     directory, such as "vendor/temml/temml.mjs", and returns a promise of
   *     the module
   * @returns {Promise<Rendering>} a promise of the rendering
   */
  async function build(document, source, { fileName, load }) {
    const html = djot.renderHTML(djot.parse(source));
    const main = document.createElement("main");
    main.className = "djot";
    main.innerHTML = DOMPurify.sanitize(html);

    const h1 = main.querySelector("h1");
    const title = (h1 && titleText(h1)) || fileName;

    await step("math rendering", () => renderMath(main, load));
    await step("syntax highlighting", () => highlightCode(main, load));
    let toc = null;
    await step("the table of contents", () => {
      toc = buildToc(document, main);
    });
    return { title, main, nodes: toc ? [toc, main] : [main] };
  }

  /**
   * Replace the body of the given document by the given rendering, and set
   * the document's title.
   *
   * @param {Document} document - a document, such as Chrome's page for a
   *     plain-text file
   * @param {Rendering} rendering - a rendering that `build` returned for
   *     `document`
   */
  function show(document, rendering) {
    document.documentElement.classList.add("djot-viewer");
    document.title = rendering.title;
    document.body.replaceChildren(...rendering.nodes);
  }

  /**
   * Add the viewer's icon (FAVICON) to the head of the given document, as a
   * `<link rel="icon">` element.  Each call adds another such element.
   *
   * @param {Document} document - a document, such as Chrome's page for a
   *     plain-text file
   */
  function addIcon(document) {
    const icon = document.createElement("link");
    icon.rel = "icon";
    icon.href = FAVICON;
    document.head.append(icon);
  }

  /**
   * Replace the body of the given document by the rendering of the given Djot
   * source text, and set the document's title and icon.  This is `build`
   * followed by `show` and `addIcon`.  If the Djot parser fails, throw before
   * changing the document.
   *
   * @param {Document} document - a document, such as Chrome's page for a
   *     plain-text file
   * @param {string} source - Djot source text
   * @param {object} options - options, as for `build`
   * @returns {Promise<void>} a promise that resolves when rendering is done
   */
  async function render(document, source, options) {
    show(document, await build(document, source, options));
    addIcon(document);
  }

  /**
   * Run the given action, and log an error to the console if it fails.
   *
   * @param {string} description - what the action does, such as "math
   *     rendering"; used for diagnostics
   * @param {function(): (void|Promise<void>)} action - an action
   */
  async function step(description, action) {
    try {
      await action();
    } catch (error) {
      console.error(`djot-viewer: ${description} failed:`, error);
    }
  }

  /**
   * Return the text of the given heading, for use as a document title.  Each
   * math span contributes its TeX source without delimiters, and footnote
   * references contribute nothing.
   *
   * @param {Element} heading - a heading element, before math rendering
   * @returns {string} the heading's text, with whitespace collapsed
   */
  function titleText(heading) {
    const copy = heading.cloneNode(true);
    for (const span of copy.querySelectorAll("span.math")) {
      span.textContent = texSource(span);
    }
    for (const ref of copy.querySelectorAll('a[role="doc-noteref"]')) {
      ref.remove();
    }
    return copy.textContent.replace(/\s+/g, " ").trim();
  }

  /**
   * Return the TeX source of the given math span, without the delimiters
   * `\(`...`\)` or `\[`...`\]` that djot.js puts around it.
   *
   * @param {Element} span - a `span.math` element that djot.js produced
   * @returns {string} the TeX source, such as "x^2"
   */
  function texSource(span) {
    const text = span.textContent;
    return /^\\[([][\s\S]*\\[)\]]$/.test(text) ? text.slice(2, -2) : text;
  }

  /**
   * Replace the contents of each math span in the given element by MathML.
   * Load Temml only if there is a math span.
   *
   * @param {Element} main - the element that holds the rendered document
   * @param {function(string): Promise<object>} load - a module loader, as
   *     for `render`
   */
  async function renderMath(main, load) {
    const spans = main.querySelectorAll("span.math");
    if (spans.length === 0) {
      return;
    }
    const temml = (await load("vendor/temml/temml.mjs")).default;
    for (const span of spans) {
      const displayMode = span.classList.contains("display");
      try {
        // Temml's defaults are kept:  `throwOnError: false` shows invalid TeX
        // as an error message, and `trust: false` disables commands such as
        // \href.
        span.innerHTML = temml.renderToString(texSource(span), { displayMode });
      } catch (error) {
        console.error("djot-viewer: math rendering failed:", span.textContent, error);
      }
    }
  }

  /**
   * Highlight the syntax of each code block in the given element that names a
   * language that highlight.js knows.  Load highlight.js only if some code
   * block names a language.  Leave Mermaid blocks unchanged.
   *
   * @param {Element} main - the element that holds the rendered document
   * @param {function(string): Promise<object>} load - a module loader, as
   *     for `render`
   */
  async function highlightCode(main, load) {
    const blocks = [];
    for (const code of main.querySelectorAll("pre > code")) {
      const language = codeLanguage(code);
      if (language !== undefined && language !== "mermaid") {
        blocks.push({ code, language });
      }
    }
    if (blocks.length === 0) {
      return;
    }
    const hljs = (await load("vendor/highlight.js/highlight.min.js")).default;
    for (const { code, language } of blocks) {
      if (hljs.getLanguage(language)) {
        // highlight.js escapes the code, so its output is safe.
        code.innerHTML = hljs.highlight(code.textContent, {
          language,
          ignoreIllegals: true,
        }).value;
        code.classList.add("hljs");
      }
    }
  }

  /**
   * Return the language that the given code element names in its class, such
   * as "python" for `<code class="language-python">`.
   *
   * @param {Element} code - a `code` element
   * @returns {string|undefined} the language, or undefined if the element
   *     names none
   */
  function codeLanguage(code) {
    for (const name of code.classList) {
      if (name.startsWith("language-") && name.length > "language-".length) {
        return name.slice("language-".length);
      }
    }
    return undefined;
  }

  /**
   * Return a table of contents for the given element, if the element has at
   * least TOC_MIN_HEADINGS headings of levels 1-3.  The table of contents is
   * a `<nav class="toc">` that holds a `<details>`, which is closed.
   *
   * @param {Document} document - the document that creates the table of
   *     contents
   * @param {Element} main - an element that holds a rendered document, after
   *     math rendering
   * @returns {Element|null} the table of contents, or null if `main` has too
   *     few headings
   */
  function buildToc(document, main) {
    const headings = main.querySelectorAll("h1, h2, h3");
    if (headings.length < TOC_MIN_HEADINGS) {
      return null;
    }
    const levels = [...headings].map((h) => Number(h.tagName[1]));

    const topList = document.createElement("ul");
    // The innermost list is last.  `item` is the list's last entry, or null.
    const stack = [{ level: Math.min(...levels), list: topList, item: null }];
    headings.forEach((heading, i) => {
      const level = levels[i];
      while (level < stack.at(-1).level) {
        stack.pop();
      }
      let top = stack.at(-1);
      if (level > top.level) {
        if (top.item === null) {
          // The heading is deeper than its predecessor's level, but it has no
          // predecessor at that level.  Nest it under an empty entry.
          top.item = document.createElement("li");
          top.list.append(top.item);
        }
        const list = document.createElement("ul");
        top.item.append(list);
        top = { level, list, item: null };
        stack.push(top);
      }
      top.item = tocEntry(document, heading);
      top.list.append(top.item);
    });

    const summary = document.createElement("summary");
    summary.textContent = "Contents";
    const details = document.createElement("details");
    details.append(summary, topList);
    const nav = document.createElement("nav");
    nav.className = "toc";
    nav.setAttribute("aria-label", "Table of contents");
    nav.append(details);
    return nav;
  }

  /**
   * Return the table-of-contents entry for the given heading:  a list item
   * that holds a copy of the heading's contents, linked to the heading's
   * section if the section has an identifier.
   *
   * @param {Document} document - the document that holds the heading
   * @param {Element} heading - a heading element
   * @returns {Element} an `li` element
   */
  function tocEntry(document, heading) {
    const copy = heading.cloneNode(true);
    for (const ref of copy.querySelectorAll('a[role="doc-noteref"]')) {
      ref.remove();
    }
    for (const link of copy.querySelectorAll("a")) {
      link.replaceWith(...link.childNodes);
    }
    for (const element of copy.querySelectorAll("[id]")) {
      element.removeAttribute("id");
    }

    // djot.js puts a heading's identifier on its enclosing section.  A heading
    // in raw HTML can have its own.
    const section = heading.parentElement;
    const id = heading.id
      || (section && section.tagName === "SECTION" ? section.id : "");
    const label = document.createElement(id ? "a" : "span");
    if (id) {
      label.href = `#${encodeURIComponent(id)}`;
    }
    label.append(...copy.childNodes);
    const item = document.createElement("li");
    item.append(label);
    return item;
  }

  return { repairEncoding, build, show, addIcon, render };
})();
