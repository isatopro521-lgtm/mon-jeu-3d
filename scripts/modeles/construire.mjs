// Fabrique les modèles allégés du jeu (dossier modeles/) à partir des fichiers sources libres
// listés dans CREDITS.md. À lancer seulement pour régénérer les modèles :
//
//   mkdir -p /tmp/outils && cd /tmp/outils && npm init -y && \
//     npm i @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 sharp
//   NODE_PATH=/tmp/outils/node_modules node scripts/modeles/construire.mjs <dossier-sources>
//
// <dossier-sources> contient les fichiers téléchargés (voir SOURCES ci-dessous).
// Le jeu, lui, n'a besoin d'aucun outil : il charge directement les .glb produits.

import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(path.join(process.env.NODE_PATH ?? '.', 'x.js'));
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const F = require('@gltf-transform/functions');
const sharp = require('sharp');

const SOURCES = path.resolve(process.argv[2] ?? '.');
const SORTIE = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../modeles');
fs.mkdirSync(SORTIE, { recursive: true });

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

// Ordre de la palette du soldat (doit correspondre à PALETTE_SOLDAT dans src/modeles.js)
export const PARTIES_SOLDAT = ['Soldier_Clothes', 'Soldier_Iron', 'Soldier_Fabric', 'Soldier_Metal', 'Soldier_Elements',
  'Soldier_Armor', 'Soldier_Flesh', 'Soldier_Shoes', 'Soldier_Boots', 'Soldier_Skin'];
const ANIMS_SOLDAT = ['idle', 'walk', 'ready_idle', 'ready_walk', 'ready_run', 'aim_idle', 'aim_walk', 'shoot', 'hit', 'death', 'melee'];

async function finir(doc, nom, { textures = 512, quantifier = true } = {}) {
  await doc.transform(
    F.resample({ tolerance: 0.0008 }),
    F.dedup(),
    F.prune({ keepLeaves: true, keepAttributes: true }),
    F.textureCompress({ encoder: sharp, targetFormat: 'jpeg', quality: 82, resize: [textures, textures] }),
    ...(quantifier ? [F.quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeWeight: 8 })] : []),
    F.prune({ keepLeaves: true, keepAttributes: true }),
  );
  doc.getRoot().getAsset().generator = 'NEXUS FRONTIER — scripts/modeles/construire.mjs';
  const fichier = path.join(SORTIE, nom);
  await io.write(fichier, doc);
  console.log(nom, (fs.statSync(fichier).size / 1024).toFixed(0), 'Ko');
}

/** Soldat : BAMEN (CC BY 4.0) + animations Quaternius (CC0) retargetées par Operation Steel Tide (MIT). */
async function soldat() {
  const doc = await io.read(path.join(SOURCES, 'bamen_military_soldier_animated.glb'));
  const root = doc.getRoot();
  for (const a of root.listAnimations()) {
    if (ANIMS_SOLDAT.includes(a.getName())) continue;
    for (const c of a.listChannels()) c.dispose();
    for (const sp of a.listSamplers()) sp.dispose();
    a.dispose();
  }
  // Pistes inutiles : échelle, et translations restées à la position de repos (seul le bassin bouge)
  for (const a of root.listAnimations()) {
    for (const c of a.listChannels()) {
      const chemin = c.getTargetPath();
      let inutile = chemin === 'scale';
      if (chemin === 'translation') {
        const repos = c.getTargetNode().getTranslation();
        const v = c.getSampler().getOutput().getArray();
        inutile = true;
        for (let k = 0; k < v.length; k++) if (Math.abs(v[k] - repos[k % 3]) > 0.002 * 100) { inutile = false; break; }
      }
      if (inutile) { const sp = c.getSampler(); c.dispose(); sp.dispose(); }
    }
  }
  // Une seule matière (palette via uv1) pour le corps + la visière à part :
  // 2 appels de rendu par soldat au lieu de 11.
  const mesh = root.listMeshes()[0];
  const corps = doc.createMaterial('Soldat').setRoughnessFactor(1).setMetallicFactor(1);
  const visiere = doc.createMaterial('Visiere').setBaseColorFactor([0.02, 0.03, 0.03, 1]).setMetallicFactor(0.7).setRoughnessFactor(0.15);
  for (const p of mesh.listPrimitives()) {
    const nom = p.getMaterial().getName();
    if (nom === 'Soldier_Glass') { p.setMaterial(visiere); continue; }
    const i = PARTIES_SOLDAT.indexOf(nom);
    const uv1 = p.getAttribute('TEXCOORD_1');
    const n = p.getAttribute('POSITION').getCount();
    const tab = new Float32Array(n * 2);
    for (let k = 0; k < n; k++) { tab[k * 2] = (i + 0.5) / 16; tab[k * 2 + 1] = 0.5; }
    uv1.setArray(tab);
    p.setMaterial(corps);
  }
  const prims = mesh.listPrimitives().filter((p) => p.getMaterial() === corps);
  const joint = F.joinPrimitives(prims);
  for (const p of prims) { mesh.removePrimitive(p); p.dispose(); }
  mesh.addPrimitive(joint);
  // Prises inutiles
  for (const n of root.listNodes()) {
    if (/Socket$/.test(n.getName()) && !['WeaponSocket', 'HeadSocket'].includes(n.getName())) n.dispose();
  }
  await finir(doc, 'soldat.glb');
}

/** Bras à la première personne : DJMaesen « fps animated smg » (CC BY 4.0), pose fusil statique. */
async function bras() {
  const doc = await io.read(path.join(SOURCES, 'smg45_rifle_arms.glb'));
  await finir(doc, 'bras.glb');
}

/** Fusil d'assaut M4A1 : nisu (CC0), assemblage Operation Steel Tide (pièces Quaternius CC0). */
async function fusil() {
  const doc = await io.read(path.join(SOURCES, 'm4.glb'));
  for (const n of doc.getRoot().listNodes()) {
    if (['SpareMagazine', 'Suppressor'].includes(n.getName())) {
      for (const e of n.listChildren()) e.dispose();
      n.dispose();
    }
  }
  for (const m of doc.getRoot().listMaterials()) {
    const ext = m.getExtension('KHR_materials_specular');
    if (ext) m.setExtension('KHR_materials_specular', null);
  }
  await finir(doc, 'fusil.glb', { textures: 1024 });
}

/** Fusil à pompe Mossberg 590A1 : J-Toastie (CC BY 3.0). */
async function pompe() {
  const doc = await io.read(path.join(SOURCES, 'shotgun_mossberg.glb'));
  await finir(doc, 'pompe.glb');
}

/** Armes des ennemis : Quaternius Ultimate Guns (CC0). */
async function armesEnnemis() {
  for (const [src, nom] of [['mp5a5.glb', 'pm-ennemi.glb'], ['ak74.glb', 'fusil-ennemi.glb']]) {
    const doc = await io.read(path.join(SOURCES, src));
    // Couleurs des matières → couleurs de sommets, puis une seule matière : 1 appel de rendu par arme
    const unique = doc.createMaterial('Arme').setMetallicFactor(0.55).setRoughnessFactor(0.5);
    for (const mesh of doc.getRoot().listMeshes()) {
      const prims = mesh.listPrimitives();
      for (const p of prims) {
        const [r, g, b] = p.getMaterial().getBaseColorFactor();
        const n = p.getAttribute('POSITION').getCount();
        const c = new Float32Array(n * 3);
        for (let k = 0; k < n; k++) c.set([r, g, b], k * 3);
        p.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(c).setBuffer(doc.getRoot().listBuffers()[0]));
        for (const att of p.listSemantics()) if (!['POSITION', 'NORMAL', 'COLOR_0'].includes(att)) p.setAttribute(att, null);
        p.setMaterial(unique);
      }
      const joint = F.joinPrimitives(prims);
      for (const p of prims) { mesh.removePrimitive(p); p.dispose(); }
      mesh.addPrimitive(joint);
    }
    await finir(doc, nom);
  }
}

const taches = { soldat, bras, fusil, pompe, armesEnnemis };
const choix = process.argv.slice(3);
for (const [nom, f] of Object.entries(taches)) if (!choix.length || choix.includes(nom)) await f();
