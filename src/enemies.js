import * as THREE from 'three';
import { clamp, collisionCercleBoites, Assemblage, fusionner } from './utils.js';
import { DEMI_ARENE } from './world.js';
import { sons } from './audio.js';
import { modeles, cloner, clip, matiereSoldat } from './modeles.js';
import { declarerLumineux } from './postprocess.js';
import { textureMetalUse, normalesDepuis, rugositeDepuis, uvMonde } from './textures.js';

// Paramètres des types d'ennemis
// taille : « poids » (recul encaissé) ; echelle : taille du modèle ; rayon/hauteur : collision ;
// yeux : hauteur des yeux (ligne de vue) ; visiere/accent : couleurs du modèle.
export const TYPES = {
  soldat: {
    vie: 60, vitesse: 4.6, degats: 10, portee: 1.7, recharge: 1.0, couleur: 0xff4a3a, taille: 1, points: 100, distance: false,
    modele: 'soldat', echelle: 1, rayon: 0.45, hauteur: 1.95, yeux: 1.76, visiere: 0xff2a1a, accent: 0x8e2a22,
  },
  tireur: {
    vie: 50, vitesse: 3.4, degats: 12, portee: 24, recharge: 1.8, couleur: 0x3a9cff, taille: 0.95, points: 150, distance: true,
    modele: 'soldat', echelle: 0.97, rayon: 0.43, hauteur: 1.9, yeux: 1.7, visiere: 0x2aa8ff, accent: 0x24548a,
  },
  // La brute est un mech-araignée blindé à 4 pattes
  brute: {
    vie: 320, vitesse: 2.5, degats: 30, portee: 2.6, recharge: 1.6, couleur: 0xff5a2a, taille: 1.45, points: 400, distance: false,
    modele: 'mech', echelle: 1.15, rayon: 1.05, hauteur: 2.7, yeux: 2.3, visiere: 0xff1a0a, accent: 0x6a1c16,
  },
};

const VISION = 45;                                   // distance de vue (m)
const CHAMP_COS = Math.cos(THREE.MathUtils.degToRad(75)); // demi-angle du champ de vision
const OUIE = 7;                                      // détecte le joueur à cette distance même sans le voir
const LIMITE = DEMI_ARENE - 1;
const VITESSE_PROJECTILE = 20;
const DUREE_APPARITION = 0.5;
const DUREE_ARMEMENT = 0.4;                          // temps avant que le coup au corps à corps ne porte
const DUREE_RECUL = 0.28;                            // sursaut quand l'ennemi est touché
const DUREE_ESQUIVE = 0.35;                          // pas de côté après une touche
const CHANCE_ESQUIVE = 0.35;
const DUREE_CHUTE = 0.75;                            // mort : chute…
const DEBUT_FONDU = 1.25;                            // …puis le corps reste au sol…
const DUREE_FONDU = 0.75;                            // …et se dissout en particules
const DUREE_ICONE = 1.1;                             // icône « ! » au-dessus de la tête à l'alerte
const COU_Y = 1.62, HANCHES_Y = 0.95;                // pivots du soldat (tête, haut du corps)

// ---------- Modèles ----------
// Chaque partie animée est un seul maillage (pièces fusionnées, couleurs de sommets) :
// peu d'appels de rendu, et un seul matériau par ennemi pour le flash de touche et la disparition.
const ARMURE = 0x424852, ARMURE_SOMBRE = 0x2b3037, TISSU = 0x2c302e, OLIVE = 0x454635, BOTTE = 0x1a1b1d;
const boite = new THREE.BoxGeometry(1, 1, 1);
const sphere = new THREE.SphereGeometry(1, 12, 8);
const cylindre = new THREE.CylinderGeometry(1, 1, 1, 8);
const matVisieres = {};
function matVisiere(couleur) {
  return (matVisieres[couleur] ??= declarerLumineux(new THREE.MeshBasicMaterial({ color: couleur }), 2.5));
}
const matVisiereFlash = new THREE.MeshBasicMaterial({ color: 0xffffff }); // éclair d'alerte
/** Visière du soldat réaliste : verre sombre et brillant, légèrement éclairé de la couleur du camp. */
const matVisieresVerre = {};
function matVisiereVerre(couleur) {
  return (matVisieresVerre[couleur] ??= declarerLumineux(new THREE.MeshStandardMaterial({
    color: 0x05070a, metalness: 0.9, roughness: 0.08, emissive: couleur, emissiveIntensity: 0.2,
  }), 4));
}

// Icône « ! » d'alerte (texture dessinée une fois, matériau partagé par tous les ennemis)
const matIcone = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#ffcf33';
  x.strokeStyle = '#1a1206';
  x.lineWidth = 5;
  x.beginPath();
  x.moveTo(32, 4); x.lineTo(60, 58); x.lineTo(4, 58); x.closePath();
  x.fill(); x.stroke();
  x.fillStyle = '#1a1206';
  x.fillRect(28, 20, 8, 22);
  x.fillRect(28, 46, 8, 7);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.SpriteMaterial({ map: tex, depthWrite: false, fog: false });
})();

function geo(fn, couleurs = true) {
  const asm = new Assemblage();
  fn((g, x, y, z, sx, sy, sz, couleur, rot = {}) => asm.ajouter(g, x, y, z, { sx, sy, sz, couleur, ...rot }));
  return asm.geometrie(couleurs);
}

// Géométries partagées par tous les soldats (une par type pour les couleurs d'accent)
const cacheSoldat = {};
function geosSoldat(t) {
  if (cacheSoldat[t.accent]) return cacheSoldat[t.accent];
  const acc = t.accent;
  const torse = geo((b) => {
    b(boite, 0, 0.98, 0, 0.36, 0.16, 0.22, TISSU);              // bassin + ceinture
    b(boite, 0, 0.99, 0.02, 0.38, 0.06, 0.24, ARMURE_SOMBRE);
    b(boite, 0, 1.15, 0, 0.31, 0.22, 0.2, TISSU);               // ventre
    b(boite, 0, 1.38, 0, 0.44, 0.3, 0.27, ARMURE);              // gilet pare-balles
    b(boite, 0, 1.36, 0.13, 0.34, 0.22, 0.05, ARMURE_SOMBRE);   // plaque avant
    b(boite, 0, 1.43, 0.157, 0.2, 0.025, 0.01, acc);            // bande de faction
    for (const x of [-0.1, 0, 0.1]) b(boite, x, 1.2, 0.12, 0.08, 0.09, 0.06, OLIVE); // poches
    b(boite, 0, 1.36, -0.2, 0.32, 0.34, 0.14, ARMURE_SOMBRE);   // sac
    b(boite, 0, 1.24, -0.26, 0.26, 0.1, 0.06, OLIVE);
    for (const s of [-1, 1]) b(boite, s * 0.29, 1.53, 0, 0.17, 0.1, 0.22, acc, { rz: s * -0.25 }); // épaulières
    b(cylindre, 0, 1.6, 0, 0.07, 0.1, 0.07, TISSU);             // cou
  });
  const tete = geo((b) => {
    b(sphere, 0, 1.78, -0.01, 0.17, 0.155, 0.19, ARMURE);       // casque
    b(boite, 0, 1.79, 0, 0.36, 0.03, 0.4, ARMURE_SOMBRE, { rx: -0.05 }); // rebord
    b(boite, 0, 1.69, 0.08, 0.2, 0.12, 0.13, ARMURE_SOMBRE);    // masque
    b(boite, 0, 1.66, 0.15, 0.1, 0.06, 0.04, 0x111214);         // filtre
    for (const s of [-1, 1]) b(boite, s * 0.16, 1.76, 0, 0.04, 0.09, 0.1, ARMURE_SOMBRE); // oreillettes
  });
  const visiere = geo((b) => b(boite, 0, 1.765, 0.155, 0.25, 0.05, 0.05, 0xffffff), false);
  // Bras : pivot à l'épaule, le long de -y. Le bras droit porte l'arme (même maillage).
  const brasPieces = (b) => {
    b(boite, 0, -0.14, 0, 0.12, 0.28, 0.13, TISSU);
    b(boite, 0, -0.29, 0.01, 0.13, 0.07, 0.14, ARMURE_SOMBRE);  // coudière
    b(boite, 0, -0.43, 0, 0.11, 0.26, 0.12, TISSU);
    b(boite, 0, -0.59, 0.01, 0.1, 0.1, 0.11, BOTTE);            // gant
  };
  const bras = geo(brasPieces);
  const brasArme = geo((b) => {
    brasPieces(b);
    // arme le long du bras (dessus vers +z), décalée de (-0.04, 0.1, 0.02)
    const a = (g, x, y, z, sx, sy, sz, rot) => b(g, x - 0.04, y + 0.1, z + 0.02, sx, sy, sz, 0x17181b, rot);
    if (t.distance) { // fusil à lunette
      a(boite, 0, -0.62, 0.05, 0.06, 0.62, 0.09);
      a(boite, 0, -0.56, -0.04, 0.045, 0.08, 0.13, { rx: 0.2 });
      a(boite, 0, -0.62, 0.13, 0.05, 0.18, 0.06);
      a(cylindre, 0, -1.0, 0.06, 0.018, 0.2, 0.018);
    } else { // pistolet-mitrailleur
      a(boite, 0, -0.58, 0.04, 0.06, 0.4, 0.09);
      a(boite, 0, -0.55, -0.05, 0.045, 0.06, 0.14);
      a(cylindre, 0, -0.82, 0.05, 0.016, 0.12, 0.016);
    }
  });
  // Jambe : pivot à la hanche, le long de -y
  const jambe = geo((b) => {
    b(boite, 0, -0.21, 0, 0.16, 0.42, 0.18, TISSU);
    b(boite, 0.09, -0.2, 0, 0.04, 0.14, 0.12, OLIVE);           // poche de cuisse
    b(boite, 0, -0.45, 0.06, 0.15, 0.12, 0.08, ARMURE_SOMBRE);  // genouillère
    b(boite, 0, -0.66, 0, 0.14, 0.36, 0.16, TISSU);
    b(boite, 0, -0.86, 0.04, 0.16, 0.1, 0.26, BOTTE);           // botte
  });
  return (cacheSoldat[acc] = { torse, tete, visiere, bras, brasArme, jambe });
}

// Mech-araignée
const MECH = { hancheX: 0.62, hancheZ: 0.72, hancheY: 1.3, cuisse: [0.78, 0.62], tibia: [0.32, -1.92] };
const geosMech = (() => {
  const acc = TYPES.brute.accent;
  const chassis = geo((b) => {
    b(boite, 0, 1.45, 0, 1.4, 0.62, 1.8, ARMURE);                // coque
    b(boite, 0, 1.8, -0.1, 1.15, 0.22, 1.4, ARMURE_SOMBRE);      // blindage supérieur
    b(boite, 0, 1.12, 0, 1.0, 0.18, 1.4, ARMURE_SOMBRE);         // ventre
    b(boite, 0, 1.45, 0.95, 1.1, 0.42, 0.2, ARMURE_SOMBRE, { rx: -0.35 }); // proue
    b(boite, 0, 1.55, -1.0, 0.9, 0.5, 0.35, 0x2f3338);           // moteur arrière
    for (const s of [-1, 1]) {
      b(boite, s * 0.74, 1.48, 0.1, 0.1, 0.42, 1.3, acc);        // plaques latérales rouges
      b(boite, s * 0.82, 1.62, 0.55, 0.22, 0.22, 0.7, ARMURE_SOMBRE); // canons latéraux
      b(cylindre, s * 0.82, 1.62, 1.05, 0.07, 0.4, 0.07, 0x18191c, { rx: Math.PI / 2 });
      b(cylindre, s * 0.62, 1.95, -0.6, 0.03, 0.6, 0.03, 0x18191c, { rz: s * 0.2 }); // antennes
    }
    for (let i = 0; i < 4; i++) b(boite, -0.3 + i * 0.2, 1.8, -0.98, 0.1, 0.12, 0.08, 0x18191c); // grilles
  });
  // tourelle (fusionnée dans la coque ; une boîte invisible sert de zone de tir à la tête)
  const T = [0, 1.98, 0.55];
  const tourelle = geo((b) => {
    b(boite, T[0], T[1], T[2], 0.78, 0.42, 0.62, ARMURE);
    b(boite, T[0], T[1] + 0.24, T[2] - 0.05, 0.6, 0.1, 0.5, ARMURE_SOMBRE);
    b(boite, T[0], T[1] - 0.05, T[2] + 0.33, 0.7, 0.3, 0.08, ARMURE_SOMBRE);
  });
  const yeux = geo((b) => {
    for (const [x, y, s] of [[-0.14, 0.06, 0.09], [0.14, 0.06, 0.09], [-0.25, -0.07, 0.06], [0.25, -0.07, 0.06], [-0.06, -0.1, 0.05], [0.06, -0.1, 0.05]]) {
      b(boite, x, y, 0.38, s, s, 0.03, 0xffffff);
    }
  }, false);
  const [cx, cy] = MECH.cuisse;
  const longCuisse = Math.hypot(cx, cy);
  const cuisse = geo((b) => {
    b(boite, cx / 2, cy / 2, 0, longCuisse, 0.24, 0.26, ARMURE, { rz: Math.atan2(cy, cx) });
    b(boite, cx / 2, cy / 2 + 0.12, 0, longCuisse * 0.7, 0.08, 0.3, acc, { rz: Math.atan2(cy, cx) });
    b(sphere, 0, 0, 0, 0.2, 0.2, 0.2, ARMURE_SOMBRE);            // rotule de hanche
    b(sphere, cx, cy, 0, 0.17, 0.17, 0.17, ARMURE_SOMBRE);       // genou
  });
  const [tx, ty] = MECH.tibia;
  const longTibia = Math.hypot(tx, ty);
  const tibia = geo((b) => {
    b(boite, tx / 2, ty / 2, 0, 0.2, longTibia, 0.22, ARMURE_SOMBRE, { rz: Math.atan2(tx, -ty) });
    b(cylindre, tx * 0.35, ty * 0.35, 0.13, 0.04, longTibia * 0.5, 0.04, 0x8a8f96, { rz: Math.atan2(tx, -ty) }); // vérin
    b(boite, tx, ty + 0.06, 0, 0.36, 0.12, 0.34, BOTTE);         // pied
  });
  const coqueComplete = fusionner([{ geo: chassis }, { geo: tourelle }], { couleurs: true });
  // UV « boîte » : la peinture usée garde la même échelle sur toutes les plaques
  for (const g of [coqueComplete, cuisse, tibia]) uvMonde(g, 0.9);
  return { chassis: coqueComplete, yeux, cuisse, tibia, tete: T };
})();

/** Soldat tactique : torse, tête (zone de tir à la tête), visière lumineuse, bras, jambes, arme. */
function construireSoldat(e, g, t) {
  const G = geosSoldat(t);
  // Pivots : « haut » (hanches) porte le torse, les bras et le cou ; « cou » porte la tête.
  // Les géométries sont en coordonnées absolues : on décale les maillages de -hauteur du pivot.
  e.haut = new THREE.Group();
  e.haut.position.y = HANCHES_Y;
  e.cou = new THREE.Group();
  e.cou.position.y = COU_Y - HANCHES_Y;
  e.cou.rotation.order = 'YXZ';
  const torse = new THREE.Mesh(G.torse, e.mat);
  torse.position.y = -HANCHES_Y;
  const tete = new THREE.Mesh(G.tete, e.mat);
  const visiere = new THREE.Mesh(G.visiere, matVisiere(t.visiere));
  tete.position.y = visiere.position.y = -COU_Y;
  tete.userData.tete = visiere.userData.tete = true;
  e.cou.add(tete, visiere);
  e.haut.add(torse, e.cou);
  g.add(e.haut);
  e.bras = [-1, 1].map((s) => {
    const b = new THREE.Mesh(s > 0 ? G.brasArme : G.bras, e.mat);
    b.position.set(s * 0.3, 1.5 - HANCHES_Y, 0.02);
    e.haut.add(b);
    return b;
  });
  e.jambes = [-1, 1].map((s) => {
    const j = new THREE.Mesh(G.jambe, e.mat);
    j.position.set(s * 0.11, 0.92, 0);
    g.add(j);
    return j;
  });
  e.lumineux = [visiere];
  torse.castShadow = true; // une seule ombre par soldat (moins d'appels de rendu)
}

// ---------- Soldat réaliste (modèle glTF animé, voir CREDITS.md) ----------
const HAUTEUR_MODELE = 1.84;                         // taille du soldat (m, casque compris)
const DEBUT_FONDU_MODELE = 1.9;                      // la chute animée dure plus longtemps
const os = (nom) => 'mixamorig' + nom;               // noms des os (le « : » est retiré au chargement)
// Zones de tir invisibles accrochées aux os : [os, largeur, longueur, profondeur, tête ?]
// (les maillages animés eux-mêmes ne sont pas testés par les balles : plus rapide et plus juste)
const ZONES_TIR = [
  ['Head', 0.27, 0.3, 0.3, true],
  ['Spine1', 0.42, 0.45, 0.3], ['Hips', 0.38, 0.28, 0.28],
  ['LeftUpLeg', 0.19, 0.46, 0.2], ['RightUpLeg', 0.19, 0.46, 0.2],
  ['LeftLeg', 0.15, 0.48, 0.16], ['RightLeg', 0.15, 0.48, 0.16],
  ['LeftArm', 0.13, 0.3, 0.13], ['RightArm', 0.13, 0.3, 0.13],
  ['LeftForeArm', 0.11, 0.28, 0.11], ['RightForeArm', 0.11, 0.28, 0.11],
];
// Animations du modèle (boucles) et vitesse de déplacement correspondant à une lecture normale
const ALLURES = { walk: 1.5, ready_walk: 1.6, aim_walk: 1.5, ready_run: 4.2 };
const _ech = new THREE.Vector3();
const _q = new THREE.Quaternion();
let echelleModele = 0;                               // calculée une fois (taille du modèle chargé)

/**
 * Soldat réaliste : clone du modèle animé, matière à la couleur de sa faction, visière lumineuse,
 * arme dans la main droite, zones de tir sur les os. Mêmes champs que le soldat procédural
 * (mat, lumineux…) + un mélangeur d'animations.
 */
function construireSoldatModele(e, g, t) {
  const racine = cloner('soldat');
  if (!echelleModele) {
    racine.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(racine, true);
    echelleModele = HAUTEUR_MODELE / Math.max(0.5, b.max.y - b.min.y);
  }
  racine.scale.setScalar(echelleModele);
  racine.updateMatrixWorld(true);
  e.modele = racine;
  racine.traverse((o) => {
    if (!o.isMesh) return;
    o.raycast = () => {}; // voir ZONES_TIR
    // la sphère englobante d'un maillage animé ne suit pas la pose : on l'agrandit (chute, bras tendus)
    if (o.isSkinnedMesh) { o.computeBoundingSphere(); o.boundingSphere.radius *= 1.6; }
    if (o.material.name === 'Visiere') {
      o.material = matVisiereVerre(t.visiere);
      e.lumineux = [o];
    } else {
      o.material = e.mat;
      o.castShadow = true;
    }
  });
  const trouver = (nom) => racine.getObjectByName(os(nom));
  e.os = { tete: trouver('Head'), cou: trouver('Neck'), buste: trouver('Spine2'), bassin: trouver('Hips') };

  // Zones de tir : boîtes invisibles, dimensions en mètres malgré l'échelle des os
  for (const [nom, l, h, p, tete] of ZONES_TIR) {
    const o = trouver(nom);
    if (!o) continue;
    o.getWorldScale(_ech);
    const z = new THREE.Mesh(geoZone);
    z.visible = false;
    z.scale.set(l / _ech.x, h / _ech.y, p / _ech.z);
    z.position.y = (tete ? h * 0.4 : h / 2) / _ech.y; // les membres partent de l'articulation (+y)
    z.userData.tete = !!tete;
    o.add(z);
  }

  e.mixer = new THREE.AnimationMixer(racine);
  e.actions = {};
  e.animBase = null;
  e.animLOD = 0;

  // Arme dans la main droite. Son orientation dans la main est calculée sur la pose « en joue » :
  // canon vers l'avant du soldat, dessus vers le haut ; elle suit ensuite la main dans toutes les poses.
  const arme = cloner(t.distance ? 'fusilEnnemi' : 'pmEnnemi');
  const main = trouver('RightHand');
  const visee = clip('soldat', 'aim_idle');
  if (arme && main && visee) {
    arme.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.raycast = () => {}; } });
    const b = new THREE.Box3().setFromObject(arme);
    const L = b.max.x - b.min.x || 1, H = b.max.y - b.min.y; // armes Quaternius : canon le long de +x
    const s = (t.distance ? 0.95 : 0.62) / L;
    const a = e.mixer.clipAction(visee);
    a.play();
    e.mixer.update(0.3);
    racine.updateMatrixWorld(true);
    main.getWorldQuaternion(_q).premultiply(racine.quaternion.clone().invert());
    main.getWorldScale(_ech);
    a.stop();
    // rotation voulue dans le repère du modèle (+x de l'arme → +z du soldat), ramenée dans la main
    arme.quaternion.setFromAxisAngle(_axeY, -Math.PI / 2).premultiply(_q.invert());
    arme.scale.set(s / _ech.x, s / _ech.y, s / _ech.z);
    // la poignée (arrière-bas de l'arme) dans la paume : ~9 cm au-delà du poignet, le long de la main
    const poignee = new THREE.Vector3(b.min.x + L * 0.3, b.min.y + H * 0.3, (b.min.z + b.max.z) / 2)
      .multiplyScalar(s).applyQuaternion(arme.quaternion);
    arme.position.set(0, 0.09, 0.02).sub(poignee).divide(_ech);
    main.add(arme);
    e.arme = arme;
    e.bouche = new THREE.Object3D();
    e.bouche.position.set(b.max.x, b.min.y + H * 0.7, (b.min.z + b.max.z) / 2);
    arme.add(e.bouche);
  }
  g.add(racine);
  e.jouer('idle', 0);
  e.mixer.update(Math.random() * 2); // pose naturelle dès l'apparition, pas tous synchronisés
}
const geoZone = new THREE.BoxGeometry(1, 1, 1);
const _axeY = new THREE.Vector3(0, 1, 0);

const geoTeteMech = new THREE.BoxGeometry(0.8, 0.5, 0.75);
let matMech = null;
/** Blindage du mech : peinture métallique usée, rayures en relief, rugosité variable (PBR). */
function matiereMech() {
  if (matMech) return matMech;
  const usure = textureMetalUse();
  return (matMech = new THREE.MeshStandardMaterial({
    vertexColors: true, map: usure, metalness: 0.55, roughness: 1,
    normalMap: normalesDepuis(usure, { force: 1.4, taille: 256 }),
    roughnessMap: rugositeDepuis(usure, { base: 0.42, variation: 0.3 }),
  }));
}

/** Mech-araignée : châssis, tourelle (tir à la tête), yeux rouges, 4 pattes articulées. */
function construireMech(e, g, t) {
  const G = geosMech;
  e.chassis = new THREE.Group();
  const coque = new THREE.Mesh(G.chassis, e.mat);
  const tourelle = new THREE.Mesh(geoTeteMech); // invisible : seulement pour le tir à la tête
  tourelle.position.set(...G.tete);
  tourelle.visible = false;
  const yeux = new THREE.Mesh(G.yeux, matVisiere(t.visiere));
  yeux.position.copy(tourelle.position);
  tourelle.userData.tete = yeux.userData.tete = true;
  e.chassis.add(coque, tourelle, yeux);
  g.add(e.chassis);
  coque.castShadow = true;
  e.pattes = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz], i) => {
    const hanche = new THREE.Group();
    hanche.position.set(sx * MECH.hancheX, MECH.hancheY, sz * MECH.hancheZ);
    // la patte (vers +x local) est tournée en diagonale vers l'extérieur
    const lacet = Math.atan2(-sz, sx) + (sz > 0 ? -0.25 : 0.25) * sx;
    hanche.rotation.order = 'YZX';
    hanche.rotation.y = lacet;
    const cuisse = new THREE.Mesh(G.cuisse, e.mat);
    const genou = new THREE.Group();
    genou.position.set(MECH.cuisse[0], MECH.cuisse[1], 0);
    const tibia = new THREE.Mesh(G.tibia, e.mat);
    genou.add(tibia);
    hanche.add(cuisse, genou);
    g.add(hanche);
    return { hanche, genou, lacet, phase: i === 0 || i === 3 ? 0 : Math.PI };
  });
  e.lumineux = [yeux];
}

const _vers = new THREE.Vector3();
const _v = new THREE.Vector3();
const _rayon = new THREE.Vector3();
const _oeil = new THREE.Vector3();
const _origine = new THREE.Vector3();
const _visee = new THREE.Vector3();
const raycaster = new THREE.Raycaster();

function angleCourt(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

class Ennemi {
  constructor(type, x, z, niveau, scene) {
    const t = TYPES[type];
    this.type = type;
    this.t = t;
    this.scene = scene;
    this.vieMax = Math.round(t.vie * (1 + 0.12 * (niveau - 1)));
    this.vie = this.vieMax;
    this.vitesseMax = t.vitesse * Math.min(1.4, 1 + 0.03 * (niveau - 1));
    this.rayon = t.rayon;
    this.hauteur = t.hauteur;

    this.position = new THREE.Vector3(x, 0, z);
    this.vel = new THREE.Vector3();
    this.cible = new THREE.Vector3();
    this.dernierePos = new THREE.Vector3();
    this.angle = Math.atan2(-x, -z); // regarde vers le centre
    this.etat = 'patrouille';
    this.choisirPatrouille();
    this.timer = 0;
    this.recharge = 0.8 + Math.random();
    this.losTimer = 0;
    this.voit = false;
    this.perdu = 0;
    this.provoque = false;
    this.flash = 0;
    this.marche = Math.random() * 10;
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.strafeTimer = 0;
    this.bloque = 0;
    this.contourne = 0;
    this.contourneSens = 1;
    this.apparition = DUREE_APPARITION;
    this.mort = false;
    this.mortTimer = 0;
    this.aSupprimer = false;

    // Petites différences entre individus : ils ne bougent pas tous en même temps
    this.echelle = t.echelle * (0.95 + Math.random() * 0.1);
    this.tempo = 0.88 + Math.random() * 0.24;       // cadence de marche et de respiration
    this.allurePatrouille = 0.35 + Math.random() * 0.2;
    this.temps = Math.random() * 100;               // horloge propre (respiration, regards)
    this.pause = 0;                                 // pause en patrouille (regarde autour)
    this.regardTete = 0; this.penchTete = 0;        // orientation actuelle de la tête
    this.recul = 0; this.reculCote = 0;             // sursaut quand touché
    this.esquive = 0; this.esquiveSens = 1; this.esquiveAttente = 0;
    this.flashVisiere = 0;
    this.icone = 0;
    this.chuteAvant = false; this.chuteCote = 0; this.etincelleMort = 0;

    // Modèle (un matériau par ennemi : flash de touche et fondu à la mort)
    if (t.modele === 'mech') this.mat = matiereMech().clone();
    else if (modeles.soldat) this.mat = matiereSoldat(type).clone();
    else this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35 });
    const g = new THREE.Group();
    g.rotation.order = 'YXZ';
    g.userData.ennemi = this;
    if (t.modele === 'mech') construireMech(this, g, t);
    else if (modeles.soldat) construireSoldatModele(this, g, t);
    else construireSoldat(this, g, t);
    g.scale.setScalar(0.01);
    g.position.copy(this.position);
    g.rotation.y = this.angle;
    scene.add(g);
    this.groupe = g;
    this.matLumineux = this.lumineux[0].material;

    // Icône d'alerte : hors du groupe pour ne pas gêner le tir (raycast)
    this.sprite = new THREE.Sprite(matIcone);
    this.sprite.visible = false;
    scene.add(this.sprite);
  }

  /** Réaction visible et sonore quand l'ennemi repère le joueur. */
  alerter() {
    this.icone = DUREE_ICONE;
    this.flashVisiere = 0.35;
    this.pause = 0;
    if (!this.pattes) { this.recul = Math.max(this.recul, DUREE_RECUL * 0.6); this.reculCote = 0; } // léger sursaut
    sons.alerte(!!this.pattes);
  }

  choisirPatrouille() {
    this.cible.set((Math.random() - 0.5) * 30, 0, (Math.random() - 0.5) * 30);
    this.timer = 6 + Math.random() * 3;
  }

  ligneDeVue(joueur, dist, obstacles) {
    if (dist > VISION) return false;
    _oeil.set(this.position.x, this.t.yeux, this.position.z);
    _rayon.set(joueur.position.x, joueur.position.y + 1.5, joueur.position.z).sub(_oeil);
    const longueur = _rayon.length();
    raycaster.set(_oeil, _rayon.divideScalar(longueur));
    raycaster.far = longueur;
    return raycaster.intersectObjects(obstacles, false).length === 0;
  }

  /** Inflige des dégâts. Renvoie null si déjà mort, sinon { mort, points }. */
  toucher(degats, direction) {
    if (this.mort) return null;
    this.vie -= degats;
    this.flash = 0.12;
    this.vel.x += direction.x * 3 / this.t.taille;
    this.vel.z += direction.z * 3 / this.t.taille;
    if (this.etat === 'patrouille' || this.etat === 'alerte') this.provoque = true;
    if (this.vie <= 0) {
      this.mourir(direction);
      return { mort: true, points: this.t.points };
    }
    // Sursaut : le haut du corps part dans le sens du coup (côté selon l'impact)
    this.recul = DUREE_RECUL;
    const cos = Math.cos(this.angle), sin = Math.sin(this.angle);
    this.reculCote = clamp(direction.x * cos - direction.z * sin, -1, 1);
    sons.douleur(!!this.pattes);
    if (this.mixer) this.unCoup('hit', 0.85, 1.3);
    // Les fantassins font parfois un pas de côté pour sortir de la ligne de tir
    if (!this.pattes && this.esquiveAttente <= 0 && this.etat !== 'attaque' && Math.random() < CHANCE_ESQUIVE) {
      this.esquive = DUREE_ESQUIVE;
      this.esquiveSens = Math.random() < 0.5 ? 1 : -1;
      this.esquiveAttente = 1.5 + Math.random();
    }
    return { mort: false, points: 0 };
  }

  mourir(direction) {
    this.mort = true;
    this.mortTimer = 0;
    this.mat.transparent = true;
    this.mat.emissive.setScalar(0);
    this.sprite.visible = false;
    this.lumineux[0].material = this.matLumineux;
    // Chute vers l'avant si touché dans le dos, sinon en arrière ; un peu de côté au hasard
    const avant = Math.sin(this.angle) * direction.x + Math.cos(this.angle) * direction.z;
    this.chuteAvant = avant > 0.3;
    this.chuteCote = (Math.random() - 0.5) * 0.6;
    sons.criMort(!!this.pattes);
    if (this.mixer) {
      this.coup?.fadeOut(0.1);
      this.coup = null;
      this.jouer('death', 0.12, 1.25, true);
    }
  }

  entendre(position, portee) {
    if (this.mort || this.etat !== 'patrouille') return;
    if (this.position.distanceToSquared(position) < portee * portee) this.provoque = true;
  }

  update(dt, c) {
    const g = this.groupe;

    if (this.mort) {
      this.animerMort(dt, c);
      return;
    }

    if (this.apparition > 0) {
      this.apparition -= dt;
      const s = 1 - Math.max(0, this.apparition) / DUREE_APPARITION;
      g.scale.setScalar(this.echelle * Math.max(0.01, s));
      if (this.mixer) this.majMixer(dt, 0);
      return;
    }
    this.temps += dt;
    this.esquiveAttente -= dt;

    const j = c.joueur;
    _vers.set(j.position.x - this.position.x, 0, j.position.z - this.position.z);
    const dist = _vers.length();
    if (dist > 1e-4) _vers.divideScalar(dist);

    this.losTimer -= dt;
    if (this.losTimer <= 0) {
      this.losTimer = 0.15 + Math.random() * 0.1;
      this.voit = this.ligneDeVue(j, dist, c.obstacles);
    }
    this.recharge -= dt;

    if (this.provoque) {
      this.provoque = false;
      this.dernierePos.copy(j.position);
      if (this.etat === 'patrouille') { this.etat = 'alerte'; this.timer = 0.3; this.alerter(); }
    }

    let dx = 0, dz = 0, vitesse = 0;
    let regard = null;

    switch (this.etat) {
      case 'patrouille': {
        if (this.pause > 0) {
          // petite pause : il reste sur place et regarde autour de lui
          this.pause -= dt;
          if (this.pause <= 0) this.choisirPatrouille();
        } else {
          _v.set(this.cible.x - this.position.x, 0, this.cible.z - this.position.z);
          const d = _v.length();
          this.timer -= dt;
          if (d < 1 || this.timer <= 0) {
            if (Math.random() < 0.65) this.pause = 1.2 + Math.random() * 2.3;
            else this.choisirPatrouille();
          } else { dx = _v.x / d; dz = _v.z / d; vitesse = this.vitesseMax * this.allurePatrouille; }
        }
        const face = Math.sin(this.angle) * _vers.x + Math.cos(this.angle) * _vers.z;
        if ((this.voit && face > CHAMP_COS) || dist < OUIE) {
          this.etat = 'alerte';
          this.timer = 0.4;
          this.dernierePos.copy(j.position);
          this.alerter();
        }
        break;
      }

      case 'alerte': {
        regard = _vers;
        this.timer -= dt;
        if (this.timer <= 0) { this.etat = 'poursuite'; this.perdu = 0; }
        break;
      }

      case 'poursuite': {
        if (this.voit) {
          this.dernierePos.copy(j.position);
          this.perdu = 0;
        } else if ((this.perdu += dt) > 10) {
          this.etat = 'patrouille';
          this.choisirPatrouille();
          break;
        }
        _v.set(this.dernierePos.x - this.position.x, 0, this.dernierePos.z - this.position.z);
        const dCible = _v.length();
        if (dCible > 1e-4) _v.divideScalar(dCible);

        if (this.t.distance) {
          // Tireur : garde ses distances, se décale sur le côté et tire
          if (!this.voit || dist > 17) {
            if (dCible > 1.5) { dx = _v.x; dz = _v.z; vitesse = this.vitesseMax; }
          } else if (dist < 8) {
            dx = -_vers.x; dz = -_vers.z; vitesse = this.vitesseMax * 0.8;
          } else {
            if ((this.strafeTimer -= dt) <= 0) {
              this.strafe *= -1;
              this.strafeTimer = 1.2 + Math.random() * 1.5;
            }
            dx = -_vers.z * this.strafe; dz = _vers.x * this.strafe;
            vitesse = this.vitesseMax * 0.6;
          }
          if (this.voit) regard = _vers;
          if (this.voit && dist < this.t.portee && this.recharge <= 0) {
            this.tirer(c, dist);
            this.recharge = this.t.recharge * (0.8 + Math.random() * 0.5);
          }
        } else {
          // Corps à corps : fonce sur le joueur
          const vise = this.voit ? _vers : _v;
          const d = this.voit ? dist : dCible;
          if (d > this.t.portee * 0.7) {
            dx = vise.x; dz = vise.z; vitesse = this.vitesseMax;
            if (!this.pattes && this.voit && d > 5) {
              // zigzag léger en approche : moins facile à viser, moins « robotique »
              const z = Math.sin(this.temps * 2.3) * 0.45;
              dx -= vise.z * z; dz += vise.x * z;
              const n = Math.hypot(dx, dz);
              dx /= n; dz /= n;
            }
          }
          if (this.voit) regard = _vers;
          if (this.voit && dist < this.t.portee && this.recharge <= 0) {
            this.etat = 'attaque';
            this.timer = DUREE_ARMEMENT;
          }
        }
        break;
      }

      case 'attaque': {
        regard = _vers;
        this.timer -= dt;
        if (this.timer <= 0) {
          if (dist < this.t.portee + 0.5 && Math.abs(j.position.y - this.position.y) < 1.8) {
            c.blesserJoueur(this.t.degats, this.position);
            sons.coup();
          }
          this.recharge = this.t.recharge;
          this.etat = 'poursuite';
        }
        break;
      }
    }

    // Pas de côté (esquive) après une touche
    if (this.esquive > 0) {
      this.esquive -= dt;
      if (this.etat !== 'attaque') {
        dx = -_vers.z * this.esquiveSens; dz = _vers.x * this.esquiveSens;
        vitesse = this.vitesseMax * 1.6;
      }
    }

    this.deplacer(dx, dz, vitesse, dt, c);

    // Orientation
    let angleVoulu = null;
    if (regard) angleVoulu = Math.atan2(regard.x, regard.z);
    else if (this.vel.lengthSq() > 0.1) angleVoulu = Math.atan2(this.vel.x, this.vel.z);
    if (angleVoulu !== null) {
      this.angle += angleCourt(angleVoulu - this.angle) * Math.min(1, dt * 10);
    }

    // Animation
    const v = Math.hypot(this.vel.x, this.vel.z);
    this.recul = Math.max(0, this.recul - dt);
    if (this.pattes) {
      this.animerMech(dt, v);
      g.position.set(this.position.x, 0, this.position.z);
    } else if (this.mixer) {
      this.animerModele(dt, v, j, dist);
      g.position.set(this.position.x, 0, this.position.z);
    } else {
      this.animerSoldat(v, dt);
      this.animerTete(dt, j, dist, this.etat !== 'patrouille');
      g.position.set(this.position.x, Math.abs(Math.sin(this.marche)) * 0.06 * Math.min(v / 2, 1), this.position.z);
    }
    g.rotation.y = this.angle;
    g.scale.setScalar(this.echelle);

    // Éclair de touche : lueur chaude qui s'éteint vite
    this.flash -= dt;
    const kf = Math.max(0, this.flash) / 0.12;
    this.mat.emissive.setRGB(kf * 0.95, kf * 0.32, kf * 0.18);

    // Visière : clignote en blanc à l'alerte, sinon couleur du type
    this.flashVisiere -= dt;
    this.lumineux[0].material = this.flashVisiere > 0 && (this.flashVisiere * 20 | 0) % 2 === 0
      ? matVisiereFlash : this.matLumineux;

    // Icône « ! » : apparaît en sautillant, puis rétrécit
    if (this.icone > 0) {
      this.icone -= dt;
      const ecoule = DUREE_ICONE - this.icone;
      let s;
      if (this.icone <= 0) s = 0;
      else if (ecoule < 0.15) s = ecoule / 0.15 * 1.3;
      else if (this.icone < 0.2) s = this.icone / 0.2;
      else s = 1 + Math.max(0, 0.3 - (ecoule - 0.15) * 2);
      this.sprite.visible = s > 0.01;
      this.sprite.scale.setScalar(0.42 * s * this.echelle);
      this.sprite.position.set(
        this.position.x,
        (this.t.hauteur + 0.45) * this.echelle + Math.sin(ecoule * 9) * 0.04,
        this.position.z,
      );
    }
  }

  /** Tête du soldat : suit le joueur quand il est repéré, regarde autour de lui sinon. */
  animerTete(dt, j, dist, suit) {
    let lacet, tangage;
    if (suit) {
      lacet = angleCourt(Math.atan2(j.position.x - this.position.x, j.position.z - this.position.z) - this.angle);
      tangage = -Math.atan2(j.position.y + 1.5 - this.t.yeux * this.echelle, Math.max(dist, 0.5));
    } else {
      // balayage lent, plus large pendant les pauses
      const amp = this.pause > 0 ? 1.0 : 0.35;
      lacet = Math.sin(this.temps * 0.9) * amp + Math.sin(this.temps * 2.1) * 0.1;
      tangage = Math.sin(this.temps * 0.6) * 0.12;
    }
    lacet = clamp(lacet, -1.1, 1.1);
    tangage = clamp(tangage, -0.6, 0.5);
    const k = Math.min(1, dt * 8);
    this.regardTete += (lacet - this.regardTete) * k;
    this.penchTete += (tangage - this.penchTete) * k;
    // sursaut : la tête part en arrière
    const r = this.recul / DUREE_RECUL;
    this.cou.rotation.set(this.penchTete - r * 0.35, this.regardTete, -this.reculCote * r * 0.3);
  }

  /** Mort : chute (soldat) ou effondrement (mech), puis le corps se dissout en étincelles. */
  animerMort(dt, c) {
    const g = this.groupe;
    this.mortTimer += dt;
    const t = this.mortTimer;
    const p = Math.min(1, t / DUREE_CHUTE);
    // la visière clignote puis s'éteint
    this.lumineux[0].visible = t < 0.5 && Math.random() < 0.6;
    if (this.mixer) {
      // chute animée du modèle ; un peu de côté au hasard
      this.majMixer(dt, 0);
      g.rotation.z = this.chuteCote * 0.3 * p;
      g.position.y = 0;
    } else if (this.pattes) {
      // le mech s'effondre : pattes écartées, châssis au sol, légère bascule
      const q = Math.min(1, t / 0.5);
      for (const patte of this.pattes) {
        patte.hanche.rotation.z = q * 0.7;
        patte.genou.rotation.z = -q * 0.9;
      }
      this.chassis.position.y = -q * q * 1.0 + Math.sin(Math.min(1, t / 0.7) * Math.PI) * 0.06;
      this.chassis.rotation.z = q * 0.15 + Math.sin(t * 40) * 0.02 * (1 - q);
      this.chassis.rotation.x = -q * 0.1;
      g.position.y = 0;
    } else {
      // genoux qui lâchent, puis chute avec un petit rebond à l'impact
      const genoux = Math.min(1, t / 0.25);
      const chute = Math.max(0, (p - 0.2) / 0.8);
      let angle = chute * chute * Math.PI / 2;
      if (chute >= 1) angle -= Math.sin(Math.min(1, (t - DUREE_CHUTE) / 0.25) * Math.PI) * 0.08;
      const sens = this.chuteAvant ? 1 : -1;
      g.rotation.x = sens * angle;
      g.rotation.z = this.chuteCote * chute;
      for (const jambe of this.jambes) jambe.rotation.x = genoux * 0.5 * sens;
      this.haut.rotation.set(sens * genoux * 0.35, 0, 0);
      // bras ballants, tête qui part en arrière
      this.bras[0].rotation.set(-sens * chute * 1.4 - 0.3, 0, 0.3 * chute);
      this.bras[1].rotation.set(-sens * chute * 1.1 - 0.4, 0, -0.2 * chute);
      this.cou.rotation.set(-sens * chute * 0.5, this.regardTete * (1 - chute), 0);
      g.position.y = 0.06 * (1 - genoux);
    }
    // dissolution : le corps s'enfonce, s'efface et lâche des étincelles de sa couleur
    const debutFondu = this.mixer ? DEBUT_FONDU_MODELE : DEBUT_FONDU;
    const f = clamp((t - debutFondu) / DUREE_FONDU, 0, 1);
    if (f > 0) {
      g.position.y -= f * 0.35;
      this.mat.opacity = 1 - f;
      if ((this.etincelleMort -= dt) <= 0) {
        this.etincelleMort = 0.07;
        const etendue = this.rayon * 2.4;
        _v.set(
          this.position.x + (Math.random() - 0.5) * etendue,
          0.15 + Math.random() * 0.4,
          this.position.z + (Math.random() - 0.5) * etendue,
        );
        c.effets.etincelles(_v, this.t.couleur, this.pattes ? 4 : 2, 0.6, 0.7, 1.6, -0.5);
      }
    }
    if (t > debutFondu + DUREE_FONDU) this.aSupprimer = true;
  }

  animerSoldat(v, dt) {
    this.marche += dt * v * 2.2 * this.tempo;
    const balancier = Math.sin(this.marche) * Math.min(v / 3, 1) * 0.7;
    // Respiration (plus rapide en combat), penché en avant quand il court, sursaut quand touché
    const combat = this.etat !== 'patrouille';
    const souffle = Math.sin(this.temps * (combat ? 3.4 : 1.8) * this.tempo);
    const r = this.recul / DUREE_RECUL;
    const course = Math.min(v / this.vitesseMax, 1);
    this.haut.position.y = HANCHES_Y + souffle * 0.008;
    this.haut.rotation.x = souffle * 0.018 + course * (combat ? 0.16 : 0.05) - r * 0.32 + (combat ? 0.05 : 0);
    this.haut.rotation.y = Math.sin(this.marche) * 0.08 * course; // les épaules tournent avec le pas
    this.haut.rotation.z = -this.reculCote * r * 0.25;
    this.bras[0].rotation.z = this.bras[1].rotation.z = 0;
    this.jambes[0].rotation.x = balancier * 0.8;
    this.jambes[1].rotation.x = -balancier * 0.8;
    if (this.etat === 'attaque') {
      // coup de crosse : les deux bras se lèvent puis frappent
      const p = 1 - this.timer / DUREE_ARMEMENT;
      this.bras[0].rotation.x = this.bras[1].rotation.x = -0.6 - p * 2.2;
    } else if (this.t.distance && this.etat === 'poursuite' && this.voit) {
      // en joue : bras tendus vers l'avant, recul après chaque tir
      const recul = Math.max(0, this.recharge - this.t.recharge + 0.2) * 2;
      this.bras[1].rotation.x = -Math.PI / 2 + recul;
      this.bras[0].rotation.x = -1.25 + recul;
      this.bras[0].rotation.z = 0.45;
    } else if (this.etat === 'poursuite' || this.etat === 'alerte') {
      // arme tenue à deux mains, prête
      this.bras[1].rotation.x = -0.75 + balancier * 0.15;
      this.bras[0].rotation.x = -0.55 + balancier * 0.15;
      this.bras[0].rotation.z = 0.4;
    } else {
      this.bras[0].rotation.x = balancier + souffle * 0.03;
      this.bras[0].rotation.z = 0.06 + souffle * 0.015;
      this.bras[1].rotation.x = -0.35 - balancier * 0.3 + souffle * 0.03;
    }
    // le sursaut écarte un peu les bras
    this.bras[0].rotation.x += r * 0.4;
    this.bras[1].rotation.x += r * 0.3;
  }

  /**
   * Lance une animation de base du modèle (boucle), en fondu depuis la précédente.
   * `unique` : jouée une fois puis figée sur la dernière image (mort).
   */
  jouer(nom, fondu = 0.2, vitesse = 1, unique = false) {
    const action = this.action(nom);
    if (!action) return;
    action.timeScale = vitesse;
    if (this.animBase === action) return;
    action.reset();
    action.setLoop(unique ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = unique;
    action.play();
    if (this.animBase && fondu > 0) this.animBase.crossFadeTo(action, fondu, false);
    else if (this.animBase) this.animBase.stop();
    this.animBase = action;
  }

  action(nom) {
    if (!(nom in this.actions)) {
      const c = clip('soldat', nom);
      this.actions[nom] = c ? this.mixer.clipAction(c) : null;
    }
    return this.actions[nom];
  }

  /** Animation courte jouée par-dessus l'animation de base (touché, tir). */
  unCoup(nom, poids, vitesse) {
    const action = this.action(nom);
    if (!action) return;
    if (this.coup && this.coup !== action) this.coup.fadeOut(0.08);
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = false;
    action.timeScale = vitesse;
    action.setEffectiveWeight(poids);
    action.fadeIn(0.05);
    action.play();
    this.coup = action;
    this.coupFin = action.getClip().duration / vitesse;
  }

  /** Met à jour le squelette ; les ennemis lointains sont animés une image sur deux. Vrai si fait. */
  majMixer(dt, dist) {
    this.animLOD += dt;
    if (dist > 28 && (this.lodImpair = !this.lodImpair)) return false;
    this.mixer.update(this.animLOD);
    this.animLOD = 0;
    return true;
  }

  /** Choisit l'animation du modèle selon l'état de l'IA, puis ajoute regard et sursaut. */
  animerModele(dt, v, j, dist) {
    const combat = this.etat !== 'patrouille';
    let nom;
    if (this.etat === 'attaque') nom = 'melee';
    else if (this.t.distance && this.etat === 'poursuite' && this.voit) nom = v > 0.6 ? 'aim_walk' : 'aim_idle';
    else if (combat) nom = v > 2.8 ? 'ready_run' : v > 0.4 ? 'ready_walk' : 'ready_idle';
    else nom = v > 0.3 ? 'walk' : 'idle';
    // la lecture suit la vitesse réelle (pas de pieds qui glissent)
    const allure = ALLURES[nom];
    const vitesse = allure ? clamp(v / allure, 0.6, 1.6) * this.tempo : nom === 'melee' ? 1.05 : this.tempo;
    this.jouer(nom, nom === 'melee' ? 0.08 : 0.22, vitesse);
    if (this.coup && (this.coupFin -= dt) < 0.12) { this.coup.fadeOut(0.12); this.coup = null; }

    if (!this.majMixer(dt, dist)) return; // image sautée : la pose précédente reste affichée

    // Par-dessus l'animation : la tête suit le joueur (ou balaie les alentours), sursaut au coup
    let lacet, tangage;
    if (combat) {
      lacet = angleCourt(Math.atan2(j.position.x - this.position.x, j.position.z - this.position.z) - this.angle);
      tangage = -Math.atan2(j.position.y + 1.5 - this.t.yeux * this.echelle, Math.max(dist, 0.5));
    } else {
      const amp = this.pause > 0 ? 0.9 : 0.3;
      lacet = Math.sin(this.temps * 0.9) * amp + Math.sin(this.temps * 2.1) * 0.08;
      tangage = Math.sin(this.temps * 0.6) * 0.1;
    }
    const k = Math.min(1, dt * 8);
    this.regardTete += (clamp(lacet, -1.0, 1.0) - this.regardTete) * k;
    this.penchTete += (clamp(tangage, -0.5, 0.4) - this.penchTete) * k;
    const r = this.recul / DUREE_RECUL;
    const { tete, cou, buste } = this.os;
    if (cou) cou.rotation.y += this.regardTete * 0.4;
    if (tete) {
      tete.rotation.y += this.regardTete * 0.5;
      tete.rotation.x += this.penchTete * 0.6 - r * 0.3;
    }
    if (buste) {
      buste.rotation.x -= r * 0.28;
      buste.rotation.z += this.reculCote * r * 0.2;
    }
  }

  animerMech(dt, v) {
    // pattes en diagonale (0-3 / 1-2) : une paire avance pendant que l'autre pousse
    this.marche += dt * (v * 1.6 + 0.4);
    const k = Math.min(v / 2, 1);
    for (const p of this.pattes) {
      const ph = this.marche + p.phase;
      const leve = Math.max(0, Math.sin(ph)) * 0.32 * k;
      p.hanche.rotation.y = p.lacet + Math.cos(ph) * 0.32 * k;
      p.hanche.rotation.z = leve;
      p.genou.rotation.z = -leve * 1.3;
    }
    // ronronnement au repos + secousse quand il est touché
    const r = this.recul / DUREE_RECUL;
    const souffle = Math.sin(this.temps * 1.5 * this.tempo);
    let tangage = souffle * 0.012 - r * 0.12;
    let haut = Math.abs(Math.sin(this.marche * 2)) * 0.05 * k + souffle * 0.025;
    this.chassis.rotation.z = Math.sin(this.temps * 47) * 0.03 * r;
    // en patrouille à l'arrêt, le châssis pivote pour scruter les alentours
    const scrute = this.etat === 'patrouille' && this.pause > 0 ? Math.sin(this.temps * 0.8) * 0.35 : 0;
    this.chassis.rotation.y += (scrute - this.chassis.rotation.y) * Math.min(1, dt * 3);
    if (this.etat === 'attaque') {
      // se cabre puis écrase le joueur avec les pattes avant
      const p = 1 - this.timer / DUREE_ARMEMENT;
      tangage += -Math.sin(p * Math.PI * 0.5) * 0.35;
      haut += p * 0.3;
      for (const i of [0, 1]) {
        this.pattes[i].hanche.rotation.z = p * 0.9;
        this.pattes[i].genou.rotation.z = -p * 0.4;
      }
    }
    this.chassis.rotation.x = tangage;
    this.chassis.position.y = haut;
  }

  deplacer(dx, dz, vitesse, dt, c) {
    // Contournement temporaire quand l'ennemi est bloqué par un obstacle
    if (this.contourne > 0 && vitesse > 0) {
      this.contourne -= dt;
      const a = this.contourneSens * 1.2;
      const cos = Math.cos(a), sin = Math.sin(a);
      [dx, dz] = [dx * cos - dz * sin, dx * sin + dz * cos];
    }

    // Séparation entre ennemis
    let sx = 0, sz = 0;
    for (const o of c.ennemis) {
      if (o === this || o.mort) continue;
      const ox = this.position.x - o.position.x;
      const oz = this.position.z - o.position.z;
      const min = this.rayon + o.rayon + 0.2;
      const d2 = ox * ox + oz * oz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const k = (min - d) / min / d;
        sx += ox * k;
        sz += oz * k;
      }
    }

    const f = 1 - Math.exp(-10 * dt);
    this.vel.x += (dx * vitesse + sx * 4 - this.vel.x) * f;
    this.vel.z += (dz * vitesse + sz * 4 - this.vel.z) * f;

    const ax = this.position.x, az = this.position.z;
    this.position.x += this.vel.x * dt;
    this.position.z += this.vel.z * dt;
    collisionCercleBoites(this.position, this.rayon, this.hauteur, c.boites);
    this.position.x = clamp(this.position.x, -LIMITE, LIMITE);
    this.position.z = clamp(this.position.z, -LIMITE, LIMITE);

    if (vitesse > 0.5 && this.contourne <= 0) {
      const parcouru = Math.hypot(this.position.x - ax, this.position.z - az);
      if (parcouru < vitesse * dt * 0.35) {
        if ((this.bloque += dt) > 0.3) {
          this.contourne = 0.7 + Math.random() * 0.6;
          this.contourneSens = Math.random() < 0.5 ? 1 : -1;
          this.bloque = 0;
        }
      } else {
        this.bloque = Math.max(0, this.bloque - dt);
      }
    }
  }

  tirer(c, dist) {
    const j = c.joueur;
    const s = this.echelle;
    if (this.bouche) {
      // bouche de l'arme tenue par le modèle
      this.bouche.getWorldPosition(_origine);
      if (this.mixer) this.unCoup('shoot', 0.7, 1.4);
    } else {
      // bouche du fusil : devant l'épaule droite
      _origine.set(
        this.position.x + Math.sin(this.angle) * 1.0 * s + Math.cos(this.angle) * 0.3 * s,
        1.55 * s,
        this.position.z + Math.cos(this.angle) * 1.0 * s - Math.sin(this.angle) * 0.3 * s,
      );
    }
    // Vise le torse en anticipant un peu le mouvement, avec une imprécision
    const t = dist / VITESSE_PROJECTILE;
    _visee.set(
      j.position.x + j.vitesse.x * t * 0.5 + (Math.random() - 0.5) * 1.2,
      j.position.y + 1.2 + (Math.random() - 0.5) * 0.6,
      j.position.z + j.vitesse.z * t * 0.5 + (Math.random() - 0.5) * 1.2,
    ).sub(_origine).normalize();
    c.projectiles.tirer(_origine, _visee, this.t.degats);
    c.effets.etincelles(_origine, 0xffc070, 5, 1.5, 0.15, 0, 0);
    sons.tirEnnemi();
  }

  detruire() {
    this.scene.remove(this.groupe);
    this.scene.remove(this.sprite);
    this.mat.dispose();
  }
}

class Projectiles {
  constructor(scene, effets) {
    this.effets = effets;
    const geo = new THREE.SphereGeometry(0.13, 10, 8);
    const mat = declarerLumineux(new THREE.MeshBasicMaterial({ color: 0x7fe3ff }), 2.2);
    const halo = new THREE.MeshBasicMaterial({
      color: 0x2aa8ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.pool = [];
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(geo, mat);
      const h = new THREE.Mesh(geo, halo);
      h.scale.setScalar(2.2);
      m.add(h);
      m.visible = false;
      scene.add(m);
      this.pool.push({ mesh: m, vel: new THREE.Vector3(), vie: 0, degats: 0 });
    }
  }

  tirer(origine, direction, degats) {
    const p = this.pool.find((q) => q.vie <= 0);
    if (!p) return;
    p.mesh.position.copy(origine);
    p.vel.copy(direction).multiplyScalar(VITESSE_PROJECTILE);
    p.vie = 3;
    p.degats = degats;
    p.mesh.visible = true;
  }

  update(dt, c) {
    const j = c.joueur.position;
    for (const p of this.pool) {
      if (p.vie <= 0) continue;
      p.vie -= dt;
      const pos = p.mesh.position;
      pos.addScaledVector(p.vel, dt);

      // Touche le joueur (cylindre approximé par un segment vertical)
      const y = clamp(pos.y, j.y + 0.2, j.y + 1.7);
      const dx = pos.x - j.x, dy = pos.y - y, dz = pos.z - j.z;
      if (dx * dx + dy * dy + dz * dz < 0.55 * 0.55) {
        c.blesserJoueur(p.degats, _v.copy(pos).addScaledVector(p.vel, -0.2));
        this.eteindre(p);
        continue;
      }

      if (p.vie <= 0 || pos.y < 0 || c.boites.some((b) => b.containsPoint(pos))) {
        this.effets.etincelles(pos, 0x66d9ff, 6, 2.5, 0.35);
        this.eteindre(p);
      }
    }
  }

  eteindre(p) {
    p.vie = 0;
    p.mesh.visible = false;
  }

  vider() {
    for (const p of this.pool) this.eteindre(p);
  }
}

export class GestionEnnemis {
  constructor(scene, monde, effets) {
    this.scene = scene;
    this.monde = monde;
    this.effets = effets;
    this.liste = [];
    this.projectiles = new Projectiles(scene, effets);
    this._cibles = [];
  }

  creer(type, x, z, niveau) {
    const e = new Ennemi(type, x, z, niveau, this.scene);
    this.liste.push(e);
    this.effets.etincelles(e.position.clone().setY(0.2), TYPES[type].couleur, 25, 3, 0.8, 4, 4);
    sons.apparition();
    return e;
  }

  get vivants() {
    let n = 0;
    for (const e of this.liste) if (!e.mort) n++;
    return n;
  }

  /** Ennemis vivants + décor : ce que les balles du joueur peuvent toucher. */
  cibles() {
    this._cibles.length = 0;
    for (const e of this.liste) if (!e.mort) this._cibles.push(e.groupe);
    for (const s of this.monde.surfaces) this._cibles.push(s);
    return this._cibles;
  }

  bruit(position, portee) {
    for (const e of this.liste) e.entendre(position, portee);
  }

  update(dt, joueur, blesserJoueur) {
    const c = {
      joueur,
      blesserJoueur,
      ennemis: this.liste,
      boites: this.monde.boites,
      obstacles: this.monde.obstacles,
      projectiles: this.projectiles,
      effets: this.effets,
    };
    for (const e of this.liste) e.update(dt, c);
    this.projectiles.update(dt, c);

    for (let i = this.liste.length - 1; i >= 0; i--) {
      if (this.liste[i].aSupprimer) {
        this.liste[i].detruire();
        this.liste.splice(i, 1);
      }
    }
  }

  vider() {
    for (const e of this.liste) e.detruire();
    this.liste.length = 0;
    this.projectiles.vider();
  }
}
