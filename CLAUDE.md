# mon-jeu-3d — NEXUS FRONTIER

Jeu de combat FPS en Three.js (PC + téléphone), publié sur GitHub Pages :
https://isatopro521-lgtm.github.io/mon-jeu-3d/

## Façon de travailler (mode autonome)

La propriétaire du projet veut que le travail se fasse **sans questions** :

1. Toute demande qui touche au jeu (fonctionnalité, bug, réglage, interface, sons…) est
   confiée **automatiquement** au sous-agent `dev-jeu-3d` (`.claude/agents/dev-jeu-3d.md`),
   sans demander confirmation. Donne-lui une consigne complète : il ne pose pas de questions
   et choisit lui-même les détails non précisés.
2. Quand l'agent a fini : relire son travail (`git diff`), relancer les vérifications
   (`node --check` sur les fichiers JS, une partie simulée dans Chromium sans écran,
   PC et téléphone), corriger ce qui ne va pas.
3. Puis, sans redemander : commit, push sur la branche de travail, pull request vers `main`
   et fusion, pour que le site se mette à jour tout seul (workflow `Publier le jeu`).
   Vérifier que le workflow réussit.
4. Répondre en français, simplement, avec un court résumé : ce qui a changé, comment
   l'essayer, ce qui a été testé.

Ne demander l'avis de la propriétaire que pour une décision qu'on ne peut vraiment pas
prendre à sa place (compte à créer, clé secrète, suppression de données…).

## Vérifier le jeu

- Serveur local : `python3 -m http.server 8000`, puis `http://localhost:8000/index.html?debug`
  (`window.jeu` expose l'état du jeu ; `?tactile` force le mode téléphone).
- Three.js est inclus dans `lib/three/` : pas besoin de réseau.
- `bash scripts/zip-itch.sh` fabrique le zip pour itch.io.
