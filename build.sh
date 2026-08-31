#!/usr/bin/env sh
set -eu
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
OUT="${1:-$HERE/../tracklist-to-spotify-firefox-v0.1.3.zip}"
cd "$HERE"
rm -f "$OUT"
zip -r "$OUT" manifest.json background.js content.js content.css popup.html popup.js popup.css README.md BUILD.md >/dev/null
printf 'Built: %s\n' "$OUT"
printf 'Checking manifest is at ZIP root...\n'
unzip -l "$OUT" | grep -E '[[:space:]]manifest\.json$' >/dev/null
printf 'OK\n'
