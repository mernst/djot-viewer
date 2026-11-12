# Plan:  publishing for Firefox and Edge

This document is a plan for making Djot Viewer available in the add-on
stores of Firefox and Microsoft Edge:

- [Firefox Add-ons](https://addons.mozilla.org/) (AMO), run by Mozilla.
- [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons),
  run by Microsoft through Partner Center.

Pull request #3 adds `docs/publishing-chrome-web-store.md`, which covers the
Chrome Web Store.  Several steps below reuse its work, and this plan refers
to it as "the Chrome document".

## Summary

Edge is built on Chromium, so the Chrome package works in Edge unchanged,
and publishing for Edge is mostly paperwork.  Firefox needs changes to the
manifest and to Temml's stylesheet, and probably to the reloading of local
files, and it needs testing of every feature, because Firefox's extension
platform differs from Chrome's in ways that matter to this extension.

Recommended order:

1. [Shared prerequisites](#phase-1--shared-prerequisites), which the Chrome
   Web Store also needs.
2. [Edge](#phase-2--edge), which is cheap and needs no code changes.
3. [Firefox compatibility](#phase-3--firefox-compatibility), the only phase
   with real engineering risk.
4. [Firefox publishing](#phase-4--firefox-publishing).
5. [Documentation and release process](#phase-5--documentation-and-release-process).

## Decisions for the maintainer

These choices affect the work below.  Each has a recommendation.

- **One manifest, or one per browser?**  Recommendation:  one
  `manifest.json` for all three browsers.  Chrome and Edge ignore the
  Firefox-only key `browser_specific_settings` (`chrome://extensions` shows a
  warning about it for an unpacked extension), and Firefox ignores
  `minimum_chrome_version`.  One manifest keeps the repository loadable as an
  unpacked extension in every browser, with no build step.  If a difference
  arises that one manifest cannot express, switch to a small script that
  writes a per-browser manifest into each ZIP file.
- **Firefox's add-on ID.**  Firefox identifies an add-on by the ID in its
  manifest, and the ID can never change after the first upload to AMO.
  Recommendation:  an email-like ID that the project controls, such as
  `djot-viewer@mernst.github.io`.
- **Automatic reloading of local files in Firefox.**  If Firefox does not let
  the extension reread a `file://` URL (see
  [Phase 3](#phase-3--firefox-compatibility)), then either release the
  Firefox version without that feature, documenting the difference, or
  delay the Firefox release until a workaround exists.  Recommendation:
  release without it.  Reloading of files on `localhost` does not depend on
  this.
- **Firefox for Android.**  AMO can also list an add-on for Firefox for
  Android.  Recommendation:  desktop only at first.  Viewing local files is
  awkward on Android, and the table of contents and window-width logic have
  not been tried on a phone.

## Phase 1:  shared prerequisites

These are needed by every store, and the Chrome document describes each of
them.  Do them once.

- Add icons (16, 32, 48, 96, and 128 pixels square) to the extension and to
  `manifest.json`.  Firefox's add-ons manager uses the 96-pixel icon on
  high-DPI displays; without it, Firefox scales up the 48-pixel icon, which
  looks blurry.  Edge's listing also wants a logo of at least 128x128
  pixels; 300x300 is recommended, so draw the artwork at a size that scales
  to 300x300.
- Commit a privacy policy, such as `PRIVACY.md`, that says the extension
  collects and transmits no data.
- Make screenshots at 1280x800 pixels, in the light and dark appearances.
  Edge accepts that size.  AMO accepts any size, and the same images serve.
- Use the Chrome document's `git archive` command to build the ZIP file.
  The same ZIP file serves all three stores if the manifest is shared (see
  [Decisions for the maintainer](#decisions-for-the-maintainer)).

## Phase 2:  Edge

### Testing

1. Load the repository unpacked from `edge://extensions` (turn on "Developer
   mode", then click "Load unpacked").
2. In the extension's details, turn on "Allow access to file URLs".
3. Check each feature in `README.md` with the files in `test/`, both as local
   files and from `raw.githubusercontent.com`:  rendering, the table of
   contents at both window widths, math, diagrams, highlighting, both color
   schemes, the tab title, and automatic reloading.

No code changes are expected.  If Edge shows plain text differently from
Chrome, `main` in `content.js`, which looks for `body > pre`, is the place
to look.

### Publishing

Microsoft's guide is
[Publish a Microsoft Edge extension](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension).

1. Register as a Microsoft Edge extension developer in
   [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/public/login?ref=dd).
   Registration has no fee.
2. Click "Create new extension" and upload the ZIP file.
3. **Availability:**  visibility "Public"; all markets.
4. **Properties:**  category (such as "Developer tools"); the privacy
   questions, which are part of this page:  answer that the extension does
   not access, collect, or transmit personal information, and give the
   privacy policy URL anyway; website
   (`https://github.com/mernst/djot-viewer`); and support contact (the
   repository's issues page).  Partner Center has no separate "Privacy" page
   and none of the Chrome Web Store's fields for the single purpose, the
   justification of permissions, or remote code.
5. **Store listings:**  a description of at least 250 characters (Edge's
   minimum, which a short description would not meet; reuse the Chrome
   listing's long description), the logo, and the screenshots.  The name and
   short description come from `manifest.json` and cannot be edited in
   Partner Center.
6. **Notes for certification:**  the same test instructions as for Chrome,
   plus the Chrome document's justification of the content script's match
   patterns, because Partner Center has no other place for it.
7. Click "Publish".  Certification can take up to seven business days.

Partner Center changes its form from time to time, so check these steps
against the form when submitting.

An update is a new ZIP file with a larger `version`, uploaded on the
extension's "Packages" page, followed by "Publish".

Edge users can already install extensions from the Chrome Web Store, after
allowing extensions from other stores.  The Edge listing adds
discoverability and avoids that extra step.

## Phase 3:  Firefox compatibility

### Manifest changes

1. Make the service worker also work as a Firefox background script.
   Firefox does not support `background.service_worker`; it runs
   `background.scripts` as an event page instead.  A manifest can list both,
   and each browser uses the one that it supports:

   ```json
   "background": {
     "service_worker": "background.js",
     "scripts": ["background.js"]
   },
   ```

   Chrome refuses an extension whose Manifest V3 `background` has `scripts`
   before Chrome 121, so raise `minimum_chrome_version` from 120 to 121, and
   update the requirement in `README.md`.  Firefox handles the combined key
   correctly from Firefox 121.

2. Add Firefox's settings:

   ```json
   "browser_specific_settings": {
     "gecko": {
       "id": "djot-viewer@mernst.github.io",
       "strict_min_version": "140.0",
       "data_collection_permissions": {
         "required": ["none"]
       }
     }
   },
   ```

   AMO requires every add-on created since November 3, 2025 to declare its
   data collection in `data_collection_permissions`; `"none"` declares that
   the extension collects nothing.  Firefox supports that key from Firefox
   140 (an Extended Support Release), which is the reason for
   `strict_min_version`.

### Stylesheet changes

Temml's stylesheet `dist/Temml-Local.css` ends with an
`@-moz-document url-prefix() { ... }` block, which only Firefox applies.  It
holds Temml's fixes for Firefox's layout of MathML:  it keeps `math` from
wrapping (`math { display: inline; }` and `math > mrow { padding: 0 }`), and
it corrects the spacing between the rows of an array (padding of `mtd` in
`mtable`).  `scope_css` in `vendor/update.sh` drops every `@-moz-document`
rule, because it cannot nest such a rule inside the selector
`html.djot-viewer`.  So `vendor/temml/temml.css` lacks these fixes, and in
Firefox, math can wrap, have extra padding, or space the rows of an array
wrongly.

Change `scope_css` to keep the block, by replacing
`@-moz-document url-prefix()` with `@supports (-moz-appearance: none)`.
Only Firefox supports `-moz-appearance`, so the replacement applies the
rules in the same browsers, and unlike `@-moz-document`, `@supports` can be
nested inside a selector.  Then run `vendor/update.sh` again, and check that
`test/math.djot` renders correctly in both Firefox and Chrome.

### Behavior to test

Each of these is a known difference between Firefox and Chrome that might
break a feature.  Test each one in Firefox, by loading the extension from
`about:debugging#/runtime/this-firefox` ("Load Temporary Add-on", then
choose `manifest.json`) or by running `npx web-ext run`.

- **Local files are shown as plain text.**  For a `file://` URL, Firefox
  picks the content type from the file name, and for an extension that it
  does not know, such as `.djot`, it might offer to download the file
  instead of showing it.  If so, the extension can do nothing about it, and
  `README.md` must tell Firefox users how to map to `text/plain` every file
  name extension that the extension handles:  `.djot`, `.dj`, `.DJOT`, and
  `.DJ` (on Linux, for example, in `~/.mime.types`).  Check whether the
  mapping ignores case; if it does not, the instructions must list the
  uppercase extensions too.  Test with `test/uppercase.DJOT` and
  `test/uppercase.DJ` as well as with a `.djot` and a `.dj` file.
- **Content scripts run on `file://` pages.**  Chrome requires the user to
  turn on "Allow access to file URLs".  Check what Firefox requires.
- **Host permissions are granted.**  In Firefox, a Manifest V3 extension's
  host permissions, including its content script match patterns, are
  optional:  Firefox 127 and later show them in the install prompt, but the
  user can revoke them at any time in the extension's "Permissions" tab.
  Check that the extension is active after a normal installation.  If the
  permissions are revoked, the content script does not run, and nothing
  else needs handling.
- **Other text types are shown as plain text.**  `main` in `content.js`
  renders a page whose content type is `text/*` other than `text/html` and
  whose body holds a `<pre>`.  Check a file served as `text/plain` and one
  served as `text/x-djot`; Firefox might download the latter.
- **Rereading a local file.**  For a `file://` page, `content.js` asks
  `background.js` to reread the file, because Chrome blocks a content
  script's fetch of a `file://` URL but allows the service worker's.  Mozilla
  bug reports say that Firefox blocks both.  If so, automatic reloading of
  local files does not work in Firefox (see
  [Decisions for the maintainer](#decisions-for-the-maintainer)).  In that
  case, `content.js` should not start watching a `file://` page in Firefox,
  rather than log a failure and retry forever.  Test for the capability, not
  the browser, and do not match the text of an error message:  Firefox
  gives the same `NetworkError` for a blocked fetch and for a missing file,
  and the text can change between versions.  Instead, change
  `watchForChanges` so that, for a `file://` page, a failed reread before
  any reread has succeeded (while `previous` is `null`) stops watching:
  the browser just loaded the page from the file, so the failure means
  that the browser does not allow the reread.  The first check of the
  existing loop serves as the probe, so no separate reread is needed, and
  Chrome and Edge read the file no more often than now.  After a reread has
  succeeded, a failure (such as when an editor replaces the file) is
  transient and is retried as now.
- **Loading libraries.**  `content.js` loads Temml, highlight.js, and
  Mermaid with `import(chrome.runtime.getURL(path))`.  Firefox supports that
  in content scripts, but its extension URLs contain a random UUID that
  differs between Firefox profiles.  Check that math, highlighting, and
  diagrams appear, including Mermaid's chunks in
  `vendor/mermaid/chunks/`.
- **DOMPurify and the DOM.**  A Firefox content script sees page objects
  through "Xray" wrappers.  Check that `test/sanitize.djot` renders as it
  does in Chrome, which the goal file `test/sanitize.html.goal` shows.
- **Messages.**  Firefox passes messages by structured clone, and Chrome
  passes them as JSON.  The extension's messages hold only strings, so this
  is not expected to matter.
- **Math rendering.**  Firefox has long supported MathML, but Temml relies
  on Firefox-only rules to lay it out well (see
  [Stylesheet changes](#stylesheet-changes)).  Check `test/math.djot`,
  especially inline math in a long line and the spacing between the rows
  of an array, both before and after the stylesheet change.
- **Encoding of local files.**  `content.js` and `repairEncoding` in
  `render.js` depend on `document.characterSet`, the encoding that the
  browser guessed for a plain-text page.  Firefox guesses with a different
  detector than Chrome's, and `repairEncoding` repairs only one wrong guess:
  a UTF-8 file decoded as windows-1252.  Check that
  `test/encoding-utf8.djot` and `test/encoding-latin1.djot` render as the
  goal files `test/encoding-utf8.html.goal` and
  `test/encoding-latin1.html.goal` show, both as local files and after an
  automatic reload on `localhost`.
- **Remote files.**  Check the files in `test/` from
  `raw.githubusercontent.com`, as for Edge.  That site sends a strict
  Content Security Policy (`default-src 'none'` and `sandbox`), and Firefox
  applies a page's CSP differently from Chrome to a content script and to
  the scripts that it loads with `import()`.  Check that the content script
  runs at all, and that math, highlighting, and diagrams appear.
- **The rest of `README.md`'s features:**  the table of contents at both
  window widths, both color schemes, the tab title, and reloading of a file
  on `localhost`.

The existing tests (`npm test`) run `render.js` in Node, so they do not
depend on the browser and need no change.

### Tools

Mozilla's [`web-ext`](https://github.com/mozilla/web-ext) tool runs,
checks, and signs Firefox extensions.  Before each upload, unzip the ZIP
file into an empty directory and run `npx web-ext lint --source-dir DIR` on
that directory; it applies the same checks as AMO's validator.  Lint the
unzipped ZIP file, not the repository:  run in the repository,
`web-ext lint` checks files that are not in the ZIP file (`test/`,
`package.json`, `vendor/update.sh`, and uncommitted files), and it misses a
problem that only the ZIP file has, such as a file that `git archive` left
out.  Consider adding `web-ext` to `devDependencies` in `package.json`, with
an `npm` script that builds the ZIP file, unzips it, and lints it.

## Phase 4:  Firefox publishing

Mozilla's guide is
[Submitting an add-on](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/).

1. Create a Mozilla account, and log in to the
   [Add-on Developer Hub](https://addons.mozilla.org/developers/).  There is
   no fee.
2. Submit a new add-on, and choose "On this site" so that AMO lists it.
3. Upload the ZIP file.  Fix every error that the validator reports, and
   the security and privacy warnings, which can cause the review to reject
   the add-on.
4. **Source code:**  AMO asks whether the add-on contains minified code.
   `vendor/` holds minified files (`djot/djot.js`, which is a minified UMD
   bundle despite its name, `dompurify/purify.min.js`,
   `highlight.js/highlight.min.js`, and Mermaid's `.mjs` files).  AMO
   accepts a third-party library without source code if the file is
   identical to the library's published release.  `vendor/update.sh` copies
   each library's files unchanged from npm, so in the notes for reviewers,
   list each library's npm package and version (the table in the "Vendored
   libraries" section of `README.md`), and the path of each file within the
   package.  The generated stylesheets `vendor/temml/temml.css` and
   `vendor/highlight.js/highlight.css` are not copies of released files, and
   `vendor/update.sh`, which generates them from the libraries'
   stylesheets, is not in the ZIP file.  So answer that the add-on contains
   minified code, and upload a source archive of the whole repository,
   built with `git archive --format=zip -o djot-viewer-source.zip vX.Y.Z`
   from the release's tag.  The notes should say that `vendor/update.sh` in
   the source archive generates the stylesheets, and that running it
   reproduces `vendor/` (it needs `npm` and Node.js).
5. **Listing:**  name, summary (at most 250 characters), description,
   categories, the MIT license, the homepage and support URLs, the
   privacy policy, the icon, and the screenshots.  Reuse the Chrome
   listing's text, but describe how Firefox handles local files, as Phase 3
   finds.
6. **Notes for reviewers:**  the same test instructions as for Chrome, plus
   the library list from step 4.
7. Submit.  AMO reviews a listed add-on, sometimes after it is published.

An update is a new ZIP file with a larger `version`, uploaded as a new
version on the add-on's page in the Developer Hub.  `npx web-ext sign
--channel=listed` can upload a version from the command line, with an AMO
API key.

## Phase 5:  documentation and release process

1. Generalize the Chrome document into a release checklist that covers all
   three stores, or add a sibling document for each store.  The steps that
   prepare a release (testing, increasing `version`, tagging, and building
   the ZIP file) are shared.
2. Update `README.md`, which calls the project a Chrome extension
   throughout:
   - Wherever the text describes all three browsers, say "the browser"
     rather than "Chrome".  Examples are the first sentence ("This Chrome
     extension ..."), "Viewing files from a local web server" ("Chrome
     downloads the file ..."), "Known limitations", and, in "Development",
     the descriptions of `manifest.json` ("tells Chrome which pages ...")
     and of `content.js` ("the Chrome-specific part").  Where Firefox
     behaves differently, as for local files, say so.
   - In "Updating", which tells the user to click the reload button in
     `chrome://extensions` or to quit Chrome, add the steps for Firefox
     (`about:debugging`, where a temporary add-on also disappears when
     Firefox quits) and for Edge (`edge://extensions`).
   - In the section about the "all websites" warning, which quotes Chrome's install warning
     and describes Chrome's "Site access" control, describe Firefox's
     install prompt and its "Permissions" tab, and Edge's wording of the
     warning.
   - In "Development", say that `background.js` runs as a service worker in
     Chrome and Edge and as an event page in Firefox, not only that it is
     "the extension's service worker".
   - In "Installation", give a link to each store's page, and add
     instructions for loading the extension unpacked in Firefox and Edge.
   - In "Known limitations", describe any feature that Firefox lacks, such
     as automatic reloading of local files.
   - In "Comparison with Markdown viewers", remove the bullet that says the
     extension runs only in Chrome.
   - Update the required browser versions.
   - In "Tests", describe how to test in Firefox and Edge, not only in
     Chrome.

   Also change the `description` in `package.json`, which says "Chrome
   extension".
3. Optionally, automate uploads with a GitHub Actions workflow that runs on
   a version tag:  the Chrome Web Store API, `web-ext sign` for AMO, and the
   Edge Add-ons API each accept a ZIP file.  Each needs credentials stored as
   repository secrets.  Do this only after a few manual releases, when the
   steps are stable.

## Risks

- **Firefox and local files.**  The main reason to use the extension is
  viewing local files.  If Firefox downloads a local `.djot` file instead of
  showing it, the Firefox version is much less useful, and only a setting
  outside Firefox fixes it.  Test this first, before the other Firefox work.
- **Review of broad host permissions.**  All three stores look harder at an
  extension whose match patterns cover every site.  The justification in
  the Chrome document applies to all three.
- **Maintenance.**  Each release goes through three reviews, which take
  different amounts of time, so the stores can briefly offer different
  versions.
