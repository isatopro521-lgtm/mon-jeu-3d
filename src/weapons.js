import * as THREE from 'three';
import { sons } from './audio.js';
import { Assemblage } from './utils.js';
import { cloner } from './modeles.js';
import { declarerLumineux } from './postprocess.js';

export const ARMES = [
  {
    nom: "Fusil d'assaut", degats: 22, cadence: 0.1, chargeur: 30, rechargement: 1.5, reserveDepart: 120, reserveMax: 240,
    dispersion: 0.012, plombs: 1, portee: 120, recul: 0.05, secousse: 0.006, auto: true, son: 'tir',
  },
  {
    nom: 'Fusil à pompe', degats: 15, cadence: 0.85, chargeur: 6, rechargement: 2.0, reserveDepart: 24, reserveMax: 48,
    dispersion: 0.075, plombs: 9, portee: 40, recul: 0.16, secousse: 0.035, auto: false, son: 'pompe',
  },
];

const POSITION_BASE = new THREE.Vector3(0.19, -0.18, -0.33);
const ECHELLE = 0.66;

const _origine = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _d = new THREE.Vector3();
const _droite = new THREE.Vector3();
const _haut = new THREE.Vector3();
const _bouche = new THREE.Vector3();
const _fin = new THREE.Vector3();

/** Texture de flamme de bouche : étoile à branches irrégulières, cœur blanc, bords orangés. */
const texFlamme = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const d = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  d.addColorStop(0, 'rgba(255,255,240,1)');
  d.addColorStop(0.18, 'rgba(255,230,150,0.95)');
  d.addColorStop(0.45, 'rgba(255,150,40,0.55)');
  d.addColorStop(1, 'rgba(255,90,0,0)');
  g.fillStyle = d;
  g.beginPath();
  const n = 9;
  for (let i = 0; i <= n * 2; i++) {
    const a = i / (n * 2) * Math.PI * 2;
    const r = i % 2 ? 14 + Math.random() * 8 : 40 + Math.random() * 24;
    g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
  }
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();

function flammeBouche() {
  const mat = declarerLumineux(new THREE.MeshBasicMaterial({
    map: texFlamme, color: 0xffffff, transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
  }), 3);
  const g = new THREE.Group();
  const plan = new THREE.PlaneGeometry(0.16, 0.16);
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(plan, mat);
    m.rotation.set(i === 2 ? Math.PI / 2 : 0, i === 1 ? Math.PI / 2 : 0, 0);
    g.add(m);
  }
  g.visible = false;
  return g;
}

// ---------- Modèles (vue à la première personne) ----------
// Chaque arme est fusionnée par matériau (5 appels de rendu environ) : acier sombre, acier,
// liserés orange lumineux, gants/manches (couleurs de sommets) et verre de lunette.
const MATERIAUX = {
  sombre: new THREE.MeshStandardMaterial({ color: 0x1b1d21, metalness: 0.75, roughness: 0.32 }),
  acier: new THREE.MeshStandardMaterial({ color: 0x3d424a, metalness: 0.7, roughness: 0.38 }),
  orange: new THREE.MeshStandardMaterial({ color: 0xff7a1e, emissive: 0xff5a00, emissiveIntensity: 1.6, roughness: 0.4 }),
  tissu: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05 }),
  verre: new THREE.MeshStandardMaterial({ color: 0x06090d, emissive: 0x04161c, metalness: 0.9, roughness: 0.18, envMapIntensity: 0.6 }),
};
const GANT = 0x1a1b1e, MANCHE = 0x2b2f35, PROTECTION = 0x3a3f46;

const boite = new THREE.BoxGeometry(1, 1, 1);
const cyl = new THREE.CylinderGeometry(1, 1, 1, 14).rotateX(Math.PI / 2); // axe le long de z
const cylBas = new THREE.CylinderGeometry(1, 1, 1, 10);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _mil = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _mat = new THREE.Matrix4();
const HAUT_Y = new THREE.Vector3(0, 1, 0);

/** Petit outil d'assemblage par matériau. */
class Atelier {
  constructor() {
    this.parties = { sombre: new Assemblage(), acier: new Assemblage(), orange: new Assemblage(), tissu: new Assemblage(), verre: new Assemblage() };
  }
  b(mat, w, h, l, x, y, z, rot = {}) { this.parties[mat].ajouter(boite, x, y, z, { sx: w, sy: h, sz: l, ...rot }); return this; }
  c(mat, r, l, x, y, z, rot = {}) { this.parties[mat].ajouter(cyl, x, y, z, { sx: r, sy: r, sz: l, ...rot }); return this; }
  /** Segment épais entre deux points (bras, avant-bras). */
  seg(mat, de, a, epais, couleur, rond = true) {
    _a.set(...de); _b.set(...a);
    const l = _a.distanceTo(_b);
    _mil.addVectors(_a, _b).multiplyScalar(0.5);
    _quat.setFromUnitVectors(HAUT_Y, _b.sub(_a).normalize());
    _mat.compose(_mil, _quat, _b.set(1, 1, 1));
    this.parties[mat].ajouter(rond ? cylBas : boite, 0, 0, 0, { sx: epais, sy: l, sz: epais, parent: _mat.clone(), couleur });
    return this;
  }
  t(couleur, w, h, l, x, y, z, rot = {}) { this.parties.tissu.ajouter(boite, x, y, z, { sx: w, sy: h, sz: l, couleur, ...rot }); return this; }
  groupe() {
    const g = new THREE.Group();
    for (const [nom, asm] of Object.entries(this.parties)) {
      if (asm.vide) continue;
      g.add(new THREE.Mesh(asm.geometrie(nom === 'tissu'), MATERIAUX[nom]));
    }
    return g;
  }
}

/** Main gantée refermée sur une poignée (repère local : poignée verticale en x,y,z). */
function main(at, x, y, z, { gauche = false } = {}) {
  const s = gauche ? -1 : 1;
  at.t(GANT, 0.05, 0.085, 0.06, x + s * 0.012, y, z);                  // paume
  for (let i = 0; i < 4; i++) at.t(GANT, 0.062, 0.018, 0.024, x - s * 0.006, y + 0.03 - i * 0.021, z - 0.035); // doigts
  at.t(PROTECTION, 0.012, 0.06, 0.04, x - s * 0.035, y + 0.005, z - 0.03); // protections des phalanges
  at.t(GANT, 0.022, 0.05, 0.022, x - s * 0.03, y + 0.045, z + 0.005, { rx: 0.5 }); // pouce
}

function modeleFusil() {
  const at = new Atelier();
  // Carcasse
  at.b('sombre', 0.075, 0.1, 0.38, 0, 0, -0.08)
    .b('acier', 0.066, 0.045, 0.34, 0, 0.068, -0.09)
    .b('sombre', 0.03, 0.014, 0.42, 0, 0.096, -0.15)                      // rail
    .b('sombre', 0.086, 0.09, 0.27, 0, 0.004, -0.39)                      // garde-main massif
    .b('acier', 0.088, 0.03, 0.25, 0, -0.03, -0.39)
    .c('sombre', 0.015, 0.14, 0, 0.012, -0.58)                            // canon
    .c('acier', 0.024, 0.07, 0, 0.012, -0.66)                             // frein de bouche
    .b('sombre', 0.05, 0.155, 0.072, 0, -0.12, -0.12, { rx: 0.18 })       // chargeur
    .b('acier', 0.052, 0.02, 0.074, 0, -0.195, -0.135, { rx: 0.18 })
    .b('sombre', 0.046, 0.115, 0.052, 0, -0.1, 0.06, { rx: -0.32 })       // poignée
    .b('acier', 0.04, 0.012, 0.09, 0, -0.045, 0.005)                      // pontet
    .b('sombre', 0.062, 0.085, 0.2, 0, -0.005, 0.22)                      // crosse
    .b('acier', 0.07, 0.115, 0.03, 0, -0.012, 0.33)
    .b('acier', 0.03, 0.05, 0.14, 0, 0.05, 0.2);
  // Grosse lunette
  at.c('sombre', 0.034, 0.22, 0, 0.17, -0.1)
    .c('sombre', 0.05, 0.085, 0, 0.17, -0.245)                            // objectif
    .c('acier', 0.053, 0.015, 0, 0.17, -0.205)
    .c('sombre', 0.043, 0.06, 0, 0.17, 0.035)                             // oculaire
    .c('acier', 0.016, 0.04, 0, 0.215, -0.1, { rx: Math.PI / 2 })         // tourelles
    .c('acier', 0.016, 0.04, 0.045, 0.17, -0.1, { rz: Math.PI / 2, rx: 0 })
    .b('acier', 0.03, 0.06, 0.03, 0, 0.125, -0.17)                        // montages
    .b('acier', 0.03, 0.06, 0.03, 0, 0.125, -0.02)
    .c('verre', 0.044, 0.004, 0, 0.17, -0.289)
    .c('verre', 0.036, 0.004, 0, 0.17, 0.066);
  // Liserés orange lumineux
  for (const s of [-1, 1]) {
    at.b('orange', 0.003, 0.012, 0.2, s * 0.044, 0.018, -0.39)
      .b('orange', 0.003, 0.008, 0.12, s * 0.039, 0.03, -0.02)
      .b('orange', 0.003, 0.01, 0.12, s * 0.032, 0.01, 0.22);
  }
  at.b('orange', 0.02, 0.004, 0.06, 0, 0.212, -0.04)
    .c('orange', 0.0515, 0.006, 0, 0.17, -0.27)
    .b('orange', 0.052, 0.006, 0.074, 0, -0.17, -0.13, { rx: 0.18 });
  // Mains et avant-bras (manches tactiques, protections)
  main(at, 0.0, -0.105, 0.065);
  at.seg('tissu', [0.01, -0.15, 0.1], [0.24, -0.42, 0.5], 0.085, MANCHE)
    .seg('tissu', [0.03, -0.19, 0.17], [0.13, -0.3, 0.33], 0.098, PROTECTION, false);
  at.t(GANT, 0.11, 0.05, 0.12, -0.012, -0.068, -0.4)                      // main gauche sous le garde-main
    .t(GANT, 0.022, 0.07, 0.1, -0.05, -0.03, -0.41)
    .t(PROTECTION, 0.012, 0.05, 0.08, -0.062, -0.02, -0.41);
  at.seg('tissu', [-0.03, -0.1, -0.37], [-0.36, -0.36, 0.12], 0.09, MANCHE)
    .seg('tissu', [-0.1, -0.16, -0.26], [-0.22, -0.26, -0.08], 0.105, PROTECTION, false)
    .seg('tissu', [-0.04, -0.09, -0.38], [-0.09, -0.13, -0.31], 0.1, GANT);
  const g = at.groupe();
  const bouche = new THREE.Object3D();
  bouche.position.set(0, 0.012, -0.7);
  g.add(bouche);
  return { groupe: g, bouche };
}

function modelePompe() {
  const at = new Atelier();
  at.b('sombre', 0.078, 0.1, 0.3, 0, 0, -0.02)
    .b('acier', 0.07, 0.03, 0.28, 0, 0.065, -0.02)
    .c('sombre', 0.024, 0.5, 0, 0.025, -0.36)                             // canon
    .c('acier', 0.019, 0.4, 0, -0.025, -0.3)                              // magasin tubulaire
    .c('acier', 0.03, 0.05, 0, 0.025, -0.6)
    .b('sombre', 0.046, 0.12, 0.052, 0, -0.1, 0.1, { rx: -0.32 })         // poignée
    .b('sombre', 0.06, 0.09, 0.22, 0, -0.02, 0.24)                        // crosse
    .b('acier', 0.068, 0.11, 0.03, 0, -0.03, 0.36)
    .b('acier', 0.02, 0.03, 0.05, 0, 0.1, -0.05)                          // viseur
    .b('sombre', 0.024, 0.016, 0.3, 0, 0.088, -0.2);
  for (const s of [-1, 1]) {
    at.b('orange', 0.003, 0.012, 0.18, s * 0.041, 0.02, -0.02)
      .b('orange', 0.003, 0.01, 0.12, s * 0.031, 0.0, 0.24);
  }
  at.c('orange', 0.032, 0.008, 0, 0.025, -0.578);
  main(at, 0.0, -0.105, 0.105);
  at.seg('tissu', [0.01, -0.15, 0.14], [0.24, -0.42, 0.54], 0.085, MANCHE)
    .seg('tissu', [0.03, -0.19, 0.21], [0.13, -0.3, 0.37], 0.098, PROTECTION, false);
  const g = at.groupe();

  // Pompe mobile (avec la main gauche dessus)
  const ap = new Atelier();
  ap.b('sombre', 0.072, 0.07, 0.17, 0, -0.025, 0)
    .b('orange', 0.074, 0.006, 0.02, 0, -0.025, -0.06)
    .b('orange', 0.074, 0.006, 0.02, 0, -0.025, 0.06)
    .t(GANT, 0.1, 0.05, 0.12, -0.01, -0.07, 0)
    .t(GANT, 0.022, 0.07, 0.1, -0.048, -0.04, -0.01)
    .t(PROTECTION, 0.012, 0.05, 0.08, -0.06, -0.03, -0.01);
  ap.seg('tissu', [-0.03, -0.08, 0.03], [-0.36, -0.34, 0.42], 0.09, MANCHE)
    .seg('tissu', [-0.1, -0.15, 0.12], [-0.22, -0.25, 0.26], 0.105, PROTECTION, false);
  const pompe = ap.groupe();
  pompe.position.z = -0.3;
  g.add(pompe);

  const bouche = new THREE.Object3D();
  bouche.position.set(0, 0.025, -0.64);
  g.add(bouche);
  return { groupe: g, bouche, pompe };
}

// ---------- Modèles réalistes (glTF, voir CREDITS.md) ----------
// Bras gantés (pose « fusil ») + vraie arme placée pour que la poignée et le garde-main tombent
// dans les mains. Repère des bras : mètres, caméra regardant vers -z.
const PRISE_DROITE = new THREE.Vector3(0, 0.096, -0.132); // poignée tenue par la main droite (fichier bras)
// Où placer cette poignée par rapport à la caméra (m) ; un peu plus centré en portrait
const POSE_CAMERA = new THREE.Vector3(0.17, -0.265, -0.4);
const ECHELLE_RIG = 0.78; // bras et arme un peu réduits : moins envahissants à l'écran
const LACET = 0.1; // l'arme pointe légèrement vers le centre de l'écran
const TANGAGE = 0.07; // bouche légèrement relevée vers le réticule

const matDouilles = {
  laiton: new THREE.MeshStandardMaterial({ color: 0xc9a253, metalness: 1, roughness: 0.32 }),
  cartouche: new THREE.MeshStandardMaterial({ color: 0x9c1e1a, roughness: 0.55, metalness: 0.1 }),
};

/** Repère commun : les bras, placés pour que la poignée tombe sur POSE_CAMERA. */
function rigBras() {
  const bras = cloner('bras');
  if (!bras) return null;
  const rig = new THREE.Group();
  rig.add(bras);
  return { rig, bras, gauche: bras.getObjectByName('LeftArm'), droite: bras.getObjectByName('RightArm') };
}

/** Place le repère dans le support de l'arme (qui a sa propre position/échelle). */
function placerRig(rig, support, portrait) {
  const cible = portrait ? _cible.set(0.07, -0.25, -0.4) : _cible.copy(POSE_CAMERA);
  const echelle = ECHELLE_RIG * (portrait ? 0.62 : 1); // en portrait le champ de vision est plus large
  const s = 1 / support.scale.x;
  rig.scale.setScalar(s * echelle);
  rig.rotation.set(TANGAGE, LACET, 0, 'YXZ');
  // position de la poignée dans le repère tourné, puis décalage vers la cible
  _a.copy(PRISE_DROITE).applyEuler(rig.rotation).multiplyScalar(echelle);
  rig.position.copy(cible).sub(_a).sub(support.position).multiplyScalar(s);
}
const _cible = new THREE.Vector3();

function nuances(objet) {
  objet.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    o.raycast = () => {};
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.envMapIntensity = 0.9;
  });
}

function modeleFusilReel() {
  const r = rigBras();
  const arme = cloner('fusil');
  if (!r || !arme) return null;
  // M4A1 : poignée (0, -0.2, 0.245) → main droite, garde-main (0, -0.17, -0.58) → main gauche
  arme.scale.setScalar(0.528);
  arme.position.set(0, 0.202, -0.261);
  arme.rotation.x = -0.05;
  const crosse = arme.getObjectByName('Stock');
  if (crosse) crosse.position.z -= 0.1; // crosse rentrée d'un cran : moins envahissante à l'écran
  r.rig.add(arme);
  nuances(r.rig);
  const groupe = new THREE.Group();
  groupe.add(r.rig);
  const bouche = new THREE.Object3D();
  (arme.getObjectByName('MuzzleDeviceTip') ?? arme).add(bouche);
  const ejection = new THREE.Object3D();
  ejection.position.set(0.06, 0.06, -0.1);
  arme.add(ejection);
  const chargeur = arme.getObjectByName('Magazine');
  return {
    groupe, bouche, ejection, rig: r.rig, reel: true, douille: 'laiton', echelleFlamme: 1.6,
    gauche: r.gauche, baseGauche: r.gauche.position.clone(),
    chargeur, baseChargeur: chargeur?.position.clone(),
    /** Rechargement : le chargeur tombe, la main gauche en amène un neuf et l'enfonce. */
    animer(p) {
      const g = this.gauche.position.copy(this.baseGauche);
      if (!this.chargeur) return;
      const c = this.chargeur.position.copy(this.baseChargeur);
      if (p < 0.12) return;
      if (p < 0.35) { // le vieux chargeur glisse et tombe, la main descend
        const q = (p - 0.12) / 0.23;
        c.y -= q * q * 0.9;
        g.y -= Math.sin(q * Math.PI * 0.5) * 0.17; g.z += q * 0.22; g.x -= q * 0.04;
        this.chargeur.visible = q < 0.85;
      } else if (p < 0.7) { // un chargeur neuf monte avec la main
        const q = (p - 0.35) / 0.35;
        this.chargeur.visible = true;
        c.y -= (1 - q) * 0.55;
        g.y -= (1 - q) * 0.17; g.z += 0.22 - q * 0.05; g.x -= 0.04 * (1 - q);
      } else { // la main revient sur le garde-main
        const q = (p - 0.7) / 0.3;
        g.z += 0.17 * (1 - q);
        g.y += Math.sin(q * Math.PI) * 0.02;
      }
    },
    finAnim() { this.gauche.position.copy(this.baseGauche); if (this.chargeur) { this.chargeur.position.copy(this.baseChargeur); this.chargeur.visible = true; } },
  };
}

function modelePompeReel() {
  const r = rigBras();
  const arme = cloner('pompe');
  if (!r || !arme) return null;
  // Mossberg 590A1 orienté le long de +x : quart de tour, poignée → main droite, pompe → main gauche
  arme.scale.setScalar(0.19);
  arme.rotation.y = Math.PI / 2;
  arme.position.set(0, -0.06, -0.262); // posé un peu au-dessus des poings : visible depuis l'épaule
  // polymère noir mat (le modèle d'origine est gris clair et trop brillant)
  arme.traverse((o) => {
    if (!o.isMesh) return;
    const sombre = o.material.name === 'shotgun_shade2';
    o.material.color.setHex(sombre ? 0x0d0e0f : 0x1e2022);
    o.material.metalness = sombre ? 0.2 : 0.55;
    o.material.roughness = sombre ? 0.75 : 0.42;
  });
  r.rig.add(arme);
  nuances(r.rig);
  const groupe = new THREE.Group();
  groupe.add(r.rig);
  const bouche = new THREE.Object3D();
  bouche.position.set(3.0, 1.0, 0);
  arme.add(bouche);
  const ejection = new THREE.Object3D();
  ejection.position.set(0.1, 0.95, 0.14);
  arme.add(ejection);
  // Os de la pompe : on le fait glisser le long du canon (direction calculée dans son repère)
  const os = arme.getObjectByName('FR');
  const m = {
    groupe, bouche, ejection, rig: r.rig, reel: true, douille: 'cartouche', echelleFlamme: 7,
    gauche: r.gauche, baseGauche: r.gauche.position.clone(), os,
    basePompe: os?.position.clone(), axePompe: new THREE.Vector3(),
    /** Recul de la pompe (0 → 1) : la main gauche suit. */
    pomper(k) {
      this.gauche.position.copy(this.baseGauche);
      this.gauche.position.z += k * 0.09;
      if (this.os) this.os.position.copy(this.basePompe).addScaledVector(this.axePompe, k * 0.09);
    },
    /** Rechargement : la main gauche glisse des cartouches sous l'arme, trois fois. */
    animer(p) {
      const g = this.gauche.position.copy(this.baseGauche);
      if (p < 0.1 || p > 0.9) return;
      const q = (p - 0.1) / 0.8;
      const cycle = (q * 3) % 1;
      const descente = Math.sin(Math.min(1, q * 6) * Math.PI * 0.5) * Math.sin(Math.min(1, (1 - q) * 6) * Math.PI * 0.5);
      g.y -= descente * 0.12 - Math.sin(cycle * Math.PI) * 0.05 * descente;
      g.z += descente * (0.2 + Math.sin(cycle * Math.PI) * 0.06);
    },
    finAnim() { this.pomper(0); },
  };
  if (os) {
    // direction « vers la crosse » (+z du repère des bras) exprimée dans le repère du parent de l'os
    r.rig.updateMatrixWorld(true);
    os.parent.getWorldQuaternion(_quat).invert();
    os.parent.getWorldScale(_b);
    _a.set(0, 0, 1).applyQuaternion(_quat);
    m.axePompe.copy(_a).divide(_b);
    // l'échelle du rig (1) est celle du monde à ce stade : la distance reste en mètres
  }
  return m;
}

function trouverEnnemi(objet) {
  for (let o = objet; o; o = o.parent) {
    if (o.userData.ennemi) return o.userData.ennemi;
  }
  return null;
}

/**
 * Armes du joueur : modèles en vue à la première personne, tir par lancer de rayon,
 * munitions et rechargement.
 *  - getCibles() : objets que les balles peuvent toucher (ennemis vivants + décor)
 *  - onTouche(ennemi, tete, degats, direction, point)
 *  - onBruit(position) : un tir alerte les ennemis proches
 */
export class Armes {
  constructor(camera, effets, { getCibles, onTouche, onBruit }) {
    this.camera = camera;
    this.effets = effets;
    this.getCibles = getCibles;
    this.onTouche = onTouche;
    this.onBruit = onBruit;
    this.raycaster = new THREE.Raycaster();
    this.actif = false;
    this.souffle = 0; // respiration de l'arme au repos

    this.support = new THREE.Group();
    this.support.position.copy(POSITION_BASE);
    this.support.scale.setScalar(ECHELLE);
    camera.add(this.support);

    this.modeles = [modeleFusil(), modelePompe()];
    for (const m of this.modeles) {
      this.support.add(m.groupe);
      m.flamme = flammeBouche();
      m.bouche.add(m.flamme);
    }

    // Douilles éjectées (pool, dans la scène)
    this.douilles = [];
    const geoDouille = new THREE.CylinderGeometry(0.0055, 0.0055, 0.024, 8).rotateZ(Math.PI / 2);
    const geoCartouche = new THREE.CylinderGeometry(0.0095, 0.0095, 0.06, 8).rotateZ(Math.PI / 2);
    for (let i = 0; i < 24; i++) {
      const d = new THREE.Mesh(i % 2 ? geoCartouche : geoDouille, i % 2 ? matDouilles.cartouche : matDouilles.laiton);
      d.visible = false;
      d.frustumCulled = false;
      (camera.parent ?? camera).add(d);
      this.douilles.push({ mesh: d, vel: new THREE.Vector3(), rot: new THREE.Vector3(), vie: 0, cartouche: i % 2 === 1 });
    }

    this.lumiere = new THREE.PointLight(0xffb45a, 0, 9, 2);
    this.lumiere.position.set(0.2, -0.1, -0.9);
    camera.add(this.lumiere);

    addEventListener('mousedown', (e) => {
      if (e.button !== 0 || e.sourceCapabilities?.firesTouchEvents) return;
      this.gachette = true;
      this.essayerTir();
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.gachette = false; });
    addEventListener('keydown', (e) => {
      if (!this.actif) return;
      if (e.code === 'KeyR') this.recharger();
      if (e.code === 'Digit1') this.changer(0);
      if (e.code === 'Digit2') this.changer(1);
    });
    addEventListener('wheel', (e) => {
      if (!this.actif) return;
      this.changer((this.indice + (e.deltaY > 0 ? 1 : ARMES.length - 1)) % ARMES.length);
    });

    this.reinitialiser();
  }

  /** En portrait (écran étroit), l'arme est plus petite et plus centrée pour ne pas masquer la vue. */
  adapterEcran(aspect) {
    const portrait = aspect < 1;
    this.portrait = portrait;
    this.support.position.copy(POSITION_BASE);
    if (portrait) this.support.position.set(0.11, -0.2, -0.36);
    this.support.scale.setScalar(portrait ? ECHELLE * 0.72 : ECHELLE);
    for (const m of this.modeles) if (m.rig) placerRig(m.rig, this.support, portrait);
  }

  /** Remplace les armes simplifiées par les modèles réalistes (s'ils ont pu être chargés). */
  utiliserModeles() {
    const fabriques = [modeleFusilReel, modelePompeReel];
    this.modeles = this.modeles.map((ancien, i) => {
      let m = null;
      try { m = fabriques[i](); } catch (e) { console.warn('Arme réaliste indisponible', e); }
      if (!m) return ancien;
      this.support.remove(ancien.groupe);
      this.support.add(m.groupe);
      m.flamme = ancien.flamme;
      m.bouche.add(m.flamme);
      m.flamme.scale.setScalar(1);
      m.groupe.visible = ancien.groupe.visible;
      placerRig(m.rig, this.support, this.portrait);
      return m;
    });
  }

  /** Douille éjectée sur la droite de l'arme (laiton pour le fusil, cartouche rouge pour le pompe). */
  ejecterDouille(m) {
    if (!m.ejection) return;
    const cartouche = m.douille === 'cartouche';
    const d = this.douilles.find((q) => q.vie <= 0 && q.cartouche === cartouche);
    if (!d) return;
    m.ejection.getWorldPosition(d.mesh.position);
    _droite.setFromMatrixColumn(this.camera.matrixWorld, 0);
    _haut.setFromMatrixColumn(this.camera.matrixWorld, 1);
    this.camera.getWorldDirection(_dir);
    d.vel.copy(_droite).multiplyScalar(1.6 + Math.random() * 0.8)
      .addScaledVector(_haut, 1.4 + Math.random() * 0.6)
      .addScaledVector(_dir, -0.4 + Math.random() * 0.3);
    if (this.joueur) d.vel.add(this.joueur.vitesse);
    d.rot.set(Math.random() * 20 - 10, Math.random() * 20 - 10, Math.random() * 20 - 10);
    d.mesh.quaternion.copy(this.camera.quaternion);
    d.vie = 1.4;
    d.rebond = false;
    d.mesh.visible = true;
  }

  majDouilles(dt) {
    for (const d of this.douilles) {
      if (d.vie <= 0) continue;
      d.vie -= dt;
      const p = d.mesh.position;
      d.vel.y -= 9.8 * dt;
      p.addScaledVector(d.vel, dt);
      d.mesh.rotation.x += d.rot.x * dt;
      d.mesh.rotation.y += d.rot.y * dt;
      d.mesh.rotation.z += d.rot.z * dt;
      if (p.y < 0.01) { // rebond sur le sol, puis immobile
        p.y = 0.01;
        if (!d.rebond) { d.rebond = true; d.vel.multiplyScalar(0.3); d.vel.y = Math.abs(d.vel.y) * 0.4 + 0.4; d.rot.multiplyScalar(0.4); }
        else { d.vel.set(0, 0, 0); d.rot.set(0, 0, 0); }
      }
      if (d.vie <= 0) d.mesh.visible = false;
    }
  }

  reinitialiser() {
    this.indice = 0;
    this.munitions = ARMES.map((a) => a.chargeur);
    this.reserves = ARMES.map((a) => a.reserveDepart);
    this.attente = 0;
    this.recharge = 0;
    this.changement = 0;
    this.gachette = false;
    this.recul = 0;
    this.flash = 0;
    this.modeles.forEach((m, i) => { m.groupe.visible = i === 0; m.finAnim?.(); });
    for (const d of this.douilles) { d.vie = 0; d.mesh.visible = false; }
  }

  get arme() { return ARMES[this.indice]; }
  get chargeur() { return this.munitions[this.indice]; }
  get reserve() { return this.reserves[this.indice]; }

  /** Bonus de munitions : `chargeurs` chargeurs pour chaque arme. Renvoie false si tout est plein. */
  ajouterMunitions(chargeurs = 2) {
    let pris = false;
    ARMES.forEach((a, i) => {
      if (this.reserves[i] >= a.reserveMax) return;
      this.reserves[i] = Math.min(a.reserveMax, this.reserves[i] + a.chargeur * chargeurs);
      pris = true;
    });
    return pris;
  }

  /** Fin de vague : la réserve remonte au moins à sa valeur de départ (on n'est jamais bloqué). */
  ravitailler() {
    ARMES.forEach((a, i) => { this.reserves[i] = Math.max(this.reserves[i], a.reserveDepart); });
  }

  /** Vrai si l'arme actuelle a peu de munitions (pour favoriser les bonus de munitions). */
  get munitionsBasses() { return this.reserve + this.chargeur <= this.arme.chargeur; }

  changer(i) {
    if (i === this.indice) return;
    this.indice = i;
    this.recharge = 0;
    this.changement = 0.3;
    this.attente = Math.max(this.attente, 0.3);
    this.modeles.forEach((m, k) => { m.groupe.visible = k === i; m.finAnim?.(); });
  }

  recharger() {
    if (this.recharge > 0 || this.chargeur === this.arme.chargeur || this.reserve <= 0) return;
    this.recharge = this.arme.rechargement;
    sons.recharge();
  }

  essayerTir() {
    if (!this.actif || this.attente > 0 || this.recharge > 0) return;
    if (this.chargeur <= 0) {
      sons.vide();
      this.attente = 0.25;
      this.recharger();
      return;
    }
    this.tirer();
  }

  tirer() {
    const a = this.arme;
    const modele = this.modeles[this.indice];
    this.munitions[this.indice]--;
    this.attente = a.cadence;
    this.recul = a.recul;
    this.flash = 0.05;
    sons[a.son]();

    this.camera.getWorldPosition(_origine);
    this.camera.getWorldDirection(_dir);
    _droite.setFromMatrixColumn(this.camera.matrixWorld, 0);
    _haut.setFromMatrixColumn(this.camera.matrixWorld, 1);
    modele.bouche.getWorldPosition(_bouche);

    const cibles = this.getCibles();
    for (let p = 0; p < a.plombs; p++) {
      _d.copy(_dir)
        .addScaledVector(_droite, (Math.random() - 0.5) * 2 * a.dispersion)
        .addScaledVector(_haut, (Math.random() - 0.5) * 2 * a.dispersion)
        .normalize();
      this.raycaster.set(_origine, _d);
      this.raycaster.far = a.portee;
      const impact = this.raycaster.intersectObjects(cibles, true)[0];
      if (impact) {
        _fin.copy(impact.point);
        const ennemi = trouverEnnemi(impact.object);
        if (ennemi) {
          this.onTouche(ennemi, !!impact.object.userData.tete, a.degats, _d, impact.point);
        } else {
          this.effets.etincelles(impact.point, 0xffd27a, 5, 3, 0.3);
        }
      } else {
        _fin.copy(_origine).addScaledVector(_d, a.portee);
      }
      this.effets.trainee(_bouche, _fin);
    }

    // Douille : tout de suite pour le fusil, au retour de pompe pour le fusil à pompe
    if (modele.douille === 'laiton') this.ejecterDouille(modele);
    else if (modele.douille) this.douilleEnAttente = 0.32;

    // Petit recul de la caméra vers le haut
    this.camera.rotateX(a.secousse);
    this.onBruit(_origine);
  }

  update(dt, joueur) {
    this.joueur = joueur;
    this.attente -= dt;
    if (this.recharge > 0) {
      this.recharge -= dt;
      if (this.recharge <= 0) {
        this.recharge = 0;
        const pris = Math.min(this.arme.chargeur - this.chargeur, this.reserve);
        this.munitions[this.indice] += pris;
        this.reserves[this.indice] -= pris;
        this.modeles[this.indice].finAnim?.();
      }
    }
    if (this.gachette && this.arme.auto) this.essayerTir();

    // Animation du modèle : balancement, recul, rechargement, changement d'arme
    const m = this.modeles[this.indice];
    const k = Math.min(joueur.vitesseHorizontale / 6.5, 1.5) * (joueur.auSol ? 1 : 0.3);
    const b = joueur.balancement;
    this.recul = Math.max(0, this.recul - dt * (this.recul * 14 + 0.05));
    // Respiration : l'arme monte et descend doucement, surtout à l'arrêt
    this.souffle += dt;
    const repos = 1 - Math.min(k, 1) * 0.7;
    const sy = Math.sin(this.souffle * 1.7) * 0.0045 * repos;
    const sx = Math.sin(this.souffle * 0.85) * 0.003 * repos;
    m.groupe.position.set(Math.sin(b) * 0.014 * k + sx, -Math.abs(Math.cos(b)) * 0.012 * k + sy, this.recul * 0.7);
    m.groupe.rotation.set(this.recul * 1.6 + sy * 1.5, sx * 2, Math.sin(b) * 0.02 * k);

    if (this.recharge > 0) {
      const p = 1 - this.recharge / this.arme.rechargement;
      const creux = Math.sin(p * Math.PI);
      if (m.reel) { // arme inclinée sur le côté pour montrer le puits de chargeur
        m.groupe.rotation.x += creux * 0.12;
        m.groupe.rotation.z = creux * 0.55;
        m.groupe.rotation.y += creux * 0.15;
        m.groupe.position.y -= creux * 0.02;
      } else {
        m.groupe.rotation.x -= creux * 0.7;
        m.groupe.rotation.z = creux * 0.4;
        m.groupe.position.y -= creux * 0.12;
      }
    }
    if (this.changement > 0) {
      this.changement -= dt;
      m.groupe.position.y -= Math.max(0, this.changement) * 0.9;
    }
    if (m.pompe) { // la pompe recule juste après le tir
      const c = Math.max(0, this.attente) / this.arme.cadence;
      m.pompe.position.z = -0.3 + Math.sin(c * Math.PI) * 0.08;
    }
    if (m.reel) {
      if (this.recharge > 0) m.animer(1 - this.recharge / this.arme.rechargement);
      else if (m.pomper) { // pompe réaliste : aller-retour juste après le tir
        const c = 1 - Math.max(0, this.attente) / this.arme.cadence;
        m.pomper(c > 0.25 && c < 0.75 ? Math.sin((c - 0.25) / 0.5 * Math.PI) : 0);
      }
    }
    if (this.douilleEnAttente > 0 && (this.douilleEnAttente -= dt) <= 0) this.ejecterDouille(m);
    this.majDouilles(dt);

    this.flash -= dt;
    const allume = this.flash > 0;
    m.flamme.visible = allume;
    if (allume) {
      m.flamme.rotation.z = Math.random() * Math.PI;
      const base = m.echelleFlamme ?? 1; // la flamme est à l'échelle du repère de l'arme
      m.flamme.scale.setScalar(base * (0.8 + Math.random() * (this.indice === 1 ? 1.2 : 0.6)));
    }
    this.lumiere.intensity = allume ? 6 : 0;
  }
}
