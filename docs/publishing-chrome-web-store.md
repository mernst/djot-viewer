# Publishing to the Chrome Web Store

This document tells a maintainer how to publish Djot Viewer in the
[Chrome Web Store](https://chromewebstore.google.com/), and how to publish a
new version of it.  Users who install the extension from this repository
(see the "Installation" section of `README.md`) do not need any of it.

Google's own documentation is the authority on the store's rules, which
change from time to time:

- [Publish in the Chrome Web Store](https://developer.chrome.com/docs/webstore/publish)
- [Update your Chrome Web Store item](https://developer.chrome.com/docs/webstore/update)
- [Chrome Web Store program policies](https://developer.chrome.com/docs/webstore/program-policies)

## One-time setup

### Register a developer account

1. Sign in to the
   [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   with the Google account that will own the extension.  Consider using an
   account that is not your personal one if other maintainers might take
   over the extension later.  You cannot change the account's developer
   email address after you create the account.
2. Accept the developer agreement, and pay the one-time registration fee
   (US $5).
3. On the dashboard's "Account" page, fill in the publisher name that the
   store shows to users, verify the contact email address, and make the
   trader or non-trader declaration that the European Union requires.  A
   project that is not a business is a non-trader.
4. Optionally, on the same page, turn on email notifications for when an
   item is staged or published.

A new publisher can have at most two published extensions, according to
[Publish in the Chrome Web Store](https://developer.chrome.com/docs/webstore/publish).

## Publishing a version

Do these steps for the first release and for every later one.

### Prepare the release

1. Make sure the tests pass (`npm test`), and test the extension by hand in
   Chrome as described in the "Tests" section of `README.md`.  Use a Chrome
   whose version is the `minimum_chrome_version` in `manifest.json`, if you
   can, as well as the current Chrome.
2. For a release after the first one, increase `version` in
   `manifest.json`, and commit and push the change.  Google requires "Each
   new version must have a larger version number than the previous version"
   ([Update your Chrome Web Store item](https://developer.chrome.com/docs/webstore/update)).
   A version is one to four integers separated by dots, such as `0.2.0`.  For
   the first release, keep the version that `manifest.json` already has.

   ```sh
   git commit -m "Version 0.2.0" manifest.json
   git push
   ```

3. Tag the commit with the version, but do not push the tag yet; push it
   after the store publishes the version (see
   [After the store publishes a version](#after-the-store-publishes-a-version)).
   Run this in the top-level directory of the repository:

   ```sh
   VERSION=$(node -p 'require("./manifest.json").version')
   git tag "v$VERSION"
   ```

### Build the package

The store takes a ZIP file whose top level holds `manifest.json`.  The ZIP
file should contain only the files that make up the extension (they are
listed in the "Development" section of `README.md`) and the licenses:  not
the tests, `node_modules/`, `package.json`, or `vendor/update.sh`.

`git archive` builds the ZIP file from the tagged commit, so uncommitted
changes, later commits, and ignored files cannot get into it.  It omits the
files that `.gitattributes` marks `export-ignore`.  When you add a file that
is not part of the extension, mark it `export-ignore` in `.gitattributes`.
Run this in the top-level directory of the repository:

```sh
VERSION=$(node -p 'require("./manifest.json").version')
git archive --format=zip -o "djot-viewer-$VERSION.zip" "v$VERSION"
```

The `LICENSE` files of the vendored libraries are in the ZIP file, as their
licenses require.

Before uploading, check the ZIP file:

1. List its contents (`unzip -l "djot-viewer-$VERSION.zip"`), and check that
   it holds no file that is not part of the extension.
2. In `chrome://extensions`, turn off your unpacked copy of the repository,
   if you have one.  Otherwise, both copies run on each Djot page, and the
   repository copy can hide a file that the ZIP file lacks.
3. Unzip the file into a fresh directory, load that directory as an unpacked
   extension (see the "Installation" section of `README.md`), and check that
   a Djot file still renders, including its math, diagrams, and highlighted
   code.
4. Remove the extension that you loaded from the fresh directory, and turn
   your repository copy back on.

### Upload the package

For the first release, click "Add new item" in the
[Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole),
and choose the ZIP file.

For a later release, select the extension in the dashboard, go to the
"Package" tab, click "Upload new package", and choose the ZIP file.

### Fill in the dashboard tabs

For a later release, change only what the release changes.  For the first
release, fill in every tab.

#### Store listing

- **Description:**  The store shows the `description` from `manifest.json`
  (at most 132 characters) as the summary, and this longer text on the
  extension's page.  Adapt the start of `README.md`:  the features, the
  sanitizing of raw HTML, and the need to turn on "Allow access to file URLs"
  to view local files.  Also explain the "all websites" warning, as the
  section of `README.md` with that title does, because users see that
  warning when they install the extension.
- **Category:**  "Developer Tools" or "Productivity".
- **Language:**  English.
- **Store icon:**  `icons/icon-128.png`.  It is also in the package, where
  the store requires a 128x128 icon:  96x96 pixels of artwork, centered with
  16 pixels of transparent padding on each side.
- **Screenshots:**  at least one, and up to five, each 1280x800 pixels
  (preferred) or 640x400 pixels, with square corners and no padding.  To
  make one, open a file from `test/`, such as `test/toc.djot` (it shows the
  table of contents) or `test/math.djot`, and open Chrome's DevTools.  Turn
  on the device toolbar, and set the dimensions to 1280x800.  In the device
  toolbar's menu, choose "Add device pixel ratio", and set the device pixel
  ratio to 1; otherwise, on a high-resolution display, the screenshot is
  larger than 1280x800 pixels.  Then choose "Capture screenshot" from the
  device toolbar's menu.  Show both the light and the dark appearance.
- **Promo images:**  optional, according to
  [Supplying images](https://developer.chrome.com/docs/webstore/images).  A
  small promo image is 440x280 pixels; a marquee image is 1400x560 pixels.
  The store lists an extension that has a small promo image ahead of one
  that does not.
- **Homepage URL:**  `https://github.com/mernst/djot-viewer`.
- **Support URL:**  `https://github.com/mernst/djot-viewer/issues`.

#### Privacy

- **Single purpose:**  for example, "Displays Djot files (`.djot`, `.dj`,
  `.DJOT`, `.DJ`) as formatted HTML in the tab that shows the file."
- **Permission justification:**  The dashboard asks for a justification of
  each permission in `manifest.json`.  The only entry in its `permissions`
  is `offscreen`.  In addition, the content script's match patterns, such as
  `*://*/*.djot`, count as host permissions.  Justify both, for example:
  - `offscreen`:  "To detect changes to a local Djot file that a tab shows,
    the extension rereads the file about once a second.  A content script
    cannot read a `file://` URL, and a read from the service worker
    sometimes fails after Chrome restarts the service worker, so an
    offscreen document reads the file.  The document reads only the file
    that the tab shows, and the extension closes the document when no Djot
    page has asked for a while."
  - Host permissions:  "The content script must run on any site that serves
    a Djot file, such as `raw.githubusercontent.com`, and on local files.
    Its match patterns restrict it to URLs whose path ends in `.djot`,
    `.dj`, `.DJOT`, or `.DJ` (optionally followed by a query string), and it
    changes only a page that the browser shows as plain text."
- **Remote code:**  "No, I am not using remote code."  Every library is in
  `vendor/`, and the extension loads Temml, highlight.js, and Mermaid from
  its own package.
- **Data usage:**  check no data types, and check the certifications.
- **Privacy policy:**
  `https://github.com/mernst/djot-viewer/blob/main/docs/PRIVACY.md`.  If a
  release changes what the extension reads, or where it sends anything,
  update `docs/PRIVACY.md` first.

#### Distribution

- **Payments:**  free.
- **Visibility:**  "Public".  Choose "Unlisted" instead to make a trial
  release that only people with the link can find.
- **Regions:**  all regions.

#### Test instructions

Reviewers need Djot files to try, including ones that exercise the bundled
libraries for math, diagrams, and highlighted code.  For example:  "Open
`https://raw.githubusercontent.com/mernst/djot-viewer/main/test/basic.djot`.
The extension renders it as HTML.  Also open `test/math.djot`,
`test/diagrams.djot`, and `test/highlight.djot` from the same directory,
which show math, Mermaid diagrams, and highlighted code.  To try a local
file, download one of those files, turn on 'Allow access to file URLs' in
the extension's details, and open the file."

### Submit for review

Click "Submit for review".  The confirmation dialog has a check box that
publishes the extension as soon as it passes review.  Uncheck it to publish
by hand instead; you then have 30 days after the review to click "Publish",
after which the submission reverts to a draft.

Expect the first review to take longer than later ones.  The dashboard warns
that the extension's broad host permissions can require an in-depth review.
Google sends email if the review rejects the extension, naming the policy
that it violates.  To submit a fix:

1. Delete the local tag, as in `git tag -d v0.2.0`.
2. Fix the problem, and commit and push the fix.
3. Do steps 1 and 3 of [Prepare the release](#prepare-the-release), but not
   step 2:  keep the version that the rejected package has.
4. Continue with [Build the package](#build-the-package).  If the dashboard
   refuses the new package because of its version, delete the tag, increase
   the version as in step 2 of [Prepare the release](#prepare-the-release),
   tag again, and build again.

## After the store publishes a version

Push the version's tag.  Run this in the top-level directory of the
repository:

```sh
VERSION=$(node -p 'require("./manifest.json").version')
git push origin "v$VERSION"
```

After the first release, also update `README.md`:

- In "Installation", describe installing the extension from its store page,
  and keep the instructions for loading it unpacked for developers.
- In "Comparison with Markdown viewers", replace the bullet that says the
  extension is not in the Chrome Web Store by one that links to its store
  page, as the section does for the two Markdown viewers.

A published extension has a different extension ID from an unpacked copy of
the repository, so Chrome treats them as two extensions.  A developer who has
both installed should turn one off, or both of them run on each Djot page.

If a published version has a serious bug, the dashboard can roll the
extension back to the previous version immediately.
