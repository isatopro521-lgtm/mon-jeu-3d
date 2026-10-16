# mon-jeu-3d
Mon jeux 3D à la première personne 

## NEXUS FRONTIER — FPS tactique & survie

Défends l'avant-poste Nexus contre des vagues d'ennemis de plus en plus nombreuses, en vue à la première personne,
dans le navigateur (PC et téléphone).

**Style visuel** : fin d'après-midi en montagne (heure dorée) — ciel bleu profond avec nuages, soleil bas,
montagnes enneigées, forêt de sapins, buissons rouges, rochers moussus, lac avec cascade, avant-postes
industriels aux fenêtres éclairées, antennes, bannières rouges au logo triangle, et une **mégastructure** :
une tour géante traversée par un anneau qui tourne lentement dans le ciel. Palette acier très sombre +
accents orange, rouge pour les factions. Tout est généré dans le code (géométries et textures procédurales,
aucune image à télécharger).

- **3 types d'ennemis** avec IA (patrouille → alerte → poursuite → attaque, champ de vision et ligne de vue) :
  - **Soldat** (visière rouge) : rapide, attaque au corps à corps (coup de crosse) ;
  - **Tireur** (visière bleue) : garde ses distances, se décale sur le côté et tire ;
  - **Mech-araignée** (yeux rouges, à partir de la vague 3) : lent, très blindé, se cabre et écrase.
- **2 armes** : fusil d'assaut automatique à lunette et fusil à pompe (9 plombs).
  Munitions : chargeur + **réserve** (affichées « 30 | 120 ») ; caisses de munitions lâchées par les ennemis,
  réserve remise au moins au niveau de départ à chaque fin de vague.
- **Armure** : 50 au départ, elle encaisse les dégâts avant la vie ; +25 à chaque vague terminée (max 100).
- **Grenades** : lancées en cloche, elles rebondissent sur le sol et le décor puis explosent après 2 s
  (dégâts de zone, bloqués par les murs ; attention à ne pas rester trop près).
  3 au départ, 5 maximum, +1 à chaque vague terminée, et parfois lâchées par les ennemis.
- **Tempête Nexus** : toutes les 5 vagues, le ciel vire au rouge, un vortex tourne au-dessus de l'arène,
  des éclairs frappent les environs et il pleut, le temps de la vague.
- Tirs à la tête ×2 dégâts (casque/visière, tourelle du mech), trousses de soin, bonus de fin de vague.
- Interface : boussole, minicarte « Zone Nexus » (ennemis en rouge, compte à rebours entre les vagues),
  vie + armure, munitions, grenades.
- Score et record (gardé dans le navigateur), classement en ligne.

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
| `src/world.js` | Arène : sol, enceinte (grillage, miradors, conteneurs), tours, sacs de sable, caisses ; collisions |
| `src/decor.js` | Décor autour : terrain, montagnes, forêt, lac, cascade, avant-postes, mégastructure |
| `src/ciel.js` | Ciel (dégradé + soleil), nuages, brouillard, lumières, reflets |
| `src/textures.js` | Textures procédurales (canvas) et logo |
| `src/tempete.js` | Tempête Nexus (ciel rouge, vortex, éclairs, pluie) |
| `src/enemies.js` | Ennemis (soldats, mech-araignée), IA, projectiles |
| `src/weapons.js` | Armes, tir par lancer de rayon, rechargement |
| `src/grenades.js` | Grenades : lancer, rebonds, explosion à dégâts de zone, effets |
| `src/effects.js` | Étincelles et traînées de balles |
| `src/pickups.js` | Bonus à ramasser (trousses de soin, grenades, munitions) |
| `src/touch.js` | Commandes tactiles (joystick, visée, boutons) |
| `src/scores.js` | Classement (mondial, partagé ou local) |
| `src/config.js` | Réglages du classement mondial |
| `src/hud.js` | Interface (boussole, minicarte, vie/armure, munitions, score, écrans) |
| `src/audio.js` | Sons générés avec la Web Audio API |
| `src/utils.js` | Collisions, bruit procédural, fusion de géométries |

`lib/three/` contient Three.js 0.160.0. `scripts/zip-itch.sh` fabrique le zip pour itch.io.

Ajouter `?debug` à l'URL expose l'objet `window.jeu` pour le débogage.

## Agent Claude Code

Le dépôt contient un sous-agent Claude Code spécialisé : `.claude/agents/dev-jeu-3d.md`.
Il connaît la stack (Three.js dans le navigateur, sans build), la structure du projet
et les bonnes pratiques d'un FPS (boucle de jeu, collisions, IA des ennemis, performances).

Utilisation dans Claude Code, par exemple :

> Utilise l'agent dev-jeu-3d pour créer la scène de base avec les contrôles FPS.

La commande `/agents` permet de le voir et de le modifier.
