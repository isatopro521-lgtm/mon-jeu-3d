import * as THREE from 'three';
import { aleatoire, fbm } from './utils.js';

// Textures procédurales dessinées sur des canvas (aucun fichier image à charger).

export function textureCanvas(largeur, hauteur, dessiner, { repeter = true, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = largeur;
  c.height = hauteur;
  dessiner(c.getContext('2d'), largeur, hauteur);
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  if (repeter) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** Logo de faction : triangle dans un triangle (style « delta »). */
export function dessinerLogo(g, cx, cy, taille, couleur = '#fff') {
  const h = taille * 0.866;
  g.save();
  g.translate(cx, cy);
  g.fillStyle = g.strokeStyle = couleur;
  g.lineJoin = 'miter';
  g.lineWidth = taille * 0.1;
  g.beginPath();
  g.moveTo(0, -h * 0.62); g.lineTo(taille / 2, h * 0.38); g.lineTo(-taille / 2, h * 0.38); g.closePath();
  g.stroke();
  // Triangle intérieur pointe en bas, coupé par une barre
  g.beginPath();
  g.moveTo(-taille * 0.2, -h * 0.02); g.lineTo(taille * 0.2, -h * 0.02); g.lineTo(0, h * 0.28); g.closePath();
  g.fill();
  g.fillRect(-taille * 0.06, -h * 0.4, taille * 0.12, h * 0.3);
  g.restore();
}

/** Détail de sol (herbe, terre, cailloux) — neutre, teinté ensuite par les couleurs de sommets. */
export function textureSol() {
  return textureCanvas(256, 256, (g, t) => {
    const r = aleatoire(7);
    const img = g.createImageData(t, t);
    for (let y = 0; y < t; y++) {
      for (let x = 0; x < t; x++) {
        // bruit périodique (texture répétée sans couture)
        const n = fbmPeriodique(x / t, y / t, 8);
        const v = 150 + n * 90 + (r() - 0.5) * 30;
        const i = (y * t + x) * 4;
        img.data[i] = v; img.data[i + 1] = v * 1.02; img.data[i + 2] = v * 0.9; img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // brins d'herbe
    for (let i = 0; i < 900; i++) {
      const x = r() * t, y = r() * t, l = 2 + r() * 4;
      const v = 120 + r() * 120;
      g.strokeStyle = `rgba(${v * 0.85},${v},${v * 0.55},0.55)`;
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y - l); g.stroke();
    }
    // petits cailloux
    for (let i = 0; i < 50; i++) {
      const x = r() * t, y = r() * t, s = 0.8 + r() * 2;
      const v = 170 + r() * 70;
      g.fillStyle = `rgb(${v},${v},${v * 0.97})`;
      g.beginPath(); g.ellipse(x, y, s, s * 0.7, r() * 3, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.beginPath(); g.ellipse(x + 0.6, y + 0.8, s, s * 0.6, 0, 0, Math.PI * 2); g.fill();
    }
  });
}

function fbmPeriodique(u, v, echelle) {
  // mélange de 4 échantillons décalés pour obtenir un bruit qui se répète sans couture
  const a = fbm(u * echelle, v * echelle, 4);
  const b = fbm((u - 1) * echelle, v * echelle, 4);
  const c = fbm(u * echelle, (v - 1) * echelle, 4);
  const d = fbm((u - 1) * echelle, (v - 1) * echelle, 4);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v - 0.5;
}

/** Touffe d'herbe (brins sur fond transparent). */
export function textureTouffe() {
  return textureCanvas(128, 128, (g, t) => {
    const r = aleatoire(3);
    for (let i = 0; i < 46; i++) {
      const x = 10 + r() * (t - 20);
      const h = t * (0.45 + r() * 0.55);
      const c = 140 + r() * 100;
      g.strokeStyle = `rgb(${c * 0.8},${c},${c * 0.45})`;
      g.lineWidth = 2 + r() * 2;
      g.beginPath();
      g.moveTo(x, t);
      g.quadraticCurveTo(x + (r() - 0.5) * 20, t - h * 0.6, x + (r() - 0.5) * 34, t - h);
      g.stroke();
    }
  }, { repeter: false });
}

/** Panneau de grillage soudé (alpha). */
export function textureGrillage() {
  return textureCanvas(128, 128, (g, t) => {
    g.clearRect(0, 0, t, t);
    g.strokeStyle = '#c9ccd0';
    g.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      const p = i * t / 4;
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, t); g.stroke();
      g.beginPath(); g.moveTo(0, p); g.lineTo(t, p); g.stroke();
    }
  });
}

/** Tôle ondulée de conteneur (gris, teintée par couleur de sommet). */
export function textureConteneur() {
  return textureCanvas(256, 128, (g, w, h) => {
    const r = aleatoire(11);
    for (let x = 0; x < w; x++) {
      const v = 175 + Math.sin(x / w * Math.PI * 2 * 18) * 45;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x, 0, 1, h);
    }
    g.fillStyle = 'rgba(60,40,25,0.25)'; // rouille et salissures
    for (let i = 0; i < 90; i++) g.fillRect(r() * w, h - r() * 30, 2 + r() * 6, r() * 20);
    g.fillStyle = 'rgba(40,40,40,0.35)';
    g.fillRect(0, 0, w, 6); g.fillRect(0, h - 8, w, 8);
    g.fillRect(0, 0, 6, h); g.fillRect(w - 6, 0, 6, h);
  });
}

/** Bannière rouge avec le logo blanc. */
export function textureBanniere() {
  return textureCanvas(128, 320, (g, w, h) => {
    const d = g.createLinearGradient(0, 0, w, 0);
    d.addColorStop(0, '#5c0f12'); d.addColorStop(0.5, '#9c1c20'); d.addColorStop(1, '#5c0f12');
    g.fillStyle = d;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, 0, w, 14);
    g.fillRect(0, h - 10, w, 10);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(8, 20, 3, h - 40); g.fillRect(w - 11, 20, 3, h - 40);
    dessinerLogo(g, w / 2, h * 0.44, w * 0.62, '#f2eee8');
    g.fillStyle = '#f2eee8';
    g.font = 'bold 15px sans-serif';
    g.textAlign = 'center';
    g.fillText('NEXUS', w / 2, h * 0.74);
  }, { repeter: false });
}

/**
 * Atlas « industriel » des obstacles de l'arène (caisses, tours, plateforme).
 * Chaque zone est donnée en pixels ; `zonesAtlas` les convertit en coordonnées UV.
 */
export const ATLAS = 1024;
export const ZONES = {
  caisseCote: [0, 0, 256, 256],
  caisseDessus: [256, 0, 256, 256],
  plateformeDessus: [512, 0, 512, 512],
  tourCote: [0, 256, 160, 600],
  tourDessus: [256, 256, 128, 128],
  plateformeCote: [160, 864, 864, 160],
};

export function textureAtlasIndustriel() {
  return textureCanvas(ATLAS, ATLAS, (g) => {
    const r = aleatoire(5);
    const salir = (x, y, w, h, n = 60) => {
      for (let i = 0; i < n; i++) {
        g.fillStyle = `rgba(${r() < 0.5 ? '20,18,16' : '120,90,60'},${0.05 + r() * 0.12})`;
        g.fillRect(x + r() * w, y + r() * h, 2 + r() * 14, 1 + r() * 6);
      }
    };
    // --- Caisse métal : panneaux sombres, cadre, liseré orange, pochoir
    {
      const [x, y, w, h] = ZONES.caisseCote;
      g.fillStyle = '#33373d'; g.fillRect(x, y, w, h);
      g.fillStyle = '#25282d';
      g.fillRect(x, y, w, 18); g.fillRect(x, y + h - 18, w, 18); g.fillRect(x, y, 18, h); g.fillRect(x + w - 18, y, 18, h);
      g.strokeStyle = '#1b1d21'; g.lineWidth = 3;
      for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(x + 18, y + i * h / 4); g.lineTo(x + w - 18, y + i * h / 4); g.stroke(); }
      g.fillStyle = '#e07a1f'; g.fillRect(x + 18, y + 40, w - 36, 10);
      g.fillStyle = 'rgba(230,230,230,0.65)'; g.font = 'bold 30px monospace';
      g.fillText('NX-07', x + 60, y + 150);
      g.fillStyle = '#8b9096';
      for (const [px, py] of [[9, 9], [w - 9, 9], [9, h - 9], [w - 9, h - 9]]) { g.beginPath(); g.arc(x + px, y + py, 4, 0, 7); g.fill(); }
      salir(x, y, w, h);
    }
    {
      const [x, y, w, h] = ZONES.caisseDessus;
      g.fillStyle = '#2d3136'; g.fillRect(x, y, w, h);
      g.strokeStyle = '#1e2024'; g.lineWidth = 16; g.strokeRect(x + 8, y + 8, w - 16, h - 16);
      g.fillStyle = '#3d4248'; g.fillRect(x + 40, y + 40, w - 80, h - 80);
      dessinerLogo(g, x + w / 2, y + h / 2 + 10, 90, 'rgba(224,122,31,0.8)');
      salir(x, y, w, h);
    }
    // --- Dessus de plateforme : béton + marquage orange
    {
      const [x, y, w, h] = ZONES.plateformeDessus;
      g.fillStyle = '#7d7a72'; g.fillRect(x, y, w, h);
      for (let i = 0; i < 4000; i++) {
        const v = 100 + r() * 60;
        g.fillStyle = `rgba(${v},${v},${v * 0.95},0.35)`;
        g.fillRect(x + r() * w, y + r() * h, 2, 2);
      }
      g.strokeStyle = 'rgba(40,40,40,0.5)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(x + w / 2, y); g.lineTo(x + w / 2, y + h); g.moveTo(x, y + h / 2); g.lineTo(x + w, y + h / 2); g.stroke();
      g.strokeStyle = '#e07a1f'; g.lineWidth = 14;
      g.strokeRect(x + 30, y + 30, w - 60, h - 60);
      dessinerLogo(g, x + w / 2, y + h / 2 + 20, 230, 'rgba(224,122,31,0.85)');
      salir(x, y, w, h, 200);
    }
    // --- Côté de plateforme : bandes de danger
    {
      const [x, y, w, h] = ZONES.plateformeCote;
      g.fillStyle = '#2a2d31'; g.fillRect(x, y, w, h);
      g.save(); g.beginPath(); g.rect(x, y + 30, w, h - 60); g.clip();
      for (let i = -4; i < 30; i++) {
        g.fillStyle = i % 2 ? '#e07a1f' : '#1c1d20';
        g.beginPath();
        g.moveTo(x + i * 40, y + h); g.lineTo(x + i * 40 + 40, y + h); g.lineTo(x + i * 40 + 120, y); g.lineTo(x + i * 40 + 80, y);
        g.fill();
      }
      g.restore();
      salir(x, y, w, h, 80);
    }
    // --- Tour métallique : panneaux rivetés, bande sombre
    {
      const [x, y, w, h] = ZONES.tourCote;
      g.fillStyle = '#4a4f57'; g.fillRect(x, y, w, h);
      for (let k = 0; k < 6; k++) {
        const py = y + k * h / 6;
        g.fillStyle = k % 2 ? '#434850' : '#50555d';
        g.fillRect(x + 6, py + 4, w - 12, h / 6 - 8);
        g.fillStyle = '#9aa0a8';
        for (const px of [14, w - 14]) for (const dy of [12, h / 6 - 12]) { g.beginPath(); g.arc(x + px, py + dy, 3, 0, 7); g.fill(); }
      }
      g.fillStyle = '#1f2226'; g.fillRect(x + w / 2 - 14, y, 28, h);
      g.fillStyle = '#e07a1f'; g.fillRect(x, y + 70, w, 8);
      salir(x, y, w, h, 120);
    }
    {
      const [x, y, w, h] = ZONES.tourDessus;
      g.fillStyle = '#3a3e45'; g.fillRect(x, y, w, h);
      g.strokeStyle = '#25282d'; g.lineWidth = 10; g.strokeRect(x + 5, y + 5, w - 10, h - 10);
    }
  });
}

/** Réécrit les UV d'une BoxGeometry : dessus/dessous → zone `dessus`, côtés → zone `cote`. */
export function uvAtlas(geo, zoneCote, zoneDessus = zoneCote) {
  const uv = geo.attributes.uv, n = geo.attributes.normal;
  const conv = ([x, y, w, h]) => [x / ATLAS, 1 - (y + h) / ATLAS, w / ATLAS, h / ATLAS];
  const c = conv(zoneCote), d = conv(zoneDessus);
  for (let i = 0; i < uv.count; i++) {
    const z = Math.abs(n.getY(i)) > 0.5 ? d : c;
    uv.setXY(i, z[0] + uv.getX(i) * z[2], z[1] + uv.getY(i) * z[3]);
  }
  return geo;
}

/** Béton de façade (avant-postes). */
export function textureBeton() {
  return textureCanvas(256, 256, (g, t) => {
    const r = aleatoire(21);
    g.fillStyle = '#8b8a85'; g.fillRect(0, 0, t, t);
    for (let i = 0; i < 3000; i++) {
      const v = 110 + r() * 60;
      g.fillStyle = `rgba(${v},${v},${v * 0.96},0.3)`;
      g.fillRect(r() * t, r() * t, 2, 2);
    }
    g.strokeStyle = 'rgba(40,40,40,0.45)'; g.lineWidth = 2;
    for (let i = 0; i <= 2; i++) { g.beginPath(); g.moveTo(0, i * t / 2); g.lineTo(t, i * t / 2); g.stroke(); }
    g.beginPath(); g.moveTo(t / 2, 0); g.lineTo(t / 2, t); g.stroke();
    for (let i = 0; i < 25; i++) { // coulures
      g.fillStyle = `rgba(30,28,25,${0.05 + r() * 0.1})`;
      g.fillRect(r() * t, r() * 30, 2 + r() * 4, 40 + r() * 140);
    }
  });
}

/** Nuage cotonneux (blanc, bords doux). */
export function textureNuage() {
  return textureCanvas(256, 128, (g, w, h) => {
    const r = aleatoire(31);
    for (let i = 0; i < 36; i++) {
      const x = w * (0.15 + r() * 0.7), y = h * (0.35 + r() * 0.35);
      const rad = h * (0.12 + r() * 0.22) * (1 - Math.abs(x / w - 0.5));
      const d = g.createRadialGradient(x, y, 0, x, y, rad * 1.6);
      const ombre = y > h * 0.55 ? 0.82 : 1;
      d.addColorStop(0, `rgba(${255 * ombre},${255 * ombre},${255 * ombre},0.55)`);
      d.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = d;
      g.fillRect(0, 0, w, h);
    }
  }, { repeter: false });
}

/** Carte de normales d'eau (vaguelettes). */
export function textureNormalesEau() {
  const t = 256;
  const c = document.createElement('canvas');
  c.width = c.height = t;
  const g = c.getContext('2d');
  const img = g.createImageData(t, t);
  const hauteurs = new Float32Array(t * t);
  for (let y = 0; y < t; y++) for (let x = 0; x < t; x++) hauteurs[y * t + x] = fbmPeriodique(x / t, y / t, 6);
  const h = (x, y) => hauteurs[((y + t) % t) * t + ((x + t) % t)];
  for (let y = 0; y < t; y++) {
    for (let x = 0; x < t; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * 6;
      const dy = (h(x, y + 1) - h(x, y - 1)) * 6;
      const i = (y * t + x) * 4;
      img.data[i] = 128 + dx * 127; img.data[i + 1] = 128 + dy * 127; img.data[i + 2] = 255; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Filets d'eau verticaux pour la cascade. */
export function textureCascade() {
  return textureCanvas(128, 256, (g, w, h) => {
    const r = aleatoire(41);
    g.fillStyle = 'rgba(190,220,235,0.55)'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 140; i++) {
      const x = r() * w, l = 30 + r() * 120, y = r() * h;
      g.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.6})`;
      g.fillRect(x, y, 1 + r() * 3, l);
      g.fillRect(x, y - h, 1 + r() * 3, l); // raccord vertical
    }
  });
}

/** Spirale de la tempête (vortex vu de dessous) : nuage sombre, bras rouges lumineux, cœur brillant. */
export function textureVortex() {
  return textureCanvas(512, 512, (g, t) => {
    const c = t / 2;
    g.clearRect(0, 0, t, t);
    const fond = g.createRadialGradient(c, c, 0, c, c, c);
    fond.addColorStop(0, 'rgba(40,6,6,0.95)');
    fond.addColorStop(0.6, 'rgba(30,6,8,0.7)');
    fond.addColorStop(1, 'rgba(20,4,6,0)');
    g.fillStyle = fond;
    g.fillRect(0, 0, t, t);
    g.lineCap = 'round';
    for (let bras = 0; bras < 6; bras++) {
      for (let k = 0; k < 140; k++) {
        const p = k / 140, p2 = (k + 1) / 140;
        const a1 = bras * Math.PI / 3 + p * Math.PI * 1.5, a2 = bras * Math.PI / 3 + p2 * Math.PI * 1.5;
        const r1 = c * (0.08 + p * 0.85), r2 = c * (0.08 + p2 * 0.85);
        g.strokeStyle = `rgba(255,${Math.round(70 - p * 50)},${Math.round(50 - p * 40)},${(0.85 * (1 - p) ** 1.2).toFixed(3)})`;
        g.lineWidth = 3 + (1 - p) * 10;
        g.beginPath();
        g.moveTo(c + Math.cos(a1) * r1, c + Math.sin(a1) * r1);
        g.lineTo(c + Math.cos(a2) * r2, c + Math.sin(a2) * r2);
        g.stroke();
      }
    }
    const coeur = g.createRadialGradient(c, c, 0, c, c, c * 0.22);
    coeur.addColorStop(0, 'rgba(255,220,200,1)');
    coeur.addColorStop(0.4, 'rgba(255,80,50,0.9)');
    coeur.addColorStop(1, 'rgba(255,40,30,0)');
    g.fillStyle = coeur;
    g.fillRect(0, 0, t, t);
  }, { repeter: false });
}

// ---------- Cartes PBR générées (relief et rugosité) ----------
// Calculées une seule fois au chargement à partir des dessins ci-dessus (ou d'un bruit), puis
// réutilisées par toutes les matières : aucun fichier image à télécharger.

/** Luminance (0..1) d'une image de canvas, réduite à `taille` pixels de côté au plus. */
function luminance(source, taille) {
  const l = Math.min(taille, source.width), h = Math.max(1, Math.round(source.height * l / source.width));
  const c = document.createElement('canvas');
  c.width = l; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(source, 0, 0, l, h);
  const d = g.getImageData(0, 0, l, h).data;
  const lum = new Float32Array(l * h);
  for (let i = 0; i < lum.length; i++) lum[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) / 255;
  return { lum, l, h };
}

/** Texture de données (non sRGB) répétable, avec mipmaps. */
function textureDonnees(d, l, h, modele) {
  const t = new THREE.DataTexture(d, l, h);
  t.wrapS = modele?.wrapS ?? THREE.RepeatWrapping;
  t.wrapT = modele?.wrapT ?? THREE.RepeatWrapping;
  if (modele) t.repeat.copy(modele.repeat);
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/**
 * Carte de normales tirée d'une texture couleur (les zones claires « sortent ») : rivets, joints,
 * tôle ondulée, grain du béton… `force` règle la hauteur du relief.
 */
const cacheCartes = new Map();
export function normalesDepuis(texture, { force = 2, taille = 512, inverser = false } = {}) {
  const cle = `n${texture.uuid}/${force}/${taille}/${inverser}`;
  if (cacheCartes.has(cle)) return cacheCartes.get(cle);
  const { lum, l, h } = luminance(texture.image, taille);
  const d = new Uint8Array(l * h * 4);
  const s = inverser ? -force : force;
  const enrouler = texture.wrapS === THREE.RepeatWrapping;
  const px = (x, y) => {
    if (enrouler) { x = (x + l) % l; y = (y + h) % h; } else { x = Math.min(l - 1, Math.max(0, x)); y = Math.min(h - 1, Math.max(0, y)); }
    return lum[y * l + x];
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      // filtre de Sobel
      const gx = (px(x + 1, y - 1) + 2 * px(x + 1, y) + px(x + 1, y + 1)) - (px(x - 1, y - 1) + 2 * px(x - 1, y) + px(x - 1, y + 1));
      const gy = (px(x - 1, y + 1) + 2 * px(x, y + 1) + px(x + 1, y + 1)) - (px(x - 1, y - 1) + 2 * px(x, y - 1) + px(x + 1, y - 1));
      let nx = -gx * s, ny = gy * s; // y de l'image vers le bas, v des UV vers le haut
      const n = 1 / Math.hypot(nx, ny, 1);
      const i = (y * l + x) * 4;
      d[i] = (nx * n * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * n * 0.5 + 0.5) * 255;
      d[i + 2] = (n * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  // l'image du canvas est retournée (flipY) : on fait pareil
  const t = textureDonnees(d, l, h, texture);
  t.flipY = texture.flipY;
  cacheCartes.set(cle, t);
  return t;
}

/**
 * Carte de rugosité tirée d'une texture couleur : `base` ± `variation` selon la luminance
 * (les salissures sombres sont plus mates). Canal vert, comme le veut Three.js.
 */
export function rugositeDepuis(texture, { base = 0.6, variation = 0.3, taille = 256, inverser = false } = {}) {
  const cle = `r${texture.uuid}/${base}/${variation}/${taille}/${inverser}`;
  if (cacheCartes.has(cle)) return cacheCartes.get(cle);
  const { lum, l, h } = luminance(texture.image, taille);
  const d = new Uint8Array(l * h * 4);
  for (let i = 0; i < lum.length; i++) {
    const k = inverser ? lum[i] - 0.5 : 0.5 - lum[i];
    const r = Math.min(1, Math.max(0.04, base + k * variation * 2));
    d.set([255, r * 255, 0, 255], i * 4);
  }
  const t = textureDonnees(d, l, h, texture);
  t.flipY = texture.flipY;
  cacheCartes.set(cle, t);
  return t;
}

/** Peinture métallique usée (gris neutre, teinté par la couleur des sommets) : rayures, éclats, coulures. */
let metalUse = null;
export function textureMetalUse() {
  return (metalUse ??= textureCanvas(256, 256, (g, t) => {
    const r = aleatoire(41);
    const img = g.createImageData(t, t);
    for (let y = 0; y < t; y++) {
      for (let x = 0; x < t; x++) {
        const n = fbmPeriodique(x / t, y / t, 6);
        const v = 200 + n * 50 + (r() - 0.5) * 14;
        const i = (y * t + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    for (let i = 0; i < 260; i++) { // rayures fines et claires
      const x = r() * t, y = r() * t, l = 4 + r() * 22, a = r() * Math.PI;
      g.strokeStyle = `rgba(255,255,255,${0.15 + r() * 0.25})`;
      g.lineWidth = 0.6 + r() * 0.8;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    for (let i = 0; i < 60; i++) { // éclats de peinture sombres
      g.fillStyle = `rgba(60,55,50,${0.2 + r() * 0.35})`;
      g.beginPath(); g.ellipse(r() * t, r() * t, 1 + r() * 4, 1 + r() * 3, r() * 3, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 18; i++) { // coulures de rouille
      g.fillStyle = `rgba(110,70,40,${0.06 + r() * 0.1})`;
      g.fillRect(r() * t, r() * t, 1 + r() * 3, 20 + r() * 60);
    }
  }));
}

/** Toile de jute des sacs de sable (trame serrée + fibres). */
export function textureToile() {
  return textureCanvas(128, 128, (g, t) => {
    const r = aleatoire(57);
    g.fillStyle = '#c8c0aa'; g.fillRect(0, 0, t, t);
    for (let i = 0; i < t; i += 4) {
      g.fillStyle = 'rgba(70,60,40,0.28)';
      g.fillRect(i, 0, 1.5, t); g.fillRect(0, i + 2, t, 1.5);
    }
    for (let i = 0; i < 400; i++) {
      const v = 150 + r() * 90;
      g.fillStyle = `rgba(${v},${v * 0.95},${v * 0.8},0.35)`;
      g.fillRect(r() * t, r() * t, 1 + r() * 3, 1);
    }
  });
}

/**
 * UV « boîte » en coordonnées du monde : chaque face prend la projection sur son plan dominant.
 * Indispensable après fusion d'éléments de tailles très différentes (la texture garde la même
 * échelle partout : `metre` = taille d'une répétition, en mètres).
 */
export function uvMonde(geo, metre = 2) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  const uv = geo.attributes.uv ?? new THREE.BufferAttribute(new Float32Array(p.count * 2), 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else if (ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv.setXY(i, u / metre, v / metre);
  }
  geo.setAttribute('uv', uv);
  uv.needsUpdate = true;
  return geo;
}
