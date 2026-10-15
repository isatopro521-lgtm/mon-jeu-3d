import * as THREE from 'three';

const SOIN = 35;
const DUREE = 20;

const geoBoite = new THREE.BoxGeometry(0.5, 0.5, 0.5);
const geoCroixH = new THREE.BoxGeometry(0.36, 0.1, 0.52);
const geoCroixV = new THREE.BoxGeometry(0.1, 0.36, 0.52);
const matBoite = new THREE.MeshStandardMaterial({ color: 0x2fbf62, emissive: 0x0b3a1c, roughness: 0.4 });
const matCroix = new THREE.MeshBasicMaterial({ color: 0xffffff });

/** Trousses de soin lâchées par les ennemis. */
export class Bonus {
  constructor(scene) {
    this.scene = scene;
    this.liste = [];
  }

  creer(x, z) {
    const g = new THREE.Group();
    const boite = new THREE.Mesh(geoBoite, matBoite);
    boite.castShadow = true;
    const h = new THREE.Mesh(geoCroixH, matCroix);
    const v = new THREE.Mesh(geoCroixV, matCroix);
    const h2 = h.clone(); h2.rotation.y = Math.PI / 2;
    const v2 = v.clone(); v2.rotation.y = Math.PI / 2;
    g.add(boite, h, v, h2, v2);
    g.position.set(x, 0.5, z);
    this.scene.add(g);
    this.liste.push({ groupe: g, vie: DUREE, phase: Math.random() * 6 });
  }

  update(dt, joueur, onRamasse) {
    for (let i = this.liste.length - 1; i >= 0; i--) {
      const b = this.liste[i];
      b.vie -= dt;
      b.phase += dt;
      const g = b.groupe;
      g.rotation.y += dt * 1.5;
      g.position.y = 0.5 + Math.sin(b.phase * 3) * 0.1;
      g.visible = b.vie > 3 || Math.sin(b.vie * 20) > 0; // clignote avant de disparaître

      const dx = g.position.x - joueur.position.x;
      const dz = g.position.z - joueur.position.z;
      const ramasse = dx * dx + dz * dz < 1.2 && joueur.position.y < 1.5 && joueur.vie < joueur.vieMax;
      if (ramasse) {
        joueur.soigner(SOIN);
        onRamasse(SOIN);
      }
      if (ramasse || b.vie <= 0) {
        this.scene.remove(g);
        this.liste.splice(i, 1);
      }
    }
  }

  vider() {
    for (const b of this.liste) this.scene.remove(b.groupe);
    this.liste.length = 0;
  }
}
