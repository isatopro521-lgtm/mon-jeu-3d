import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { collisionCercleBoites, hauteurSol } from './utils.js';

const VITESSE = 6.5;
const MULT_SPRINT = 1.6;
const SAUT = 8.5;
const GRAVITE = 24;
const HAUTEUR_YEUX = 1.6;
const HAUTEUR = 1.8;
export const RAYON_JOUEUR = 0.4;
export const VIE_MAX = 100;

const HAUT = new THREE.Vector3(0, 1, 0);
const _avant = new THREE.Vector3();
const _droite = new THREE.Vector3();
const _souhait = new THREE.Vector3();

export class Joueur {
  constructor(camera, domElement, boites) {
    this.camera = camera;
    this.controles = new PointerLockControls(camera, domElement);
    this.boites = boites;
    this.position = new THREE.Vector3(); // position des pieds
    this.vitesse = new THREE.Vector3();
    this.touches = new Set();
    this.vieMax = VIE_MAX;
    this.balancement = 0;
    this.secousse = 0;

    addEventListener('keydown', (e) => {
      this.touches.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    addEventListener('keyup', (e) => this.touches.delete(e.code));
    addEventListener('blur', () => this.touches.clear());

    this.reinitialiser();
  }

  reinitialiser() {
    this.position.set(0, 0, 12);
    this.vitesse.set(0, 0, 0);
    this.vie = VIE_MAX;
    this.auSol = true;
    this.secousse = 0;
    this.camera.quaternion.identity(); // regarde vers le centre (-z)
    this.touches.clear();
    this.majCamera();
  }

  get mort() { return this.vie <= 0; }

  get vitesseHorizontale() { return Math.hypot(this.vitesse.x, this.vitesse.z); }

  subirDegats(n) {
    this.vie = Math.max(0, this.vie - n);
    this.secousse = Math.min(0.25, this.secousse + n / 150);
  }

  soigner(n) {
    this.vie = Math.min(VIE_MAX, this.vie + n);
  }

  update(dt) {
    const t = this.touches;
    const av = (t.has('KeyW') || t.has('ArrowUp') ? 1 : 0) - (t.has('KeyS') || t.has('ArrowDown') ? 1 : 0);
    const dr = (t.has('KeyD') || t.has('ArrowRight') ? 1 : 0) - (t.has('KeyA') || t.has('ArrowLeft') ? 1 : 0);

    // Direction voulue dans le plan horizontal, selon l'orientation de la caméra
    this.camera.getWorldDirection(_avant);
    _avant.y = 0;
    _avant.normalize();
    _droite.crossVectors(_avant, HAUT);
    _souhait.set(0, 0, 0).addScaledVector(_avant, av).addScaledVector(_droite, dr);
    if (_souhait.lengthSq() > 0) _souhait.normalize();
    const sprint = (t.has('ShiftLeft') || t.has('ShiftRight')) && av > 0;
    _souhait.multiplyScalar(VITESSE * (sprint ? MULT_SPRINT : 1));

    // Accélération douce (moins de contrôle en l'air)
    const f = 1 - Math.exp(-(this.auSol ? 12 : 3) * dt);
    this.vitesse.x += (_souhait.x - this.vitesse.x) * f;
    this.vitesse.z += (_souhait.z - this.vitesse.z) * f;

    if (t.has('Space') && this.auSol) {
      this.vitesse.y = SAUT;
      this.auSol = false;
    }
    this.vitesse.y -= GRAVITE * dt;

    const yAvant = this.position.y;
    this.position.addScaledVector(this.vitesse, dt);

    const sol = hauteurSol(this.position.x, this.position.z, yAvant, RAYON_JOUEUR, this.boites);
    if (this.position.y <= sol) {
      this.position.y = sol;
      this.vitesse.y = 0;
      this.auSol = true;
    } else {
      this.auSol = false;
    }

    collisionCercleBoites(this.position, RAYON_JOUEUR, HAUTEUR, this.boites);

    const v = this.vitesseHorizontale;
    if (this.auSol && v > 0.5) this.balancement += dt * v * 1.5;
    this.secousse = Math.max(0, this.secousse - dt);
    this.majCamera();
  }

  majCamera() {
    const v = Math.min(this.vitesseHorizontale / VITESSE, 1.5);
    const bob = this.auSol ? Math.sin(this.balancement * 2) * 0.045 * v : 0;
    const s = this.secousse * 0.4;
    this.camera.position.set(
      this.position.x + (Math.random() - 0.5) * s,
      this.position.y + HAUTEUR_YEUX + bob + (Math.random() - 0.5) * s,
      this.position.z + (Math.random() - 0.5) * s,
    );
  }
}
