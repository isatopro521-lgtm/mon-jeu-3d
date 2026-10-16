#!/usr/bin/env bash
# Vérifie la liste FICHIERS de sw.js : chaque fichier listé existe, et chaque src/*.js y figure.
# (Sinon l'installation hors ligne échoue, ou un fichier manque hors ligne.)
set -euo pipefail
cd "$(dirname "$0")/.."
erreur=0
for f in $(sed -n "/const FICHIERS = \[/,/\];/p" sw.js | grep -o "'[^']*'" | tr -d "'"); do
  [ "$f" = "./" ] && continue
  [ -f "$f" ] || { echo "sw.js liste un fichier absent : $f"; erreur=1; }
done
for f in src/*.js; do
  grep -q "'$f'" sw.js || { echo "Fichier absent de la liste de sw.js : $f"; erreur=1; }
done
[ $erreur -eq 0 ] && echo "sw.js : liste des fichiers OK"
exit $erreur
