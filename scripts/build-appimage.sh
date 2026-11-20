#!/usr/bin/env bash
# Baut dist/DnD-Tabletop-<version>-x86_64.AppImage (enthält Node.js, keine Installation nötig).
#
#   bash scripts/build-appimage.sh
#
# Umgebungsvariablen:
#   NODE_VERSION  Node-Version zum Herunterladen (Standard 22.11.0)
#   NODE_BIN      statt Download dieses node-Binary verwenden (zum lokalen Testen)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
VERSION="$(node -p "require('./package.json').version")"
NODE_VERSION="${NODE_VERSION:-22.11.0}"
WORK="$(mktemp -d)"
APPDIR="$WORK/AppDir"
LIB="$APPDIR/usr/lib/dnd-tabletop"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$APPDIR/usr/bin" "$LIB" dist

echo "==> Node.js"
if [ -n "${NODE_BIN:-}" ]; then
  cp "$NODE_BIN" "$APPDIR/usr/bin/node"
else
  curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" | tar -xJ -C "$WORK"
  cp "$WORK/node-v${NODE_VERSION}-linux-x64/bin/node" "$APPDIR/usr/bin/node"
  cp "$WORK/node-v${NODE_VERSION}-linux-x64/LICENSE" "$LIB/NODE-LICENSE"
fi

echo "==> Programm"
cp -r server public shared package.json package-lock.json LICENSE README.md config.example.json "$LIB/"
(cd "$LIB" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund >/dev/null)

echo "==> AppImage-Rahmen"
cp packaging/AppRun "$APPDIR/AppRun"
cp packaging/dnd-tabletop.desktop "$APPDIR/dnd-tabletop.desktop"
cp packaging/icon-256.png "$APPDIR/dnd-tabletop.png"
mkdir -p "$APPDIR/usr/share/icons/hicolor/256x256/apps"
cp packaging/icon-256.png "$APPDIR/usr/share/icons/hicolor/256x256/apps/dnd-tabletop.png"

echo "==> appimagetool"
TOOL="$WORK/appimagetool"
curl -fsSL -o "$TOOL" "https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage"
chmod +x "$TOOL"
OUT="dist/DnD-Tabletop-${VERSION}-x86_64.AppImage"
# Ohne FUSE (CI, Container) direkt entpackt ausführen
APPIMAGE_EXTRACT_AND_RUN=1 ARCH=x86_64 "$TOOL" --no-appstream "$APPDIR" "$OUT" >/dev/null
chmod +x "$OUT"
echo "Fertig: $OUT ($(du -h "$OUT" | cut -f1))"
