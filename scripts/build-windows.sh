#!/usr/bin/env bash
# Baut dist/DnD-Tabletop-<version>-windows-x64.zip: entpacken, start.bat doppelklicken.
# Node.js ist enthalten (Ordner runtime/), keine Installation nötig.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
VERSION="$(node -p "require('./package.json').version")"
NODE_VERSION="${NODE_VERSION:-22.11.0}"
WORK="$(mktemp -d)"
NAME="DnD-Tabletop"
OUTDIR="$WORK/$NAME"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$OUTDIR/runtime" dist

echo "==> Node.js für Windows"
curl -fsSL -o "$WORK/node.zip" "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip"
(cd "$WORK" && unzip -q node.zip)
cp "$WORK/node-v${NODE_VERSION}-win-x64/node.exe" "$OUTDIR/runtime/"
cp "$WORK/node-v${NODE_VERSION}-win-x64/LICENSE" "$OUTDIR/runtime/NODE-LICENSE"

echo "==> Programm"
cp -r server public shared package.json package-lock.json LICENSE README.md config.example.json start.bat "$OUTDIR/"
(cd "$OUTDIR" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund >/dev/null)

OUT="$ROOT/dist/${NAME}-${VERSION}-windows-x64.zip"
rm -f "$OUT"
(cd "$WORK" && zip -qr "$OUT" "$NAME")
echo "Fertig: dist/$(basename "$OUT") ($(du -h "$OUT" | cut -f1))"
