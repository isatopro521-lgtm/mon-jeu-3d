# Crédits — modèles 3D et voix de NEXUS FRONTIER

Les personnages et les armes réalistes du jeu (dossier `modeles/`) viennent de modèles libres.
Tous autorisent un jeu publié gratuitement ; les licences CC BY demandent seulement de citer l'auteur,
ce que fait cette page (et la page `credits.html`, accessible depuis le menu du jeu).

Les fichiers ont été allégés pour le web (animations utiles seulement, textures réduites,
géométrie compressée, couleurs regroupées) par `scripts/modeles/construire.mjs`.

| Fichier du jeu | Modèle d'origine | Auteur | Licence | Source |
| --- | --- | --- | --- | --- |
| `modeles/soldat.glb` (corps, tenue, casque) | FREE [Military Soldier] RIGGED | BAMEN (bamenwo05) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | https://sketchfab.com/3d-models/free-military-soldier-rigged-e9c56308a67d4a3db62e914fafa4d198 |
| `modeles/soldat.glb` (animations : repos, marche, course, visée, tir, touché, mort, coup de crosse) | Universal Animation Library | Quaternius | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | https://quaternius.itch.io/universal-animation-library |
| `modeles/soldat.glb` (adaptation des animations au soldat) | Operation Steel Tide — `bamen_military_soldier_animated.glb` | AetherRadar | [MIT](https://github.com/AetherRadar/operation-steel-tide/blob/main/LICENSE) (code et adaptation) | https://github.com/AetherRadar/operation-steel-tide |
| `modeles/bras.glb` (bras et gants à la première personne) | fps animated smg (bras en pose « fusil », pose adaptée par Operation Steel Tide) | DJMaesen | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | https://sketchfab.com/3d-models/fps-animated-smg-ea3dad7478624495a5a46f40127b0579 |
| `modeles/fusil.glb` (fusil d'assaut) | M4A1 Assault Rifle | nisu | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | https://opengameart.org/content/m4a1-assault-rifle |
| `modeles/fusil.glb` (poignée avant, viseur) | Ultimate Guns Pack | Quaternius | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | https://poly.pizza/bundle/Ultimate-Guns-Pack-cpgUfI4t2F |
| `modeles/pompe.glb` (fusil à pompe) | Mossberg 590A1 | J-Toastie | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | https://poly.pizza/m/eAh1oHY32T |
| `modeles/pm-ennemi.glb` (pistolet-mitrailleur des soldats) | Submachine Gun (Ultimate Guns Pack) | Quaternius | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | https://poly.pizza/bundle/Ultimate-Guns-Pack-cpgUfI4t2F |
| `modeles/fusil-ennemi.glb` (fusil des tireurs) | Assault Rifle (Ultimate Guns Pack) | Quaternius | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | https://poly.pizza/bundle/Ultimate-Guns-Pack-cpgUfI4t2F |

Modifications apportées (exigées par les licences CC BY) : couleurs de la tenue changées par faction,
matières regroupées, animations triées et compressées, textures réduites ; arme du bras d'origine retirée
(adaptation Operation Steel Tide), fusil à pompe recoloré en noir mat.

Les fichiers sources ont été récupérés via les dépôts publics
[AetherRadar/operation-steel-tide](https://github.com/AetherRadar/operation-steel-tide) (qui documente
la provenance et la licence de chaque fichier) et
[bumbeishvili/green-diamond](https://github.com/bumbeishvili/green-diamond) (Mossberg 590A1).

## Voix du film (`audio/film/`)

Les 28 répliques du film (`audio/film/voix-00.mp3` … `voix-27.mp3`) ont été générées hors ligne par
synthèse vocale (aucun service en ligne, aucune voix de personne connue clonée), puis filtrées
(voix grave du narrateur, filtre radio de la Base) et normalisées :

| Personnage | Moteur et voix | Licence du modèle / des données |
|------------|----------------|----------------------------------|
| Varga | [Kokoro-82M](https://github.com/hexgrad/kokoro) v1.0, voix française `ff_siwis` | Modèle Apache 2.0 ; voix issue du corpus [SIWIS](https://datashare.is.ed.ac.uk/handle/10283/2353) (CC BY 4.0) |
| Narrateur | [Piper](https://github.com/rhasspy/piper) `fr_FR-tom-medium` | Modèle et données [Tjiho/French-tts-model-piper](https://git.bksp.space/Tjiho/French-tts-model-piper) (AGPLv3) |
| Base (radio) | [Piper](https://github.com/rhasspy/piper) `fr_FR-upmc-medium`, voix « pierre » | Données [UPMC Pierre](https://github.com/marytts/upmc-pierre-data) ([CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.fr)) |

Modèles exécutés avec [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) (Apache 2.0) ; vérification
automatique des répliques avec Whisper small (MIT). Par prudence, les répliques de la Base (voix UPMC Pierre)
sont redistribuées sous la même licence CC BY-SA 4.0.

## Bibliothèque

- [Three.js](https://threejs.org) 0.160.0 — licence MIT (`lib/three/LICENSE`), y compris les modules
  `GLTFLoader`, `SkeletonUtils`, `BufferGeometryUtils` et `PointerLockControls`.

## Licence MIT d'Operation Steel Tide

```
MIT License

Copyright (c) 2026 AetherRadar

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Tout le reste (code, décor, textures procédurales, sons générés) est créé pour le jeu.
