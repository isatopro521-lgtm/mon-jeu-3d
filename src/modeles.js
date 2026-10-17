import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as clonerSquelette } from 'three/addons/utils/SkeletonUtils.js';

// Modèles 3D réalistes (glTF, dossier modeles/, voir CREDITS.md) : soldats animés, bras et armes
// à la première personne, armes des ennemis.
// Chargés une seule fois au démarrage ; chaque ennemi reçoit un clone (squelette compris).
// Si un fichier ne charge pas (hors ligne sans cache, vieux navigateur…), le jeu garde ses
// modèles procéduraux : rien ne plante. `?sansmodeles` force ce mode (tests).

const FICHIERS = {
  soldat: 'modeles/soldat.glb',
  bras: 'modeles/bras.glb',
  fusil: 'modeles/fusil.glb',
  pompe: 'modeles/pompe.glb',
  pmEnnemi: 'modeles/pm-ennemi.glb',
  fusilEnnemi: 'modeles/fusil-ennemi.glb',
};

/** gltf chargés, par nom (absent si le chargement a échoué). */
export const modeles = {};
let promesse = null;

/** Lance le chargement (une seule fois) ; la promesse ne rejette jamais. */
export function chargerModeles() {
  if (promesse) return promesse;
  if (new URLSearchParams(location.search).has('sansmodeles')) return (promesse = Promise.resolve(modeles));
  const chargeur = new GLTFLoader();
  promesse = Promise.all(Object.entries(FICHIERS).map(([nom, url]) =>
    chargeur.loadAsync(url)
      .then((gltf) => { modeles[nom] = gltf; })
      .catch((e) => console.warn(`Modèle ${url} indisponible, modèle simplifié utilisé.`, e?.message ?? e)),
  )).then(() => modeles);
  return promesse;
}

/** Copie indépendante d'un modèle (squelette et os compris), ou null s'il n'est pas chargé. */
export function cloner(nom) {
  const g = modeles[nom];
  return g ? clonerSquelette(g.scene) : null;
}

/** Clip d'animation par nom (ou undefined). */
export function clip(nom, nomClip) {
  return modeles[nom]?.animations.find((a) => a.name === nomClip);
}

// ---------- Soldat : palette de couleurs par faction ----------
// Le corps du soldat n'a qu'une matière : la couleur de chaque partie est lue dans une petite
// texture-palette (coordonnées uv1), ce qui permet de changer de tenue sans multiplier les
// appels de rendu. Ordre : scripts/modeles/construire.mjs (PARTIES_SOLDAT).
// [couleur sRGB, rugosité, métal]
const PARTIES = ['tenue', 'casque', 'sangles', 'boucles', 'poches', 'plaques', 'peau', 'semelles', 'bottes', 'souscombi'];
const BASE = {
  tenue: [0x3b4231, 0.9, 0], casque: [0x2c3127, 0.5, 0.25], sangles: [0x6e6247, 0.92, 0],
  boucles: [0x5b6062, 0.35, 0.85], poches: [0x30342a, 0.85, 0.05], plaques: [0x464c3a, 0.6, 0.1],
  peau: [0xa77f62, 0.65, 0], semelles: [0x1c1d1e, 0.8, 0], bottes: [0x2a2620, 0.7, 0], souscombi: [0x1e211d, 0.75, 0],
};
const FACTIONS = {
  // soldat d'assaut : treillis olive, plaques rouge sombre
  soldat: { plaques: [0x5c2620, 0.55, 0.12], sangles: [0x75674a, 0.92, 0] },
  // tireur : tenue urbaine gris-bleu, plaques bleu acier
  tireur: { tenue: [0x3a4148, 0.9, 0], casque: [0x2a3036, 0.45, 0.3], poches: [0x2c3238, 0.85, 0.05],
    sangles: [0x585f66, 0.9, 0], plaques: [0x24405e, 0.55, 0.15] },
};

const cachePalettes = {};
/** Matière du corps pour une faction (partagée ; chaque ennemi en reçoit un clone). */
export function matiereSoldat(faction) {
  if (cachePalettes[faction]) return cachePalettes[faction];
  const couleurs = new Uint8Array(16 * 4), surface = new Uint8Array(16 * 4);
  const c = new THREE.Color();
  PARTIES.forEach((p, i) => {
    const [hex, rugosite, metal] = FACTIONS[faction]?.[p] ?? BASE[p];
    c.setHex(hex, THREE.LinearSRGBColorSpace); // valeurs déjà en sRGB : on les écrit telles quelles
    couleurs.set([c.r * 255, c.g * 255, c.b * 255, 255], i * 4);
    surface.set([255, rugosite * 255, metal * 255, 255], i * 4); // G = rugosité, B = métal (glTF)
  });
  const tex = (donnees, srgb) => {
    const t = new THREE.DataTexture(donnees, 16, 1);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.channel = 1; // uv1 : coordonnées de palette
    t.needsUpdate = true;
    return t;
  };
  const surf = tex(surface, false);
  return (cachePalettes[faction] = new THREE.MeshStandardMaterial({
    map: tex(couleurs, true), roughnessMap: surf, metalnessMap: surf, roughness: 1, metalness: 1,
    normalMap: normalesTissu(), normalScale: new THREE.Vector2(0.6, 0.6),
  }));
}

let texTissu = null;
/** Petite carte de normales « toile » (trame + bruit), répétée sur les UV du modèle. */
export function normalesTissu() {
  if (texTissu) return texTissu;
  const t = 64;
  const h = new Float32Array(t * t);
  for (let y = 0; y < t; y++) {
    for (let x = 0; x < t; x++) {
      // trame croisée + grain aléatoire (périodique)
      const trame = Math.sin(x / t * Math.PI * 2 * 16) * Math.sin(y / t * Math.PI * 2 * 16);
      h[y * t + x] = trame * 0.5 + (Math.random() - 0.5) * 0.6;
    }
  }
  const d = new Uint8Array(t * t * 4);
  for (let y = 0; y < t; y++) {
    for (let x = 0; x < t; x++) {
      const gx = h[y * t + (x + 1) % t] - h[y * t + (x + t - 1) % t];
      const gy = h[((y + 1) % t) * t + x] - h[((y + t - 1) % t) * t + x];
      const n = new THREE.Vector3(-gx, -gy, 2).normalize();
      d.set([(n.x * 0.5 + 0.5) * 255, (n.y * 0.5 + 0.5) * 255, (n.z * 0.5 + 0.5) * 255, 255], (y * t + x) * 4);
    }
  }
  texTissu = new THREE.DataTexture(d, t, t);
  texTissu.wrapS = texTissu.wrapT = THREE.RepeatWrapping;
  texTissu.repeat.set(6, 6);
  texTissu.generateMipmaps = true;
  texTissu.minFilter = THREE.LinearMipmapLinearFilter;
  texTissu.magFilter = THREE.LinearFilter;
  texTissu.needsUpdate = true;
  return texTissu;
}
