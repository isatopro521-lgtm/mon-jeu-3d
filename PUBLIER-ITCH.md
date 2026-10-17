# Publier NEXUS FRONTIER sur itch.io (et le faire connaître)

itch.io est le grand site des jeux indépendants : des milliers de joueurs y cherchent chaque jour
des jeux gratuits à lancer dans le navigateur. C'est le meilleur endroit pour trouver de **vrais joueurs**.

Tout est prêt : il ne reste qu'à **créer le compte** (gratuit) et à copier les textes ci-dessous.

---

## 1. Les étapes (10 minutes)

1. **Créer un compte** sur https://itch.io (bouton *Register*). Gratuit. Choisir un nom d'utilisateur :
   il apparaîtra dans l'adresse de la page (`https://<nom>.itch.io/nexus-frontier`).
2. **Récupérer le zip du jeu** :
   - sur GitHub : onglet **Actions** → dernière exécution réussie de « Publier le jeu » → en bas, **Artifacts** →
     `nexus-frontier-itch` (on obtient un zip qui contient `nexus-frontier-itch.zip`) ;
   - ou sur un ordinateur avec le projet : `bash scripts/zip-itch.sh` → `dist/nexus-frontier-itch.zip`.
3. Sur itch.io : menu en haut à droite → **Upload new project**.
4. Remplir la fiche :
   - **Title** : `NEXUS FRONTIER`
   - **Project URL** : `nexus-frontier`
   - **Short description or tagline** : voir « Accroche » plus bas
   - **Classification** : *Games* — **Kind of project** : **HTML**
   - **Release status** : *Released* (ou *In development* si on veut montrer qu'il évolue)
   - **Pricing** : *No payments* (gratuit) — ou *$0 or donate* pour accepter des dons
5. **Uploads** : envoyer `nexus-frontier-itch.zip`, puis cocher **This file will be played in the browser**.
6. **Embed options** :
   - *Viewport dimensions* : **1280 × 720**
   - cocher **Mobile friendly** (orientation : **Landscape**)
   - cocher **Fullscreen button**
   - cocher **Automatically start on page load** : non (laisser décoché)
7. **Description** : coller le texte « Description » plus bas.
8. **Genre** : *Shooter* — **Tags** : voir la liste plus bas.
9. **Cover image** (630 × 500 conseillé) : envoyer `captures/apercu-partage.jpg`
   (itch.io propose de recadrer). **Screenshots** : `captures/capture-combat.png` et `captures/capture-menu.png`.
10. **Visibility & access** : *Public*, puis **Save & view page**. C'est en ligne !

Astuce : dans *Edit theme* (sur la page du jeu), choisir un fond sombre et l'orange `#ff7a1e` pour les liens,
aux couleurs du jeu.

---

## 2. Textes de la page (à copier)

### Titre

```
NEXUS FRONTIER
```

### Accroche (Short description or tagline)

```
FPS de survie gratuit : repousse les vagues de soldats et de mechs-araignées, sur PC et téléphone !
```

### Description

```
Défends l'avant-poste Nexus, perdu au milieu des montagnes, contre des vagues d'ennemis de plus en plus nombreuses.
Toutes les 5 vagues, la TEMPÊTE NEXUS s'abat sur l'arène : ciel rouge, éclairs et pluie battante.

Combien de vagues tiendras-tu ?

 3 types d'ennemis avec une vraie IA : soldats rapides, tireurs qui gardent leurs distances, mechs-araignées blindés
 2 armes : fusil d'assaut à lunette et fusil à pompe — tirs à la tête ×2
 Grenades qui rebondissent, armure, trousses de soin et caisses de munitions
 Boussole, minicarte, classement des meilleurs scores
 Défie tes amis : à la fin d'une partie, touche « Défier un ami » et envoie-leur ton score à battre
 Jouable sur ordinateur ET sur téléphone / tablette (commandes tactiles)
 Gratuit, sans pub, sans compte, sans téléchargement

COMMANDES PC
• Z Q S D ou W A S D : se déplacer
• Souris : viser — Clic gauche : tirer
• Espace : sauter — Maj : sprinter
• R : recharger — 1 / 2 ou molette : changer d'arme
• G ou clic droit : lancer une grenade
• Échap : pause

COMMANDES TÉLÉPHONE / TABLETTE (mode paysage conseillé)
• Joystick à gauche : se déplacer (à fond vers l'avant : sprint)
• Glisser à droite de l'écran : viser
• Boutons TIR, SAUT, R (recharger), ARME, GRENADE et pause

Le jeu existe aussi en version installable (plein écran, hors ligne) :
https://isatopro521-lgtm.github.io/mon-jeu-3d/

Fait avec Three.js. Toutes les images et tous les sons sont générés par le code.
```

### Tags conseillés (10 maximum)

```
fps, shooter, survival, wave-shooter, 3d, first-person, browser, mobile, singleplayer, low-poly
```

### Genre

```
Shooter
```

---

## 3. Textes prêts à poster pour faire venir des joueurs

Le lien à partager : **https://isatopro521-lgtm.github.io/mon-jeu-3d/** (ou la page itch.io une fois créée).
Quand on colle ce lien, une belle image d'aperçu s'affiche toute seule (WhatsApp, Discord, X, Snapchat…).

Conseils :
- toujours **montrer une image ou une courte vidéo** du jeu (les captures sont dans `captures/`) ;
- répondre aux commentaires : les gens adorent qu'on tienne compte de leurs idées ;
- le meilleur moyen reste le **défi** : finir une partie, toucher « Défier un ami » et envoyer le lien.

### Discord (serveur d'amis ou salon #jeux / #self-promo)

```
J'ai créé un FPS de survie qui se joue direct dans le navigateur, sur PC et sur téléphone !
Des vagues de soldats et de mechs-araignées, une tempête toutes les 5 vagues… Combien de vagues vous tenez ?
Essayez de tenir plus de vagues que moi (ou finissez une partie et touchez « Défier un ami ») :
https://isatopro521-lgtm.github.io/mon-jeu-3d/
```

### TikTok / Instagram / YouTube Shorts (légende de la vidéo)

Idée de vidéo : 15 à 30 s filmées pendant une partie (une grenade qui explose, la Tempête Nexus, un mech-araignée),
avec le texte à l'écran « J'ai codé mon propre jeu FPS. Tu bats mon score ? »

```
J'ai créé mon propre jeu de tir 3D, jouable gratuitement sur téléphone et PC ! Tu tiens combien de vagues ?
Lien dans la bio. #jeuvideo #gamedev #fps #indiegame #jeuindé #threejs
```

(Mettre https://isatopro521-lgtm.github.io/mon-jeu-3d/ dans la bio du compte.)

### Reddit — r/WebGames (en anglais, la règle du sous-forum : lien direct vers un jeu jouable)

Titre :
```
NEXUS FRONTIER - a free 3D wave-survival FPS that runs in your browser (PC + mobile)
```
Lien : `https://isatopro521-lgtm.github.io/mon-jeu-3d/`

Commentaire à ajouter sous le post :
```
Hi! I made this FPS with Three.js. Survive waves of soldiers and spider mechs, and every 5 waves a "Nexus Storm" hits
the arena. Works on desktop (WASD + mouse) and on phones (touch controls). No download, no account.
The interface is in French for now, but the controls are standard. Feedback welcome!
```

Autres endroits : r/IndieGaming, r/threejs (montrer comment c'est fait), r/jeuxvideo (en français),
le salon « showcase » du Discord de Three.js.

### X (Twitter) / Bluesky / Threads

```
J'ai créé NEXUS FRONTIER, un FPS de survie gratuit qui se joue dans le navigateur, sur PC et téléphone.
Vagues d'ennemis, mechs-araignées, tempête… Tu bats mon score ?
https://isatopro521-lgtm.github.io/mon-jeu-3d/
#gamedev #indiegame #threejs #webgame
```

### Message à un ami (WhatsApp, Snapchat, SMS)

Le plus simple : finir une partie et toucher **« Défier un ami »** dans le jeu — le message et le lien
avec ton score sont préparés tout seuls.

---

## 4. Et pour aller plus loin

- **Classement mondial / multijoueur en temps réel** : il faut un service en ligne pour stocker les scores
  de tout le monde. Le plus simple est un compte **gratuit Supabase** (voir la section « Classement » du README :
  quelques minutes, puis l'URL et la clé publique à coller dans `src/config.js`). Un vrai multijoueur en temps réel
  demanderait aussi ce genre de service (Supabase Realtime, par exemple).
- **Google Search Console** (gratuit, avec un compte Google) : ajouter le site et envoyer le plan du site
  `https://isatopro521-lgtm.github.io/mon-jeu-3d/sitemap.xml` pour apparaître plus vite dans Google.
- Autres sites de jeux gratuits où publier le même zip : **Newgrounds**, **GameJolt**, **CrazyGames** et **Poki**
  (ces deux derniers sélectionnent les jeux, mais peuvent apporter beaucoup de joueurs).
