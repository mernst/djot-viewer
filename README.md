# Djot Viewer

This Chrome extension displays [Djot](https://djot.net/) files (`.djot`,
`.dj`, `.DJOT`, and `.DJ`) as formatted HTML.  It works for local files
(`file://`) and for remote files (`http://`, `https://`) that a server sends
as text, such as files on `raw.githubusercontent.com`.

Features:

- A collapsible table of contents, as a sidebar or box above the document,
  depending on the browser window width.
- Math, written in Djot as `` $`x^2` `` (inline) or `` $$`x^2` `` (display),
  rendered as MathML by [Temml](https://temml.org/).
- Diagrams, written as a code block that starts with ```` ``` mermaid ````,
  rendered by [Mermaid](https://mermaid.js.org/).
- Syntax highlighting of a code block that names a language, such as
  ```` ``` python ````, by [highlight.js](https://highlightjs.org/).  It
  knows these 36 languages (and their aliases, such as `js` and `sh`):
  bash, c, cpp, csharp, css, diff, go, graphql, ini, java, javascript, json,
  kotlin, less, lua, makefile, markdown, objectivec, perl, php,
  php-template, plaintext, python, python-repl, r, ruby, rust, scss, shell,
  sql, swift, typescript, vbnet, wasm, xml, and yaml.
- A light and a dark appearance, following the system's color scheme.
- The tab title is the first level-1 heading, or the file name if there is
  none.  The tab icon is the letters "dj", following the system's color
  scheme:  black for light and white for dark.
- Automatic reloading of a local file (`file://`) or a file on `localhost`:
  about a second after the file changes, the page shows the new version, at
  the same scroll position.  The extension checks for changes only while the
  tab is visible.

Raw HTML in a document (such as `` `<b>bold</b>`{=html} ``) is sanitized
with [DOMPurify](https://github.com/cure53/DOMPurify), so a document cannot
run scripts.

## Installation

The extension requires Chrome 120 or later.

1. Clone this repository:

   ```sh
   git clone https://github.com/mernst/djot-viewer.git
   ```

2. Open `chrome://extensions`.
3. Turn on "Developer mode" (at the top right).
4. Click "Load unpacked", and choose the repository's directory.
5. To view local files, click "Details" for the extension, and turn on
   "Allow access to file URLs".

### Updating

Chrome does not notice when the files of an unpacked extension change.  After
you update the repository (for example, with `git pull`), do one of these:

- Open `chrome://extensions` and click the reload button (the circular arrow)
  on the extension's card.  Then reload any Djot page that is already open.
- Quit Chrome completely and start it again.  Closing all of Chrome's windows
  is not enough if "Continue running background apps when Google Chrome is
  closed" is on (in `chrome://settings/system`), because Chrome then keeps
  running.

### The "all websites" warning

When you install the extension, Chrome warns that it can "Read and change all
your data on all websites."  The extension runs only on pages whose URL ends
in `.djot`, `.dj`, `.DJOT`, or `.DJ` (optionally followed by a query string
such as `?token=abc`), and it changes only a page that Chrome shows as plain
text.  But Chrome ignores the path of a URL pattern when it decides which
sites an extension can access, so a pattern such as `*://*/*.djot` counts as
access to every site.

If you set the extension's "Site access" (under "Details") to "On click", the
extension does not run on a page until you click its icon in the toolbar.

## Viewing files from a local web server

A server must send a `text/*` content type, such as `text/plain`, for
`.djot` files.  Otherwise, Chrome downloads the file instead of displaying it.
For example, `python3 -m http.server` sends `application/octet-stream` for
`.djot`, because Python's `mimetypes` module does not recognize the extension.

## Known limitations

- A server that sends `application/octet-stream` for `.djot` files makes
  Chrome download the file, so the extension never sees it.
- On `raw.githubusercontent.com`, images in a document are not shown,
  because the site's Content Security Policy blocks them.
- If Chrome guesses the wrong encoding for a file, the extension repairs a
  guess of windows-1252 for a UTF-8 file, but not other wrong guesses.
- A file extension in mixed case, such as `README.Djot`, is not rendered.
  Lowercase (`.djot`) and uppercase (`.DJOT`) are.
- Math looks best with a math font installed, such as STIX Two Math or Latin
  Modern Math.
- A web page can detect that the extension is installed, by requesting one
  of the library files that the extension makes accessible to pages.  Sites
  use such checks for fingerprinting:  combining facts such as which
  extensions are installed to recognize a browser, and so to track its user,
  without cookies.
- Diagrams take a moment to appear, because Mermaid is large and is loaded
  only when a document contains a diagram.

## Development

These are all the files that make up the extension.  The repository's other
files are documentation, licenses, tests, and the script that updates the
libraries.

- `manifest.json` tells Chrome which pages the extension runs on, and which
  scripts and stylesheets to inject into them.
- `render.js` renders a Djot document:  it parses, sanitizes, renders math,
  highlights code, and builds the table of contents.  It uses no Chrome API.
- `content.js` is the Chrome-specific part:  it decides whether to render the
  page, reads the file's text from the page, loads libraries, renders
  Mermaid diagrams, and renders the page again when a local file changes.
- `background.js` is the extension's service worker.  It rereads a local
  file for `content.js`, which checks whether the file has changed; Chrome
  does not let a content script read a `file://` URL.
- `content.css` styles a rendered page.
- `vendor/` holds the libraries that the scripts use, except
  `vendor/update.sh`, which downloads them (see
  [Vendored libraries](#vendored-libraries)).

### Tests

The tests run `render.js` in [Node](https://nodejs.org/) with
[jsdom](https://github.com/jsdom/jsdom).  They do not exercise Chrome itself
(the manifest, the content-type check, the window-width check, or Mermaid).

```sh
npm install
npm test
```

For each `test/NAME.djot`, the tests compare the rendered page with
`test/NAME.html.goal`.  After an intended change to the output, update the
goal files, and review their diff before committing them:

```sh
UPDATE_GOALS=1 npm test
git diff test/
```

To test in Chrome, load the unpacked extension and open the files in `test/`,
either as local files or from a local web server that sends them as
`text/plain`.

### Vendored libraries

The extension includes these libraries, downloaded from npm by
`vendor/update.sh`.  Each library's directory under `vendor/` holds its
license.  The project's MIT license (in `LICENSE`) does not cover the files
in `vendor/` other than `vendor/update.sh`; each library is under its own
license, shown below.  DOMPurify offers a choice of licenses, and this
project uses it under Apache-2.0.  The script copies each library's
JavaScript files unchanged.

| Library | Version | License |
| --- | --- | --- |
| [`@djot/djot`](https://github.com/jgm/djot.js) | 0.3.2 | MIT |
| [DOMPurify](https://github.com/cure53/DOMPurify) | 3.4.17 | MPL-2.0 or Apache-2.0 |
| [Temml](https://github.com/ronkok/Temml) | 0.14.0 | MIT |
| [highlight.js](https://github.com/highlightjs/highlight.js) (`@highlightjs/cdn-assets`) | 11.12.0 | BSD-3-Clause |
| [Mermaid](https://github.com/mermaid-js/mermaid) | 12.3.0 | MIT |

To change a version, edit the variable at the top of `vendor/update.sh`, run
the script, run the tests, and commit the result.  The script also generates
`vendor/temml/temml.css` and `vendor/highlight.js/highlight.css`, which are
the libraries' stylesheets with every rule scoped to pages that the viewer
renders.

## Comparison with Markdown viewers

Djot Viewer does for Djot what these Chrome extensions do for Markdown:

- [Markdown Viewer](https://github.com/simov/markdown-viewer), in the
  [Chrome Web Store](https://chromewebstore.google.com/detail/markdown-viewer/ckkdlimhmcjmikdlpkmbgfkaikojcbjk).
- [Markdown Reader](https://md-reader.github.io) (md-reader), in the
  [Chrome Web Store](https://chromewebstore.google.com/detail/md-reader/medapdbncneneejhbgcjceippjlfkmkg).
  Its GitHub repository,
  [md-reader/md-reader](https://github.com/md-reader/md-reader), holds the
  older 2.x version, which is no longer maintained.

Like those extensions, Djot Viewer renders a file in the same tab when Chrome
shows the file as plain text, works for both local and remote files, and
needs "Allow access to file URLs" for local files.  Like them, it has a table
of contents, math, Mermaid diagrams, syntax highlighting, light and dark
appearances, and automatic reloading of a changed file.

Djot Viewer differs from them in these ways:

- It renders Djot, not Markdown.
- It is installed from this repository as an unpacked extension, not from the
  Chrome Web Store.
- It has no settings and no themes.  Both Markdown viewers have themes, and
  Markdown Viewer has many settings, such as a choice of Markdown parser.
- It runs only in Chrome.  Both Markdown viewers are also available for
  Firefox and Edge.
- It has access to every site from the time it is installed (see
  [The "all websites" warning](#the-all-websites-warning)).  Markdown Viewer
  instead starts with access to no site, and you grant it access to each
  origin, such as `https://raw.githubusercontent.com`, in its options.
- Its features are always on.  In Markdown Viewer, the table of contents,
  math, and Mermaid diagrams are options that are off by default.
- Math needs no escaping of ordinary dollar signs, because Djot marks math
  explicitly, as in `` $`x^2` ``.  With math enabled, Markdown Viewer
  requires writing a dollar sign that is not part of a formula as `\$`.
