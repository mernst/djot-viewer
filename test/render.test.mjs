// Tests of render.js and the vendored libraries, run in Node with jsdom.
//
// For each test/NAME.djot, render it and compare the resulting page with
// test/NAME.html.goal.  If the environment variable UPDATE_GOALS is set,
// write the goal files instead of comparing; review their diff before
// committing them.

import assert from "node:assert/strict";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, test } from "node:test";
import { JSDOM } from "jsdom";

const ROOT = new URL("../", import.meta.url);
const TEST_DIR = new URL("test/", ROOT);

/** The scripts that the manifest injects before content.js, in order. */
const SCRIPTS = ["vendor/djot/djot.js", "vendor/dompurify/purify.min.js", "render.js"];

/**
 * Return the given ES module of the extension, as content.js's `load` does
 * in Chrome.
 *
 * @param {string} path - a path within the extension, such as
 *     "vendor/temml/temml.mjs"
 * @returns {Promise<object>} a promise of the module
 */
function load(path) {
  return import(new URL(path, ROOT));
}

/**
 * Return a new jsdom window whose document resembles Chrome's page for a
 * plain-text file, with the manifest's scripts (other than content.js)
 * loaded.
 *
 * @param {string} text - a string, which becomes the contents of the page's
 *     <pre>
 * @returns {Window} the window
 */
function plainTextWindow(text) {
  const { window } = new JSDOM(
    '<!DOCTYPE html><html><head><meta name="color-scheme" content="light dark">'
      + "</head><body><pre></pre></body></html>",
    { runScripts: "outside-only" },
  );
  window.document.querySelector("pre").textContent = text;
  for (const script of SCRIPTS) {
    window.eval(readFileSync(new URL(script, ROOT), "utf8"));
  }
  return window;
}

/** djotViewer, from a window that is used only for its pure functions. */
const djotViewer = plainTextWindow("").djotViewer;

/**
 * Return the given text, encoded as UTF-8 and then decoded as windows-1252.
 * That is what Chrome shows for a UTF-8 file whose encoding it guesses
 * wrongly.
 *
 * @param {string} text - a string
 * @returns {string} the misdecoded text
 */
function misdecode(text) {
  return new TextDecoder("windows-1252").decode(new TextEncoder().encode(text));
}

describe("repairEncoding", () => {
  test("repairs UTF-8 that was decoded as windows-1252", () => {
    const text = `${"ASCII filler. ".repeat(600)}naïve café “€” 日本語 \u0081\u009d`;
    assert.notEqual(misdecode(text), text);
    assert.equal(djotViewer.repairEncoding(misdecode(text), "windows-1252"), text);
  });

  test("leaves genuine windows-1252 text unchanged", () => {
    const text = "café, naïve, “quotes”, €, ±";
    assert.equal(djotViewer.repairEncoding(text, "windows-1252"), text);
  });

  test("leaves text unchanged when the encoding is not windows-1252", () => {
    const text = misdecode("café");
    assert.equal(djotViewer.repairEncoding(text, "UTF-8"), text);
  });

  test("leaves text unchanged that windows-1252 cannot produce", () => {
    const text = "Ã© and 日本語";
    assert.equal(djotViewer.repairEncoding(text, "windows-1252"), text);
  });
});

describe("render", () => {
  const files = readdirSync(TEST_DIR).filter((f) => f.endsWith(".djot")).sort();
  for (const file of files) {
    test(file, async () => {
      // Decode the file as windows-1252, the worst case for Chrome's encoding
      // guess, so that each test also exercises repairEncoding.
      const bytes = readFileSync(new URL(file, TEST_DIR));
      const shown = new TextDecoder("windows-1252").decode(bytes);
      const window = plainTextWindow(shown);
      const source = window.djotViewer.repairEncoding(shown, "windows-1252");
      await window.djotViewer.render(window.document, source, { fileName: file, load });
      const actual = `${window.document.documentElement.outerHTML}\n`;

      const goalFile = new URL(file.replace(/\.djot$/, ".html.goal"), TEST_DIR);
      if (process.env.UPDATE_GOALS) {
        writeFileSync(goalFile, actual);
      } else {
        assert.equal(actual, readFileSync(goalFile, "utf8"));
      }
    });
  }

  test("build returns a rendering without changing the page", async () => {
    const window = plainTextWindow("text");
    const before = window.document.documentElement.outerHTML;
    const rendering = await window.djotViewer.build(
      window.document,
      "# Title\n\n# Two\n\n# Three\n",
      { fileName: "f.djot", load },
    );
    assert.equal(window.document.documentElement.outerHTML, before);
    assert.equal(rendering.title, "Title");
    // Array.from makes an array of this realm, not of jsdom's window.
    assert.deepEqual(Array.from(rendering.nodes, (n) => n.className), ["toc", "djot"]);
    assert.equal(rendering.nodes[1], rendering.main);
  });

  test("showing a new rendering keeps exactly one icon", async () => {
    const window = plainTextWindow("");
    const { document, djotViewer: viewer } = window;
    await viewer.render(document, "# One\n", { fileName: "f.djot", load });
    viewer.show(document, await viewer.build(document, "# Two\n", { fileName: "f.djot", load }));
    assert.equal(document.title, "Two");
    assert.equal(document.head.querySelectorAll('link[rel="icon"]').length, 1);
  });

  test("leaves the page unchanged if the parser fails", async () => {
    const window = plainTextWindow("text");
    const before = window.document.documentElement.outerHTML;
    window.djot = {
      parse() {
        throw new Error("parser failure");
      },
    };
    await assert.rejects(
      window.djotViewer.render(window.document, "text", { fileName: "f.djot", load }),
      /parser failure/,
    );
    assert.equal(window.document.documentElement.outerHTML, before);
  });

  test("renders the document without a feature whose library fails to load", async () => {
    const window = plainTextWindow("");
    const errors = [];
    window.console.error = (...args) => errors.push(args.join(" "));
    const failingLoad = () => Promise.reject(new Error("no such module"));
    await window.djotViewer.render(window.document, "# T\n\n$`x`\n\n``` python\nx\n```\n", {
      fileName: "f.djot",
      load: failingLoad,
    });
    const main = window.document.querySelector("main.djot");
    assert.equal(main.querySelector("span.math").textContent, "\\(x\\)");
    assert.equal(main.querySelector("code.language-python").textContent, "x\n");
    assert.equal(errors.length, 2);
  });
});
