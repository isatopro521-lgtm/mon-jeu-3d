import * as THREE from 'three';

const MAX_PARTICULES = 600;
const MAX_TRAINEES = 24;
const _couleur = new THREE.Color();

/** Étincelles, sang, traînées de balles — tout est préalloué (aucune allocation en jeu). */
export class Effets {
  constructor(scene) {
    this.pos = new Float32Array(MAX_PARTICULES * 3);
    this.col = new Float32Array(MAX_PARTICULES * 3);
    this.base = new Float32Array(MAX_PARTICULES * 3);
    this.vel = new Float32Array(MAX_PARTICULES * 3);
    this.vie = new Float32Array(MAX_PARTICULES);
    this.vieMax = new Float32Array(MAX_PARTICULES);
    this.gravite = new Float32Array(MAX_PARTICULES);
    this.prochain = 0;
    for (let i = 0; i < MAX_PARTICULES; i++) this.pos[i * 3 + 1] = -9999;

    const geo = new THREE.BufferGeometry();
    this.attrPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.attrCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.attrPos);
    geo.setAttribute('color', this.attrCol);
    const points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.1,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    points.frustumCulled = false;
    scene.add(points);

    this.trainees = [];
    for (let i = 0; i < MAX_TRAINEES; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const ligne = new THREE.Line(g, new THREE.LineBasicMaterial({
        color: 0xffe2a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      }));
      ligne.frustumCulled = false;
      ligne.visible = false;
      scene.add(ligne);
      this.trainees.push({ ligne, vie: 0 });
    }
    this.indexTrainee = 0;
  }

  /** Projette `n` particules depuis `point`. `haut` > 0 les pousse vers le haut. */
  etincelles(point, couleur, n = 8, force = 4, duree = 0.45, haut = 1.5, gravite = 9.8) {
    _couleur.set(couleur);
    for (let k = 0; k < n; k++) {
      const i = this.prochain;
      this.prochain = (this.prochain + 1) % MAX_PARTICULES;
      const i3 = i * 3;
      this.pos[i3] = point.x; this.pos[i3 + 1] = point.y; this.pos[i3 + 2] = point.z;
      this.vel[i3] = (Math.random() - 0.5) * force;
      this.vel[i3 + 1] = (Math.random() - 0.3) * force + haut;
      this.vel[i3 + 2] = (Math.random() - 0.5) * force;
      this.base[i3] = _couleur.r; this.base[i3 + 1] = _couleur.g; this.base[i3 + 2] = _couleur.b;
      this.vieMax[i] = this.vie[i] = duree * (0.6 + Math.random() * 0.6);
      this.gravite[i] = gravite;
    }
  }

  trainee(de, a) {
    const t = this.trainees[this.indexTrainee];
    this.indexTrainee = (this.indexTrainee + 1) % MAX_TRAINEES;
    const p = t.ligne.geometry.attributes.position;
    p.setXYZ(0, de.x, de.y, de.z);
    p.setXYZ(1, a.x, a.y, a.z);
    p.needsUpdate = true;
    t.vie = 0.06;
    t.ligne.visible = true;
    t.ligne.material.opacity = 0.9;
  }

  update(dt) {
    for (let i = 0; i < MAX_PARTICULES; i++) {
      if (this.vie[i] <= 0) continue;
      const i3 = i * 3;
      this.vie[i] -= dt;
      if (this.vie[i] <= 0) {
        this.pos[i3 + 1] = -9999;
        continue;
      }
      this.vel[i3 + 1] -= this.gravite[i] * dt;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < 0.02) { // rebond amorti sur le sol
        this.pos[i3 + 1] = 0.02;
        this.vel[i3 + 1] *= -0.3;
        this.vel[i3] *= 0.6;
        this.vel[i3 + 2] *= 0.6;
      }
      const k = this.vie[i] / this.vieMax[i];
      this.col[i3] = this.base[i3] * k;
      this.col[i3 + 1] = this.base[i3 + 1] * k;
      this.col[i3 + 2] = this.base[i3 + 2] * k;
    }
    this.attrPos.needsUpdate = true;
    this.attrCol.needsUpdate = true;

    for (const t of this.trainees) {
      if (t.vie <= 0) continue;
      t.vie -= dt;
      t.ligne.material.opacity = Math.max(0, t.vie / 0.06) * 0.9;
      if (t.vie <= 0) t.ligne.visible = false;
    }
  }

  vider() {
    this.vie.fill(0);
    for (let i = 0; i < MAX_PARTICULES; i++) this.pos[i * 3 + 1] = -9999;
    for (const t of this.trainees) { t.vie = 0; t.ligne.visible = false; }
  }
}
