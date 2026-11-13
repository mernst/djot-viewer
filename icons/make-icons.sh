#!/bin/bash

# Generate the extension's PNG icons from icon.svg in this directory.  Run
# this script after changing icon.svg, and commit its output.  It is not a
# build step:  the extension loads the committed files directly.
#
# Requires rsvg-convert (from librsvg) and ImageMagick's magick.

set -euo pipefail

ICONS=$(cd "$(dirname "$0")" && pwd)

# Chrome shows these sizes on chrome://extensions and in the toolbar.  The
# artwork fills the whole image.
for size in 16 32 48; do
  rsvg-convert -w "$size" -h "$size" "$ICONS/icon.svg" \
    | magick png:- -strip "PNG32:$ICONS/icon-$size.png"
done

# Chrome shows this size when installing, and the Chrome Web Store shows it.
# The Chrome Web Store requires 96x96 pixels of artwork, with 16 pixels of
# transparent padding on each side.
rsvg-convert -w 96 -h 96 "$ICONS/icon.svg" \
  | magick png:- -background none -gravity center -extent 128x128 -strip \
    "PNG32:$ICONS/icon-128.png"
