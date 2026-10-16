# mon-jeu-3d
Mon jeux 3D à la première personne 

## ARÈNE — jeu de combat FPS

Survis à des vagues d'ennemis de plus en plus nombreuses dans une arène, en vue à la première personne.

- **3 types d'ennemis** avec IA (patrouille → alerte → poursuite → attaque, champ de vision et ligne de vue) :
  - **Soldat** (rouge) : rapide, attaque au corps à corps ;
  - **Tireur** (bleu) : garde ses distances, se décale sur le côté et tire des projectiles ;
  - **Brute** (violet) : lente, très résistante, frappe fort (à partir de la vague 3).
- **2 armes** : fusil d'assaut automatique et fusil à pompe (9 plombs).
- **Grenades** : lancées en cloche, elles rebondissent sur le sol et le décor puis explosent après 2 s
  (dégâts de zone, bloqués par les murs ; attention à ne pas rester trop près).
  3 au départ, 5 maximum, +1 à chaque vague terminée, et parfois lâchées par les ennemis.
- Tirs à la tête ×2 dégâts, trousses de soin et grenades lâchées par les ennemis, bonus de fin de vague.
- Score et record (gardé dans le navigateur).

### Lancer le jeu

Les modules JavaScript ne fonctionnent pas en ouvrant directement le fichier : il faut un petit serveur local.

```bash
python3 -m http.server 8000
```

Puis ouvrir http://localhost:8000 dans le navigateur.

Pour jouer sur téléphone, lancer le serveur sur l'ordinateur et ouvrir `http://<adresse-IP-de-l'ordinateur>:8000` depuis le téléphone (même réseau Wi-Fi).

### Mettre le jeu en ligne

**GitHub Pages** (gratuit, adresse `https://isatopro521-lgtm.github.io/mon-jeu-3d/`) :

1. Rendre le dépôt public : *Settings → General → Danger Zone → Change visibility → Public*
   (GitHub Pages est gratuit uniquement pour les dépôts publics).
2. Activer Pages : *Settings → Pages → Build and deployment → Source : **GitHub Actions***.
3. Fusionner le code dans la branche `main`. Le workflow `.github/workflows/pages.yml`
   publie alors le jeu automatiquement à chaque modification de `main`
   (suivi dans l'onglet *Actions*).

**itch.io** (site de jeux indépendants, pour être découvert par des joueurs) :

1. Fabriquer le zip : `bash scripts/zip-itch.sh` → `dist/arene-itch.zip`
   (le workflow GitHub le fabrique aussi : onglet *Actions* → dernière exécution → *Artifacts*).
2. Sur itch.io : *Upload new project* → *Kind of project* : **HTML** → envoyer le zip
   → cocher *This file will be played in the browser*.
3. Dans *Embed options* : taille 1280 × 720, cocher *Mobile friendly* (orientation paysage)
   et *Fullscreen button*.
4. Ajouter une description, des captures d'écran, puis *Save* et passer la page en *Public*.

Le jeu n'a besoin d'aucun serveur ni d'aucun site extérieur : la bibliothèque Three.js
(licence MIT) est incluse dans `lib/three/`.

### Classement

À la fin d'une partie, le joueur entre son pseudo pour enregistrer son score.
Le bouton *Classement* du menu affiche les 10 meilleurs. La source est choisie toute seule :

| Situation | Classement |
| --- | --- |
| `src/config.js` rempli (voir ci-dessous) | **Mondial**, commun à tous les joueurs |
| Jeu ouvert depuis sa page Claude | Partagé entre les personnes invitées sur la page |
| Sinon | Local, sur l'appareil du joueur |

**Activer le classement mondial** (gratuit, avec [Supabase](https://supabase.com)) :

1. Créer un compte et un projet sur supabase.com.
2. Dans *SQL Editor*, exécuter :

   ```sql
   create table scores (
     id bigint generated always as identity primary key,
     pseudo text not null check (char_length(pseudo) between 1 and 16),
     score integer not null check (score between 0 and 10000000),
     vague integer not null check (vague between 1 and 1000),
     cree_le timestamptz not null default now()
   );
   alter table scores enable row level security;
   create policy "tout le monde lit" on scores for select using (true);
   create policy "tout le monde ajoute" on scores for insert with check (true);
   ```

3. Dans *Project Settings → API*, copier l'**URL du projet** et la clé **anon public**
   dans `src/config.js`. Ne jamais y mettre la clé `service_role` (elle est secrète).

Comme le jeu tourne dans le navigateur, un joueur malin peut envoyer un faux score.
Si ça arrive, on peut supprimer la ligne dans *Table Editor* sur Supabase.

### Commandes PC

| Touche | Action |
| --- | --- |
| Z Q S D / W A S D | Se déplacer |
| Souris | Viser |
| Clic gauche | Tirer |
| Espace | Sauter |
| Maj | Sprinter |
| R | Recharger |
| 1 / 2 / molette | Changer d'arme |
| G / clic droit | Lancer une grenade |
| Échap | Pause |

### Commandes téléphone / tablette

Le mode tactile s'active tout seul sur les écrans tactiles (ou avec `?tactile` dans l'URL).

| Geste | Action |
| --- | --- |
| Joystick (moitié gauche de l'écran) | Se déplacer — poussé à fond vers l'avant : sprint |
| Glisser sur la moitié droite | Viser |
| Bouton **TIR** | Tirer (on peut glisser dessus pour viser en même temps) |
| Boutons **SAUT**, **R**, **ARME** | Sauter, recharger, changer d'arme |
| Bouton **GRENADE** | Lancer une grenade (dans la direction visée) |
| Bouton pause (en haut à gauche) | Pause |

Mode paysage conseillé ; en portrait, le champ de vision s'élargit automatiquement.

### Code

| Fichier | Rôle |
| --- | --- |
| `src/main.js` | Rendu, boucle de jeu, vagues, états de la partie |
| `src/player.js` | Contrôles FPS, saut, gravité, collisions |
| `src/world.js` | Arène, éclairage, obstacles |
| `src/enemies.js` | Ennemis, IA, projectiles |
| `src/weapons.js` | Armes, tir par lancer de rayon, rechargement |
| `src/grenades.js` | Grenades : lancer, rebonds, explosion à dégâts de zone, effets |
| `src/effects.js` | Étincelles et traînées de balles |
| `src/pickups.js` | Bonus à ramasser (trousses de soin, grenades) |
| `src/touch.js` | Commandes tactiles (joystick, visée, boutons) |
| `src/scores.js` | Classement (mondial, partagé ou local) |
| `src/config.js` | Réglages du classement mondial |
| `src/hud.js` | Interface (vie, munitions, score, écrans) |
| `src/audio.js` | Sons générés avec la Web Audio API |

`lib/three/` contient Three.js 0.160.0. `scripts/zip-itch.sh` fabrique le zip pour itch.io.

Ajouter `?debug` à l'URL expose l'objet `window.jeu` pour le débogage.

## Agent Claude Code

Le dépôt contient un sous-agent Claude Code spécialisé : `.claude/agents/dev-jeu-3d.md`.
Il connaît la stack (Three.js dans le navigateur, sans build), la structure du projet
et les bonnes pratiques d'un FPS (boucle de jeu, collisions, IA des ennemis, performances).

Utilisation dans Claude Code, par exemple :

> Utilise l'agent dev-jeu-3d pour créer la scène de base avec les contrôles FPS.

La commande `/agents` permet de le voir et de le modifier.
