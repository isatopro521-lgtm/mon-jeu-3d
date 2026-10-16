import * as THREE from 'three';

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/**
 * Repousse un cylindre vertical (pieds en `pos`, rayon, hauteur) hors des boîtes.
 * Les boîtes sur lesquelles on se tient (sommet sous les pieds) sont ignorées.
 */
export function collisionCercleBoites(pos, rayon, hauteur, boites) {
  for (const b of boites) {
    if (pos.y >= b.max.y - 0.05 || pos.y + hauteur <= b.min.y) continue;
    const cx = clamp(pos.x, b.min.x, b.max.x);
    const cz = clamp(pos.z, b.min.z, b.max.z);
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= rayon * rayon) continue;

    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      const k = (rayon - d) / d;
      pos.x += dx * k;
      pos.z += dz * k;
    } else {
      // Centre à l'intérieur de la boîte : on sort par le côté le plus proche
      const g = pos.x - b.min.x, dr = b.max.x - pos.x;
      const ar = pos.z - b.min.z, av = b.max.z - pos.z;
      const m = Math.min(g, dr, ar, av);
      if (m === g) pos.x = b.min.x - rayon;
      else if (m === dr) pos.x = b.max.x + rayon;
      else if (m === ar) pos.z = b.min.z - rayon;
      else pos.z = b.max.z + rayon;
    }
  }
}

/** Hauteur du sol sous (x, z) : sommet de boîte le plus haut qui était sous les pieds (`yPieds`). */
export function hauteurSol(x, z, yPieds, rayon, boites) {
  let h = 0;
  const r = rayon * 0.7;
  for (const b of boites) {
    if (b.max.y > yPieds + 0.05) continue;
    if (x + r > b.min.x && x - r < b.max.x && z + r > b.min.z && z - r < b.max.z) {
      h = Math.max(h, b.max.y);
    }
  }
  return h;
}

export function melanger(tableau) {
  for (let i = tableau.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tableau[i], tableau[j]] = [tableau[j], tableau[i]];
  }
  return tableau;
}

// ---------- Bruit procédural (décor) ----------

/** Générateur pseudo-aléatoire déterministe (même décor à chaque partie). */
export function aleatoire(graine = 1) {
  let s = graine >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, y) {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

/** Bruit de valeur 2D lissé, entre 0 et 1. */
export function bruit2D(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Somme de plusieurs octaves de bruit (0..1 environ). */
export function fbm(x, y, octaves = 4) {
  let somme = 0, amp = 0.5, total = 0;
  for (let i = 0; i < octaves; i++) {
    somme += bruit2D(x, y) * amp;
    total += amp;
    x *= 2.03; y *= 2.03;
    amp *= 0.5;
  }
  return somme / total;
}

export const lisse = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ---------- Fusion de géométries ----------

/**
 * Fusionne des géométries (indexées ou non) en une seule, pour réduire les appels de rendu.
 * `pieces` : liste de { geo, matrice?, couleur? } — `couleur` (THREE.Color) remplit l'attribut
 * `color` (pour un matériau en vertexColors). Les géométries sources ne sont pas modifiées.
 */
export function fusionner(pieces, { couleurs = false } = {}) {
  let nbSommets = 0, nbIndices = 0;
  const prep = pieces.map((p) => {
    const g = p.geo.index ? p.geo : p.geo; // les deux cas sont gérés ci-dessous
    const n = g.attributes.position.count;
    const ni = g.index ? g.index.count : n;
    nbSommets += n;
    nbIndices += ni;
    return { ...p, g, n, ni };
  });
  const pos = new Float32Array(nbSommets * 3);
  const nor = new Float32Array(nbSommets * 3);
  const uv = new Float32Array(nbSommets * 2);
  const col = couleurs ? new Float32Array(nbSommets * 3) : null;
  const idx = new Uint32Array(nbIndices);
  const v = new THREE.Vector3();
  const m3 = new THREE.Matrix3();
  let os = 0, oi = 0;
  for (const p of prep) {
    const { g, n } = p;
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, C = g.attributes.color;
    if (p.matrice) m3.getNormalMatrix(p.matrice);
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(P, i);
      if (p.matrice) v.applyMatrix4(p.matrice);
      pos.set([v.x, v.y, v.z], (os + i) * 3);
      if (N) {
        v.fromBufferAttribute(N, i);
        if (p.matrice) v.applyMatrix3(m3).normalize();
        nor.set([v.x, v.y, v.z], (os + i) * 3);
      }
      if (U) uv.set([U.getX(i), U.getY(i)], (os + i) * 2);
      if (col) {
        if (p.couleur) col.set([p.couleur.r, p.couleur.g, p.couleur.b], (os + i) * 3);
        else if (C) col.set([C.getX(i), C.getY(i), C.getZ(i)], (os + i) * 3);
        else col.set([1, 1, 1], (os + i) * 3);
      }
    }
    if (g.index) for (let i = 0; i < p.ni; i++) idx[oi + i] = g.index.getX(i) + os;
    else for (let i = 0; i < p.ni; i++) idx[oi + i] = i + os;
    os += n;
    oi += p.ni;
  }
  const res = new THREE.BufferGeometry();
  res.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  res.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  res.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) res.setAttribute('color', new THREE.BufferAttribute(col, 3));
  res.setIndex(new THREE.BufferAttribute(idx, 1));
  res.computeBoundingBox();
  res.computeBoundingSphere();
  return res;
}

/**
 * Petit assembleur : on empile des pièces (géométrie + position/rotation/échelle + couleur),
 * puis `geometrie()` renvoie une seule géométrie fusionnée.
 */
export class Assemblage {
  constructor() { this.pieces = []; this._o = new THREE.Object3D(); }
  ajouter(geo, x = 0, y = 0, z = 0, { rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, couleur = null, parent = null } = {}) {
    const o = this._o;
    o.position.set(x, y, z);
    o.rotation.set(rx, ry, rz);
    o.scale.set(sx, sy, sz);
    o.updateMatrix();
    const m = o.matrix.clone();
    if (parent) m.premultiply(parent);
    this.pieces.push({ geo, matrice: m, couleur: couleur === null ? null : new THREE.Color(couleur) });
    return this;
  }
  get vide() { return this.pieces.length === 0; }
  geometrie(couleurs = false) { return fusionner(this.pieces, { couleurs }); }
}
