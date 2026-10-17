# mon-jeu-3d — NEXUS FRONTIER

Jeu de combat FPS en Three.js (PC + téléphone), publié sur GitHub Pages :
https://isatopro521-lgtm.github.io/mon-jeu-3d/

## Façon de travailler (mode autonome)

La propriétaire du projet veut que le travail se fasse **sans questions** :

1. Toute demande sur le projet (jeu, site, publication, README, itch.io, bugs, idées…) est
   confiée **automatiquement** au sous-agent `chef-de-projet` (`.claude/agents/chef-de-projet.md`),
   sans demander confirmation. Il travaille à la place de la propriétaire de bout en bout :
   code, tests PC + téléphone, commit, push, pull request, fusion, vérification du site.
   Donne-lui une consigne complète : il ne pose pas de questions.
   (`dev-jeu-3d` reste disponible pour une tâche purement technique, sans publication.)
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
- Tout nouveau fichier `src/*.js` doit être ajouté à la liste `FICHIERS` de `sw.js` (mode hors ligne) ; `bash scripts/verifier-sw.sh` le contrôle, et la publication échoue sinon.
