#!/usr/bin/env bash
# Fabrique dist/nexus-frontier-itch.zip, prêt à être envoyé sur itch.io (projet de type HTML).
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist
mkdir -p dist
zip -qr dist/nexus-frontier-itch.zip index.html style.css src lib
echo "Créé : dist/nexus-frontier-itch.zip"
