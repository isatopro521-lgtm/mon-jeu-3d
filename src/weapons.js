import * as THREE from 'three';
import { sons } from './audio.js';
import { Assemblage } from './utils.js';

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

function flammeBouche() {
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffc35a, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
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
    this.support.position.copy(POSITION_BASE);
    if (portrait) this.support.position.set(0.11, -0.2, -0.36);
    this.support.scale.setScalar(portrait ? ECHELLE * 0.72 : ECHELLE);
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
    this.modeles.forEach((m, i) => { m.groupe.visible = i === 0; });
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
    this.modeles.forEach((m, k) => { m.groupe.visible = k === i; });
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

    // Petit recul de la caméra vers le haut
    this.camera.rotateX(a.secousse);
    this.onBruit(_origine);
  }

  update(dt, joueur) {
    this.attente -= dt;
    if (this.recharge > 0) {
      this.recharge -= dt;
      if (this.recharge <= 0) {
        this.recharge = 0;
        const pris = Math.min(this.arme.chargeur - this.chargeur, this.reserve);
        this.munitions[this.indice] += pris;
        this.reserves[this.indice] -= pris;
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
      m.groupe.rotation.x -= creux * 0.7;
      m.groupe.rotation.z = creux * 0.4;
      m.groupe.position.y -= creux * 0.12;
    }
    if (this.changement > 0) {
      this.changement -= dt;
      m.groupe.position.y -= Math.max(0, this.changement) * 0.9;
    }
    if (m.pompe) { // la pompe recule juste après le tir
      const c = Math.max(0, this.attente) / this.arme.cadence;
      m.pompe.position.z = -0.3 + Math.sin(c * Math.PI) * 0.08;
    }

    this.flash -= dt;
    const allume = this.flash > 0;
    m.flamme.visible = allume;
    if (allume) {
      m.flamme.rotation.z = Math.random() * Math.PI;
      m.flamme.scale.setScalar(0.8 + Math.random() * (this.indice === 1 ? 1.2 : 0.6));
    }
    this.lumiere.intensity = allume ? 6 : 0;
  }
}
