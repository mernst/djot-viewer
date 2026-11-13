# Djot Viewer privacy policy

Djot Viewer does not collect, store, or transmit any data.  It reads the
text of a page whose URL ends in `.djot`, `.dj`, `.DJOT`, or `.DJ`
(optionally followed by a query string), and renders it in the same tab.

For a local file, or a file on a web server on the user's own computer
(`localhost`, `127.0.0.1`, or `[::1]`), the extension rereads the file about
once a second while the tab is visible, to detect changes.  It rereads a
local file from disk, and it requests a file on `localhost` again from the
same server.  The file's contents never leave the user's computer.

As on any web page, the browser loads the images and other resources that a
rendered document refers to, which can be on other servers.
