import * as THREE from 'three';
import { creerMonde } from './world.js';
import { DIRECTION_SOLEIL } from './ciel.js';
import { MEGA } from './decor.js';
import { Ennemi, TYPES } from './enemies.js';
import { Effets } from './effects.js';
import { TempeteNexus } from './tempete.js';
import { Qualite } from './qualite.js';
import { PostTraitement, declarerLumineux } from './postprocess.js';
import { chargerModeles } from './modeles.js';
import { Armes } from './weapons.js';
import { initAudio, sons, contexteAudio } from './audio.js';
import { estTactile } from './touch.js';
import { clamp } from './utils.js';
import { Musique } from './film-musique.js';

// ============================================================================================
// NEXUS FRONTIER — le film : court-métrage en temps réel, avec le décor, les soldats, le mech
// et la Tempête Nexus du jeu. Tout est écrit sur une ligne de temps (secondes) :
//  - CUES : événements de mise en scène (apparitions, tirs, explosion…) ;
//  - PLANS : mouvements de caméra ;
//  - TEXTES : titres, cartons de chapitre, sous-titres ;
//  - FONDUS : fondus au noir entre les scènes.
// ?debug : window.film pour les tests ; ?capture : images pas à pas (enregistrement vidéo).
// ============================================================================================

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const CAPTURE = params.has('capture');
const DUREE = 118;                 // durée totale (générique compris)
const DEBUT_GENERIQUE = 108;
const CADRE_PAYSAGE = 2.2;         // format « cinémascope » (bandes noires)
const CADRE_PORTRAIT = 1;          // en portrait : image carrée, textes dans les bandes
const VITESSE_BOLT = 22;

// L'héroïne : un soldat du jeu aux couleurs de l'avant-poste (visière orange, tenue noire)
TYPES.heros = { ...TYPES.tireur, visiere: 0xff7a1e, accent: 0xc8641a, couleur: 0xff9a40, echelle: 1 };

const $ = (id) => document.getElementById(id);
const el = {
  scene: $('scene'), fondu: $('fondu'), eclair: $('eclair'), textes: $('textes'),
  accueil: $('accueil'), fin: $('fin'), lancer: $('btn-lancer'), chargement: $('chargement'),
  controles: $('controles'), lecture: $('c-lecture'), recommencer: $('c-recommencer'), son: $('c-son'),
  plein: $('c-plein'), barre: $('c-barre-remplie'), temps: $('c-temps'), revoir: $('btn-revoir'),
  generique: $('generique'), portrait: $('conseil-portrait'),
};
document.body.classList.toggle('tactile', estTactile);
document.body.classList.toggle('capture', CAPTURE);

// ---------- Rendu ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, estTactile ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
el.scene.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.08, 3000);
scene.add(camera); // l'arme de la vue subjective est attachée à la caméra

const monde = creerMonde(scene, {
  tailleOmbres: estTactile ? 1024 : 2048,
  qualite: estTactile ? 'basse' : 'haute',
  renderer,
});
const effets = new Effets(scene);
const tempete = new TempeteNexus(scene, camera, monde.ciel, {
  eclair(k) { el.eclair.style.opacity = k; },
}, { qualite: estTactile ? 'basse' : 'haute' });
const post = new PostTraitement(renderer, { soleil: DIRECTION_SOLEIL });

// Vue subjective (plan « à travers les yeux » de l'héroïne) : les armes du jeu, tirs compris
const acteurs = [];
const armes = new Armes(camera, effets, {
  getCibles: () => {
    cibles.length = 0;
    for (const a of acteurs) if (!a.e.mort && a !== heros) cibles.push(a.e.groupe);
    for (const s of monde.surfaces) cibles.push(s);
    return cibles;
  },
  onTouche: (ennemi, tete, degats, direction, point) => {
    if (ennemi.acteur) toucherActeur(ennemi.acteur, tete ? degats * 2 : degats, direction, point, tete);
  },
  onBruit: () => {},
});
const cibles = [];
armes.support.visible = false;
const joueurFictif = { vitesseHorizontale: 0, auSol: true, balancement: 0, vitesse: new THREE.Vector3() };

// Cadre : le canvas n'occupe que l'image (les bandes noires sont le fond de la page)
let largeurImage = innerWidth, hauteurImage = innerHeight, aspectImage = 16 / 9;
function redimensionner() {
  const L = innerWidth, H = innerHeight;
  const portrait = L / H < 1.15;
  const cadre = portrait ? CADRE_PORTRAIT : CADRE_PAYSAGE;
  hauteurImage = Math.min(H, Math.round(L / cadre));
  largeurImage = L;
  aspectImage = largeurImage / hauteurImage;
  const barre = Math.max(0, Math.round((H - hauteurImage) / 2));
  renderer.setSize(largeurImage, hauteurImage);
  renderer.domElement.style.top = `${barre}px`;
  document.documentElement.style.setProperty('--barre', `${barre}px`);
  document.body.classList.toggle('portrait', portrait);
  document.body.classList.toggle('grandes-barres', barre >= 64);
  camera.aspect = aspectImage;
  camera.updateProjectionMatrix();
  armes.adapterEcran(aspectImage);
  besoinRendu = true;
}
let besoinRendu = true;

// Qualité graphique : même réglage que le jeu (Auto baisse les détails si le film rame)
const qualite = new Qualite({ renderer, scene, monde, tempete, estTactile, post, onChange: redimensionner });
redimensionner();
addEventListener('resize', redimensionner);

// ---------- Lumières et objets propres au film ----------
const lumiereTir = new THREE.PointLight(0xffb45a, 0, 8, 2);
const lumiereExplosion = new THREE.PointLight(0xff7a2a, 0, 40, 1.6);
scene.add(lumiereTir, lumiereExplosion);

// Tirs d'énergie bleus des tireurs ennemis (préalloués)
const geoBolt = new THREE.SphereGeometry(0.11, 10, 8);
const matBolt = declarerLumineux(new THREE.MeshBasicMaterial({ color: 0x7fe3ff }), 2.2);
const matHalo = new THREE.MeshBasicMaterial({
  color: 0x2aa8ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false,
});
const bolts = [];
for (let i = 0; i < 10; i++) {
  const m = new THREE.Mesh(geoBolt, matBolt);
  const h = new THREE.Mesh(geoBolt, matHalo);
  h.scale.setScalar(2.4);
  m.add(h);
  m.visible = false;
  scene.add(m);
  bolts.push({ mesh: m, de: new THREE.Vector3(), a: new THREE.Vector3(), t: 0, duree: 0, actif: false, blesse: false });
}

// Grenade + boule de feu de l'explosion
const grenade = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8),
  new THREE.MeshStandardMaterial({ color: 0x2b2f33, metalness: 0.6, roughness: 0.4, emissive: 0xff5a10, emissiveIntensity: 0.4 }));
grenade.visible = false;
scene.add(grenade);
const etatGrenade = { actif: false, t: 0, duree: 1, de: new THREE.Vector3(), a: new THREE.Vector3() };
// Explosion : boule de feu, cœur éblouissant et fumée (sprites à dégradé radial)
function textureHalo(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const d = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [k, couleur] of stops) d.addColorStop(k, couleur);
  g.fillStyle = d;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const texFeu = textureHalo([[0, 'rgba(255,240,200,1)'], [0.25, 'rgba(255,170,60,0.95)'], [0.6, 'rgba(230,70,20,0.5)'], [1, 'rgba(120,20,0,0)']]);
const texFumee = textureHalo([[0, 'rgba(40,36,34,0.85)'], [0.55, 'rgba(30,28,27,0.5)'], [1, 'rgba(20,20,20,0)']]);
const sprite = (map, additif) => {
  const m = new THREE.Sprite(new THREE.SpriteMaterial({
    map, transparent: true, depthWrite: false, opacity: 0,
    blending: additif ? THREE.AdditiveBlending : THREE.NormalBlending,
  }));
  m.visible = false;
  scene.add(m);
  return m;
};
const boule = sprite(texFeu, true), coeur = sprite(texFeu, true);
const fumees = [0, 1, 2].map(() => sprite(texFumee, false));
const etatBoule = { t: 9 };

// Vecteurs temporaires (aucune allocation dans la boucle)
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _o = new THREE.Vector3(), _d = new THREE.Vector3();
const camPos = new THREE.Vector3(), camCible = new THREE.Vector3();
const viseeLissee = new THREE.Vector3(), suiviLisse = new THREE.Vector3();
const lisse = (u) => u * u * (3 - 2 * u);
const angleCourt = (a) => Math.atan2(Math.sin(a), Math.cos(a));
function melange(sortie, a, b, u) { return sortie.set(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u); }

// ============================================================================================
// Acteurs : les ennemis du jeu (mêmes modèles et animations), pilotés par le scénario
// ============================================================================================
const contexteMort = { effets };

class Acteur {
  constructor(type, x, z, { angle = 0, apparition = false } = {}) {
    const e = new Ennemi(type, x, z, 1, scene);
    e.acteur = this;
    e.angle = angle;
    e.etat = 'patrouille';
    e.pause = 0;
    if (!apparition) {
      e.apparition = 0;
      e.groupe.scale.setScalar(e.echelle);
    }
    this.e = e;
    this.chemin = [];
    this.vitesse = 0;
    this.regard = new THREE.Vector3();
    this.aRegard = false;
    this.suivi = null;
    this.cibleTete = { position: new THREE.Vector3() };
    acteurs.push(this);
    if (apparition) {
      effets.etincelles(_v.set(x, 0.2, z), e.t.couleur, 25, 3, 0.8, 4, 4);
      sons.apparition();
    }
    this.majGroupe();
  }

  /** Suit une liste de points [[x, z], …] à la vitesse donnée (m/s). */
  aller(points, vitesse) {
    this.chemin = points.map(([x, z]) => new THREE.Vector3(x, 0, z));
    this.vitesse = vitesse;
    return this;
  }

  /** Regarde un point (au sol : la tête vise 1,5 m plus haut) ou un autre acteur. */
  regarder(x, y, z) { this.aRegard = true; this.suivi = null; this.regard.set(x, y, z); return this; }
  fixer(acteur) { this.aRegard = true; this.suivi = acteur; return this; }
  libre() { this.aRegard = false; this.suivi = null; return this; }
  /** État d'animation du jeu : 'patrouille' (détendu), 'alerte' (arme prête), 'poursuite' + voit (en joue). */
  attitude(etat, voit = false) { this.e.etat = etat; this.e.voit = voit; return this; }

  majGroupe() {
    const e = this.e;
    e.groupe.position.set(e.position.x, 0, e.position.z);
    e.groupe.rotation.y = e.angle;
  }

  update(dt) {
    const e = this.e;
    if (e.mort) {
      e.animerMort(dt, contexteMort);
      if (e.aSupprimer) {
        e.detruire();
        acteurs.splice(acteurs.indexOf(this), 1);
      }
      return;
    }
    if (e.apparition > 0) {
      e.grandir(dt);
      this.majGroupe();
      return;
    }
    e.temps += dt;

    // déplacement le long du chemin
    let dx = 0, dz = 0;
    while (this.chemin.length) {
      const c = this.chemin[0];
      _v.set(c.x - e.position.x, 0, c.z - e.position.z);
      const d = _v.length();
      if (d < 0.15) { this.chemin.shift(); continue; }
      dx = _v.x / d; dz = _v.z / d;
      break;
    }
    const f = 1 - Math.exp(-8 * dt);
    e.vel.x += (dx * this.vitesse - e.vel.x) * f;
    e.vel.z += (dz * this.vitesse - e.vel.z) * f;
    e.position.x += e.vel.x * dt;
    e.position.z += e.vel.z * dt;

    // orientation : vers ce qu'il regarde, sinon dans le sens de la marche
    if (this.suivi && !this.suivi.e.mort) this.regard.copy(this.suivi.e.position);
    let angleVoulu = null;
    if (this.aRegard) angleVoulu = Math.atan2(this.regard.x - e.position.x, this.regard.z - e.position.z);
    else if (e.vel.lengthSq() > 0.1) angleVoulu = Math.atan2(e.vel.x, e.vel.z);
    if (angleVoulu !== null) e.angle += angleCourt(angleVoulu - e.angle) * Math.min(1, dt * 7);

    if (e.etat === 'attaque' && (e.timer -= dt) <= 0) e.etat = 'poursuite';

    const cible = this.cibleTete.position;
    if (this.aRegard) cible.copy(this.regard);
    else cible.set(e.position.x + Math.sin(e.angle) * 10, 0, e.position.z + Math.cos(e.angle) * 10);
    e.poser(dt, this.cibleTete, Math.hypot(cible.x - e.position.x, cible.z - e.position.z));
  }

  /** Bouche de l'arme (position monde), ou à défaut devant l'épaule. */
  bouche(sortie) {
    const e = this.e;
    if (e.bouche) return e.bouche.getWorldPosition(sortie);
    return sortie.set(e.position.x + Math.sin(e.angle) * 0.8, 1.45, e.position.z + Math.cos(e.angle) * 0.8);
  }

  /** Point visé sur cet acteur (torse ; plus haut pour le mech). */
  torse(sortie) {
    const e = this.e;
    return sortie.set(e.position.x, (e.pattes ? 1.7 : 1.25) * e.echelle, e.position.z);
  }
}

let heros = null, s1 = null, s2 = null, s3 = null, t1 = null, t2 = null, mech = null;
let dernierSonTouche = 0;

function toucherActeur(a, degats, direction, point, tete = false) {
  const res = a.e.toucher(degats, direction);
  if (!res) return;
  effets.etincelles(point, tete ? 0xffcc33 : 0xff3b2f, tete ? 12 : 7, 3.5, 0.5);
  const maintenant = performance.now();
  if (maintenant - dernierSonTouche > 40) {
    dernierSonTouche = maintenant;
    (tete ? sons.tete : sons.touche)();
  }
  if (res.mort) {
    sons.mortEnnemi();
    effets.etincelles(point, a.e.t.couleur, 30, 5, 0.9);
  }
}

/** Animation courte d'un acteur (seulement pour les modèles animés). */
function geste(a, nom, poids, vitesse) {
  if (a?.e.mixer) a.e.unCoup(nom, poids, vitesse);
}

/** Tir de l'héroïne : vue subjective (armes du jeu) ou vue de l'extérieur (traînée, flash, impact). */
function tirHeros(cible, degats = 22, rate = false) {
  if (!heros || !cible) return;
  if (planCourant?.pov) {
    armes.munitions[armes.indice] = armes.arme.chargeur;
    armes.tirer(); // tir réel depuis la caméra (lancer de rayon sur les zones de tir des ennemis)
    if (degats >= 999 && !cible.e.mort) {
      cible.torse(_w);
      toucherActeur(cible, degats, _d.copy(_w).sub(camera.position).normalize(), _w);
    }
    return;
  }
  geste(heros, 'shoot', 0.7, 1.4);
  heros.bouche(_o);
  cible.torse(_w);
  _w.x += (Math.random() - 0.5) * 0.25;
  _w.y += (Math.random() - 0.5) * 0.3;
  if (rate) _w.y += 1.2;
  effets.trainee(_o, _w);
  effets.etincelles(_o, 0xffd27a, 4, 1.5, 0.12, 0, 0);
  lumiereTir.position.copy(_o);
  lumiereTir.intensity = 7;
  sons.tir();
  if (rate || cible.e.mort) { effets.etincelles(_w, 0xffd27a, 5, 3, 0.3); return; }
  _d.copy(_w).sub(_o).normalize();
  toucherActeur(cible, degats, _d, _w);
}

/** Rafale : n tirs espacés de 0,1 s à partir de l'instant `t` ; le dernier achève la cible si besoin. */
function rafale(t, cible, n, { degats = 22, achever = true } = {}) {
  const liste = [];
  for (let i = 0; i < n; i++) {
    liste.push([t + i * 0.1, () => {
      const c = cible();
      tirHeros(c, degats);
      if (achever && i === n - 1 && c && !c.e.mort) tirHeros(c, 999);
    }]);
  }
  return liste;
}

/** Tir d'énergie d'un tireur ennemi vers un point (qui rate de peu, ou touche l'héroïne). */
function tirEnnemi(a, cx, cy, cz, blesse = false) {
  if (!a || a.e.mort) return;
  const b = bolts.find((x) => !x.actif);
  if (!b) return;
  geste(a, 'shoot', 0.7, 1.4);
  a.bouche(b.de);
  b.a.set(cx, cy, cz);
  b.duree = b.de.distanceTo(b.a) / VITESSE_BOLT;
  b.t = 0;
  b.actif = true;
  b.blesse = blesse;
  b.mesh.visible = true;
  b.mesh.position.copy(b.de);
  effets.etincelles(b.de, 0x7fe3ff, 5, 1.5, 0.15, 0, 0);
  sons.tirEnnemi();
}

function majBolts(dt) {
  for (const b of bolts) {
    if (!b.actif) continue;
    b.t += dt;
    const u = Math.min(1, b.t / b.duree);
    b.mesh.position.lerpVectors(b.de, b.a, u);
    if (u >= 1) {
      b.actif = false;
      b.mesh.visible = false;
      effets.etincelles(b.a, 0x66d9ff, 10, 3, 0.4);
      if (b.blesse && heros) {
        heros.e.toucher(1, _d.copy(b.a).sub(b.de).normalize());
        secousse = Math.max(secousse, 0.5);
      }
    }
  }
}

function lancerGrenade() {
  if (!heros || !mech) return;
  geste(heros, 'melee', 0.9, 1.3);
  sons.lancerGrenade();
  etatGrenade.de.set(heros.e.position.x, 1.7, heros.e.position.z);
  etatGrenade.a.set(mech.e.position.x, 1.3, mech.e.position.z);
  etatGrenade.t = 0;
  etatGrenade.duree = 1.1;
  etatGrenade.actif = true;
  grenade.visible = true;
}

function majGrenade(dt) {
  if (etatGrenade.actif) {
    etatGrenade.t += dt;
    const u = Math.min(1, etatGrenade.t / etatGrenade.duree);
    grenade.position.lerpVectors(etatGrenade.de, etatGrenade.a, u);
    grenade.position.y += Math.sin(u * Math.PI) * 3;
    grenade.rotation.x += dt * 12;
    if (u >= 1) {
      etatGrenade.actif = false;
      grenade.visible = false;
      exploser(etatGrenade.a);
    }
  }
  // boule de feu, cœur et fumée
  etatBoule.t += dt;
  const t = etatBoule.t;
  const k = t / 1.1;
  boule.visible = k < 1;
  if (boule.visible) {
    boule.scale.setScalar(2 + lisse(Math.min(1, k * 1.8)) * 9);
    boule.material.opacity = Math.min(1, (1 - k) * 1.5);
    boule.material.color.setRGB(1, 0.85 - k * 0.4, 0.7 - k * 0.5);
  }
  coeur.visible = t < 0.35;
  if (coeur.visible) {
    coeur.scale.setScalar(3 + t * 12);
    coeur.material.opacity = 1 - t / 0.35;
  }
  fumees.forEach((f, i) => {
    const kf = (t - 0.15 - i * 0.12) / 3.2;
    f.visible = kf > 0 && kf < 1;
    if (!f.visible) return;
    f.scale.setScalar(3 + lisse(kf) * (7 + i * 2));
    f.position.y = boule.position.y + 0.5 + kf * (3 + i);
    f.material.opacity = Math.sin(kf * Math.PI) * 0.75;
  });
  lumiereExplosion.intensity = Math.max(0, 1 - etatBoule.t / 1.2) * 60;
  lumiereTir.intensity = Math.max(0, lumiereTir.intensity - dt * 120);
}

function exploser(p) {
  boule.position.copy(p).setY(p.y + 0.9);
  coeur.position.copy(boule.position);
  fumees.forEach((f, i) => f.position.set(p.x + (i - 1) * 0.8, p.y, p.z + (i % 2) * 0.6));
  lumiereExplosion.position.copy(p).setY(p.y + 1);
  etatBoule.t = 0;
  effets.etincelles(p, 0xffa040, 90, 10, 1.1, 4, 6);
  effets.etincelles(p, 0xff4a1a, 60, 6, 1.4, 2, 3);
  effets.etincelles(p, 0xffe0a0, 40, 14, 0.6, 3, 9);
  sons.explosion(1);
  secousse = 1.2;
  tempete.frapper();
  if (mech && !mech.e.mort) toucherActeur(mech, 9999, _d.set(0.7, 0, -0.7), _w.copy(p));
}

// ============================================================================================
// Scénario : événements datés (secondes du film)
// ============================================================================================
const HAUT_MEGA = [MEGA.x, MEGA.hauteurAnneau, MEGA.z];
const CUES = [
  // --- Scène 2 : l'arrivée ---
  [15.9, () => {
    heros = new Acteur('heros', -5.5, 26, { angle: Math.PI });
    heros.aller([[-5.5, 14], [-1.5, 5.5]], 1.55);
  }],
  [31.5, () => heros.regarder(HAUT_MEGA[0], 60, HAUT_MEGA[2])], // lève les yeux vers la Mégastructure
  [34, () => heros.regarder(0, 0, -30)],
  // --- Scène 3 : l'embuscade ---
  [38.5, () => sons.alerte()],
  [38.7, () => heros.attitude('alerte').regarder(-6, 0, -20)],
  [41.2, () => { s1 = new Acteur('soldat', -7, -20, { apparition: true }).fixer(heros); }],
  [41.6, () => { s2 = new Acteur('soldat', 7, -21, { apparition: true }).fixer(heros); }],
  [42.0, () => { s3 = new Acteur('soldat', 2, -25, { apparition: true }).fixer(heros); }],
  [42.6, () => {
    t1 = new Acteur('tireur', -15, -9, { apparition: true }).fixer(heros);
    t2 = new Acteur('tireur', 15, -7, { apparition: true }).fixer(heros);
  }],
  [43.6, () => { for (const a of [s1, s2, s3, t1, t2]) { a.attitude('alerte'); a.e.alerter(); } heros.fixer(s1); }],
  [49, () => { for (const a of [s1, s2, s3]) a.attitude('poursuite', true); for (const a of [t1, t2]) a.attitude('poursuite', true); }],
  // --- Scène 4 : le combat ---
  [51.5, () => s3.aller([[5.5, -17], [3.6, 3.2], [-0.2, 4.5]], 3.6)],
  [52, () => {
    heros.attitude('poursuite', true);
    s1.aller([[-3.5, -6], [-2.2, 2.6]], 4.2);
    s2.aller([[4.5, -8], [1.8, 2.8]], 4.0);
    t1.aller([[-14, -4], [-15, -8], [-14, -3]], 1.4);
    t2.aller([[14, -2], [15, -7], [14, -2]], 1.4);
  }],
  ...rafale(52.9, () => s1, 6),
  ...rafale(54.6, () => s2, 6),
  [56.3, () => tirEnnemi(t2, heros.e.position.x + 0.7, 1.7, heros.e.position.z - 0.5)],
  [57.3, () => { tirEnnemi(t1, heros.e.position.x - 0.8, 1.2, heros.e.position.z + 0.4); heros.fixer(t1); }],
  ...rafale(58.0, () => t1, 5),
  [58.9, () => tirEnnemi(t2, heros.e.position.x + 0.5, 0.6, heros.e.position.z - 1.2)],
  [59.6, () => heros.fixer(s3)],
  [60.5, () => { if (s3 && !s3.e.mort) { s3.e.etat = 'attaque'; s3.e.timer = 0.4; } }],
  [60.9, () => { heros.e.toucher(1, _d.set(-0.6, 0, 0.8)); sons.coup(); secousse = 0.8; }],
  ...rafale(61.4, () => s3, 4),
  [62.0, () => heros.fixer(t2)],
  [63.0, () => tirEnnemi(t2, heros.e.position.x - 0.6, 1.5, heros.e.position.z + 0.3)],
  [63.9, () => tirEnnemi(t2, heros.e.position.x + 0.4, 1.9, heros.e.position.z - 0.2, true)],
  ...rafale(64.6, () => t2, 6),
  [65.6, () => heros.attitude('alerte').regarder(0, 0, -25)],
  // --- La tempête et le mech ---
  [67, () => tempete.demarrer()],
  [67.3, () => {
    mech = new Acteur('brute', 7, -27, { angle: 0, apparition: true });
    mech.attitude('poursuite', true).fixer(heros).aller([[6.5, -14], [5.2, -3], [4.6, 1.5]], 2.5);
    sons.alerte(true);
  }],
  [68.5, () => heros.attitude('poursuite', true).fixer(mech)],
  [72.5, () => sons.alerte(true)],
  ...rafale(76.6, () => mech, 6, { degats: 6, achever: false }),
  ...rafale(78.4, () => mech, 6, { degats: 6, achever: false }),
  [79.2, () => heros.aller([[-3, 8.6]], 1.1)],
  [80.4, () => { mech.e.etat = 'attaque'; mech.e.timer = 0.4; sons.alerte(true); }],
  ...rafale(81.2, () => mech, 5, { degats: 6, achever: false }),
  [83.6, () => { mech.e.etat = 'attaque'; mech.e.timer = 0.4; sons.coup(); secousse = 0.6; }],
  [85.0, lancerGrenade],
  // --- Après l'explosion ---
  [89.5, () => tempete.arreter()],
  [90.5, () => heros.attitude('alerte').regarder(3.6, 0, 2)],
  [93.5, () => heros.attitude('patrouille').regarder(HAUT_MEGA[0], 40, HAUT_MEGA[2])],
];
CUES.sort((a, b) => a[0] - b[0]);

/** Ralenti au moment de l'explosion (le temps de la scène ralentit, pas la musique). */
function vitesseSimulation(T) {
  if (T < 86.1 || T > 88.6) return 1;
  if (T < 86.4) return 1 - (T - 86.1) / 0.3 * 0.72;
  if (T > 88.0) return 0.28 + (T - 88.0) / 0.6 * 0.72;
  return 0.28;
}

// ============================================================================================
// Plans (caméra). fn(u, tl, dt) place camPos / camCible et renvoie le champ vertical (16:9).
// ============================================================================================
function suivre(acteur, dx, dy, dz, cx, cy, cz) {
  const p = acteur.e.position;
  camPos.set(p.x + dx, dy, p.z + dz);
  camCible.set(p.x + cx, cy, p.z + cz);
}
function pointHeros(sortie, y = 1.5) {
  return heros ? sortie.set(heros.e.position.x, y, heros.e.position.z) : sortie.set(-1.5, y, 5.5);
}

const PLANS = [
  // Scène 1 — prologue : grand panoramique vers la Mégastructure, puis l'avant-poste
  { d: 0, f: 9, fn(u) {
    const k = lisse(u);
    melange(camPos, [-150, 62, 140], [-100, 50, 78], k);
    melange(camCible, [0, 40, -300], [25, 110, -440], k);
    return 50;
  } },
  { d: 9, f: 16, fn(u) {
    const k = lisse(u);
    melange(camPos, [52, 28, 70], [34, 17, 44], k);
    melange(camCible, [0, 3, 0], [-2, 4, -14], k);
    return 48;
  } },
  // Scène 2 — l'arrivée
  { d: 16, f: 21, fn() { if (heros) suivre(heros, 0.9, 1.75, 3.0, 0, 1.4, -8); return 55; } },
  { d: 21, f: 27, fn() { if (heros) suivre(heros, 1.1, 0.7, -3.3, 0, 1.45, 0); return 44; } },
  { d: 27, f: 36, init() { pointHeros(suiviLisse, 1.2); }, fn(u, tl, dt) {
    const k = lisse(u);
    melange(camPos, [11, 2.2, 15], [13, 8.5, 18], k);
    pointHeros(_v, 1.2);
    suiviLisse.lerp(_v, 1 - Math.exp(-3 * dt));
    camCible.copy(suiviLisse);
    return 46;
  } },
  // Scène 3 — l'embuscade
  { d: 36, f: 41, fn(u) {
    pointHeros(_v, 0);
    camPos.set(_v.x + 0.75 + u * 0.2, 1.62, _v.z - 1.25);
    camCible.set(_v.x, 1.6, _v.z);
    return 34;
  } },
  { d: 41, f: 46, fn(u) {
    const k = lisse(u);
    pointHeros(_v, 0);
    camPos.set(_v.x + 1.7 - k * 0.3, 3.1 - k * 0.2, _v.z + 3.6 - k * 0.6);
    camCible.set(0, 0.9, -18);
    return 38;
  } },
  { d: 46, f: 52, fn(u) {
    if (!s1) return 35;
    const p = s1.e.position;
    pointHeros(_w, 0);
    _d.set(_w.x - p.x, 0, _w.z - p.z).normalize();
    camPos.set(p.x + _d.x * (1.6 - u * 0.3) - _d.z * 0.5, 1.12, p.z + _d.z * (1.6 - u * 0.3) + _d.x * 0.5);
    camCible.set(p.x, 1.62, p.z);
    return 34;
  } },
  // Scène 4 — le combat : vue subjective
  { d: 52, f: 57, pov: true, init() { s1?.torse(viseeLissee); }, fn(u, tl, dt) {
    pointHeros(camPos, 1.62);
    let cible = null;
    if (s1 && !s1.e.mort && tl < 2.4) cible = s1;
    else if (s2 && !s2.e.mort && tl < 4) cible = s2;
    if (cible) cible.torse(_v);
    else if (t2) t2.torse(_v);
    viseeLissee.lerp(_v, 1 - Math.exp(-7 * dt));
    camCible.copy(viseeLissee);
    return 62;
  } },
  { d: 57, f: 62.5, main: 1, fn(u) {
    pointHeros(_v, 0);
    camPos.set(_v.x - 3.2 + u * 0.6, 1.9, _v.z + 3.4);
    camCible.set(_v.x + 2, 1.0, _v.z - 8);
    return 55;
  } },
  { d: 62.5, f: 67, main: 0.6, fn(u) {
    pointHeros(_v, 0);
    const a = 0.5 + lisse(u) * 1.1;
    camPos.set(_v.x + Math.sin(a) * 3.6, 1.45, _v.z + Math.cos(a) * 3.6);
    camCible.set(_v.x, 1.35, _v.z);
    return 45;
  } },
  { d: 67, f: 76, init() { suiviLisse.set(7, 2, -27); }, fn(u, tl, dt) {
    camPos.set(1.4, 0.35 + u * 0.15, -2.6 - u * 1.2);
    if (mech) mech.torse(_v).setY(2.2); else _v.set(7, 2, -27);
    suiviLisse.lerp(_v, 1 - Math.exp(-3 * dt));
    camCible.copy(suiviLisse);
    return 46;
  } },
  // Scène 5 — la tempête
  { d: 76, f: 81, main: 1, fn(u) {
    pointHeros(_v, 0);
    camPos.set(_v.x - 1.6, 2.3, _v.z + 4.4 - u * 0.6);
    if (mech) mech.torse(camCible); else camCible.set(3, 1.5, 0);
    camCible.lerp(_v.setY(1.4), 0.35);
    return 52;
  } },
  { d: 81, f: 85.7, main: 0.5, fn(u) {
    pointHeros(_v, 0);
    if (mech) _d.set(mech.e.position.x - _v.x, 0, mech.e.position.z - _v.z).normalize(); else _d.set(1, 0, -1).normalize();
    camPos.set(_v.x + _d.x * 2.1 - _d.z * 0.75, 1.55, _v.z + _d.z * 2.1 + _d.x * 0.75);
    camCible.set(_v.x, 1.5, _v.z);
    return 36 - u * 5;
  } },
  { d: 85.7, f: 91, fn(u) {
    camPos.set(-9.6 + u * 0.6, 4.6 - u * 0.5, 15.6 - u * 0.6);
    camCible.set(1.6, 1.3, 3.8);
    return 48;
  } },
  { d: 91, f: 98, fn(u) {
    pointHeros(_v, 0);
    const a = 2.3 + lisse(u) * 0.9;
    camPos.set(_v.x + Math.sin(a) * 4.5, 1.6 + u * 0.6, _v.z + Math.cos(a) * 4.5);
    camCible.set(_v.x, 1.4, _v.z);
    return 42;
  } },
  // Scène 6 — épilogue : la caméra s'élève vers la Mégastructure
  { d: 98, f: DUREE, fn(u, tl) {
    const k = lisse(Math.min(1, tl / 10));
    pointHeros(_v, 0);
    melange(camPos, [_v.x + 2.6, 1.6, _v.z + 4.2], [14, 30, 46], k);
    melange(camCible, [_v.x, 1.5, _v.z], HAUT_MEGA, lisse(Math.min(1, tl / 10) ** 1.4));
    return 46 + k * 6;
  } },
];

// ============================================================================================
// Textes à l'écran. type : narration (centre), titre, chapitre (carton), replique (sous-titre)
// ============================================================================================
const TEXTES = [
  { d: 1.5, f: 6.6, type: 'narration', html: 'Aux confins du monde connu…' },
  { d: 4.4, f: 8.8, type: 'narration bas', html: '…la Mégastructure Nexus veille sur la dernière frontière.' },
  { d: 9.4, f: 15.2, type: 'titre', html: `<svg class="logo"><use href="#logo"/></svg>
      <h1><span class="nexus">NEXUS</span><span class="frontier">FRONTIER</span></h1>
      <p class="sous-titre">Le film</p>` },
  { d: 16.6, f: 20.4, type: 'chapitre', html: '<b>I</b> L’arrivée' },
  { d: 17.2, f: 21, type: 'replique', html: '<span class="qui">Sergente Kaï Varga</span> éclaireuse de l’avant-poste Nexus' },
  { d: 21.8, f: 25.6, type: 'replique', html: '<span class="qui">Varga</span> Base, ici Varga. J’arrive à l’avant-poste.' },
  { d: 26.2, f: 30.6, type: 'replique radio', html: '<span class="qui">Base · radio</span> Reçu. Plus aucun signal depuis trois jours… Prudence.' },
  { d: 31.6, f: 35, type: 'replique', html: '<span class="qui">Varga</span> Personne. Pas un bruit…' },
  { d: 36.6, f: 40.2, type: 'chapitre', html: '<b>II</b> L’embuscade' },
  { d: 43.9, f: 46, type: 'replique', html: '<span class="qui">Varga</span> Embuscade !' },
  { d: 47.2, f: 51.4, type: 'replique', html: '<span class="qui">Varga</span> Base ! Contact, plusieurs hostiles !' },
  { d: 52.2, f: 55.4, type: 'chapitre', html: '<b>III</b> Le combat' },
  { d: 65.6, f: 67.6, type: 'replique', html: '<span class="qui">Varga</span> Zone dégagée… ?' },
  { d: 69.6, f: 74, type: 'replique', html: '<span class="qui">Varga</span> Un mech-araignée… et la Tempête Nexus avec lui.' },
  { d: 76.3, f: 79.8, type: 'chapitre', html: '<b>IV</b> La tempête' },
  { d: 81.6, f: 84.8, type: 'replique', html: '<span class="qui">Varga</span> Allez… approche encore un peu.' },
  { d: 92.2, f: 96.6, type: 'replique', html: '<span class="qui">Varga</span> Base, ici Varga. L’avant-poste est sécurisé.' },
  { d: 98.4, f: 101.6, type: 'chapitre', html: '<b>V</b> Épilogue' },
  { d: 98.8, f: 102.8, type: 'replique radio', html: '<span class="qui">Base · radio</span> Bien reçu, Varga. Tiens la frontière.' },
  { d: 103.2, f: 107.4, type: 'narration', html: 'La frontière tient.<br><span class="petit">Pour l’instant…</span>' },
];
for (const t of TEXTES) {
  const div = document.createElement('div');
  div.className = `texte ${t.type}`;
  div.innerHTML = t.html;
  div.style.opacity = '0';
  el.textes.appendChild(div);
  t.el = div;
  t.affiche = -1;
}

// Fondus au noir : [début, fin, opacité de départ, opacité d'arrivée]
const FONDUS = [
  [0, 1.5, 1, 0], [15.1, 16, 0, 1], [16, 16.8, 1, 0], [35.2, 36, 0, 1], [36, 36.8, 1, 0],
  [97.2, 98, 0, 1], [98, 98.8, 1, 0], [106.8, DEBUT_GENERIQUE, 0, 1], [DEBUT_GENERIQUE, DUREE + 10, 1, 1],
];
function opaciteNoir(T) {
  for (const [a, b, de, vers] of FONDUS) if (T >= a && T < b) return de + (vers - de) * lisse((T - a) / (b - a));
  return 0;
}

// ============================================================================================
// Lecture
// ============================================================================================
let etat = 'accueil'; // accueil | lecture | pause | fin
let T = 0;
let prochaineCue = 0;
let planCourant = null;
let secousse = 0;
let musique = null;
let muet = false;

function reinitialiser() {
  for (const a of acteurs) a.e.detruire();
  acteurs.length = 0;
  heros = s1 = s2 = s3 = t1 = t2 = mech = null;
  for (const b of bolts) { b.actif = false; b.mesh.visible = false; }
  etatGrenade.actif = false;
  grenade.visible = false;
  etatBoule.t = 9;
  effets.vider();
  tempete.reinitialiser();
  armes.support.visible = false;
  T = 0;
  prochaineCue = 0;
  planCourant = null;
  secousse = 0;
  for (const t of TEXTES) { t.affiche = -1; t.el.style.opacity = '0'; }
  el.generique.style.visibility = 'hidden';
  musique?.reinitialiser();
}

function lancer({ son = true } = {}) {
  if (son) {
    initAudio();
    const audio = contexteAudio();
    if (audio && !musique) musique = new Musique(audio.ctx, audio.maitre);
    if (audio) audio.maitre.gain.value = muet ? 0 : 0.45;
  }
  reinitialiser();
  etat = 'lecture';
  el.accueil.classList.add('cache');
  el.fin.classList.add('cache');
  document.body.classList.add('en-lecture');
  majBoutons();
  montrerControles();
  qualite.reprise();
}

function pause(oui) {
  if (etat !== 'lecture' && etat !== 'pause') return;
  etat = oui ? 'pause' : 'lecture';
  const audio = contexteAudio();
  if (audio) (oui ? audio.ctx.suspend() : audio.ctx.resume()).catch(() => {});
  majBoutons();
  montrerControles();
  besoinRendu = true;
}

function finir() {
  etat = 'fin';
  el.fin.classList.remove('cache');
  document.body.classList.remove('en-lecture');
  majBoutons();
}

function majBoutons() {
  const lecture = etat === 'lecture';
  el.lecture.textContent = lecture ? '❚❚' : '▶';
  el.lecture.setAttribute('aria-label', lecture ? 'Pause' : 'Lecture');
  el.son.textContent = muet ? '🔇' : '🔊';
  el.son.setAttribute('aria-label', muet ? 'Remettre le son' : 'Couper le son');
  document.body.classList.toggle('en-pause', etat === 'pause');
}

/** Une image de film : événements, acteurs, effets, caméra, textes. */
function etape(dtFilm) {
  if (dtFilm > 0) T += dtFilm;
  while (prochaineCue < CUES.length && CUES[prochaineCue][0] <= T) CUES[prochaineCue++][1]();
  const dt = dtFilm * vitesseSimulation(T);

  for (let i = acteurs.length - 1; i >= 0; i--) acteurs[i]?.update(dt);
  majBolts(dt);
  majGrenade(dt);
  effets.update(dt);
  tempete.update(dt);
  monde.update(dt);
  secousse = Math.max(0, secousse - dtFilm * 1.6);

  placerCamera(dtFilm);
  armes.update(dt, joueurFictif);
  majTextes();
  el.fondu.style.opacity = opaciteNoir(T).toFixed(3);
  majGenerique();
  majProgression();
  if (musique) musique.planifier(T, tempete.k);
  if (T >= DUREE && etat === 'lecture') finir();
}

function placerCamera(dt) {
  let plan = PLANS[PLANS.length - 1];
  for (const p of PLANS) if (T >= p.d && T < p.f) { plan = p; break; }
  if (plan !== planCourant) {
    planCourant = plan;
    plan.init?.();
    const pov = !!plan.pov;
    armes.support.visible = pov;
    if (heros) heros.e.groupe.visible = !pov;
  }
  const tl = T - plan.d;
  const fov = plan.fn(clamp(tl / (plan.f - plan.d), 0, 1), tl, dt) ?? 50;
  // caméra à l'épaule (légère dérive) + secousses (coups, explosion)
  const main = plan.main ?? 0.25;
  camPos.x += Math.sin(T * 1.3) * 0.025 * main;
  camPos.y += Math.sin(T * 1.9 + 1) * 0.02 * main;
  if (secousse > 0) {
    const s = secousse * secousse * 0.12;
    camPos.x += (Math.random() - 0.5) * s;
    camPos.y += (Math.random() - 0.5) * s;
    camCible.x += (Math.random() - 0.5) * s * 2;
  }
  camera.position.copy(camPos);
  camera.lookAt(camCible);
  // même champ horizontal qu'en 16:9, quel que soit le format de l'écran
  const tanH = Math.tan(THREE.MathUtils.degToRad(fov / 2)) * 16 / 9;
  camera.fov = clamp(THREE.MathUtils.radToDeg(2 * Math.atan(tanH / aspectImage)), 18, 100);
  camera.updateProjectionMatrix();
}

/** Générique de fin : défile de bas en haut, au rythme du temps du film. */
function majGenerique() {
  const actif = T >= DEBUT_GENERIQUE;
  el.generique.style.visibility = actif ? 'visible' : 'hidden';
  if (!actif) return;
  const p = Math.min(1, (T - DEBUT_GENERIQUE) / (DUREE - DEBUT_GENERIQUE - 0.4));
  const H = innerHeight, h = el.generique.offsetHeight;
  el.generique.style.transform = `translateY(${(H - p * (H + h)).toFixed(1)}px)`;
}

const FONDU_TEXTE = 0.5;
function majTextes() {
  for (const t of TEXTES) {
    let o = 0;
    if (T >= t.d && T < t.f) o = Math.min(1, (T - t.d) / FONDU_TEXTE, (t.f - T) / FONDU_TEXTE);
    o = Math.round(o * 50) / 50;
    if (o !== t.affiche) {
      t.affiche = o;
      t.el.style.opacity = String(o);
      t.el.style.visibility = o > 0 ? 'visible' : 'hidden';
    }
  }
}

const format = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
let secondeAffichee = -1;
function majProgression() {
  el.barre.style.transform = `scaleX(${Math.min(1, T / DUREE).toFixed(4)})`;
  const s = Math.floor(T);
  if (s !== secondeAffichee) {
    secondeAffichee = s;
    el.temps.textContent = `${format(Math.min(T, DUREE))} / ${format(DUREE)}`;
  }
}

/** Avant le lancement : lent travelling au-dessus de l'avant-poste. */
let tempsAccueil = 0;
function cameraAccueil(dt) {
  tempsAccueil += dt;
  const a = Math.sin(tempsAccueil * 0.05);
  camera.position.set(-130 + a * 25, 58, 115 - a * 15);
  camera.lookAt(15 + a * 10, 80, -400);
  const tanH = Math.tan(THREE.MathUtils.degToRad(25)) * 16 / 9;
  camera.fov = clamp(THREE.MathUtils.radToDeg(2 * Math.atan(tanH / aspectImage)), 18, 100);
  camera.updateProjectionMatrix();
}

let rendu = true; // (tests) false : le film tourne sans être dessiné
function rendre() {
  if (!rendu) return;
  // générique : écran noir, inutile de dessiner la scène
  if (Number(el.fondu.style.opacity) >= 0.999 && etat !== 'accueil') return;
  post.rendre(scene, camera);
}

// ---------- Boucle ----------
const horloge = new THREE.Clock();
let dtMax = 0.05; // delta borné (évite les sauts après un onglet en pause)
function boucle() {
  const dtReel = horloge.getDelta();
  const dt = Math.min(dtReel, dtMax);
  qualite.mesurer(dtReel, etat === 'lecture' && !document.hidden);
  if (etat === 'accueil' || etat === 'fin') {
    if (etat === 'accueil') {
      cameraAccueil(dt);
      monde.update(dt);
    }
    rendre();
    return;
  }
  if (etat === 'pause') {
    if (besoinRendu) { placerCamera(0); rendre(); besoinRendu = false; }
    return;
  }
  etape(dt);
  rendre();
}
if (!CAPTURE) renderer.setAnimationLoop(boucle);

document.addEventListener('visibilitychange', () => { if (document.hidden && etat === 'lecture') pause(true); });

// ---------- Commandes ----------
let minuteurControles = 0;
function montrerControles() {
  el.controles.classList.add('visible');
  document.body.classList.remove('sans-curseur');
  clearTimeout(minuteurControles);
  if (etat === 'lecture') {
    minuteurControles = setTimeout(() => {
      el.controles.classList.remove('visible');
      document.body.classList.add('sans-curseur');
    }, 2800);
  }
}

function basculerPleinEcran() {
  try {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else {
      Promise.resolve(document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }))
        .then(() => { if (estTactile) return screen.orientation?.lock?.('landscape'); })
        .catch(() => {});
    }
  } catch { /* plein écran indisponible */ }
}
if (!document.fullscreenEnabled) el.plein.classList.add('cache');

function basculerSon() {
  muet = !muet;
  const audio = contexteAudio();
  if (audio) audio.maitre.gain.value = muet ? 0 : 0.45;
  majBoutons();
}

el.lancer.addEventListener('click', () => {
  lancer();
  if (estTactile) basculerPleinEcran();
});
el.revoir.addEventListener('click', () => lancer());
el.lecture.addEventListener('click', () => {
  if (etat === 'fin') lancer();
  else pause(etat === 'lecture');
});
el.recommencer.addEventListener('click', () => lancer());
el.son.addEventListener('click', basculerSon);
el.plein.addEventListener('click', basculerPleinEcran);

// Toucher / souris sur l'image : affiche les commandes (au tactile) ou met en pause (clic souris)
el.scene.addEventListener('pointerdown', (e) => {
  if (etat !== 'lecture' && etat !== 'pause') return;
  if (e.pointerType === 'mouse') pause(etat === 'lecture');
  else if (el.controles.classList.contains('visible') && etat === 'lecture') {
    el.controles.classList.remove('visible');
    clearTimeout(minuteurControles);
  } else montrerControles();
});
addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') montrerControles(); });
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Space' || e.code === 'KeyK') {
    e.preventDefault();
    if (etat === 'accueil') { if (!el.lancer.disabled) lancer(); }
    else if (etat === 'fin') lancer();
    else pause(etat === 'lecture');
  } else if (e.code === 'KeyR' && etat !== 'accueil') lancer();
  else if (e.code === 'KeyF') basculerPleinEcran();
  else if (e.code === 'KeyM') basculerSon();
  else return;
  montrerControles();
});

// ---------- Chargement des modèles 3D ----------
chargerModeles().then(() => {
  armes.utiliserModeles();
  armes.adapterEcran(aspectImage);
  el.lancer.disabled = false;
  el.lancer.textContent = '▶ Lancer le film';
  el.chargement.classList.add('cache');
});

// ---------- Accès de test ----------
if (DEBUG || CAPTURE) {
  window.film = {
    get t() { return T; },
    get etat() { return etat; },
    get acteurs() { return acteurs.map((a) => ({ type: a.e.type, mort: a.e.mort, x: a.e.position.x, z: a.e.position.z })); },
    get plan() { return PLANS.indexOf(planCourant); },
    lancer, pause, scene, camera, renderer, tempete, qualite, contexteAudio,
    pret: () => !el.lancer.disabled,
    set rendu(oui) { rendu = oui; },
    /** (enregistrement du son) delta maximal plus large : le film suit exactement l'horloge. */
    set dtMax(s) { dtMax = s; },
    /** Avance le film de `s` secondes sans dessiner (tests rapides). */
    avancer(s, pas = 1 / 30) { for (let x = 0; x < s; x += pas) etape(pas); },
    /** Capture : avance d'une image et la dessine. */
    image(dt = 1 / 30) { etape(dt); rendre(); },
  };
}
