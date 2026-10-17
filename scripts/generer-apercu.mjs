// Génère captures/apercu-partage.jpg (1200 × 630, JPEG léger pour WhatsApp) : l'image affichée quand on partage le lien
// du jeu (WhatsApp, Discord, X, Snapchat…). Elle part de captures/capture-combat.png.
// Usage : node scripts/generer-apercu.mjs
// (Playwright + Chromium nécessaires ; chemin modifiable avec PLAYWRIGHT=/chemin/vers/playwright/index.mjs)
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const { chromium } = await import(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright/index.mjs');

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fond = fs.readFileSync(path.join(racine, 'captures', 'capture-combat.png')).toString('base64');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; overflow: hidden; background: #14171b; color: #e9edf1;
    font-family: "Inter Display", "Inter", "DejaVu Sans", sans-serif; }
  .fond { position: absolute; inset: 0; background: url(data:image/png;base64,${fond}) center 40% / cover; }
  .voile { position: absolute; inset: 0;
    background: linear-gradient(90deg, rgba(10,12,15,0.95) 0%, rgba(10,12,15,0.82) 40%, rgba(10,12,15,0.1) 72%),
                linear-gradient(0deg, rgba(10,12,15,0.7), rgba(10,12,15,0) 35%); }
  .bloc { position: absolute; left: 70px; top: 0; bottom: 0; display: flex; flex-direction: column;
    justify-content: center; gap: 14px; width: 720px; }
  svg { width: 110px; height: 99px; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.7)); }
  h1 { display: grid; line-height: 0.95; }
  .nexus { font-size: 124px; font-weight: 800; letter-spacing: 8px;
    background: linear-gradient(180deg, #f4f6f8 0%, #b3bbc4 46%, #5e656e 52%, #d2d8de 100%);
    -webkit-background-clip: text; background-clip: text; color: transparent; }
  .frontier { font-size: 50px; font-weight: 700; letter-spacing: 21px; color: #ff7a1e;
    text-shadow: 0 0 22px rgba(255,122,30,0.5); }
  .accroche { font-size: 30px; font-weight: 600; line-height: 1.25; max-width: 700px; }
  .accroche b { color: #ffa25a; }
  .badge { align-self: flex-start; margin-top: 8px; padding: 12px 34px; font-size: 26px; font-weight: 800;
    letter-spacing: 4px; text-transform: uppercase; color: #fff;
    background: linear-gradient(180deg, #ff8a32, #e2620e);
    clip-path: polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%); }
  .barre { position: absolute; left: 0; right: 0; top: 0; height: 8px; background: #ff7a1e; }
</style></head><body>
  <div class="fond"></div><div class="voile"></div><div class="barre"></div>
  <div class="bloc">
    <svg viewBox="0 0 100 90">
      <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#f3f5f7"/><stop offset="0.48" stop-color="#a7afb8"/>
        <stop offset="0.52" stop-color="#5f666f"/><stop offset="1" stop-color="#c9cfd5"/></linearGradient></defs>
      <polygon points="2,6 34,6 50,42 66,6 98,6 50,88" fill="url(#g)"/>
      <polygon points="12,12 30,12 50,56 70,12 88,12 50,76" fill="none" stroke="#1b1e23" stroke-width="2.5"/>
      <polygon points="50,34 39,10 61,10" fill="#ff7a1e"/>
    </svg>
    <h1><span class="nexus">NEXUS</span><span class="frontier">FRONTIER</span></h1>
    <p class="accroche">FPS de survie <b>gratuit</b>, direct dans le navigateur.<br>PC et téléphone, sans installation.</p>
    <span class="badge">Bats mon score</span>
  </div>
</body></html>`;

const navigateur = await chromium.launch();
try {
  const page = await navigateur.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(html);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(racine, 'captures', 'apercu-partage.jpg'), type: 'jpeg', quality: 84 });
  console.log('Créé : captures/apercu-partage.jpg');
} finally {
  await navigateur.close();
}
