# mon-jeu-3d
Mon jeux 3D à la première personne 

## ARÈNE — jeu de combat FPS

Survis à des vagues d'ennemis de plus en plus nombreuses dans une arène, en vue à la première personne.

- **3 types d'ennemis** avec IA (patrouille → alerte → poursuite → attaque, champ de vision et ligne de vue) :
  - **Soldat** (rouge) : rapide, attaque au corps à corps ;
  - **Tireur** (bleu) : garde ses distances, se décale sur le côté et tire des projectiles ;
  - **Brute** (violet) : lente, très résistante, frappe fort (à partir de la vague 3).
- **2 armes** : fusil d'assaut automatique et fusil à pompe (9 plombs).
- Tirs à la tête ×2 dégâts, trousses de soin lâchées par les ennemis, bonus de fin de vague.
- Score et record (gardé dans le navigateur).

### Lancer le jeu

Les modules JavaScript ne fonctionnent pas en ouvrant directement le fichier : il faut un petit serveur local.

```bash
python3 -m http.server 8000
```

Puis ouvrir http://localhost:8000 dans le navigateur (clavier + souris requis).

### Commandes

| Touche | Action |
| --- | --- |
| Z Q S D / W A S D | Se déplacer |
| Souris | Viser |
| Clic gauche | Tirer |
| Espace | Sauter |
| Maj | Sprinter |
| R | Recharger |
| 1 / 2 / molette | Changer d'arme |
| Échap | Pause |

### Code

| Fichier | Rôle |
| --- | --- |
| `src/main.js` | Rendu, boucle de jeu, vagues, états de la partie |
| `src/player.js` | Contrôles FPS, saut, gravité, collisions |
| `src/world.js` | Arène, éclairage, obstacles |
| `src/enemies.js` | Ennemis, IA, projectiles |
| `src/weapons.js` | Armes, tir par lancer de rayon, rechargement |
| `src/effects.js` | Étincelles et traînées de balles |
| `src/pickups.js` | Trousses de soin |
| `src/hud.js` | Interface (vie, munitions, score, écrans) |
| `src/audio.js` | Sons générés avec la Web Audio API |

Ajouter `?debug` à l'URL expose l'objet `window.jeu` pour le débogage.

## Agent Claude Code

Le dépôt contient un sous-agent Claude Code spécialisé : `.claude/agents/dev-jeu-3d.md`.
Il connaît la stack (Three.js dans le navigateur, sans build), la structure du projet
et les bonnes pratiques d'un FPS (boucle de jeu, collisions, IA des ennemis, performances).

Utilisation dans Claude Code, par exemple :

> Utilise l'agent dev-jeu-3d pour créer la scène de base avec les contrôles FPS.

La commande `/agents` permet de le voir et de le modifier.
