#!/usr/bin/env bash
# Fabrique dist/nexus-frontier-itch.zip, prêt à être envoyé sur itch.io (projet de type HTML).
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist
mkdir -p dist
# sw.js est inclus mais sa version reste « __VERSION__ » : il passe alors en mode « réseau d'abord »
# (itch.io sert le jeu depuis son propre domaine, le hors-ligne y est secondaire).
zip -qr dist/nexus-frontier-itch.zip index.html style.css src lib modeles \
  manifest.webmanifest sw.js confidentialite.html credits.html CREDITS.md icons captures
echo "Créé : dist/nexus-frontier-itch.zip"
