import * as THREE from 'three';
import { clamp, collisionCercleBoites } from './utils.js';
import { DEMI_ARENE } from './world.js';
import { sons } from './audio.js';

// Paramètres des types d'ennemis
export const TYPES = {
  soldat: { vie: 60, vitesse: 4.6, degats: 10, portee: 1.7, recharge: 1.0, couleur: 0xd8443a, taille: 1, points: 100, distance: false },
  tireur: { vie: 50, vitesse: 3.4, degats: 12, portee: 24, recharge: 1.8, couleur: 0x3a86d8, taille: 0.95, points: 150, distance: true },
  brute: { vie: 320, vitesse: 2.5, degats: 30, portee: 2.4, recharge: 1.6, couleur: 0x8c3ad8, taille: 1.45, points: 400, distance: false },
};

const VISION = 45;                                   // distance de vue (m)
const CHAMP_COS = Math.cos(THREE.MathUtils.degToRad(75)); // demi-angle du champ de vision
const OUIE = 7;                                      // détecte le joueur à cette distance même sans le voir
const LIMITE = DEMI_ARENE - 1;
const VITESSE_PROJECTILE = 20;
const DUREE_APPARITION = 0.5;
const DUREE_ARMEMENT = 0.4;                          // temps avant que le coup au corps à corps ne porte

const geoCorps = new THREE.CapsuleGeometry(0.34, 0.45, 4, 12);
const geoTete = new THREE.SphereGeometry(0.24, 16, 12);
const geoJambe = new THREE.BoxGeometry(0.17, 0.52, 0.17).translate(0, -0.26, 0); // pivot à la hanche
const geoOeil = new THREE.BoxGeometry(0.08, 0.05, 0.04);
const geoBras = new THREE.BoxGeometry(0.14, 0.62, 0.14).translate(0, -0.26, 0); // pivot à l'épaule
const geoArme = new THREE.BoxGeometry(0.1, 0.45, 0.1).translate(0, -0.7, 0);
const matOeil = new THREE.MeshBasicMaterial({ color: 0xffee66 });
const matArme = new THREE.MeshStandardMaterial({ color: 0x1d1f24, metalness: 0.7, roughness: 0.4 });

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
    this.rayon = 0.45 * t.taille;
    this.hauteur = 2.05 * t.taille;

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

    // Modèle
    this.mat = new THREE.MeshStandardMaterial({ color: t.couleur, roughness: 0.55, metalness: 0.15 });
    const g = new THREE.Group();
    g.rotation.order = 'YXZ';
    g.userData.ennemi = this;
    const corps = new THREE.Mesh(geoCorps, this.mat);
    corps.position.y = 1.05;
    const tete = new THREE.Mesh(geoTete, this.mat);
    tete.position.y = 1.8;
    tete.userData.tete = true;
    g.add(corps, tete);
    for (const s of [-1, 1]) {
      const oeil = new THREE.Mesh(geoOeil, matOeil);
      oeil.position.set(s * 0.085, 1.83, 0.21);
      g.add(oeil);
    }
    this.bras = [-1, 1].map((s) => {
      const b = new THREE.Mesh(geoBras, this.mat);
      b.position.set(s * 0.47, 1.42, 0);
      g.add(b);
      return b;
    });
    this.jambes = [-1, 1].map((s) => {
      const j = new THREE.Mesh(geoJambe, this.mat);
      j.position.set(s * 0.15, 0.55, 0);
      g.add(j);
      return j;
    });
    if (t.distance) {
      this.arme = new THREE.Mesh(geoArme, matArme);
      this.bras[1].add(this.arme);
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.scale.setScalar(0.01);
    g.position.copy(this.position);
    g.rotation.y = this.angle;
    scene.add(g);
    this.groupe = g;
  }

  choisirPatrouille() {
    this.cible.set((Math.random() - 0.5) * 30, 0, (Math.random() - 0.5) * 30);
    this.timer = 6;
  }

  ligneDeVue(joueur, dist, obstacles) {
    if (dist > VISION) return false;
    _oeil.set(this.position.x, 1.8 * this.t.taille, this.position.z);
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
    this.flash = 0.08;
    this.vel.x += direction.x * 3 / this.t.taille;
    this.vel.z += direction.z * 3 / this.t.taille;
    if (this.etat === 'patrouille' || this.etat === 'alerte') this.provoque = true;
    if (this.vie <= 0) {
      this.mourir();
      return { mort: true, points: this.t.points };
    }
    return { mort: false, points: 0 };
  }

  mourir() {
    this.mort = true;
    this.mortTimer = 0;
    this.mat.transparent = true;
    this.mat.emissive.setScalar(0);
    this.groupe.traverse((o) => { if (o.material === matOeil || o.material === matArme) o.visible = false; });
  }

  entendre(position, portee) {
    if (this.mort || this.etat !== 'patrouille') return;
    if (this.position.distanceToSquared(position) < portee * portee) this.provoque = true;
  }

  update(dt, c) {
    const g = this.groupe;

    if (this.mort) {
      this.mortTimer += dt;
      const p = Math.min(1, this.mortTimer / 0.45);
      g.rotation.x = -p * p * Math.PI / 2;
      g.position.y = -Math.max(0, this.mortTimer - 0.8) * 0.8;
      this.mat.opacity = 1 - clamp((this.mortTimer - 0.7) / 0.6, 0, 1);
      if (this.mortTimer > 1.3) this.aSupprimer = true;
      return;
    }

    if (this.apparition > 0) {
      this.apparition -= dt;
      const s = 1 - Math.max(0, this.apparition) / DUREE_APPARITION;
      g.scale.setScalar(this.t.taille * Math.max(0.01, s));
      return;
    }

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
      if (this.etat === 'patrouille') { this.etat = 'alerte'; this.timer = 0.3; }
    }

    let dx = 0, dz = 0, vitesse = 0;
    let regard = null;

    switch (this.etat) {
      case 'patrouille': {
        _v.set(this.cible.x - this.position.x, 0, this.cible.z - this.position.z);
        const d = _v.length();
        this.timer -= dt;
        if (d < 1 || this.timer <= 0) this.choisirPatrouille();
        else { dx = _v.x / d; dz = _v.z / d; vitesse = this.vitesseMax * 0.45; }
        const face = Math.sin(this.angle) * _vers.x + Math.cos(this.angle) * _vers.z;
        if ((this.voit && face > CHAMP_COS) || dist < OUIE) {
          this.etat = 'alerte';
          this.timer = 0.4;
          this.dernierePos.copy(j.position);
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
          if (d > this.t.portee * 0.7) { dx = vise.x; dz = vise.z; vitesse = this.vitesseMax; }
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
    this.marche += dt * v * 2.2;
    const balancier = Math.sin(this.marche) * Math.min(v / 3, 1) * 0.7;
    this.jambes[0].rotation.x = balancier * 0.8;
    this.jambes[1].rotation.x = -balancier * 0.8;
    if (this.etat === 'attaque') {
      const p = 1 - this.timer / DUREE_ARMEMENT;
      this.bras[0].rotation.x = this.bras[1].rotation.x = -0.6 - p * 2.2;
    } else if (this.t.distance && this.etat === 'poursuite' && this.voit) {
      this.bras[0].rotation.x = balancier;
      this.bras[1].rotation.x = -Math.PI / 2 + Math.max(0, this.recharge - this.t.recharge + 0.2) * 2;
    } else {
      this.bras[0].rotation.x = balancier;
      this.bras[1].rotation.x = -balancier;
    }

    g.position.set(this.position.x, Math.abs(Math.sin(this.marche)) * 0.06, this.position.z);
    g.rotation.y = this.angle;
    g.scale.setScalar(this.t.taille);

    this.flash -= dt;
    this.mat.emissive.setScalar(this.flash > 0 ? 0.9 : 0);
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
    const s = this.t.taille;
    _origine.set(
      this.position.x + Math.sin(this.angle) * 0.6 * s + Math.cos(this.angle) * 0.5 * s,
      1.42 * s,
      this.position.z + Math.cos(this.angle) * 0.6 * s - Math.sin(this.angle) * 0.5 * s,
    );
    // Vise le torse en anticipant un peu le mouvement, avec une imprécision
    const t = dist / VITESSE_PROJECTILE;
    _visee.set(
      j.position.x + j.vitesse.x * t * 0.5 + (Math.random() - 0.5) * 1.2,
      j.position.y + 1.2 + (Math.random() - 0.5) * 0.6,
      j.position.z + j.vitesse.z * t * 0.5 + (Math.random() - 0.5) * 1.2,
    ).sub(_origine).normalize();
    c.projectiles.tirer(_origine, _visee, this.t.degats);
    c.effets.etincelles(_origine, 0x66d9ff, 4, 1.5, 0.2, 0, 0);
    sons.tirEnnemi();
  }

  detruire() {
    this.scene.remove(this.groupe);
    this.mat.dispose();
  }
}

class Projectiles {
  constructor(scene, effets) {
    this.effets = effets;
    const geo = new THREE.SphereGeometry(0.13, 10, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0x7fe3ff });
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
