#!/usr/bin/env bash
# Fabrique dist/arene-itch.zip, prêt à être envoyé sur itch.io (projet de type HTML).
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist
mkdir -p dist
zip -qr dist/arene-itch.zip index.html style.css src lib
echo "Créé : dist/arene-itch.zip"
