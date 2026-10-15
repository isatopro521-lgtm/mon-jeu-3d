import * as THREE from 'three';
import { sons } from './audio.js';

export const ARMES = [
  {
    nom: "Fusil d'assaut", degats: 22, cadence: 0.1, chargeur: 30, rechargement: 1.5,
    dispersion: 0.012, plombs: 1, portee: 120, recul: 0.05, secousse: 0.006, auto: true, son: 'tir',
  },
  {
    nom: 'Fusil à pompe', degats: 15, cadence: 0.85, chargeur: 6, rechargement: 2.0,
    dispersion: 0.075, plombs: 9, portee: 40, recul: 0.16, secousse: 0.035, auto: false, son: 'pompe',
  },
];

const POSITION_BASE = new THREE.Vector3(0.17, -0.17, -0.32);
const ECHELLE = 0.7;

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

function modeleFusil() {
  const sombre = new THREE.MeshStandardMaterial({ color: 0x4a515c, metalness: 0.2, roughness: 0.5 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xd9822b, metalness: 0.3, roughness: 0.5 });
  const g = new THREE.Group();
  const ajouter = (geo, mat, x, y, z, rx = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    g.add(m);
  };
  ajouter(new THREE.BoxGeometry(0.07, 0.09, 0.42), sombre, 0, 0, -0.1);
  ajouter(new THREE.CylinderGeometry(0.016, 0.016, 0.26, 10), sombre, 0, 0.015, -0.42, Math.PI / 2);
  ajouter(new THREE.BoxGeometry(0.045, 0.13, 0.06), accent, 0, -0.1, -0.06, 0.25);
  ajouter(new THREE.BoxGeometry(0.06, 0.08, 0.16), sombre, 0, -0.015, 0.18);
  ajouter(new THREE.BoxGeometry(0.02, 0.03, 0.08), accent, 0, 0.06, -0.05);
  ajouter(new THREE.BoxGeometry(0.04, 0.09, 0.05), sombre, 0, -0.08, 0.06, -0.3);
  const bouche = new THREE.Object3D();
  bouche.position.set(0, 0.015, -0.57);
  g.add(bouche);
  return { groupe: g, bouche };
}

function modelePompe() {
  const metal = new THREE.MeshStandardMaterial({ color: 0x555a62, metalness: 0.25, roughness: 0.45 });
  const bois = new THREE.MeshStandardMaterial({ color: 0x7a4a26, roughness: 0.7 });
  const g = new THREE.Group();
  const ajouter = (geo, mat, x, y, z, rx = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    g.add(m);
  };
  ajouter(new THREE.CylinderGeometry(0.024, 0.024, 0.5, 10), metal, 0, 0.02, -0.3, Math.PI / 2);
  ajouter(new THREE.CylinderGeometry(0.02, 0.02, 0.42, 10), metal, 0, -0.025, -0.26, Math.PI / 2);
  ajouter(new THREE.BoxGeometry(0.065, 0.06, 0.15), bois, 0, -0.025, -0.3);
  ajouter(new THREE.BoxGeometry(0.075, 0.09, 0.18), metal, 0, 0, 0.0);
  ajouter(new THREE.BoxGeometry(0.06, 0.1, 0.22), bois, 0, -0.04, 0.18, -0.15);
  const bouche = new THREE.Object3D();
  bouche.position.set(0, 0.02, -0.56);
  g.add(bouche);
  return { groupe: g, bouche, pompe: g.children[2] };
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
      if (e.button !== 0) return;
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

  reinitialiser() {
    this.indice = 0;
    this.munitions = ARMES.map((a) => a.chargeur);
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

  changer(i) {
    if (i === this.indice) return;
    this.indice = i;
    this.recharge = 0;
    this.changement = 0.3;
    this.attente = Math.max(this.attente, 0.3);
    this.modeles.forEach((m, k) => { m.groupe.visible = k === i; });
  }

  recharger() {
    if (this.recharge > 0 || this.chargeur === this.arme.chargeur) return;
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
        this.munitions[this.indice] = this.arme.chargeur;
      }
    }
    if (this.gachette && this.arme.auto) this.essayerTir();

    // Animation du modèle : balancement, recul, rechargement, changement d'arme
    const m = this.modeles[this.indice];
    const k = Math.min(joueur.vitesseHorizontale / 6.5, 1.5) * (joueur.auSol ? 1 : 0.3);
    const b = joueur.balancement;
    this.recul = Math.max(0, this.recul - dt * (this.recul * 14 + 0.05));
    m.groupe.position.set(Math.sin(b) * 0.014 * k, -Math.abs(Math.cos(b)) * 0.012 * k, this.recul * 0.7);
    m.groupe.rotation.set(this.recul * 1.6, 0, 0);

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
