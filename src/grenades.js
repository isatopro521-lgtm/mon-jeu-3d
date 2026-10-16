import * as THREE from 'three';
import { sons } from './audio.js';
import { clamp } from './utils.js';
import { DEMI_ARENE } from './world.js';

// ---------- Réglages ----------
export const GRENADES_DEPART = 3;
export const GRENADES_MAX = 5;
const DELAI_LANCER = 0.6;        // s entre deux lancers
const VITESSE_LANCER = 14;       // m/s dans la direction visée
const BONUS_HAUT = 3;            // m/s ajoutés vers le haut (arc)
const PART_VITESSE_JOUEUR = 0.5; // la grenade hérite d'une partie de la vitesse du joueur
const GRAVITE = 20;
const RAYON = 0.09;              // rayon de collision de la grenade
const REBOND = 0.45;             // coefficient de restitution
const SEUIL_REBOND = 1.5;        // en dessous (m/s), plus de rebond : elle roule
const FROTTEMENT = 2.5;          // ralentissement quand elle roule
const AMORTI_IMPACT = 0.7;       // vitesse tangentielle gardée à chaque rebond
const PAS_PHYSIQUE = 0.008;      // sous-pas pour ne pas traverser les murs
const MECHE = 2.0;               // s avant l'explosion
const CLIGNOTE = 0.6;            // clignote en rouge pendant les dernières secondes

const DEGATS_MAX = 150;          // au centre de l'explosion
const PORTEE = 6;                // 0 dégât au-delà (m)
const DEGATS_JOUEUR_MAX = 40;
const PORTEE_JOUEUR = 5;
const RECUL = 2;                 // poussée vers l'extérieur (multipliée par 3 dans Ennemi.toucher)
const PORTEE_SECOUSSE = 14;
const PORTEE_BRUIT = 30;         // les ennemis entendent l'explosion

const MAX_ACTIVES = 6;           // grenades en vol simultanées (pool)
const MAX_EXPLOSIONS = 4;        // boules de feu / fumée simultanées (pool)
const DUREE_FEU = 0.35;
const DUREE_FUMEE = 1.6;
const DUREE_FLASH = 0.3;
const INTENSITE_FLASH = 120;

// Géométries et matériaux partagés
const geoCorps = new THREE.SphereGeometry(RAYON, 14, 10);
const geoTete = new THREE.CylinderGeometry(0.035, 0.04, 0.06, 8);
const geoLevier = new THREE.BoxGeometry(0.025, 0.12, 0.02);
const geoGoupille = new THREE.TorusGeometry(0.03, 0.007, 6, 12);
const matMetal = new THREE.MeshStandardMaterial({ color: 0x8a8f96, metalness: 0.6, roughness: 0.4 });
const BOUFFEES = 4;              // sprites de fumée par explosion

// Texture ronde à bord doux, partagée par le feu et la fumée
function textureDouce() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const d = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  d.addColorStop(0, 'rgba(255,255,255,1)');
  d.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  d.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = d;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const _origine = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _n = new THREE.Vector3();
const _centre = new THREE.Vector3();
const _versCible = new THREE.Vector3();
const _recul = new THREE.Vector3();
const _impacts = [];
const _faces = new Float32Array(6);
const raycaster = new THREE.Raycaster();

/** Petit modèle de grenade (sphère vert olive + tête, levier et goupille). */
export function modeleGrenade(materiauCorps) {
  const g = new THREE.Group();
  const corps = new THREE.Mesh(geoCorps, materiauCorps);
  corps.scale.set(1, 1.15, 1);
  corps.castShadow = true;
  const tete = new THREE.Mesh(geoTete, matMetal);
  tete.position.y = RAYON * 1.15 + 0.02;
  const levier = new THREE.Mesh(geoLevier, matMetal);
  levier.position.set(0.05, RAYON * 0.6, 0);
  levier.rotation.z = -0.25;
  const goupille = new THREE.Mesh(geoGoupille, matMetal);
  goupille.position.set(-0.045, RAYON * 1.15 + 0.03, 0);
  goupille.rotation.y = Math.PI / 2;
  g.add(corps, tete, levier, goupille);
  return g;
}

export function materiauGrenade() {
  return new THREE.MeshStandardMaterial({ color: 0x556b2f, roughness: 0.6, metalness: 0.1, emissive: 0x000000 });
}

/**
 * Grenades du joueur : lancer (G / clic droit / bouton tactile), physique avec rebonds,
 * explosion à dégâts de zone (bloquée par les murs), effets visuels et sonores.
 * Options :
 *  - joueur, peutLancer() : vrai seulement pendant la partie
 *  - getEnnemis() : liste des ennemis
 *  - onTouche(ennemi, degats, direction, point) : même chemin que les balles
 *  - onBlesserJoueur(n), onBruit(position), onLancer()
 */
export class Grenades {
  constructor(scene, camera, effets, monde, options) {
    this.scene = scene;
    this.camera = camera;
    this.effets = effets;
    this.boites = monde.boites;
    this.obstacles = monde.obstacles;
    this.o = options;
    this.stock = GRENADES_DEPART;
    this.max = GRENADES_MAX;
    this.attente = 0;

    // Pool de grenades (préallouées)
    this.pool = [];
    for (let i = 0; i < MAX_ACTIVES; i++) {
      const mat = materiauGrenade();
      const groupe = modeleGrenade(mat);
      groupe.visible = false;
      scene.add(groupe);
      this.pool.push({
        groupe, mat, actif: false, meche: 0, repos: false,
        position: new THREE.Vector3(), vitesse: new THREE.Vector3(),
      });
    }

    // Pool de boules de feu et de bouffées de fumée (sprites à bord doux)
    const tex = textureDouce();
    this.explosions = [];
    for (let i = 0; i < MAX_EXPLOSIONS; i++) {
      const feu = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, color: 0xffa040, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      feu.visible = false;
      scene.add(feu);
      const fumees = [];
      for (let k = 0; k < BOUFFEES; k++) {
        const f = new THREE.Sprite(new THREE.SpriteMaterial({
          map: tex, color: 0x60636a, transparent: true, opacity: 0, depthWrite: false,
        }));
        f.visible = false;
        f.userData.decalage = new THREE.Vector3();
        scene.add(f);
        fumees.push(f);
      }
      this.explosions.push({ feu, fumees, t: -1 });
    }
    this.indexExplosion = 0;

    // Flash lumineux unique, réutilisé à chaque explosion
    this.lumiere = new THREE.PointLight(0xffa24a, 0, 22, 2);
    scene.add(this.lumiere);
    this.flash = 0;

    // Commandes PC : touche G ou clic droit
    addEventListener('keydown', (e) => {
      if (e.code === 'KeyG' && !e.repeat && !(e.target instanceof HTMLInputElement)) this.lancer();
    });
    addEventListener('mousedown', (e) => {
      if (e.button !== 2 || e.sourceCapabilities?.firesTouchEvents) return;
      this.lancer();
    });
    addEventListener('contextmenu', (e) => { if (this.o.peutLancer()) e.preventDefault(); });
  }

  reinitialiser() {
    this.stock = GRENADES_DEPART;
    this.attente = 0;
    for (const g of this.pool) this.desactiver(g);
    for (const ex of this.explosions) this.cacherExplosion(ex);
    this.flash = 0;
    this.lumiere.intensity = 0;
  }

  /** Ajoute des grenades ; renvoie false si le stock est déjà plein. */
  ajouter(n = 1) {
    if (this.stock >= GRENADES_MAX) return false;
    this.stock = Math.min(GRENADES_MAX, this.stock + n);
    return true;
  }

  lancer() {
    if (!this.o.peutLancer() || this.attente > 0 || this.stock <= 0) return false;
    const g = this.pool.find((p) => !p.actif);
    if (!g) return false;
    this.stock--;
    this.attente = DELAI_LANCER;

    this.camera.getWorldPosition(_origine);
    this.camera.getWorldDirection(_dir);
    g.position.copy(_origine).addScaledVector(_dir, 0.4);
    g.position.y -= 0.12;
    const vj = this.o.joueur.vitesse;
    g.vitesse.copy(_dir).multiplyScalar(VITESSE_LANCER);
    g.vitesse.x += vj.x * PART_VITESSE_JOUEUR;
    g.vitesse.y += BONUS_HAUT + Math.max(0, vj.y) * PART_VITESSE_JOUEUR;
    g.vitesse.z += vj.z * PART_VITESSE_JOUEUR;
    g.meche = MECHE;
    g.repos = false;
    g.actif = true;
    g.groupe.visible = true;
    g.groupe.position.copy(g.position);
    g.groupe.rotation.set(0, Math.random() * 6, 0);
    sons.lancerGrenade();
    this.o.onLancer?.();
    return true;
  }

  desactiver(g) {
    g.actif = false;
    g.groupe.visible = false;
    g.mat.emissive.setScalar(0);
  }

  /** Physique et mèches (appelé seulement pendant la partie). */
  update(dt) {
    this.attente = Math.max(0, this.attente - dt);
    for (const g of this.pool) {
      if (!g.actif) continue;
      if (!g.repos) {
        const n = Math.min(10, Math.ceil(dt / PAS_PHYSIQUE));
        for (let i = 0; i < n; i++) this.pas(g, dt / n);
      }
      g.groupe.position.copy(g.position);

      g.meche -= dt;
      // Clignote en rouge de plus en plus vite avant l'explosion
      if (g.meche < CLIGNOTE) {
        const allume = Math.sin((CLIGNOTE - g.meche) * (20 + (CLIGNOTE - g.meche) * 60)) > 0;
        g.mat.emissive.setHex(allume ? 0xff2010 : 0x000000);
      }
      if (g.meche <= 0) {
        this.exploser(g.position);
        this.desactiver(g);
      }
    }
  }

  /** Un sous-pas de physique : gravité, collisions sol / boîtes / ennemis, roulement. */
  pas(g, h) {
    const p = g.position;
    const v = g.vitesse;
    v.y -= GRAVITE * h;
    p.addScaledVector(v, h);
    let contact = false;

    // Sol
    if (p.y < RAYON) {
      p.y = RAYON;
      _n.set(0, 1, 0);
      this.rebondir(v, _n);
      contact = true;
    }

    // Boîtes du décor (sphère contre Box3)
    for (const b of this.boites) {
      const cx = clamp(p.x, b.min.x, b.max.x);
      const cy = clamp(p.y, b.min.y, b.max.y);
      const cz = clamp(p.z, b.min.z, b.max.z);
      const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= RAYON * RAYON) continue;
      if (d2 > 1e-10) {
        const d = Math.sqrt(d2);
        _n.set(dx / d, dy / d, dz / d);
        p.set(cx, cy, cz).addScaledVector(_n, RAYON);
      } else {
        // Centre dans la boîte : on sort par la face la plus proche
        const faces = _faces;
        faces[0] = p.x - b.min.x; faces[1] = b.max.x - p.x;
        faces[2] = p.y - b.min.y; faces[3] = b.max.y - p.y;
        faces[4] = p.z - b.min.z; faces[5] = b.max.z - p.z;
        let k = 0;
        for (let i = 1; i < 6; i++) if (faces[i] < faces[k]) k = i;
        const s = k % 2 ? 1 : -1;
        _n.set(k < 2 ? s : 0, k === 2 || k === 3 ? s : 0, k > 3 ? s : 0);
        p.addScaledVector(_n, faces[k] + RAYON);
      }
      this.rebondir(v, _n);
      if (_n.y > 0.7) contact = true;
    }

    // Ennemis vivants (cylindres) : la grenade rebondit dessus
    for (const e of this.o.getEnnemis()) {
      if (e.mort || p.y > e.position.y + e.hauteur) continue;
      const dx = p.x - e.position.x, dz = p.z - e.position.z;
      const min = e.rayon + RAYON;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min || d2 < 1e-8) continue;
      const d = Math.sqrt(d2);
      _n.set(dx / d, 0, dz / d);
      p.x = e.position.x + _n.x * min;
      p.z = e.position.z + _n.z * min;
      this.rebondir(v, _n, 0.3);
    }

    // Filet de sécurité : reste dans l'arène
    p.x = clamp(p.x, -DEMI_ARENE + RAYON, DEMI_ARENE - RAYON);
    p.z = clamp(p.z, -DEMI_ARENE + RAYON, DEMI_ARENE - RAYON);

    if (contact) {
      // Roule : frottement, puis arrêt
      const f = Math.exp(-FROTTEMENT * h);
      v.x *= f;
      v.z *= f;
      if (v.x * v.x + v.z * v.z < 0.02 && Math.abs(v.y) < 0.3) {
        v.set(0, 0, 0);
        g.repos = true;
      }
    }
    const vh = Math.hypot(v.x, v.z);
    if (vh > 0.01) { // rotation visuelle dans le sens du roulement
      g.groupe.rotation.x += v.z / RAYON * h * 0.5;
      g.groupe.rotation.z -= v.x / RAYON * h * 0.5;
    }
  }

  /** Réfléchit la vitesse sur une surface de normale `n` (amortie). */
  rebondir(v, n, restitution = REBOND) {
    const vn = v.dot(n);
    if (vn >= 0) return;
    if (-vn > SEUIL_REBOND) {
      v.addScaledVector(n, -(1 + restitution) * vn);
      v.multiplyScalar(AMORTI_IMPACT);
      sons.rebondGrenade(Math.min(1, -vn / 12));
    } else {
      v.addScaledVector(n, -vn); // trop lent : glisse le long de la surface
    }
  }

  /** Vrai si aucun mur ne se trouve entre `de` et `a`. */
  ligneDeVue(de, a) {
    _versCible.subVectors(a, de);
    const longueur = _versCible.length();
    if (longueur < 1e-4) return true;
    raycaster.set(de, _versCible.divideScalar(longueur));
    raycaster.far = longueur;
    _impacts.length = 0;
    raycaster.intersectObjects(this.obstacles, false, _impacts);
    return _impacts.length === 0;
  }

  exploser(position) {
    _centre.copy(position);
    _origine.copy(position).y += 0.25; // un peu au-dessus du sol pour la ligne de vue

    // Dégâts de zone sur les ennemis (protégés par les murs)
    for (const e of this.o.getEnnemis()) {
      if (e.mort) continue;
      _versCible.set(e.position.x, e.position.y + e.hauteur * 0.5, e.position.z);
      const d = Math.max(0, _versCible.distanceTo(_centre) - e.rayon);
      if (d >= PORTEE) continue;
      _n.copy(_versCible); // centre de l'ennemi (ligneDeVue réutilise _versCible)
      if (!this.ligneDeVue(_origine, _n)) continue;
      const degats = DEGATS_MAX * (1 - d / PORTEE);
      _recul.set(_n.x - _centre.x, 0, _n.z - _centre.z);
      if (_recul.lengthSq() < 1e-6) _recul.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      _recul.normalize().multiplyScalar(RECUL);
      this.o.onTouche(e, degats, _recul, _n);
    }

    // Le joueur aussi, s'il est trop près
    const j = this.o.joueur;
    _n.set(j.position.x, j.position.y + 1, j.position.z);
    const dJoueur = _n.distanceTo(_centre);
    if (dJoueur < PORTEE_JOUEUR && this.ligneDeVue(_origine, _n)) {
      this.o.onBlesserJoueur(Math.round(DEGATS_JOUEUR_MAX * (1 - dJoueur / PORTEE_JOUEUR)));
    }
    if (dJoueur < PORTEE_SECOUSSE) {
      j.secousse = Math.max(j.secousse, 0.3 * (1 - dJoueur / PORTEE_SECOUSSE));
    }
    this.o.onBruit?.(_centre, PORTEE_BRUIT);

    // Effets : flash, boule de feu, fumée, particules, son
    this.lumiere.position.copy(_origine);
    this.flash = DUREE_FLASH;
    const ex = this.explosions[this.indexExplosion];
    this.indexExplosion = (this.indexExplosion + 1) % MAX_EXPLOSIONS;
    ex.t = 0;
    ex.feu.position.copy(_origine).y += 0.4;
    ex.feu.visible = true;
    for (const f of ex.fumees) {
      // chaque bouffée part un peu de côté et monte à sa propre vitesse
      f.userData.decalage.set((Math.random() - 0.5) * 1.6, 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 1.6);
      f.position.copy(_origine).y += 0.4;
      f.material.rotation = Math.random() * 6;
      f.visible = true;
    }
    this.effets.etincelles(_origine, 0xff8a20, 45, 11, 0.7, 3);
    this.effets.etincelles(_origine, 0xffe070, 30, 7, 0.45, 2);
    this.effets.etincelles(_origine, 0x6a6d72, 40, 2.5, 1.6, 1.2, -1.5); // fumée qui monte
    sons.explosion(clamp(1.2 - dJoueur / 40, 0.35, 1));
  }

  /** Effets visuels (appelé à chaque image, même en pause / fin, pour qu'ils se terminent). */
  majVisuels(dt) {
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt);
      const k = this.flash / DUREE_FLASH;
      this.lumiere.intensity = INTENSITE_FLASH * k * k;
    }
    for (const ex of this.explosions) {
      if (ex.t < 0) continue;
      ex.t += dt;
      const kf = Math.min(1, ex.t / DUREE_FEU);
      ex.feu.scale.setScalar(1 + 5 * Math.sqrt(kf));
      ex.feu.material.opacity = 1 - kf;
      ex.feu.visible = kf < 1;
      const ks = Math.min(1, ex.t / DUREE_FUMEE);
      for (const f of ex.fumees) {
        f.position.addScaledVector(f.userData.decalage, dt * (1 - ks));
        f.scale.setScalar(1.2 + 3 * Math.sqrt(ks));
        f.material.opacity = 0.75 * Math.min(1, ex.t * 5) * (1 - ks);
      }
      if (ks >= 1) this.cacherExplosion(ex);
    }
  }

  cacherExplosion(ex) {
    ex.t = -1;
    ex.feu.visible = false;
    for (const f of ex.fumees) f.visible = false;
  }

  /** Nombre de grenades en vol (débogage / tests). */
  get enVol() {
    let n = 0;
    for (const g of this.pool) if (g.actif) n++;
    return n;
  }
}
