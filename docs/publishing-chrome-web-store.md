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

A new account can have at most two published extensions at a time.

### Add icons to the extension

The store requires a 128x128 PNG icon inside the uploaded package, and the
extension currently has none.  Before the first upload:

1. Create an icon:  96x96 pixels of artwork, centered in a 128x128 PNG with
   16 pixels of transparent padding on each side.  Also make 16x16, 32x32,
   and 48x48 versions, which Chrome uses on `chrome://extensions` and in the
   toolbar.
2. Commit them, for example as `icons/icon-16.png` through
   `icons/icon-128.png`, and add them to `manifest.json`:

   ```json
   "icons": {
     "16": "icons/icon-16.png",
     "32": "icons/icon-32.png",
     "48": "icons/icon-48.png",
     "128": "icons/icon-128.png"
   },
   ```

3. Add `icons` to the list of files in the `git archive` command in
   [Build the package](#build-the-package), and add a bullet for the icons to
   the list of files in the "Development" section of `README.md`.

### Write a privacy policy

The store asks for a privacy policy URL.  Djot Viewer collects no user data
and sends nothing off the user's computer, so a short policy that says so is
enough.  For example, commit a file `PRIVACY.md` that says:

> Djot Viewer does not collect, store, or transmit any data.  It reads the
> text of a page whose URL ends in `.djot`, `.dj`, `.DJOT`, or `.DJ`, and
> renders it in the same tab.  For a local file, the extension's service
> worker rereads the file to detect changes; the file's contents never leave
> the browser.

Then use the file's GitHub URL, such as
`https://github.com/mernst/djot-viewer/blob/main/PRIVACY.md`, as the privacy
policy URL.

## Publishing a version

Do these steps for the first release and for every later one.

### Prepare the release

1. Make sure the tests pass (`npm test`), and test the extension by hand in
   Chrome as described in the "Tests" section of `README.md`.  Use a Chrome
   whose version is the `minimum_chrome_version` in `manifest.json`, if you
   can, as well as the current Chrome.
2. Increase `version` in `manifest.json`.  Every upload must have a larger
   version than the previous one, even an upload that is rejected or never
   published.  A version is one to four integers separated by dots, such as
   `0.2.0`.
3. Commit the change, and tag the commit, as in:

   ```sh
   git commit -m "Version 0.2.0" manifest.json
   git tag v0.2.0
   git push && git push --tags
   ```

### Build the package

The store takes a ZIP file whose top level holds `manifest.json`.  The ZIP
file should contain only the files that make up the extension (they are
listed in the "Development" section of `README.md`):  not the tests,
`node_modules/`, `package.json`, or `vendor/update.sh`.

`git archive` builds the ZIP file from the committed files, so uncommitted
changes and ignored files cannot get into it.  Run it in the top-level
directory of the repository:

```sh
VERSION=$(node -p 'require("./manifest.json").version')
git archive --format=zip -o "djot-viewer-$VERSION.zip" HEAD \
  manifest.json background.js content.js content.css render.js LICENSE \
  vendor ':!vendor/update.sh'
```

The `LICENSE` files of the vendored libraries are in the ZIP file, as their
licenses require.

Before uploading, unzip the file into a fresh directory, load that directory
as an unpacked extension (see the "Installation" section of `README.md`),
and check that a Djot file still renders, including its math, diagrams, and
highlighted code.  This catches a file that the command omitted.

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
- **Store icon:**  the 128x128 icon from [Add icons to the extension](#add-icons-to-the-extension).
- **Screenshots:**  at least one, and up to five, each 1280x800 pixels
  (preferred) or 640x400 pixels, with square corners and no padding.  To
  make one, open a file from `test/`, such as `test/toc.djot` (it shows the
  table of contents) or `test/math.djot`, and open Chrome's DevTools.  Turn
  on the device toolbar, set the dimensions to 1280x800, and choose "Capture
  screenshot" from the device toolbar's menu.  Show both the light and the
  dark appearance.
- **Promo images:**  optional.  A small promo image is 440x280 pixels; a
  marquee image is 1400x560 pixels.  The store lists an extension that has a
  small promo image ahead of one that does not.
- **Homepage URL:**  `https://github.com/mernst/djot-viewer`.
- **Support URL:**  `https://github.com/mernst/djot-viewer/issues`.

#### Privacy

- **Single purpose:**  for example, "Displays Djot files (`.djot`, `.dj`)
  as formatted HTML in the tab that shows the file."
- **Permission justification:**  The extension requests no `permissions`,
  but its content script's match patterns, such as `*://*/*.djot`, count as
  host permissions.  Justify them, for example:  "The content script must
  run on any site that serves a Djot file, such as
  `raw.githubusercontent.com`, and on local files.  Its match patterns
  restrict it to URLs whose path ends in `.djot`, `.dj`, `.DJOT`, or `.DJ`,
  and it changes only a page that the browser shows as plain text."
- **Remote code:**  "No, I am not using remote code."  Every library is in
  `vendor/`, and the extension loads Temml, highlight.js, and Mermaid from
  its own package.
- **Data usage:**  check no data types, and check the certifications.
- **Privacy policy:**  the URL from [Write a privacy policy](#write-a-privacy-policy).

#### Distribution

- **Payments:**  free.
- **Visibility:**  "Public".  Choose "Unlisted" instead to make a trial
  release that only people with the link can find.
- **Regions:**  all regions.

#### Test instructions

Reviewers need a Djot file to try.  For example:  "Open
`https://raw.githubusercontent.com/mernst/djot-viewer/main/test/basic.djot`.
The extension renders it as HTML.  To try a local file, download that file,
turn on 'Allow access to file URLs' in the extension's details, and open
the file."

### Submit for review

Click "Submit for review".  The confirmation dialog has a check box that
publishes the extension as soon as it passes review.  Uncheck it to publish
by hand instead; you then have 30 days after the review to click "Publish",
after which the submission reverts to a draft.

Expect the first review to take longer than later ones.  The dashboard warns
that the extension's broad host permissions can require an in-depth review.
Google sends email if the review rejects the extension, naming the policy
that it violates; fix the problem, increase the version, and upload again.

## After the first release

After the extension is published, update `README.md`:

- In "Installation", describe installing the extension from its store page,
  and keep the instructions for loading it unpacked for developers.
- In "Comparison with Markdown viewers", remove the bullet that says the
  extension is not in the Chrome Web Store.

A published extension has a different extension ID from an unpacked copy of
the repository, so Chrome treats them as two extensions.  A developer who has
both installed should turn one off, or both of them run on each Djot page.

If a published version has a serious bug, the dashboard can roll the
extension back to the previous version immediately.
