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
- **Ennemis vivants** (animations procédurales, sans fichier) : respiration, marche différente pour chacun,
  pauses où ils regardent autour d'eux, tête qui suit le joueur, icône « ! » + visière qui clignote
  quand ils te repèrent, sursaut et pas de côté quand ils sont touchés, petits cris radio,
  chute (en avant ou en arrière selon le tir) puis dissolution en étincelles.
  L'arme du joueur « respire » doucement à l'arrêt.
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
- **Défis entre amis** : bouton « Défier un ami » en fin de partie (et dans le menu) ; l'ami reçoit un lien
  avec le score à battre, et le jeu lui dit à la fin s'il a relevé le défi.
- **Qualité graphique** (bouton dans le menu et la pause) : Auto (par défaut), Haute, Moyenne, Basse.
- **App installable (PWA)** : le jeu s'installe sur l'écran d'accueil (iPhone, Android, PC), s'ouvre en plein écran
  et fonctionne **hors ligne** (service worker).
  En Auto, le jeu baisse tout seul la qualité s'il passe sous 40 images/s (choix mémorisé).

### Lancer le jeu

Les modules JavaScript ne fonctionnent pas en ouvrant directement le fichier : il faut un petit serveur local.

```bash
python3 -m http.server 8000
```

Puis ouvrir http://localhost:8000 dans le navigateur.

Pour jouer sur téléphone, lancer le serveur sur l'ordinateur et ouvrir `http://<adresse-IP-de-l'ordinateur>:8000` depuis le téléphone (même réseau Wi-Fi).

### Installer le jeu comme une app

Le jeu est une **web app installable** (PWA) : une fois installé, il a son icône, s'ouvre en plein écran
sans barre d'adresse et marche même sans connexion (seul le classement en ligne a besoin d'Internet).

- **iPhone / iPad** (Safari) : ouvrir https://isatopro521-lgtm.github.io/mon-jeu-3d/, toucher **Partager**
  (carré avec une flèche) → **Sur l'écran d'accueil** → *Ajouter*. Le menu du jeu le rappelle avec une petite bannière
  (que l'on peut fermer).
- **Android** (Chrome) : bouton **Installer le jeu** dans le menu, ou menu ⋮ → *Installer l'application*.
- **PC** (Chrome, Edge) : bouton **Installer le jeu** du menu, ou icône d'installation dans la barre d'adresse.

Les mises à jour arrivent toutes seules : à chaque publication, le workflow remplace le marqueur `__VERSION__`
de `sw.js` par le numéro du commit, ce qui renouvelle le cache hors ligne des joueurs
(au lancement suivant, `index.html` est toujours redemandé au réseau d'abord).
En local, le marqueur reste et le service worker passe en « réseau d'abord » pour ne pas gêner le développement ;
il n'est pas enregistré du tout avec `?debug`.

Pour refaire les icônes ou les captures d'écran (Playwright + Chromium nécessaires) :
`node scripts/generer-icones.mjs` et `node scripts/generer-captures.mjs`.

### Publier sur les stores

**Déjà prêt** : icônes (`icons/`, dont une icône *maskable* pour Android et une icône Apple 180 × 180),
manifest (`manifest.webmanifest`), 2 captures d'écran 1280 × 720 (`captures/`), service worker hors ligne (`sw.js`)
et page de confidentialité (`confidentialite.html`, à donner comme « Privacy policy URL » :
https://isatopro521-lgtm.github.io/mon-jeu-3d/confidentialite.html).

**Google Play (Android)** — le plus simple :

1. Créer un compte développeur Google Play : **25 $ une seule fois**.
2. Aller sur [PWABuilder](https://www.pwabuilder.com), coller l'adresse du site
   (https://isatopro521-lgtm.github.io/mon-jeu-3d/) : il vérifie le manifest et **génère le paquet Android**
   (fichier `.aab`) à partir du site, sans rien recoder.
3. Envoyer ce paquet dans la Play Console, remplir la fiche (description, captures, confidentialité, classification
   du contenu) et publier. PWABuilder fournit aussi un fichier `assetlinks.json` à mettre sur le site pour
   masquer la barre d'adresse.

**App Store (iPhone / iPad)** — plus contraignant :

- Compte **Apple Developer : 99 $ par an**, au nom d'une personne **majeure (18 ans)** ou d'un parent.
- Il faut un **Mac avec Xcode** (ou un service de compilation en ligne) pour fabriquer l'app, par exemple avec
  PWABuilder (paquet iOS) ou [Capacitor](https://capacitorjs.com).
- **Risque de refus** : la règle 4.2 d'Apple (« fonctionnalités minimales ») refuse les apps qui ne sont qu'un site
  web emballé. Sur iPhone, l'installation depuis Safari (ci-dessus) reste gratuite et suffit souvent.

### Mettre le jeu en ligne

**GitHub Pages** (gratuit, adresse `https://isatopro521-lgtm.github.io/mon-jeu-3d/`) :

1. Rendre le dépôt public : *Settings → General → Danger Zone → Change visibility → Public*
   (GitHub Pages est gratuit uniquement pour les dépôts publics).
2. Activer Pages : *Settings → Pages → Build and deployment → Source : **GitHub Actions***.
3. Fusionner le code dans la branche `main`. Le workflow `.github/workflows/pages.yml`
   publie alors le jeu automatiquement à chaque modification de `main`
   (suivi dans l'onglet *Actions*).

**itch.io** (site de jeux indépendants, pour être découvert par des joueurs) :

1. Fabriquer le zip : `bash scripts/zip-itch.sh` → `dist/nexus-frontier-itch.zip`
   (le workflow GitHub le fabrique aussi : onglet *Actions* → dernière exécution → *Artifacts*).
2. Sur itch.io : *Upload new project* → *Kind of project* : **HTML** → envoyer le zip
   → cocher *This file will be played in the browser*.
3. Dans *Embed options* : taille 1280 × 720, cocher *Mobile friendly* (orientation paysage)
   et *Fullscreen button*.
4. Ajouter une description, des captures d'écran, puis *Save* et passer la page en *Public*.

Les textes de la page itch.io (accroche, description, tags) sont prêts dans [`PUBLIER-ITCH.md`](PUBLIER-ITCH.md).

Le jeu n'a besoin d'aucun serveur ni d'aucun site extérieur : la bibliothèque Three.js
(licence MIT) est incluse dans `lib/three/`.

### Partager le jeu et défier ses amis

**Jouer** : https://isatopro521-lgtm.github.io/mon-jeu-3d/

- **Bouton « Défier un ami »** sur l'écran de fin de partie (et « Partager le jeu » / « Défier un ami » dans le menu,
  avec le record) : sur téléphone, il ouvre le menu de partage du téléphone (WhatsApp, Snapchat, SMS…) ;
  sur ordinateur, il **copie le lien** dans le presse-papiers (message de confirmation sous le bouton).
- Le lien contient le score à battre : `https://isatopro521-lgtm.github.io/mon-jeu-3d/?defi=12500&nom=Isa`.
- Quand un ami ouvre ce lien, le menu affiche **« Isa te défie : bats 12 500 points ! »**, et l'écran de fin
  lui dit s'il a relevé le défi (ou combien de points il lui manque).
- Sécurité : `defi` doit être un nombre entier entre 1 et 10 000 000, `nom` est réduit à 16 lettres/chiffres ;
  sinon le lien est ignoré. Le texte est toujours affiché comme du texte (jamais interprété comme du HTML).
- Code : `src/partage.js`.

**Aperçu du lien** : quand on colle l'adresse du jeu dans WhatsApp, Discord, Snapchat, X, Facebook…,
une carte avec image, titre et description s'affiche (balises Open Graph et Twitter Card dans `index.html`,
image `captures/apercu-partage.jpg` en 1200 × 630, refaite avec `node scripts/generer-apercu.mjs`).
Les applis gardent l'aperçu en mémoire un moment : un changement d'image peut mettre du temps à apparaître.

**Référencement** : adresse canonique, données structurées `VideoGame` (JSON-LD) dans `index.html`,
`robots.txt` et `sitemap.xml` (copiés sur le site par le workflow). Pour apparaître plus vite dans Google :
ajouter le site dans [Google Search Console](https://search.google.com/search-console) et y envoyer
`https://isatopro521-lgtm.github.io/mon-jeu-3d/sitemap.xml`.

**itch.io et réseaux sociaux** : tout est expliqué, avec les textes prêts à copier, dans
[`PUBLIER-ITCH.md`](PUBLIER-ITCH.md) (page itch.io, tags, messages pour Discord, TikTok, Reddit r/WebGames, X…).

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
| `src/qualite.js` | Niveaux de qualité (haute/moyenne/basse) et mode Auto selon les images/s |
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
| `src/installation.js` | Aide à l'installation de l'app (bannière iPhone, bouton « Installer le jeu ») |
| `src/partage.js` | Partage du jeu, liens de défi `?defi=…&nom=…`, bandeau et résultat du défi |
| `robots.txt`, `sitemap.xml` | Référencement par les moteurs de recherche |
| `PUBLIER-ITCH.md` | Textes et étapes pour publier sur itch.io et faire connaître le jeu |
| `sw.js` | Service worker : cache des fichiers du jeu, jeu hors ligne, mises à jour |
| `manifest.webmanifest` | Manifest de l'app (nom, icônes, plein écran paysage, captures) |
| `confidentialite.html` | Page de confidentialité (demandée par les stores) |
| `icons/`, `captures/` | Icônes de l'app et captures d'écran pour les stores |

`lib/three/` contient Three.js 0.160.0. `scripts/zip-itch.sh` fabrique le zip pour itch.io ;
`scripts/generer-icones.mjs` et `scripts/generer-captures.mjs` refont les icônes et les captures,
`scripts/generer-apercu.mjs` l'image d'aperçu des liens partagés.

Ajouter `?debug` à l'URL expose l'objet `window.jeu` pour le débogage.

## Agent Claude Code

Le dépôt contient un sous-agent Claude Code spécialisé : `.claude/agents/dev-jeu-3d.md`.
Il connaît la stack (Three.js dans le navigateur, sans build), la structure du projet
et les bonnes pratiques d'un FPS (boucle de jeu, collisions, IA des ennemis, performances).

Utilisation dans Claude Code, par exemple :

> Utilise l'agent dev-jeu-3d pour créer la scène de base avec les contrôles FPS.

La commande `/agents` permet de le voir et de le modifier.
