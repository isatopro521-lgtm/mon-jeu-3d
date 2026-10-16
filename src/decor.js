import * as THREE from 'three';
import { aleatoire, fbm, bruit2D, lisse, Assemblage } from './utils.js';
import {
  textureSol, textureBeton, textureNormalesEau, textureCascade, textureBanniere,
} from './textures.js';

// Décor autour de l'arène (purement visuel, aucune collision) :
// terrain vallonné, montagnes enneigées, forêt de sapins, buissons rouges, rochers moussus,
// lac avec cascade, avant-postes industriels, antennes et mégastructure en anneau.

// ---------- Placement des grands éléments (vue de départ : vers -z) ----------
const LAC = { x: 48, z: -74, rx: 46, rz: 30, niveau: -8.6 };
const PLATEAU = { zBord: -106, xMin: 14, xMax: 130, hauteur: 2 };
const VALLEE = -8.3; // l'arène est sur un promontoire : le terrain descend tout autour
const CASCADE = { x: 58, largeur: 9 };
const AVANT_POSTES = [
  { x: -52, z: -72, rayon: 24 },  // à gauche, près de la grande bannière
  { x: 98, z: -116, rayon: 22 },  // à droite, sur le plateau derrière le lac
  { x: 30, z: -114, rayon: 14 },  // à gauche de la cascade
];
export const MEGA = { x: 30, z: -520, hauteurAnneau: 250, rayonAnneau: 165 };

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();

/** Hauteur du terrain extérieur en (x, z). L'arène (|x|,|z| < 34) reste plate. */
export function hauteurTerrain(x, z) {
  const carre = Math.max(Math.abs(x), Math.abs(z));
  const r = Math.hypot(x, z);
  let h = -0.05 + VALLEE * lisse(34, 78, carre);
  const relief = (fbm(x / 95 + 3, z / 95 - 7, 4) - 0.38) * 26 + (fbm(x / 30, z / 30, 3) - 0.5) * 3;
  h += Math.max(-1, relief) * lisse(40, 130, carre) + lisse(150, 320, r) * 22;

  // plateau rocheux derrière le lac (d'où tombe la cascade)
  const p = lisse(PLATEAU.zBord + 4, PLATEAU.zBord - 6, z) *
    lisse(PLATEAU.xMin - 6, PLATEAU.xMin + 6, x) * lisse(PLATEAU.xMax + 8, PLATEAU.xMax - 4, x);
  h = h * (1 - p) + (PLATEAU.hauteur + (fbm(x / 20, z / 20, 2) - 0.5) * 1.5) * p;

  // rive en pente douce autour du lac, puis cuvette sous l'eau
  const d = ((x - LAC.x) / LAC.rx) ** 2 + ((z - LAC.z) / LAC.rz) ** 2;
  const rive = 1 - lisse(1.5, 2.6, d);
  h = h * (1 - rive) + (LAC.niveau + 0.45 + (d - 1) * 0.6) * rive;
  const fond = 1 - lisse(0.8, 1.06, d);
  h = h * (1 - fond) + (LAC.niveau - 2.2) * fond;

  // avant-postes posés sur un sol plat
  for (const a of AVANT_POSTES) {
    const k = lisse(a.rayon, a.rayon * 0.7, Math.hypot(x - a.x, z - a.z));
    const base = a.z < PLATEAU.zBord - 4 && a.x > PLATEAU.xMin ? PLATEAU.hauteur : VALLEE - 0.2;
    h = h * (1 - k) + base * k;
  }
  return h;
}

function dansLac(x, z, marge = 1.2) {
  return ((x - LAC.x) / LAC.rx) ** 2 + ((z - LAC.z) / LAC.rz) ** 2 < marge;
}
// Emplacements occupés près de l'arène : bannière, miradors, conteneurs
const OCCUPES = [
  [-37, -37, 4.5], [-33.2, -33.2, 3], [33.2, -33.2, 3], [33.2, 33.2, 3], [-33.2, 33.2, 3],
  [-34.3, 13, 5.5], [34.3, 17, 6], [15, 34.3, 6.5], [-11, -34.3, 6.5],
];
function dansAvantPoste(x, z, marge = 0) {
  return AVANT_POSTES.some((a) => Math.hypot(x - a.x, z - a.z) < a.rayon + marge) ||
    OCCUPES.some(([ox, oz, r]) => Math.hypot(x - ox, z - oz) < r);
}

/**
 * Maillage polaire (anneaux × secteurs) découpé en `parts` morceaux angulaires partageant les mêmes
 * sommets : les normales restent continues, et chaque morceau hors du champ de la caméra n'est pas dessiné.
 */
function maillagePolaire(geo, anneaux, secteurs, parts, materiau) {
  const L = secteurs + 1;
  const groupe = new THREE.Group();
  const P = geo.attributes.position;
  const boite = new THREE.Box3(), v = new THREE.Vector3();
  for (let k = 0; k < parts; k++) {
    const idx = [];
    boite.makeEmpty();
    const j0 = Math.floor(k * secteurs / parts), j1 = Math.floor((k + 1) * secteurs / parts);
    for (let i = 0; i < anneaux; i++) {
      for (let j = j0; j < j1; j++) {
        const a = i * L + j, b = a + L;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    for (let i = 0; i <= anneaux; i++) for (let j = j0; j <= j1; j++) boite.expandByPoint(v.fromBufferAttribute(P, i * L + j));
    const g = new THREE.BufferGeometry();
    for (const [nom, attr] of Object.entries(geo.attributes)) g.setAttribute(nom, attr);
    g.setIndex(idx);
    g.boundingBox = boite.clone();
    g.boundingSphere = boite.getBoundingSphere(new THREE.Sphere());
    groupe.add(new THREE.Mesh(g, materiau));
  }
  return groupe;
}

// ---------- Terrain ----------
function creerTerrain(qualite) {
  const anneaux = qualite === 'haute' ? 72 : 48;
  const secteurs = qualite === 'haute' ? 160 : 112;
  const R0 = 24, R1 = 600;
  const pos = [], col = [], uv = [], idx = [];
  const herbe = new THREE.Color(0x6f7838), herbeSombre = new THREE.Color(0x3d5428),
    terre = new THREE.Color(0x705638), roche = new THREE.Color(0x77736b), rive = new THREE.Color(0x8a8068);
  for (let i = 0; i <= anneaux; i++) {
    const r = R0 + (i / anneaux) ** 2 * (R1 - R0);
    for (let j = 0; j <= secteurs; j++) {
      const a = j / secteurs * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = hauteurTerrain(x, z);
      pos.push(x, h, z);
      uv.push(x / 7, z / 7);
      const pente = Math.abs(hauteurTerrain(x + 1.5, z) - h) + Math.abs(hauteurTerrain(x, z + 1.5) - h);
      _c.copy(herbe).lerp(herbeSombre, lisse(0.35, 0.7, fbm(x / 25, z / 25, 3)));
      _c.lerp(terre, lisse(0.55, 0.75, fbm(x / 14 + 9, z / 14, 3)) * 0.8);
      _c.lerp(roche, lisse(0.8, 2.2, pente));
      if (dansLac(x, z, 1.6)) _c.lerp(rive, 0.7);
      col.push(_c.r, _c.g, _c.b);
    }
  }
  const L = secteurs + 1;
  for (let i = 0; i < anneaux; i++) {
    for (let j = 0; j < secteurs; j++) {
      const a = i * L + j, b = a + L;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const map = textureSol();
  const terrain = maillagePolaire(geo, anneaux, secteurs, 8, new THREE.MeshLambertMaterial({ map, vertexColors: true }));
  terrain.children.forEach((m) => { m.receiveShadow = true; });
  return terrain;
}

// ---------- Montagnes enneigées ----------
function creerMontagnes(qualite) {
  const anneaux = qualite === 'haute' ? 40 : 28;
  const secteurs = qualite === 'haute' ? 256 : 176;
  const R0 = 480, R1 = 1300;
  const pos = [], col = [], idx = [];
  const foret = new THREE.Color(0x24382e), roche = new THREE.Color(0x4f525e), rocheClaire = new THREE.Color(0x7d7c88),
    neige = new THREE.Color(0xf4f6fb);
  for (let i = 0; i <= anneaux; i++) {
    const t = i / anneaux;
    const r = R0 + t * (R1 - R0);
    for (let j = 0; j <= secteurs; j++) {
      const a = j / secteurs * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      // crêtes : bruit « ridged » (arêtes vives)
      const n = 1 - Math.abs(fbm(x / 260 + 50, z / 260, 4) * 2 - 1);
      const n2 = fbm(x / 90, z / 90, 3);
      const enveloppe = lisse(0, 0.18, t);
      // un peu plus bas sous la mégastructure pour la laisser voir
      const dMega = Math.hypot(x - MEGA.x, z - MEGA.z);
      const creux = 1 - 0.35 * lisse(260, 60, dMega);
      let h = enveloppe * (25 + (n ** 3) * 270 + n2 * 45) * (0.7 + t * 0.6) * creux + hauteurTerrain(x, z) * (1 - enveloppe);
      if (t === 0) h = hauteurTerrain(x, z) - 1;
      pos.push(x, h, z);
      const limiteNeige = 150 + (bruit2D(x / 40, z / 40) - 0.5) * 70;
      _c.copy(foret).lerp(roche, lisse(25, 70, h));
      _c.lerp(rocheClaire, lisse(70, 160, h) * 0.7 * n2);
      _c.lerp(neige, lisse(limiteNeige - 12, limiteNeige + 12, h) * (0.75 + n2 * 0.4));
      col.push(_c.r, _c.g, _c.b);
    }
  }
  const L = secteurs + 1;
  for (let i = 0; i < anneaux; i++) {
    for (let j = 0; j < secteurs; j++) {
      const a = i * L + j, b = a + L;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return maillagePolaire(geo, anneaux, secteurs, 8, new THREE.MeshLambertMaterial({ vertexColors: true }));
}

// ---------- Végétation et rochers (InstancedMesh) ----------
function geoSapin() {
  // profil en dents de scie : 4 étages de branches
  const pts = [new THREE.Vector2(0.001, 0)];
  const etages = [[0.5, 0.1, 0.42], [0.38, 0.4, 0.72], [0.24, 0.68, 1.0]];
  for (const [rayon, bas, haut] of etages) {
    pts.push(new THREE.Vector2(rayon, bas), new THREE.Vector2(rayon * 0.35, bas + 0.02));
    if (haut === 1) pts.push(new THREE.Vector2(0.001, 1));
    else pts.push(new THREE.Vector2(rayon * 0.3, haut - 0.12));
  }
  return new THREE.LatheGeometry(pts, 6);
}

function geoRocher() {
  const g = new THREE.DodecahedronGeometry(1, 1);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 0.75 + bruit2D(v.x * 2 + v.z, v.y * 2 + 3) * 0.5;
    v.multiplyScalar(k);
    if (v.y < 0) v.y *= 0.4;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  // mousse sur le dessus (couleur de sommet selon la normale)
  const n = g.attributes.normal;
  const col = [];
  const pierre = new THREE.Color(0x77746c), mousse = new THREE.Color(0x4a5a2a);
  for (let i = 0; i < n.count; i++) {
    _c.copy(pierre).lerp(mousse, lisse(0.35, 0.8, n.getY(i)));
    col.push(_c.r, _c.g, _c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/** Remplit une InstancedMesh : `placer(i)` renvoie [x, y, z, échelleXZ, échelleY, rotY, couleur] ou null. */
function remplir(mesh, n, placer) {
  let k = 0;
  for (let essai = 0; essai < n * 6 && k < n; essai++) {
    const res = placer(k);
    if (!res) continue;
    const [x, y, z, sxz, sy, ry, couleur, rx = 0] = res;
    _p.set(x, y, z);
    _q.setFromEuler(_e.set(rx, ry, rx * 0.5));
    _s.set(sxz, sy, sxz);
    mesh.setMatrixAt(k, _m.compose(_p, _q, _s));
    if (couleur !== undefined && mesh.instanceColor !== undefined) mesh.setColorAt(k, _c.set(couleur));
    k++;
  }
  mesh.count = k;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

function creerForet(qualite) {
  const n = qualite === 'haute' ? 850 : 380;
  const r = aleatoire(101);
  const verts = [0x264a30, 0x2d5534, 0x335c36, 0x22422c, 0x3a6238];
  // 1) emplacements
  const places = [];
  for (let essai = 0; essai < n * 6 && places.length < n; essai++) {
    const k = places.length;
    let x, z;
    if (k < 46) { // bosquet de grands sapins sombres juste à gauche de l'arène (premier plan)
      x = -34 - r() * 16; z = -48 + r() * 60;
    } else {
      const a = r() * Math.PI * 2;
      const d = 34 + (r() ** 1.6) * 330;
      x = Math.cos(a) * d; z = Math.sin(a) * d;
    }
    if (Math.max(Math.abs(x), Math.abs(z)) < 33.5) continue;
    if (dansLac(x, z, 1.5) || dansAvantPoste(x, z, 4)) continue;
    // vue dégagée vers le lac et les avant-postes (devant, entre -25° et +75°) : arbres clairsemés
    const cap = Math.atan2(x, -z);
    if (k >= 46 && z < 0 && cap > -0.45 && cap < 1.3 && Math.hypot(x, z) < 170 && r() < 0.93) continue;
    if (x > -5 && z < -15 && Math.hypot(x, z) < 130 && r() < 0.97) continue;
    if (Math.abs(x - CASCADE.x) < 14 && z < PLATEAU.zBord + 6 && z > PLATEAU.zBord - 12) continue;
    const y = hauteurTerrain(x, z);
    if (y > 60) continue;
    const h = (k < 46 ? 15 : 8) + r() * 12;
    places.push({ x, y, z, h, l: h * (0.36 + r() * 0.08), ry: r() * 6, couleur: verts[Math.floor(r() * verts.length)] });
  }
  // 2) 4 quarts (nord/est/sud/ouest) : ceux qui sont derrière la caméra ne sont pas dessinés
  const geoF = geoSapin();
  const geoT = new THREE.CylinderGeometry(0.12, 0.2, 1, 6).translate(0, 0.5, 0);
  const matF = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const matT = new THREE.MeshLambertMaterial({ color: 0x4a3526 });
  const maillages = [];
  for (let q = 0; q < 4; q++) {
    const liste = places.filter((p) => Math.floor(((Math.atan2(p.z, p.x) + Math.PI) / (Math.PI / 2))) % 4 === q);
    if (!liste.length) continue;
    const feuillage = new THREE.InstancedMesh(geoF, matF, liste.length);
    const troncs = new THREE.InstancedMesh(geoT, matT, liste.length);
    remplir(feuillage, liste.length, (k) => {
      const p = liste[k];
      return [p.x, p.y + p.h * 0.12, p.z, p.l, p.h * 0.9, p.ry, p.couleur];
    });
    remplir(troncs, liste.length, (k) => {
      const p = liste[k];
      return [p.x, p.y - 0.3, p.z, p.h * 0.07, p.h * 0.25, 0];
    });
    maillages.push(feuillage, troncs); // pas d'ombres : réservées à l'arène
  }
  return maillages;
}

function creerBuissons(qualite) {
  const n = qualite === 'haute' ? 380 : 170;
  const r = aleatoire(202);
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), n);
  const rouges = [0xa3192a, 0xc2283a, 0x8a1424, 0xd4466a, 0xb53156, 0x7a1a20];
  return remplir(mesh, n, () => {
    const a = r() * Math.PI * 2;
    const d = 32 + (r() ** 2) * 120;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.max(Math.abs(x), Math.abs(z)) < 31.5 || dansLac(x, z, 1.05) || dansAvantPoste(x, z)) return null;
    const s = 0.5 + r() * 0.9;
    return [x, hauteurTerrain(x, z) + s * 0.3, z, s, s * (0.7 + r() * 0.3), r() * 6, rouges[Math.floor(r() * rouges.length)]];
  });
}

function creerRochers(qualite) {
  const n = qualite === 'haute' ? 140 : 70;
  const r = aleatoire(303);
  const mesh = new THREE.InstancedMesh(geoRocher(),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), n);
  return remplir(mesh, n, (k) => {
    let x, z, s;
    if (k < 14) { // gros rochers moussus en bordure de l'arène
      const cote = k % 4;
      const t = (r() - 0.5) * 56;
      const d = 33.5 + r() * 4;
      [x, z] = [[t, -d], [d, t], [t, d], [-d, t]][cote];
      s = 1.6 + r() * 1.8;
    } else {
      const a = r() * Math.PI * 2;
      const d = 34 + (r() ** 1.5) * 200;
      x = Math.cos(a) * d; z = Math.sin(a) * d;
      s = 0.8 + r() * 3.5;
    }
    if (Math.max(Math.abs(x), Math.abs(z)) < 32.5 || dansLac(x, z, 0.9) || dansAvantPoste(x, z)) return null;
    return [x, hauteurTerrain(x, z) - s * 0.15, z, s, s * (0.6 + r() * 0.4), r() * 6, undefined, (r() - 0.5) * 0.4];
  });
}

// ---------- Lac et cascade ----------
function creerLac() {
  const normales = textureNormalesEau();
  normales.repeat.set(10, 7);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x1f5468, roughness: 0.06, metalness: 0.15, normalMap: normales,
    normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.3,
  });
  const lac = new THREE.Mesh(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2), mat);
  lac.scale.set(LAC.rx * 1.06, 1, LAC.rz * 1.06);
  lac.position.set(LAC.x, LAC.niveau, LAC.z);
  lac.receiveShadow = true;

  const texCascade = textureCascade();
  texCascade.repeat.set(2, 1.5);
  const matCascade = new THREE.MeshBasicMaterial({
    map: texCascade, transparent: true, depthWrite: false, side: THREE.DoubleSide, color: 0xe8f4ff,
  });
  const hauteur = PLATEAU.hauteur + 0.5 - LAC.niveau;
  const geoC = new THREE.PlaneGeometry(CASCADE.largeur, hauteur, 1, 6);
  // léger bombement vers l'avant (l'eau « tombe » du rebord)
  const p = geoC.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) + hauteur / 2) / hauteur;
    p.setZ(i, Math.sin(t * Math.PI * 0.5) * 2.5 - 2.5 + (1 - t) * 0.5);
  }
  const cascade = new THREE.Mesh(geoC, matCascade);
  cascade.position.set(CASCADE.x, LAC.niveau + hauteur / 2, PLATEAU.zBord - 0.5);
  // écume au pied de la cascade
  const matEcume = new THREE.MeshBasicMaterial({ map: texCascade, transparent: true, opacity: 0.6, depthWrite: false, color: 0xffffff });
  const ecume = new THREE.Mesh(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), matEcume);
  ecume.scale.set(CASCADE.largeur * 0.75, 1, 4);
  ecume.position.set(CASCADE.x, LAC.niveau + 0.05, PLATEAU.zBord + 3);
  return { lac, cascade, ecume, normales, texCascade };
}

// ---------- Bâtiments ----------
/** BoxGeometry dont les UV répètent la texture tous les `metre` mètres. */
function boiteUV(w, h, d, metre = 6) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv, n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const su = (ax > 0.5 ? d : w) / metre, sv = (ay > 0.5 ? d : h) / metre;
    uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  }
  return g;
}

const geoUnite = new THREE.BoxGeometry(1, 1, 1);

class Chantier {
  constructor() {
    this.beton = new Assemblage();
    this.metal = new Assemblage();
    this.lumieres = new Assemblage();
    this.rouges = new Assemblage();
    this.r = aleatoire(404);
  }

  /** Bâtiment en béton : toit métal, rangées de fenêtres chaudes, équipements sur le toit. */
  batiment(x, y, z, w, h, d, ry = 0) {
    const r = this.r;
    const parent = new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
    const teinte = 0.75 + r() * 0.3;
    this.beton.ajouter(boiteUV(w, h, d), 0, h / 2, 0, { parent, couleur: _c.setRGB(teinte, teinte, teinte * 0.97).getHex() });
    this.metal.ajouter(geoUnite, 0, h + 0.25, 0, { sx: w + 0.6, sy: 0.5, sz: d + 0.6, parent, couleur: 0x3b3f45 });
    this.metal.ajouter(geoUnite, 0, h * 0.62, 0, { sx: w + 0.3, sy: 0.35, sz: d + 0.3, parent, couleur: 0x2c2f34 });
    // fenêtres sur les 4 faces
    const etages = Math.max(1, Math.floor(h / 3.2));
    for (const [nx, nz, longueur] of [[0, 1, w], [0, -1, w], [1, 0, d], [-1, 0, d]]) {
      const cols = Math.max(1, Math.floor(longueur / 2.6));
      for (let e = 0; e < etages; e++) {
        for (let c = 0; c < cols; c++) {
          if (r() < 0.45) continue;
          const t = (c + 0.5) / cols - 0.5;
          const px = nz !== 0 ? t * longueur : nx * (w / 2 + 0.03);
          const pz = nx !== 0 ? t * longueur : nz * (d / 2 + 0.03);
          const chaud = [0xffc46a, 0xffa83c, 0xffe0a0, 0xff9a40][Math.floor(r() * 4)];
          this.lumieres.ajouter(geoUnite, px, 1.5 + e * 3.2, pz,
            { sx: nz !== 0 ? 1.2 : 0.06, sy: 0.8, sz: nx !== 0 ? 1.2 : 0.06, parent, couleur: chaud });
        }
      }
    }
    // équipements de toit
    for (let i = 0; i < 3; i++) {
      const s = 1 + r() * 2;
      this.metal.ajouter(geoUnite, (r() - 0.5) * (w - s), h + 0.5 + s / 2, (r() - 0.5) * (d - s),
        { sx: s, sy: s, sz: s * 1.3, parent, couleur: 0x555a62 });
    }
    if (r() < 0.7) this.antenne(x + (r() - 0.5) * w * 0.5, y + h + 0.5, z + (r() - 0.5) * d * 0.5, 6 + r() * 8);
  }

  /** Antenne/pylône en treillis avec feu rouge au sommet. */
  antenne(x, y, z, h, largeur = 0.5) {
    const l = largeur;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      this.metal.ajouter(geoUnite, x + sx * l / 2, y + h / 2, z + sz * l / 2, { sx: 0.08 * (l + 0.5), sy: h, sz: 0.08 * (l + 0.5), couleur: 0x3a3d42 });
    }
    const pas = Math.max(1.2, l * 1.6);
    for (let k = pas; k < h; k += pas) {
      this.metal.ajouter(geoUnite, x, y + k, z, { sx: l + 0.08, sy: 0.06 * (l + 0.5), sz: l + 0.08, couleur: 0x3a3d42 });
    }
    this.metal.ajouter(geoUnite, x, y + h + 1.5, z, { sx: 0.06, sy: 3, sz: 0.06, couleur: 0x2a2c30 });
    this.rouges.ajouter(geoUnite, x, y + h + 3, z, { sx: 0.35, sy: 0.35, sz: 0.35 });
  }

  /** Tour industrielle : blocs empilés qui s'affinent, passerelles, lumières. */
  tour(x, y, z, h) {
    const r = this.r;
    let w = 6, cy = y;
    const niveaux = 4;
    for (let i = 0; i < niveaux; i++) {
      const hh = h / niveaux * (1 - i * 0.08);
      this.metal.ajouter(boiteUV(w, hh, w, 4), x, cy + hh / 2, z, { couleur: i % 2 ? 0x4a4f57 : 0x3c4047 });
      this.metal.ajouter(geoUnite, x, cy + hh, z, { sx: w + 1.6, sy: 0.3, sz: w + 1.6, couleur: 0x2a2d31 });
      for (let k = 0; k < 4; k++) {
        if (r() < 0.4) continue;
        const a = k * Math.PI / 2;
        this.lumieres.ajouter(geoUnite, x + Math.sin(a) * (w / 2 + 0.05), cy + hh * 0.6, z + Math.cos(a) * (w / 2 + 0.05),
          { sx: Math.abs(Math.cos(a)) * 2 + 0.06, sy: 0.5, sz: Math.abs(Math.sin(a)) * 2 + 0.06, couleur: 0xffb050 });
      }
      cy += hh;
      w *= 0.78;
    }
    this.antenne(x, cy, z, h * 0.35, 1.2);
  }
}

// ---------- Mégastructure : tour verticale traversant un anneau géant ----------
function creerMegastructure(qualite) {
  const groupe = new THREE.Group();
  groupe.position.set(MEGA.x, 0, MEGA.z);
  const matMetal = new THREE.MeshStandardMaterial({ color: 0x9aa1ad, metalness: 0.65, roughness: 0.38, vertexColors: true });
  const matViolet = new THREE.MeshBasicMaterial({ color: 0xb48cff, fog: false });

  // Tour
  const tour = new Assemblage();
  const lum = new Assemblage();
  const H = 640;
  tour.ajouter(new THREE.CylinderGeometry(26, 40, 160, 8), 0, 80, 0, { couleur: 0x8a909a });
  tour.ajouter(new THREE.CylinderGeometry(16, 24, H, 8), 0, H / 2, 0, { couleur: 0xa4abb6 });
  tour.ajouter(new THREE.CylinderGeometry(1, 14, 110, 8), 0, H + 55, 0, { couleur: 0x9aa0aa });
  for (let k = 0; k < 4; k++) { // contreforts
    const a = k * Math.PI / 2 + Math.PI / 4;
    tour.ajouter(geoUnite, Math.sin(a) * 21, 250, Math.cos(a) * 21, { sx: 7, sy: 460, sz: 7, ry: a, couleur: 0x6d737d });
    lum.ajouter(geoUnite, Math.sin(a) * 24.8, 330, Math.cos(a) * 24.8, { sx: 1.6, sy: 560, sz: 1.6, ry: a });
    lum.ajouter(geoUnite, Math.sin(a + 0.6) * 20.5, 420, Math.cos(a + 0.6) * 20.5, { sx: 1.2, sy: 300, sz: 1.2, ry: a });
  }
  for (let y = 40; y < H; y += 55) tour.ajouter(new THREE.CylinderGeometry(26 - y * 0.012, 26 - y * 0.012, 4, 8), 0, y, 0, { couleur: 0x5d636c });
  const meshTour = new THREE.Mesh(tour.geometrie(true), matMetal);
  const meshLum = new THREE.Mesh(lum.geometrie(), matViolet);
  groupe.add(meshTour, meshLum);

  // Anneau (tourne lentement autour de la tour)
  const anneau = new THREE.Group();
  anneau.position.y = MEGA.hauteurAnneau;
  anneau.rotation.x = 0.08;
  const a = new Assemblage();
  const al = new Assemblage();
  const R = MEGA.rayonAnneau;
  const seg = qualite === 'haute' ? 140 : 96;
  a.ajouter(new THREE.TorusGeometry(R, 7, 8, seg), 0, 0, 0, { rx: Math.PI / 2, couleur: 0xb2b8c2 });
  a.ajouter(new THREE.TorusGeometry(R + 14, 2.5, 6, seg), 0, -3, 0, { rx: Math.PI / 2, sy: 1, couleur: 0x7f8590 });
  a.ajouter(new THREE.CylinderGeometry(R + 13, R + 13, 1.5, seg, 1, true), 0, -3, 0, { couleur: 0x8b919b });
  for (let k = 0; k < 48; k++) { // modules sur le pourtour
    const t = k / 48 * Math.PI * 2;
    a.ajouter(geoUnite, Math.cos(t) * (R + 6), 5, Math.sin(t) * (R + 6),
      { sx: 10, sy: 3 + (k % 5 === 0 ? 4 : 0), sz: 14 + (k % 3) * 5, ry: -t, couleur: k % 4 ? 0x969ca6 : 0x6b707a });
  }
  for (let k = 0; k < 4; k++) { // rayons vers la tour
    const t = k / 4 * Math.PI * 2 + 0.3;
    a.ajouter(geoUnite, Math.cos(t) * R / 2, 0, Math.sin(t) * R / 2, { sx: R - 20, sy: 3, sz: 4, ry: -t, couleur: 0x80868f });
  }
  a.ajouter(new THREE.CylinderGeometry(34, 34, 16, 12), 0, 0, 0, { couleur: 0x8f959f }); // moyeu autour de la tour
  al.ajouter(new THREE.TorusGeometry(R - 6.5, 0.9, 4, seg), 0, 0, 0, { rx: Math.PI / 2 });
  al.ajouter(new THREE.TorusGeometry(R + 15.5, 0.6, 4, seg), 0, -3, 0, { rx: Math.PI / 2 });
  anneau.add(new THREE.Mesh(a.geometrie(true), matMetal), new THREE.Mesh(al.geometrie(), matViolet));
  groupe.add(anneau);

  // Le brouillard ne doit pas l'effacer complètement : on garde une silhouette nette
  groupe.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  return { groupe, anneau };
}

// ---------- Assemblage du décor ----------
export function creerDecor(scene, { qualite = 'haute' } = {}) {
  const terrain = creerTerrain(qualite);
  const montagnes = creerMontagnes(qualite);
  const foret = creerForet(qualite);
  const buissons = creerBuissons(qualite);
  const rochers = creerRochers(qualite);
  const eau = creerLac();
  scene.add(terrain, montagnes, ...foret, buissons, rochers, eau.lac, eau.cascade, eau.ecume);

  // Avant-postes
  const ch = new Chantier();
  const [A, B, C] = AVANT_POSTES;
  const hB = PLATEAU.hauteur;
  const hA = VALLEE - 0.2;
  ch.batiment(A.x - 4, hA, A.z, 16, 9, 11, 0.2);
  ch.batiment(A.x + 12, hA, A.z + 10, 9, 6, 8, -0.3);
  ch.batiment(A.x - 14, hA, A.z + 12, 7, 5, 7, 0.5);
  ch.tour(A.x + 6, hA, A.z - 9, 30);
  ch.batiment(B.x - 6, hB, B.z + 4, 14, 10, 12, -0.15);
  ch.batiment(B.x + 10, hB, B.z - 2, 10, 7, 9, 0.25);
  ch.tour(B.x + 2, hB, B.z - 12, 34);
  ch.batiment(C.x + 2, hB, C.z, 12, 8, 9, 0.1);
  ch.batiment(CASCADE.x + 14, hB, PLATEAU.zBord - 9, 9, 6, 8, -0.1);
  // antennes au loin
  for (const [x, z, h] of [[-130, -170, 40], [170, 40, 34], [-110, 130, 30], [140, -220, 46], [-200, -40, 36], [60, 190, 32]]) {
    ch.antenne(x, hauteurTerrain(x, z), z, h, 2.2);
  }

  const matBeton = new THREE.MeshStandardMaterial({ map: textureBeton(), vertexColors: true, roughness: 0.92 });
  const matMetal = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.6, roughness: 0.45 });
  const matLumieres = new THREE.MeshBasicMaterial({ vertexColors: true });
  const matRouge = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  const batiments = new THREE.Mesh(ch.beton.geometrie(true), matBeton);
  const metal = new THREE.Mesh(ch.metal.geometrie(true), matMetal);
  const lumieres = new THREE.Mesh(ch.lumieres.geometrie(true), matLumieres);
  const feux = new THREE.Mesh(ch.rouges.geometrie(), matRouge);
  // hors de la zone d'ombre de l'arène : ni ombres portées ni reçues (économise une passe de rendu)
  scene.add(batiments, metal, lumieres, feux);

  // Grande bannière rouge sur portique (premier plan à gauche)
  const portique = new Assemblage();
  portique.ajouter(geoUnite, -2.4, 5.5, 0, { sx: 0.35, sy: 11, sz: 0.35 });
  portique.ajouter(geoUnite, 2.4, 5.5, 0, { sx: 0.35, sy: 11, sz: 0.35 });
  portique.ajouter(geoUnite, 0, 10.9, 0, { sx: 5.4, sy: 0.4, sz: 0.5 });
  const meshPortique = new THREE.Mesh(portique.geometrie(),
    new THREE.MeshStandardMaterial({ color: 0x2c2f34, metalness: 0.6, roughness: 0.5 }));
  const banniere = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 10, 1, 8),
    new THREE.MeshStandardMaterial({ map: textureBanniere(), side: THREE.DoubleSide, roughness: 0.85 }));
  banniere.position.set(0, 5.7, 0.3);
  meshPortique.castShadow = banniere.castShadow = true;
  const groupeBanniere = new THREE.Group();
  groupeBanniere.position.set(-37, 0, -37);
  groupeBanniere.rotation.y = 0.55;
  groupeBanniere.add(meshPortique, banniere);
  scene.add(groupeBanniere);

  const mega = creerMegastructure(qualite);
  scene.add(mega.groupe);

  // ondulation légère de la bannière
  const posB = banniere.geometry.attributes.position;
  const baseB = Float32Array.from(posB.array);

  return {
    foret, buissons, rochers, terrain, montagnes, mega,
    update(dt, t) {
      eau.normales.offset.set(t * 0.012, t * 0.007);
      eau.texCascade.offset.y = (t * 0.9) % 1;
      mega.anneau.rotation.y = t * 0.01;
      for (let i = 0; i < posB.count; i++) {
        const y = baseB[i * 3 + 1];
        posB.setZ(i, Math.sin(t * 1.6 + y * 0.6) * 0.12 * (0.5 - y / 10));
      }
      posB.needsUpdate = true;
    },
  };
}
