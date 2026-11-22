#!/bin/sh
# Rebuilds the DMG with Fermata's drive icon and install instructions.
# Tauri has no setting for the DMG's volume icon (it always uses the app icon),
# so this builds the DMG itself with a copy of Tauri's DMG tool (scripts/create-dmg)
# and Fermata's own artwork. `pnpm release:build` runs it after building the app.
# Usage: scripts/make-dmg.sh [output.dmg]
#
# The window is 660x480: 420 points of artwork, plus Finder's title bar and the
# path bar some people have turned on (the background extends to cover it).
set -e
cd "$(dirname "$0")/.."

BUNDLE=src-tauri/target/universal-apple-darwin/release/bundle
VERSION=$(node -p "require('./src-tauri/tauri.conf.json').version")
OUT="${1:-$BUNDLE/dmg/Fermata_${VERSION}_universal.dmg}"

# The DMG contains only what's in this folder, so stage the app on its own
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
ditto "$BUNDLE/macos/Fermata.app" "$STAGE/Fermata.app"
# Finder ignores the script's request to hide ".app", so set the flag on the app itself
SetFile -a E "$STAGE/Fermata.app"

mkdir -p "$(dirname "$OUT")"
rm -f "$OUT"
scripts/create-dmg/bundle_dmg.sh \
  --volname "Fermata" \
  --volicon src-tauri/dmg/volume-icon.icns \
  --background src-tauri/dmg/background.tiff \
  --window-size 660 480 \
  --icon-size 112 \
  --icon "Fermata.app" 170 150 \
  --hide-extension "Fermata.app" \
  --app-drop-link 490 150 \
  "$OUT" "$STAGE"

echo "Built $OUT"
