import * as THREE from 'three';
import { textureVortex } from './textures.js';
import { sons } from './audio.js';

// Tempête Nexus (toutes les 5 vagues) : le ciel vire au rouge, un vortex tourne au-dessus
// de l'arène, des éclairs frappent les environs (flash + tonnerre) et la pluie tombe.
// Purement visuel : aucun effet sur le gameplay.

const DUREE_TRANSITION = 3;     // s pour passer du beau temps à la tempête (et retour)
const HAUTEUR_VORTEX = 85;
const POINTS_ECLAIR = 14;
const DUREE_ECLAIR = 0.35;
const PLUIE_BOITE = 36;         // côté de la zone de pluie autour de la caméra (m)
const VITESSE_PLUIE = 30;

const _droite = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export class TempeteNexus {
  constructor(scene, camera, ciel, hud, { qualite = 'haute' } = {}) {
    this.camera = camera;
    this.ciel = ciel;
    this.hud = hud;
    this.k = 0;          // intensité actuelle 0..1
    this.cible = 0;
    this.prochainEclair = 2;
    this.eclair = 0;     // flash 0..1
    this.temps = 0;

    // Vortex : deux disques en rotation inverse (additifs)
    const tex = textureVortex();
    this.vortex = new THREE.Group();
    this.vortex.position.y = HAUTEUR_VORTEX;
    this.disques = [0, 1].map((i) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(i ? 120 : 80, 48).rotateX(Math.PI / 2),
        new THREE.MeshBasicMaterial({
          map: tex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
          blending: i ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false, color: i ? 0xff6050 : 0xffffff,
        }));
      m.position.y = i * 12;
      this.vortex.add(m);
      return m;
    });
    this.vortex.visible = false;
    scene.add(this.vortex);

    // Éclair : ruban de quads (préalloué) qui fait face à la caméra au moment de la frappe
    this.posEclair = new Float32Array(POINTS_ECLAIR * 2 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.posEclair, 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < POINTS_ECLAIR - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    this.matEclair = new THREE.MeshBasicMaterial({
      color: 0xffd6e6, transparent: true, opacity: 0, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    this.ruban = new THREE.Mesh(geo, this.matEclair);
    this.ruban.frustumCulled = false;
    this.ruban.visible = false;
    scene.add(this.ruban);

    // Pluie : segments préalloués autour de la caméra
    this.nbGouttes = qualite === 'haute' ? 1400 : 600;
    this.gouttes = new Float32Array(this.nbGouttes * 6);
    for (let i = 0; i < this.nbGouttes; i++) this.placerGoutte(i, true);
    const geoPluie = new THREE.BufferGeometry();
    this.attrPluie = new THREE.BufferAttribute(this.gouttes, 3).setUsage(THREE.DynamicDrawUsage);
    geoPluie.setAttribute('position', this.attrPluie);
    this.matPluie = new THREE.LineBasicMaterial({ color: 0xc8b0b8, transparent: true, opacity: 0, depthWrite: false });
    this.pluie = new THREE.LineSegments(geoPluie, this.matPluie);
    this.pluie.frustumCulled = false;
    this.pluie.visible = false;
    scene.add(this.pluie);
    this.nbActives = this.nbGouttes;
  }

  /** Part des gouttes dessinées et animées (réglage de qualité, 0..1). */
  densitePluie(f) {
    this.nbActives = Math.max(1, Math.floor(this.nbGouttes * f));
    this.pluie.geometry.setDrawRange(0, this.nbActives * 2);
  }

  get active() { return this.cible > 0; }

  demarrer() { this.cible = 1; this.prochainEclair = 1.5; }
  arreter() { this.cible = 0; }
  /** Retour immédiat au beau temps (nouvelle partie). */
  reinitialiser() { this.cible = 0; this.k = 0; this.eclair = 0; this.appliquer(); }

  placerGoutte(i, auHasard) {
    const c = this.camera.position;
    const o = i * 6;
    const x = c.x + (Math.random() - 0.5) * PLUIE_BOITE;
    const z = c.z + (Math.random() - 0.5) * PLUIE_BOITE;
    const y = c.y + (auHasard ? (Math.random() - 0.3) * 24 : 14 + Math.random() * 6);
    this.gouttes[o] = x; this.gouttes[o + 1] = y; this.gouttes[o + 2] = z;
    this.gouttes[o + 3] = x + 0.08; this.gouttes[o + 4] = y + 0.7; this.gouttes[o + 5] = z + 0.04;
  }

  frapper() {
    // point d'impact : surtout autour de l'arène, parfois sur un mirador ou une tour
    const angle = Math.random() * Math.PI * 2;
    const dist = 20 + Math.random() * 90;
    _b.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
    _a.set((Math.random() - 0.5) * 30, HAUTEUR_VORTEX, (Math.random() - 0.5) * 30);
    _droite.setFromMatrixColumn(this.camera.matrixWorld, 0);
    const p = this.posEclair;
    for (let i = 0; i < POINTS_ECLAIR; i++) {
      const t = i / (POINTS_ECLAIR - 1);
      const zig = (i === 0 || i === POINTS_ECLAIR - 1) ? 0 : (Math.random() - 0.5) * 9;
      const x = _a.x + (_b.x - _a.x) * t + zig;
      const y = _a.y + (_b.y - _a.y) * t;
      const z = _a.z + (_b.z - _a.z) * t + (Math.random() - 0.5) * 6 * (zig !== 0);
      const w = 0.5 + (1 - t) * 0.9;
      p.set([x - _droite.x * w, y, z - _droite.z * w, x + _droite.x * w, y, z + _droite.z * w], i * 6);
    }
    this.ruban.geometry.attributes.position.needsUpdate = true;
    this.ruban.visible = true;
    this.eclair = 1;
    const distance = _b.distanceTo(this.camera.position);
    sons.tonnerre?.(Math.min(1.2, distance / 120), Math.max(0.3, 1 - distance / 200));
  }

  update(dt) {
    this.temps += dt;
    const avant = this.k;
    this.k += Math.sign(this.cible - this.k) * Math.min(Math.abs(this.cible - this.k), dt / DUREE_TRANSITION);
    if (this.k <= 0 && avant <= 0 && this.eclair <= 0) return;

    if (this.cible > 0 && this.k > 0.6 && (this.prochainEclair -= dt) <= 0) {
      this.frapper();
      this.prochainEclair = 2 + Math.random() * 5;
    }
    this.eclair = Math.max(0, this.eclair - dt / DUREE_ECLAIR);
    // scintillement du flash
    const flash = this.eclair > 0 ? this.eclair * (0.6 + 0.4 * Math.sin(this.eclair * 40)) : 0;
    this.matEclair.opacity = Math.min(1, this.eclair * 1.6);
    this.ruban.visible = this.eclair > 0;

    this.disques[0].rotation.y = this.temps * 0.25;
    this.disques[1].rotation.y = -this.temps * 0.12;

    // Pluie
    if (this.k > 0) {
      const g = this.gouttes;
      const cy = this.camera.position.y;
      for (let i = 0; i < this.nbActives; i++) {
        const o = i * 6;
        g[o + 1] -= VITESSE_PLUIE * dt; g[o + 4] -= VITESSE_PLUIE * dt;
        g[o] -= 2 * dt; g[o + 3] -= 2 * dt;
        if (g[o + 1] < Math.max(0, cy - 8)) this.placerGoutte(i, false);
      }
      this.attrPluie.needsUpdate = true;
    }
    this.flash = flash;
    this.appliquer();
  }

  appliquer() {
    const k = this.k;
    this.vortex.visible = this.pluie.visible = k > 0.01;
    this.disques[0].material.opacity = k * 0.95;
    this.disques[1].material.opacity = k * 0.25;
    this.matPluie.opacity = k * 0.45;
    this.ciel.ambiance(k, this.flash ?? 0);
    this.hud.eclair((this.flash ?? 0) * 0.5);
  }
}
