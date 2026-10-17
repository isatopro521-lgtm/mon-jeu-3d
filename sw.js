// Service worker de NEXUS FRONTIER : rend le jeu installable et jouable hors ligne.
// - index.html / navigation : réseau d'abord (pour recevoir les mises à jour), cache si hors ligne ;
// - autres fichiers du jeu : cache d'abord ;
// - jamais de cache pour les autres domaines (classement en ligne) ni pour les requêtes POST.
// La version est remplacée par le SHA du commit lors de la publication (workflow « Publier le jeu »).
// En local, le marqueur reste tel quel : on passe alors en « réseau d'abord » partout pour ne pas
// servir de vieux fichiers pendant le développement.

const VERSION = '__VERSION__';
const EN_DEVELOPPEMENT = VERSION.startsWith('__');
const PREFIXE = 'nexus-frontier-';
const CACHE = PREFIXE + VERSION;

// Chemins relatifs à l'emplacement de sw.js (le site est servi sous /mon-jeu-3d/ sur GitHub Pages)
const FICHIERS = [
  './',
  'index.html',
  'style.css',
  'manifest.webmanifest',
  'confidentialite.html',
  'credits.html',
  'film.html',
  'src/main.js',
  'src/audio.js',
  'src/ciel.js',
  'src/config.js',
  'src/decor.js',
  'src/effects.js',
  'src/enemies.js',
  'src/film.js',
  'src/film-musique.js',
  'src/film-voix.js',
  'src/grenades.js',
  'src/hud.js',
  'src/installation.js',
  'src/modeles.js',
  'src/partage.js',
  'src/pickups.js',
  'src/player.js',
  'src/postprocess.js',
  'src/qualite.js',
  'src/scores.js',
  'src/tempete.js',
  'src/textures.js',
  'src/touch.js',
  'src/utils.js',
  'src/weapons.js',
  'src/world.js',
  'lib/three/three.module.min.js',
  'lib/three/addons/controls/PointerLockControls.js',
  'lib/three/addons/loaders/GLTFLoader.js',
  'lib/three/addons/utils/BufferGeometryUtils.js',
  'lib/three/addons/utils/SkeletonUtils.js',
  // Modèles 3D réalistes (voir CREDITS.md)
  'modeles/soldat.glb',
  'modeles/bras.glb',
  'modeles/fusil.glb',
  'modeles/pompe.glb',
  'modeles/pm-ennemi.glb',
  'modeles/fusil-ennemi.glb',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon-180.png',
  'icons/favicon-32.png',
];

const urlIndex = new URL('index.html', self.registration.scope).href;
const urlRacine = new URL('./', self.registration.scope).href;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // 'reload' : ignore le cache HTTP du navigateur pour récupérer la toute dernière version
    await cache.addAll(FICHIERS.map((f) => new Request(f, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const noms = await caches.keys();
    await Promise.all(noms.filter((n) => n.startsWith(PREFIXE) && n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const requete = e.request;
  if (requete.method !== 'GET') return;
  const url = new URL(requete.url);
  if (url.origin !== self.location.origin) return; // classement en ligne, etc. : navigateur seul
  if (!requete.url.startsWith(self.registration.scope)) return;

  if (requete.mode === 'navigate' || url.href.split('?')[0] === urlIndex || EN_DEVELOPPEMENT) {
    e.respondWith(reseauDAbord(requete));
  } else {
    e.respondWith(cacheDAbord(requete));
  }
});

/** Clé de cache : la page d'accueil (avec ou sans ?debug, ?tactile…) est rangée sous index.html. */
function cle(requete) {
  const sansParam = requete.url.split('?')[0].split('#')[0];
  if (requete.mode === 'navigate' && (sansParam === urlRacine || sansParam === urlIndex)) return urlIndex;
  return sansParam === requete.url ? requete : sansParam;
}

async function reseauDAbord(requete) {
  const cache = await caches.open(CACHE);
  try {
    const reponse = await fetch(requete);
    if (reponse.ok && reponse.type === 'basic') cache.put(cle(requete), reponse.clone());
    return reponse;
  } catch (erreur) {
    const enCache = await cache.match(cle(requete), { ignoreSearch: true })
      ?? (requete.mode === 'navigate' ? await cache.match(urlIndex) : undefined);
    if (enCache) return enCache;
    throw erreur;
  }
}

async function cacheDAbord(requete) {
  const cache = await caches.open(CACHE);
  const enCache = await cache.match(requete, { ignoreSearch: true });
  if (enCache) return enCache;
  const reponse = await fetch(requete);
  if (reponse.ok && reponse.type === 'basic') cache.put(requete, reponse.clone());
  return reponse;
}
