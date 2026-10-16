// Génère les captures d'écran du manifest (1280 × 720) en lançant le jeu dans Chromium.
// Usage : node scripts/generer-captures.mjs
// (Playwright + Chromium nécessaires ; chemin modifiable avec PLAYWRIGHT=/chemin/vers/playwright/index.mjs)
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';

const { chromium } = await import(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright/index.mjs');

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dossier = path.join(racine, 'captures');
fs.mkdirSync(dossier, { recursive: true });

// Petit serveur statique (les modules ES ne marchent pas en file://)
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(racine, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!chemin.startsWith(racine)) { res.writeHead(403).end(); return; }
  const fichier = fs.existsSync(chemin) && fs.statSync(chemin).isDirectory() ? path.join(chemin, 'index.html') : chemin;
  fs.readFile(fichier, (err, data) => {
    if (err) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(fichier)] || 'application/octet-stream' }).end(data);
  });
});
await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
const url = `http://127.0.0.1:${serveur.address().port}/index.html?debug`;

const navigateur = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await navigateur.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.error('Erreur dans la page :', e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.jeu);
  await page.addStyleTag({ content: '#ips { display: none !important; }' });
  await page.waitForTimeout(4000); // laisse le travelling du menu démarrer
  await page.screenshot({ path: path.join(dossier, 'capture-menu.png') });
  console.log('Créé : captures/capture-menu.png');

  // Partie : quelques vagues d'ennemis, on vise le plus proche et on tire
  await page.evaluate(() => { window.jeu.commencer(); window.jeu.joueur.vie = 1e9; });
  // Attend que quelques ennemis soient apparus (le jeu tourne lentement sans carte graphique)
  await page.waitForFunction(() => { window.jeu.joueur.vie = 1e9; return window.jeu.ennemis.liste.length >= 3; },
    null, { timeout: 90000, polling: 200 });
  // Mise en scène : cherche une direction dégagée et y place trois ennemis face au joueur
  await page.evaluate(() => {
    const { joueur, ennemis, camera, monde } = window.jeu;
    const p = joueur.position;
    const libre = (x, z) => !monde.boites.some((b) =>
      x > b.min.x - 1 && x < b.max.x + 1 && z > b.min.z - 1 && z < b.max.z + 1 && b.max.y > 0.3);
    let cap = 0;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 24) {
      let ok = true;
      for (let d = 1; d <= 14 && ok; d += 0.5) ok = libre(p.x - Math.sin(a) * d, p.z - Math.cos(a) * d);
      if (ok) { cap = a; break; }
    }
    const places = [[7, 0.18], [10, -0.2], [12.5, 0.05]];
    ennemis.liste.slice(0, 3).forEach((e, i) => {
      const [d, decalage] = places[i];
      e.position.set(p.x - Math.sin(cap + decalage) * d, 0, p.z - Math.cos(cap + decalage) * d);
      e.etat = 'poursuite';
    });
    camera.rotation.set(0.02, cap + 0.04, 0, 'YXZ');
    joueur.vie = joueur.vieMax;
  });
  await page.addStyleTag({ content: '#message { display: none !important; }' }); // bandeau « VAGUE 1 »
  await page.waitForTimeout(500);
  await page.evaluate(() => { window.jeu.joueur.vie = window.jeu.joueur.vieMax; window.jeu.armes.gachette = true; });
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(dossier, 'capture-combat.png') });
  console.log('Créé : captures/capture-combat.png');
} finally {
  await navigateur.close();
  serveur.close();
}
