// Génère les icônes de l'app (PWA) à partir du logo SVG du jeu.
// Usage : node scripts/generer-icones.mjs
// (Playwright + Chromium nécessaires ; chemin modifiable avec PLAYWRIGHT=/chemin/vers/playwright/index.mjs)
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const { chromium } = await import(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright/index.mjs');

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dossier = path.join(racine, 'icons');
fs.mkdirSync(dossier, { recursive: true });

// Logo : identique au <symbol id="logo"> de index.html (triangle métal + pointe orange)
const LOGO = `
  <defs>
    <linearGradient id="metal" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f3f5f7"/><stop offset="0.48" stop-color="#a7afb8"/>
      <stop offset="0.52" stop-color="#5f666f"/><stop offset="1" stop-color="#c9cfd5"/>
    </linearGradient>
  </defs>
  <polygon points="2,6 34,6 50,42 66,6 98,6 50,88" fill="url(#metal)"/>
  <polygon points="12,12 30,12 50,56 70,12 88,12 50,76" fill="none" stroke="#1b1e23" stroke-width="TRAIT"/>
  <polygon points="50,34 39,10 61,10" fill="#ff7a1e"/>`;

/**
 * taille : côté en px ; logo : part du côté occupée par le logo ; trait : épaisseur du contour intérieur
 * (plus épais en petit pour rester lisible).
 */
const ICONES = [
  { fichier: 'icon-192.png', taille: 192, logo: 0.66, trait: 3 },
  { fichier: 'icon-512.png', taille: 512, logo: 0.66, trait: 2.5 },
  { fichier: 'icon-maskable-512.png', taille: 512, logo: 0.5, trait: 2.5 }, // zone sûre : cercle de 80 %
  { fichier: 'apple-touch-icon-180.png', taille: 180, logo: 0.64, trait: 3 },
  { fichier: 'favicon-32.png', taille: 32, logo: 0.9, trait: 5, petit: true },
];

function page({ taille, logo, trait, petit }) {
  const l = taille * logo;
  const h = l * 0.9; // viewBox 100 × 90
  // Fond sombre opaque, halo orange derrière le logo, léger liseré orange en bas
  return `<!doctype html><html><head><style>
    html, body { margin: 0; width: ${taille}px; height: ${taille}px; overflow: hidden; }
    .fond {
      width: 100%; height: 100%; position: relative;
      background:
        radial-gradient(circle at 50% 46%, rgba(255,122,30,${petit ? 0.4 : 0.55}) 0%, rgba(255,122,30,0.16) 36%, rgba(255,122,30,0) 62%),
        linear-gradient(180deg, #1f242a 0%, #14171b 55%, #0d0f12 100%);
    }
    svg { position: absolute; left: ${(taille - l) / 2}px; top: ${(taille - h) / 2 + h * 0.03}px;
          width: ${l}px; height: ${h}px;
          filter: drop-shadow(0 ${taille * 0.012}px ${taille * 0.02}px rgba(0,0,0,0.75)); }
  </style></head><body><div class="fond">
    <svg viewBox="0 0 100 90">${LOGO.replace('TRAIT', trait)}</svg>
  </div></body></html>`;
}

const navigateur = await chromium.launch();
try {
  for (const icone of ICONES) {
    const p = await navigateur.newPage({ viewport: { width: icone.taille, height: icone.taille }, deviceScaleFactor: 1 });
    await p.setContent(page(icone));
    await p.screenshot({ path: path.join(dossier, icone.fichier), omitBackground: false });
    await p.close();
    console.log('Créé : icons/' + icone.fichier);
  }
} finally {
  await navigateur.close();
}
