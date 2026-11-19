#!/usr/bin/env bash
# DnD-Tabletop starten (Linux/macOS): ./start.sh
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js fehlt. Bitte die LTS-Version installieren (https://nodejs.org oder Paketmanager)."
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "Erster Start: installiere Abhängigkeiten …"
  npm install --omit=dev
fi
exec node server/index.js
