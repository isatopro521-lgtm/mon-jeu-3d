import * as THREE from 'three';
import { aleatoire, fbm, lisse, Assemblage } from './utils.js';
import {
  textureSol, textureTouffe, textureGrillage, textureConteneur, textureBanniere,
  textureAtlasIndustriel, uvAtlas, ZONES, textureBeton, textureMetalUse, textureToile,
  normalesDepuis, rugositeDepuis, uvMonde,
} from './textures.js';
import { declarerLumineux } from './postprocess.js';
import { creerCiel } from './ciel.js';
import { creerDecor } from './decor.js';

export const DEMI_ARENE = 30;

// Points d'apparition des ennemis (bords de l'arène)
export const POINTS_APPARITION = [
  [-26, -26], [0, -27], [26, -26],
  [-27, 0], [27, 0],
  [-26, 26], [0, 27], [26, 26],
];

const HAUTEUR_CLOTURE = 3;   // hauteur visible de l'enceinte (on voit le paysage par-dessus)
const HAUTEUR_COLLISION = 8; // mur invisible : impossible de sortir, même en sautant d'une caisse

const geoUnite = new THREE.BoxGeometry(1, 1, 1);
const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

/**
 * Arène « avant-poste Nexus » : chaque obstacle garde exactement la même boîte de collision
 * qu'avant (plateforme, 4 tours, 4 murets de sacs de sable, caisses métal), avec :
 *  - un maillage invisible simple (boîte) pour les tirs et les lignes de vue (rapide à tester),
 *  - un visuel détaillé fusionné par matériau (peu d'appels de rendu).
 */
export function creerMonde(scene, { tailleOmbres = 2048, qualite = 'haute', renderer } = {}) {
  const obstacles = []; // maillages (invisibles) qui bloquent la vue et les balles
  const boites = [];    // Box3 pour les collisions
  const r = aleatoire(9);

  const ciel = creerCiel(scene, renderer, { qualite, tailleOmbres });
  const decor = creerDecor(scene, { qualite });

  // ---------- Sol de l'arène ----------
  const texSol = textureSol();
  const geoSol = new THREE.PlaneGeometry(DEMI_ARENE * 2, DEMI_ARENE * 2, 48, 48).rotateX(-Math.PI / 2);
  {
    const p = geoSol.attributes.position, uv = geoSol.attributes.uv;
    const col = [];
    const herbe = new THREE.Color(0x8a9448), herbeSombre = new THREE.Color(0x667a3c),
      terre = new THREE.Color(0x97795a), gravier = new THREE.Color(0xa49e90);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      uv.setXY(i, x / 7, z / 7);
      // terre battue : allées vers le centre et cercle autour de la plateforme
      const allee = lisse(3.2, 1.2, Math.min(Math.abs(x), Math.abs(z)));
      const cercle = lisse(9, 5, Math.hypot(x, z));
      const tache = lisse(0.55, 0.7, fbm(x / 9 + 4, z / 9, 3));
      _c.copy(herbe).lerp(herbeSombre, lisse(0.4, 0.7, fbm(x / 6, z / 6, 3)));
      _c.lerp(terre, Math.min(1, Math.max(allee * 0.6, cercle * 0.85, tache * 0.35) * (0.7 + fbm(x / 3, z / 3, 2) * 0.4)));
      _c.lerp(gravier, cercle * lisse(5.5, 3.2, Math.hypot(x, z)) * 0.7);
      col.push(_c.r, _c.g, _c.b);
    }
    geoSol.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  }
  // Lambert (léger, même sur téléphone) + relief des cailloux et touffes
  const solVisuel = new THREE.Mesh(geoSol, new THREE.MeshLambertMaterial({
    map: texSol, vertexColors: true, normalMap: normalesDepuis(texSol, { force: 1.0, taille: 256 }),
  }));
  solVisuel.receiveShadow = true;
  scene.add(solVisuel);
  // Sol « logique » pour les impacts de balles : 2 triangles seulement
  const sol = new THREE.Mesh(new THREE.PlaneGeometry(DEMI_ARENE * 2, DEMI_ARENE * 2).rotateX(-Math.PI / 2));
  sol.visible = false;
  scene.add(sol);

  // ---------- Assemblages des visuels ----------
  const industriel = new Assemblage(); // atlas : caisses, tours, plateforme
  const sacs = new Assemblage();       // sacs de sable
  const metal = new Assemblage();      // poteaux, rambardes, miradors, conteneurs (structures)
  const beton = new Assemblage();      // muret de béton au pied de la clôture
  const grillage = new Assemblage();   // panneaux de grillage (alpha)
  const conteneurs = new Assemblage(); // tôle ondulée teintée
  const neon = new Assemblage();       // liserés orange lumineux
  const feux = new Assemblage();       // feux rouges
  const bannieres = new Assemblage();

  /** Obstacle : boîte de collision + proxy invisible pour les tirs. */
  function proxy(x, z, largeur, hauteur, profondeur, y = 0, hauteurBoite = hauteur) {
    const m = new THREE.Mesh(geoUnite);
    m.scale.set(largeur, hauteur, profondeur);
    m.position.set(x, y + hauteur / 2, z);
    m.visible = false;
    m.updateMatrixWorld();
    scene.add(m);
    obstacles.push(m);
    boites.push(new THREE.Box3(
      new THREE.Vector3(x - largeur / 2, y, z - profondeur / 2),
      new THREE.Vector3(x + largeur / 2, y + hauteurBoite, z + profondeur / 2),
    ));
    return m;
  }

  // ---------- Enceinte : muret béton + grillage + poteaux, miradors aux coins ----------
  const L = DEMI_ARENE * 2 + 2;
  for (const [x, z, w, d] of [
    [0, -DEMI_ARENE - 0.5, L, 1], [0, DEMI_ARENE + 0.5, L, 1],
    [-DEMI_ARENE - 0.5, 0, 1, L], [DEMI_ARENE + 0.5, 0, 1, L],
  ]) {
    proxy(x, z, w, HAUTEUR_CLOTURE, d, 0, HAUTEUR_COLLISION);
    const long = Math.max(w, d), surX = w > d;
    const ry = surX ? 0 : Math.PI / 2;
    // muret de béton (type « jersey »)
    beton.ajouter(geoUnite, x, 0.25, z, { sx: surX ? long : 0.7, sy: 0.5, sz: surX ? 0.7 : long });
    beton.ajouter(geoUnite, x, 0.55, z, { sx: surX ? long : 0.4, sy: 0.1, sz: surX ? 0.4 : long });
    // grillage (un seul grand panneau par côté, texture répétée)
    const hg = HAUTEUR_CLOTURE - 0.6;
    const panneau = new THREE.PlaneGeometry(long, hg);
    const uv = panneau.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * long, uv.getY(i) * hg);
    grillage.ajouter(panneau, x, 0.6 + hg / 2, z, { ry });
    // poteaux + lisses
    for (let t = -long / 2; t <= long / 2 + 0.01; t += 3) {
      const px = surX ? x + t : x, pz = surX ? z : z + t;
      metal.ajouter(geoUnite, px, HAUTEUR_CLOTURE / 2 + 0.2, pz, { sx: 0.12, sy: HAUTEUR_CLOTURE + 0.4, sz: 0.12, couleur: 0x3a3e44 });
    }
    metal.ajouter(geoUnite, x, HAUTEUR_CLOTURE, z, { sx: surX ? long : 0.08, sy: 0.08, sz: surX ? 0.08 : long, couleur: 0x4a4f56 });
    metal.ajouter(geoUnite, x, 0.62, z, { sx: surX ? long : 0.08, sy: 0.06, sz: surX ? 0.08 : long, couleur: 0x4a4f56 });
    // barbelés : petites croix le long du sommet
    for (let t = -long / 2; t < long / 2; t += 0.5) {
      const px = surX ? x + t : x, pz = surX ? z : z + t;
      metal.ajouter(geoUnite, px, HAUTEUR_CLOTURE + 0.18, pz, { sx: 0.03, sy: 0.3, sz: 0.03, rx: 0.7, ry: ry + 0.8, couleur: 0x6b7078 });
    }
  }

  // Miradors aux 4 coins (à l'extérieur)
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const x = sx * (DEMI_ARENE + 3.2), z = sz * (DEMI_ARENE + 3.2);
    for (const [ox, oz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      metal.ajouter(geoUnite, x + ox * 1.3, 3.5, z + oz * 1.3, { sx: 0.2, sy: 7, sz: 0.2, couleur: 0x33373c });
    }
    for (const y of [2.2, 4.6]) {
      metal.ajouter(geoUnite, x, y, z, { sx: 2.8, sy: 0.1, sz: 0.1, rz: 0.6, couleur: 0x33373c });
      metal.ajouter(geoUnite, x, y, z, { sx: 0.1, sy: 0.1, sz: 2.8, rx: 0.6, couleur: 0x33373c });
    }
    metal.ajouter(geoUnite, x, 7, z, { sx: 3.4, sy: 0.25, sz: 3.4, couleur: 0x2b2e33 });
    metal.ajouter(geoUnite, x, 7.6, z, { sx: 3.4, sy: 1, sz: 3.4, couleur: 0x3e434a });
    metal.ajouter(geoUnite, x, 9.4, z, { sx: 3.8, sy: 0.2, sz: 3.8, couleur: 0x2b2e33 });
    for (const [ox, oz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      metal.ajouter(geoUnite, x + ox * 1.6, 8.7, z + oz * 1.6, { sx: 0.1, sy: 1.3, sz: 0.1, couleur: 0x2b2e33 });
    }
    neon.ajouter(geoUnite, x, 7.6, z, { sx: 3.45, sy: 0.08, sz: 3.45 });
    // projecteur tourné vers l'arène
    neon.ajouter(geoUnite, x - sx * 1.75, 8.5, z - sz * 1.75, { sx: 0.4, sy: 0.3, sz: 0.4 });
  }

  // Conteneurs militaires empilés derrière la clôture (décor)
  const texConteneur = textureConteneur();
  texConteneur.repeat.set(1, 1);
  const teintes = [0x5a5f66, 0x7a3a2a, 0x4d5a3a, 0x3c4450, 0x8a6a3a];
  for (const [x, z, ry, etage] of [
    [-14, -34.2, 0, 0], [-14, -34.2, 0.05, 1], [-7.5, -34.4, 0, 0],
    [12, 34.3, 0, 0], [18.5, 34.2, 0, 0], [15, 34.3, 0.04, 1],
    [34.3, 14, Math.PI / 2, 0], [34.3, 20.5, Math.PI / 2, 0], [34.3, 17, Math.PI / 2 + 0.05, 1],
    [-34.3, 10, Math.PI / 2, 0], [-34.3, 16.5, Math.PI / 2, 0],
  ]) {
    const geo = new THREE.BoxGeometry(6.06, 2.6, 2.44);
    const uv = geo.attributes.uv, n = geo.attributes.normal;
    for (let i = 0; i < uv.count; i++) {
      const lat = Math.abs(n.getX(i)) > 0.5; // portes : moins de répétitions
      uv.setXY(i, uv.getX(i) * (lat ? 1 : 3), uv.getY(i));
    }
    conteneurs.ajouter(geo, x, 1.3 + etage * 2.6, z, { ry, couleur: teintes[Math.floor(r() * teintes.length)] });
  }

  // ---------- Plateforme centrale (on peut sauter dessus) ----------
  proxy(0, 0, 5, 1, 5);
  industriel.ajouter(uvAtlas(new THREE.BoxGeometry(5, 1, 5), ZONES.plateformeCote, ZONES.plateformeDessus), 0, 0.5, 0);
  for (const [x, z, w, d] of [[0, 2.5, 5.05, 0.06], [0, -2.5, 5.05, 0.06], [2.5, 0, 0.06, 5.05], [-2.5, 0, 0.06, 5.05]]) {
    neon.ajouter(geoUnite, x, 1.0, z, { sx: w, sy: 0.05, sz: d });
  }

  // ---------- Tours métalliques (anciens piliers) ----------
  for (const [x, z] of [[-10, -10], [10, -10], [-10, 10], [10, 10]]) {
    proxy(x, z, 1.6, 6, 1.6);
    industriel.ajouter(uvAtlas(new THREE.BoxGeometry(1.6, 6, 1.6), ZONES.tourCote, ZONES.tourDessus), x, 3, z);
    metal.ajouter(geoUnite, x, 6.1, z, { sx: 2, sy: 0.2, sz: 2, couleur: 0x2a2d31 });
    metal.ajouter(geoUnite, x, 0.15, z, { sx: 1.9, sy: 0.3, sz: 1.9, couleur: 0x2a2d31 });
    // liserés orange aux arêtes
    for (const [ox, oz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      neon.ajouter(geoUnite, x + ox * 0.81, 3.4, z + oz * 0.81, { sx: 0.05, sy: 4.6, sz: 0.05 });
    }
    // mât d'antenne + feu rouge
    metal.ajouter(geoUnite, x + 0.4, 8.2, z + 0.4, { sx: 0.1, sy: 4, sz: 0.1, couleur: 0x2a2d31 });
    metal.ajouter(geoUnite, x - 0.3, 7, z - 0.3, { sx: 0.5, sy: 1.6, sz: 0.5, couleur: 0x464b52 });
    feux.ajouter(geoUnite, x + 0.4, 10.3, z + 0.4, { sx: 0.22, sy: 0.22, sz: 0.22 });
    // bannière rouge face au centre
    const versCentre = -Math.sign(x);
    bannieres.ajouter(new THREE.PlaneGeometry(1.3, 3.4), x + versCentre * 0.82, 3.6, z, { ry: versCentre * Math.PI / 2 });
  }

  // ---------- Murets de sacs de sable (anciens murets) ----------
  const geoSac = new THREE.SphereGeometry(0.5, 6, 4);
  const sable = [0x9a8a64, 0x8c7c58, 0xa69670, 0x857552];
  function muret(x, z, largeur, hauteur, profondeur) {
    proxy(x, z, largeur, hauteur, profondeur);
    const surX = largeur > profondeur;
    const long = surX ? largeur : profondeur, epais = surX ? profondeur : largeur;
    const rangs = 6, h = hauteur / rangs;
    for (let k = 0; k < rangs; k++) {
      const n = Math.round(long / 0.5);
      const dec = k % 2 ? 0.25 : 0;
      for (let i = 0; i < n; i++) {
        const t = -long / 2 + 0.25 + i * 0.5 + dec;
        if (t > long / 2 - 0.2) continue;
        const px = surX ? x + t : x, pz = surX ? z : z + t;
        sacs.ajouter(geoSac, px, h / 2 + k * h, pz, {
          sx: surX ? 0.56 : epais * 1.02, sy: h * 1.35, sz: surX ? epais * 1.02 : 0.56,
          ry: (r() - 0.5) * 0.12, couleur: sable[Math.floor(r() * sable.length)],
        });
      }
    }
  }
  muret(18, 0, 1, 1.3, 8);
  muret(-18, 0, 1, 1.3, 8);
  muret(0, 18, 8, 1.3, 1);
  muret(0, -18, 8, 1.3, 1);

  // ---------- Caisses métal ----------
  function caisse(x, z, t, y = 0) {
    proxy(x, z, t, t, t, y);
    industriel.ajouter(uvAtlas(new THREE.BoxGeometry(t, t, t), ZONES.caisseCote, ZONES.caisseDessus), x, y + t / 2, z);
  }
  for (const [x, z, t] of [
    [-20, -12, 2], [20, 12, 2], [-12, 20, 2], [12, -20, 2],
    [22, -22, 1.6], [-22, 22, 1.6], [-21.8, -14, 1.2], [21.8, 14, 1.2],
    [6, 10, 1.4], [-6, -10, 1.4],
  ]) caisse(x, z, t);
  // Caisses empilées
  caisse(14, -20, 2);
  caisse(14, -20, 1.4, 2);
  caisse(-14, 20, 2);
  caisse(-14, 20, 1.4, 2);

  // ---------- Matériaux et maillages fusionnés ----------
  const texGrillage = textureGrillage();
  const ajouterMesh = (asm, mat, { ombre = true, couleurs = false } = {}) => {
    if (asm.vide) return null;
    const m = new THREE.Mesh(asm.geometrie(couleurs), mat);
    m.castShadow = ombre;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  // Matières PBR : couleur + relief (normales) + rugosité, générés une fois (textures.js)
  const atlas = textureAtlasIndustriel();
  ajouterMesh(industriel, new THREE.MeshStandardMaterial({
    map: atlas, metalness: 0.45, roughness: 1,
    normalMap: normalesDepuis(atlas, { force: 2.2, taille: 1024 }), normalScale: new THREE.Vector2(1, 1),
    roughnessMap: rugositeDepuis(atlas, { base: 0.55, variation: 0.35, taille: 512 }),
  }));
  const toile = textureToile();
  toile.repeat.set(3, 2);
  ajouterMesh(sacs, new THREE.MeshLambertMaterial({
    vertexColors: true, flatShading: true, map: toile, normalMap: normalesDepuis(toile, { force: 2.5, taille: 128 }),
  }), { couleurs: true });
  const usure = textureMetalUse();
  const meshMetal = ajouterMesh(metal, new THREE.MeshStandardMaterial({
    vertexColors: true, map: usure, metalness: 0.6, roughness: 1,
    normalMap: normalesDepuis(usure, { force: 1.2, taille: 256 }),
    roughnessMap: rugositeDepuis(usure, { base: 0.45, variation: 0.3 }),
  }), { couleurs: true });
  if (meshMetal) uvMonde(meshMetal.geometry, 1.5);
  const texBeton = textureBeton();
  const meshBeton = ajouterMesh(beton, new THREE.MeshStandardMaterial({
    map: texBeton, color: 0xb3afa6, roughness: 1, metalness: 0,
    normalMap: normalesDepuis(texBeton, { force: 2.5, taille: 256 }),
    roughnessMap: rugositeDepuis(texBeton, { base: 0.88, variation: 0.12 }),
  }));
  if (meshBeton) uvMonde(meshBeton.geometry, 2.5);
  ajouterMesh(grillage, new THREE.MeshStandardMaterial({
    map: texGrillage, alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.5, color: 0x9aa0a8,
  }), { ombre: false });
  ajouterMesh(conteneurs, new THREE.MeshStandardMaterial({
    map: texConteneur, vertexColors: true, metalness: 0.35, roughness: 1,
    normalMap: normalesDepuis(texConteneur, { force: 3, taille: 256 }),
    roughnessMap: rugositeDepuis(texConteneur, { base: 0.6, variation: 0.25 }),
  }), { couleurs: true });
  ajouterMesh(neon, declarerLumineux(new THREE.MeshBasicMaterial({ color: 0xff7a1e }), 3), { ombre: false });
  const matFeux = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  ajouterMesh(feux, matFeux, { ombre: false });
  ajouterMesh(bannieres, new THREE.MeshStandardMaterial({ map: textureBanniere(), roughness: 0.85, side: THREE.DoubleSide }), { ombre: false });

  // ---------- Herbe, cailloux et buissons dans l'arène (décor sans collision) ----------
  const libre = (x, z, marge) => {
    for (const b of boites) {
      if (x > b.min.x - marge && x < b.max.x + marge && z > b.min.z - marge && z < b.max.z + marge) return false;
    }
    return true;
  };
  const instancier = (mesh, n, placer) => {
    let k = 0;
    for (let essai = 0; essai < n * 5 && k < n; essai++) {
      const res = placer();
      if (!res) continue;
      const [x, y, z, s, sy, ry, couleur] = res;
      mesh.setMatrixAt(k, _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(0, ry, 0)), _s.set(s, sy, s)));
      if (couleur !== undefined) mesh.setColorAt(k, _c.set(couleur));
      k++;
    }
    mesh.count = k;
    mesh.computeBoundingSphere();
    scene.add(mesh);
    return mesh;
  };
  const nbHerbe = qualite === 'haute' ? 2800 : 1000;
  const geoTouffe = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const touffe = new Assemblage().ajouter(geoTouffe).ajouter(geoTouffe, 0, 0, 0, { ry: Math.PI / 2 }).geometrie();
  const herbe = new THREE.InstancedMesh(touffe, new THREE.MeshLambertMaterial({
    map: textureTouffe(), alphaTest: 0.5, side: THREE.DoubleSide,
  }), nbHerbe);
  const vertsHerbe = [0x6f8240, 0x5d7838, 0x7d8a48, 0x667a3a, 0x8a8a52];
  instancier(herbe, nbHerbe, () => {
    const x = (r() - 0.5) * 59, z = (r() - 0.5) * 59;
    if (!libre(x, z, 0.3)) return null;
    // moins d'herbe sur les allées de terre battue
    const allee = Math.min(Math.abs(x), Math.abs(z)) < 2.5 || Math.hypot(x, z) < 7;
    if (allee && r() < 0.85) return null;
    const s = 0.22 + r() * 0.25;
    return [x, 0, z, s * 1.4, s * (0.6 + r() * 0.5), r() * 3, vertsHerbe[Math.floor(r() * vertsHerbe.length)]];
  });
  const nbBuissons = qualite === 'haute' ? 70 : 40;
  const buissons = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshLambertMaterial({ flatShading: true }), nbBuissons);
  const rouges = [0xa3192a, 0xc2283a, 0x8a1424, 0xd4466a, 0xb53156];
  instancier(buissons, nbBuissons, () => {
    // le long de la clôture et au pied des obstacles
    const cote = Math.floor(r() * 4), t = (r() - 0.5) * 56, d = DEMI_ARENE - 0.6 - r() * 1.4;
    const [x, z] = [[t, -d], [d, t], [t, d], [-d, t]][cote];
    if (!libre(x, z, 0.2)) return null;
    if (POINTS_APPARITION.some(([px, pz]) => Math.hypot(px - x, pz - z) < 3)) return null;
    const s = 0.45 + r() * 0.45;
    return [x, s * 0.25, z, s, s * 0.7, r() * 6, rouges[Math.floor(r() * rouges.length)]];
  });
  buissons.castShadow = true;

  // Feux rouges qui clignotent
  let temps = 0;
  return {
    obstacles,
    boites,
    surfaces: [sol, ...obstacles], // tout ce que les balles peuvent toucher
    ciel,
    decor,
    herbe,
    buissonsArene: buissons,
    update(dt) {
      temps += dt;
      ciel.update(dt, temps);
      decor.update(dt, temps);
      matFeux.color.setHex(Math.sin(temps * 3) > -0.2 ? 0xff2a1a : 0x3a0806);
    },
  };
}
