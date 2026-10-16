import * as THREE from 'three';
import { creerMonde, POINTS_APPARITION, DEMI_ARENE } from './world.js';
import { Joueur } from './player.js';
import { Armes } from './weapons.js';
import { GestionEnnemis } from './enemies.js';
import { Effets } from './effects.js';
import { Bonus, SOIN } from './pickups.js';
import { Grenades } from './grenades.js';
import { hud } from './hud.js';
import { initAudio, sons } from './audio.js';
import { melanger } from './utils.js';
import { ControlesTactiles, estTactile, pleinEcranPaysage } from './touch.js';
import { classement, lirePseudo, nettoyerPseudo } from './scores.js';
import { TempeteNexus } from './tempete.js';
import { Qualite } from './qualite.js';

const MAX_ENNEMIS_SIMULTANES = 12;
const DELAI_APPARITION = 0.7;
const PAUSE_ENTRE_VAGUES = 4;
const CHANCE_SOIN = 0.22;
const CHANCE_GRENADE = 0.1;
const CHANCE_MUNITIONS = 0.14;        // 0.35 quand l'arme en main manque de munitions
const ARMURE_PAR_VAGUE = 25;
const VAGUES_TEMPETE = 5;              // Tempête Nexus toutes les 5 vagues
const CLE_RECORD = 'mon-jeu-3d-record';

document.body.classList.toggle('tactile', estTactile);

// ---------- Rendu ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
// Résolution un peu réduite sur téléphone pour garder un jeu fluide
renderer.setPixelRatio(Math.min(devicePixelRatio, estTactile ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.getElementById('jeu').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 3000);
scene.add(camera); // nécessaire pour afficher l'arme attachée à la caméra

// En mode portrait, on élargit le champ vertical pour garder assez de vision sur les côtés
function ajusterCamera() {
  const aspect = innerWidth / innerHeight;
  const fovMin = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(40)) / aspect);
  camera.aspect = aspect;
  camera.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(fovMin), 75, 115);
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
ajusterCamera();
addEventListener('resize', ajusterCamera);

// ---------- Objets du jeu ----------
const monde = creerMonde(scene, {
  tailleOmbres: estTactile ? 1024 : 2048,
  qualite: estTactile ? 'basse' : 'haute', // moins d'arbres et d'herbe sur téléphone
  renderer,
});
const effets = new Effets(scene);
const joueur = new Joueur(camera, document.body, monde.boites);
const ennemis = new GestionEnnemis(scene, monde, effets);
const bonus = new Bonus(scene);
const tempete = new TempeteNexus(scene, camera, monde.ciel, hud, { qualite: estTactile ? 'basse' : 'haute' });

// Qualité graphique (Auto par défaut) : bouton dans le menu et l'écran pause
const boutonsQualite = document.querySelectorAll('.btn-qualite');
const qualite = new Qualite({
  renderer, scene, monde, tempete, estTactile,
  onChange: (q) => { for (const b of boutonsQualite) b.textContent = q.libelle; },
});
for (const b of boutonsQualite) b.addEventListener('click', () => qualite.cycler());

const partie = {
  etat: 'menu', // menu | jeu | pause | fin
  score: 0,
  vague: 0,
  file: [],
  minuteurApparition: 0,
  entreVagues: 0,
  record: lireRecord(),
};

let dernierSonTouche = 0;

/**
 * Dégâts infligés par le joueur (balle ou grenade) : effets, marqueur, sons,
 * puis score et bonus éventuels si l'ennemi meurt.
 */
function toucherEnnemi(ennemi, degats, direction, point, tete = false) {
  const res = ennemi.toucher(degats, direction);
  if (!res) return;
  effets.etincelles(point, tete ? 0xffcc33 : 0xff3b2f, tete ? 12 : 7, 3.5, 0.5);
  hud.marqueur(tete, res.mort);
  const maintenant = performance.now();
  if (maintenant - dernierSonTouche > 40) { // évite d'empiler les sons (fusil à pompe, grenade)
    dernierSonTouche = maintenant;
    (tete ? sons.tete : sons.touche)();
  }
  if (res.mort) {
    partie.score += res.points * (tete ? 1.5 : 1);
    sons.mortEnnemi();
    effets.etincelles(point, ennemi.t.couleur, 30, 5, 0.9);
    const tirage = Math.random();
    const chanceMun = armes.munitionsBasses ? 0.35 : CHANCE_MUNITIONS;
    if (tirage < CHANCE_SOIN) bonus.creer(ennemi.position.x, ennemi.position.z, 'soin');
    else if (tirage < CHANCE_SOIN + CHANCE_GRENADE) bonus.creer(ennemi.position.x, ennemi.position.z, 'grenade');
    else if (tirage < CHANCE_SOIN + CHANCE_GRENADE + chanceMun) bonus.creer(ennemi.position.x, ennemi.position.z, 'munitions');
  }
}

const armes = new Armes(camera, effets, {
  getCibles: () => ennemis.cibles(),
  onBruit: (position) => ennemis.bruit(position, 25),
  onTouche(ennemi, tete, degats, direction, point) {
    toucherEnnemi(ennemi, tete ? degats * 2 : degats, direction, point, tete);
  },
});

armes.adapterEcran(innerWidth / innerHeight);
addEventListener('resize', () => armes.adapterEcran(innerWidth / innerHeight));

const grenades = new Grenades(scene, camera, effets, monde, {
  joueur,
  peutLancer: () => partie.etat === 'jeu',
  getEnnemis: () => ennemis.liste,
  onTouche: (ennemi, degats, direction, point) => toucherEnnemi(ennemi, degats, direction, point),
  onBlesserJoueur: (n) => blesserJoueur(n),
  onBruit: (position, portee) => ennemis.bruit(position, portee),
  onLancer() { // l'arme s'abaisse brièvement pendant le lancer
    armes.changement = Math.max(armes.changement, 0.25);
    armes.attente = Math.max(armes.attente, 0.25);
  },
});

/** Ramassage d'un bonus : renvoie false si le joueur n'en a pas besoin (il reste au sol). */
function ramasserBonus(type) {
  if (type === 'soin') {
    if (joueur.vie >= joueur.vieMax) return false;
    joueur.soigner(SOIN);
    sons.soin();
    hud.message('+ SOIN', 0.8);
    return true;
  }
  if (type === 'munitions') {
    if (!armes.ajouterMunitions(2)) return false;
    sons.ramasserGrenade();
    hud.message('+ MUNITIONS', 0.8);
    return true;
  }
  if (type === 'grenade') {
    if (!grenades.ajouter(1)) return false;
    sons.ramasserGrenade();
    hud.message('+1 GRENADE', 0.8);
    return true;
  }
  return false;
}

function blesserJoueur(n) {
  if (partie.etat !== 'jeu') return;
  joueur.subirDegats(n);
  hud.degats(n);
  sons.degat();
}

// ---------- Vagues ----------
function composition(n) {
  const liste = [];
  const ajouter = (type, nombre) => { for (let i = 0; i < nombre; i++) liste.push(type); };
  ajouter('soldat', 3 + n * 2);
  ajouter('tireur', n >= 2 ? n - 1 : 0);
  ajouter('brute', n >= 3 ? Math.floor((n - 1) / 2) : 0);
  return melanger(liste);
}

function prochaineVague() {
  partie.vague++;
  partie.file = composition(partie.vague);
  partie.minuteurApparition = 0.5;
  partie.entreVagues = 0;
  sons.vague();
  if (partie.vague % VAGUES_TEMPETE === 0) {
    tempete.demarrer();
    hud.message(`VAGUE ${partie.vague} — TEMPÊTE NEXUS`, 3);
  } else {
    hud.message(`VAGUE ${partie.vague}`);
  }
}

function faireApparaitre(type) {
  // Point d'apparition éloigné du joueur
  const possibles = POINTS_APPARITION.filter(([x, z]) =>
    Math.hypot(x - joueur.position.x, z - joueur.position.z) > 16);
  const [x, z] = possibles[Math.floor(Math.random() * possibles.length)] ?? POINTS_APPARITION[0];
  ennemis.creer(type, x + (Math.random() - 0.5) * 3, z + (Math.random() - 0.5) * 3, partie.vague);
}

function gererVagues(dt) {
  if (partie.file.length > 0) {
    partie.minuteurApparition -= dt;
    if (partie.minuteurApparition <= 0 && ennemis.vivants < MAX_ENNEMIS_SIMULTANES) {
      faireApparaitre(partie.file.shift());
      partie.minuteurApparition = DELAI_APPARITION;
    }
  } else if (ennemis.liste.length === 0) {
    if (partie.entreVagues === 0) {
      partie.entreVagues = PAUSE_ENTRE_VAGUES;
      const prime = 250 * partie.vague;
      partie.score += prime;
      joueur.soigner(25);
      joueur.ajouterArmure(ARMURE_PAR_VAGUE);
      armes.ravitailler();
      grenades.ajouter(1);
      hud.message(`VAGUE TERMINÉE  +${prime}`, 2.5);
      tempete.arreter();
    } else if ((partie.entreVagues -= dt) <= 0) {
      prochaineVague();
    }
  }
}

// ---------- États de la partie ----------
function nouvellePartie() {
  ennemis.vider();
  bonus.vider();
  effets.vider();
  joueur.reinitialiser();
  armes.reinitialiser();
  grenades.reinitialiser();
  tempete.reinitialiser();
  partie.score = 0;
  partie.vague = 0;
  partie.file = [];
  prochaineVague();
}

function commencer() {
  if (partie.etat === 'menu' || partie.etat === 'fin') nouvellePartie();
  qualite.reprise();
  partie.etat = 'jeu';
  armes.actif = true;
  hud.ecran(null);
}

function mettreEnPause() {
  if (partie.etat !== 'jeu') return;
  partie.etat = 'pause';
  armes.actif = false;
  armes.gachette = false;
  relacherCommandes();
  hud.ecran('pause');
}

function finDePartie() {
  partie.etat = 'fin';
  armes.actif = false;
  armes.gachette = false;
  relacherCommandes();
  const score = Math.round(partie.score);
  const nouveauRecord = score > partie.record;
  if (nouveauRecord) {
    partie.record = score;
    ecrireRecord(score);
  }
  hud.fin(score, partie.vague, partie.record, nouveauRecord);
  hud.record(partie.record);
  hud.ecran('fin');
  preparerEnvoiScore(score, partie.vague);
  joueur.controles.unlock();
}

joueur.controles.addEventListener('lock', commencer);
joueur.controles.addEventListener('unlock', mettreEnPause);

// ---------- Commandes tactiles ----------
const tactile = estTactile ? new ControlesTactiles(camera, {
  onTir(actif) {
    armes.gachette = actif;
    if (actif) armes.essayerTir();
  },
  onSaut(actif) { joueur.entree.saut = actif; },
  onRecharge: () => armes.recharger(),
  onArme: () => armes.changer((armes.indice + 1) % 2),
  onGrenade: () => grenades.lancer(),
  onPause: mettreEnPause,
}) : null;

function relacherCommandes() {
  tactile?.reinitialiser();
  joueur.relacherEntree();
}

// Sur PC on capture la souris ; sur téléphone on démarre directement
function demarrer() {
  initAudio();
  if (estTactile) {
    pleinEcranPaysage();
    commencer();
  } else {
    joueur.controles.lock();
  }
}
for (const id of ['btn-jouer', 'btn-reprendre', 'btn-rejouer']) {
  document.getElementById(id).addEventListener('click', demarrer);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) mettreEnPause(); });

function lireRecord() {
  try { return Number(localStorage.getItem(CLE_RECORD)) || 0; } catch { return 0; }
}
function ecrireRecord(v) {
  try { localStorage.setItem(CLE_RECORD, String(v)); } catch { /* stockage indisponible */ }
}

// ---------- Classement ----------
const $ = (id) => document.getElementById(id);
let dernierePartie = null;

async function chargerClassement(ol, source, moi) {
  const { liste, nom, erreur } = await classement.meilleurs();
  hud.classement(ol, liste, moi);
  if (source) source.textContent = erreur ? `${nom} (le classement en ligne ne répond pas)` : nom;
}

function preparerEnvoiScore(score, vague) {
  dernierePartie = { score, vague };
  $('form-score').classList.remove('cache');
  $('btn-enregistrer').disabled = false;
  $('pseudo').value = lirePseudo();
  $('score-etat').textContent = '';
  chargerClassement($('fin-classement'));
  if (!estTactile) $('pseudo').focus(); // sur téléphone on évite d'ouvrir le clavier tout seul
}

$('form-score').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!dernierePartie) return;
  const pseudo = nettoyerPseudo($('pseudo').value);
  if (!pseudo) {
    $('score-etat').textContent = 'Écris un pseudo (lettres et chiffres, 16 caractères max).';
    $('pseudo').focus();
    return;
  }
  $('btn-enregistrer').disabled = true;
  $('score-etat').textContent = 'Envoi…';
  const { score, vague } = dernierePartie;
  const ok = await classement.envoyer(pseudo, score, vague);
  dernierePartie = null;
  $('form-score').classList.add('cache');
  $('score-etat').textContent = ok
    ? 'Score enregistré !'
    : 'Score gardé sur cet appareil : le classement en ligne ne répond pas.';
  chargerClassement($('fin-classement'), null, { pseudo, score });
});

$('btn-classement').addEventListener('click', () => {
  hud.ecran('classement');
  $('classement-source').textContent = 'Chargement…';
  chargerClassement($('classement-liste'), $('classement-source'));
});
$('btn-retour').addEventListener('click', () => hud.ecran('menu'));

hud.record(partie.record);
hud.ecran('menu');

// ---------- Boucle de jeu ----------
const horloge = new THREE.Clock();
const _dirCamera = new THREE.Vector3();

/** Cap de la caméra en degrés : 0 = nord (-z), 90 = est (+x). */
function capCamera() {
  camera.getWorldDirection(_dirCamera);
  const cap = THREE.MathUtils.radToDeg(Math.atan2(_dirCamera.x, -_dirCamera.z));
  return (cap + 360) % 360;
}

// Menu : lent travelling au-dessus de l'arène, vers le lac, les avant-postes et l'anneau
let tempsMenu = 0;
function cameraMenu(dt) {
  tempsMenu += dt;
  const a = Math.sin(tempsMenu * 0.05) * 0.25;
  camera.position.set(8 + Math.sin(tempsMenu * 0.04) * 2, 6.5, -27);
  camera.rotation.set(0.06, -0.42 + a, 0, 'YXZ');
}

function majJeu(dt) {
  if (tactile) {
    joueur.entree.x = tactile.axe.x;
    joueur.entree.y = tactile.axe.y;
    joueur.entree.sprint = tactile.sprint;
  }
  joueur.update(dt);
  armes.update(dt, joueur);
  ennemis.update(dt, joueur, blesserJoueur);
  grenades.update(dt);
  bonus.update(dt, joueur, ramasserBonus);
  gererVagues(dt);

  const restants = ennemis.vivants + partie.file.length;
  const cap = capCamera();
  hud.vie(joueur.vie, joueur.vieMax, joueur.armure, joueur.armureMax);
  hud.munitions(armes.arme.nom, armes.chargeur, armes.arme.chargeur, armes.recharge > 0, armes.reserve, armes.indice);
  hud.grenades(grenades.stock, grenades.max);
  hud.vague(partie.vague, restants);
  hud.score(Math.round(partie.score));
  hud.boussole(cap);
  hud.carte(dt, {
    joueur, ennemis: ennemis.liste, bonus: bonus.liste, boites: monde.boites, demiArene: DEMI_ARENE,
    cap, vague: partie.vague, restants, entreVagues: partie.entreVagues,
  });

  if (joueur.mort) finDePartie();
}

const elIps = new URLSearchParams(location.search).has('debug') ? document.getElementById('ips') : null;
elIps?.classList.remove('cache');
let ipsAffiche = 0, imagesIps = 0, tempsIps = 0;

renderer.setAnimationLoop(() => {
  const dtReel = horloge.getDelta();
  const dt = Math.min(dtReel, 0.05);
  qualite.mesurer(dtReel, partie.etat === 'jeu' && !document.hidden);
  if (elIps) {
    imagesIps++;
    tempsIps += dtReel;
    if ((ipsAffiche -= dtReel) <= 0) {
      ipsAffiche = 0.5;
      elIps.textContent = `${(imagesIps / tempsIps).toFixed(0)} i/s · ${qualite.niveau} · ${renderer.info.render.calls} appels`;
      imagesIps = tempsIps = 0;
    }
  }
  if (partie.etat === 'jeu') majJeu(dt);
  else if (partie.etat === 'menu' && !joueur.controles.isLocked) cameraMenu(dt);
  armes.support.visible = partie.etat !== 'menu';
  monde.update(dt);
  tempete.update(dt);
  effets.update(dt);
  grenades.majVisuels(dt);
  hud.update(dt, joueur.vie, joueur.vieMax);
  renderer.render(scene, camera);
});

// Accès de débogage : ouvrir index.html?debug
if (new URLSearchParams(location.search).has('debug')) {
  window.jeu = { partie, joueur, ennemis, armes, grenades, bonus, commencer, scene, tactile, renderer, camera, monde, tempete, effets, qualite };
}
