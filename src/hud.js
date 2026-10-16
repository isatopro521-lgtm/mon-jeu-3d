const $ = (id) => document.getElementById(id);

const el = {
  hud: $('hud'),
  vignette: $('vignette'),
  eclair: $('eclair'),
  marqueur: $('marqueur'),
  vague: $('vague'),
  restants: $('restants'),
  score: $('score'),
  vieRemplissage: $('vie-remplissage'),
  vieTexte: $('vie-texte'),
  armureRemplissage: $('armure-remplissage'),
  armureTexte: $('armure-texte'),
  armeNom: $('arme-nom'),
  iconeArme: $('icone-arme').querySelector('use'),
  munChargeur: $('mun-chargeur'),
  munReserve: $('mun-reserve'),
  rechargeTexte: $('recharge-texte'),
  grenades: $('grenades'),
  grenadesNb: $('grenades-nb'),
  boutonGrenade: $('t-grenade'),
  message: $('message'),
  boussole: $('boussole'),
  bande: $('boussole-bande'),
  carte: $('carte'),
  carteTexte: $('carte-texte'),
  ecrans: { menu: $('ecran-menu'), pause: $('ecran-pause'), fin: $('ecran-fin'), classement: $('ecran-classement') },
  finStats: $('fin-stats'),
  recordMenu: $('record-menu'),
};

// Évite de toucher au DOM quand rien n'a changé
const derniers = {};
function texte(cle, element, valeur) {
  if (derniers[cle] === valeur) return;
  derniers[cle] = valeur;
  element.textContent = valeur;
}

let vignette = 0;
let marqueurTemps = 0;
let messageTemps = 0;

// ---------- Boussole ----------
// Bande de graduations (tous les 15°) répétée sur 3 tours ; on la fait glisser selon le cap.
const CHAMP_BOUSSOLE = 130; // degrés visibles
const CARDINAUX = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SO', 270: 'O', 315: 'NO' };
let pxParDegre = 0;
let largeurBoussole = 0;
function construireBoussole() {
  const largeur = el.boussole.clientWidth; // lu une seule fois (et après un redimensionnement)
  if (!largeur) return false;
  largeurBoussole = largeur;
  pxParDegre = largeur / CHAMP_BOUSSOLE;
  el.bande.replaceChildren();
  for (let d = -360; d <= 720; d += 15) {
    const n = ((d % 360) + 360) % 360;
    const graduation = document.createElement('span');
    graduation.className = n in CARDINAUX ? 'cardinal' : 'degre';
    if (n === 0) graduation.classList.add('nord');
    graduation.textContent = CARDINAUX[n] ?? String(n);
    graduation.style.left = `${(d + 360) * pxParDegre}px`;
    el.bande.append(graduation);
  }
  derniers.cap = null;
  return true;
}
addEventListener('resize', () => { pxParDegre = 0; });

// ---------- Minicarte ----------
const ctxCarte = el.carte.getContext('2d');
const MONDE_CARTE = 34; // demi-largeur de la zone affichée (m)
let fondCarte = null;
let minuteurCarte = 0;

function dessinerFondCarte(boites, demiArene) {
  const t = el.carte.width;
  const c = document.createElement('canvas');
  c.width = c.height = t;
  const g = c.getContext('2d');
  const k = t / (MONDE_CARTE * 2);
  const px = (v) => (v + MONDE_CARTE) * k;
  // terrain autour, arène, quadrillage
  g.fillStyle = 'rgba(28, 40, 30, 0.9)';
  g.fillRect(0, 0, t, t);
  g.fillStyle = 'rgba(62, 70, 52, 0.95)';
  g.fillRect(px(-demiArene), px(-demiArene), demiArene * 2 * k, demiArene * 2 * k);
  g.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  g.lineWidth = 1;
  for (let v = -30; v <= 30; v += 10) {
    g.beginPath(); g.moveTo(px(v), 0); g.lineTo(px(v), t); g.stroke();
    g.beginPath(); g.moveTo(0, px(v)); g.lineTo(t, px(v)); g.stroke();
  }
  // obstacles (vue de dessus) ; l'enceinte en orange
  for (const b of boites) {
    const enceinte = b.max.y > 6;
    g.fillStyle = enceinte ? 'rgba(255, 122, 30, 0.85)' : 'rgba(205, 212, 220, 0.75)';
    g.fillRect(px(b.min.x), px(b.min.z), Math.max(1.5, (b.max.x - b.min.x) * k), Math.max(1.5, (b.max.z - b.min.z) * k));
  }
  // lac (au nord-est, hors de l'arène)
  g.fillStyle = 'rgba(60, 140, 190, 0.55)';
  g.beginPath(); g.ellipse(px(34), px(-36), 9, 6, 0, 0, Math.PI * 2); g.fill();
  fondCarte = c;
}

function dessinerCarte(joueur, ennemis, bonus, cap) {
  const t = el.carte.width;
  const k = t / (MONDE_CARTE * 2);
  const px = (v) => (v + MONDE_CARTE) * k;
  const g = ctxCarte;
  g.clearRect(0, 0, t, t);
  g.drawImage(fondCarte, 0, 0);
  // bonus
  for (const b of bonus) {
    g.fillStyle = b.type === 'soin' ? '#4ade80' : b.type === 'munitions' ? '#ffb15a' : '#c8d46a';
    g.fillRect(px(b.groupe.position.x) - 2, px(b.groupe.position.z) - 2, 4, 4);
  }
  // ennemis : points rouges (plus gros pour les mechs)
  for (const e of ennemis) {
    if (e.mort) continue;
    const r = e.t.modele === 'mech' ? 4 : 2.6;
    g.fillStyle = '#ff3b30';
    g.shadowColor = '#ff3b30';
    g.shadowBlur = 4;
    g.beginPath(); g.arc(px(e.position.x), px(e.position.z), r, 0, Math.PI * 2); g.fill();
  }
  g.shadowBlur = 0;
  // joueur : flèche orientée selon le cap, avec cône de vision
  const x = px(joueur.position.x), y = px(joueur.position.z);
  const a = cap * Math.PI / 180;
  g.save();
  g.translate(x, y);
  g.rotate(a);
  const cone = g.createRadialGradient(0, 0, 0, 0, 0, 34);
  cone.addColorStop(0, 'rgba(255, 200, 140, 0.35)');
  cone.addColorStop(1, 'rgba(255, 200, 140, 0)');
  g.fillStyle = cone;
  g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 34, -Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6); g.closePath(); g.fill();
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#ff7a1e';
  g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(0, -6); g.lineTo(4.5, 5); g.lineTo(0, 2.5); g.lineTo(-4.5, 5); g.closePath();
  g.fill(); g.stroke();
  g.restore();
}

function deuxChiffres(n) { return String(n).padStart(2, '0'); }

export const hud = {
  ecran(nom) {
    for (const [cle, e] of Object.entries(el.ecrans)) e.classList.toggle('cache', cle !== nom);
    el.hud.classList.toggle('cache', nom === 'menu' || nom === 'classement');
    if (nom) {
      el.message.classList.remove('visible');
      messageTemps = 0;
    }
  },

  vie(vie, max, armure = 0, armureMax = 100) {
    const p = Math.max(0, vie / max) * 100;
    if (derniers.vie !== p) {
      derniers.vie = p;
      el.vieRemplissage.style.width = `${p}%`;
      el.vieRemplissage.classList.toggle('bas', p < 30);
      el.vieTexte.textContent = Math.ceil(vie);
    }
    const q = Math.max(0, armure / armureMax) * 100;
    if (derniers.armure !== q) {
      derniers.armure = q;
      el.armureRemplissage.style.width = `${q}%`;
      el.armureTexte.textContent = Math.ceil(armure);
    }
  },

  munitions(nom, chargeur, max, enRecharge, reserve = 0, indice = 0) {
    texte('arme', el.armeNom, nom);
    texte('chargeur', el.munChargeur, String(chargeur));
    texte('reserve', el.munReserve, String(reserve));
    if (derniers.indice !== indice) {
      derniers.indice = indice;
      el.iconeArme.setAttribute('href', indice === 0 ? '#ico-fusil' : '#ico-pompe');
    }
    el.munChargeur.classList.toggle('vide', chargeur === 0);
    el.munReserve.classList.toggle('vide', reserve === 0);
    const consigne = enRecharge ? 'Rechargement…'
      : chargeur === 0 && reserve === 0 ? 'Plus de munitions : change d\'arme'
        : chargeur === 0 ? 'R pour recharger' : chargeur <= max * 0.25 && reserve > 0 ? 'Munitions faibles' : '';
    texte('recharge', el.rechargeTexte, consigne);
  },

  grenades(n, max) {
    if (derniers.grenades === n) return;
    derniers.grenades = n;
    el.grenadesNb.textContent = String(n);
    el.grenades.classList.toggle('vide', n === 0);
    el.grenades.classList.toggle('plein', n >= max);
    el.boutonGrenade.classList.toggle('vide', n === 0);
  },

  vague(n, restants) {
    texte('vague', el.vague, `Vague ${n}`);
    texte('restants', el.restants, restants > 0 ? `${restants} hostile${restants > 1 ? 's' : ''}` : 'Zone sécurisée');
  },

  score(s) {
    texte('score', el.score, s.toLocaleString('fr-FR'));
  },

  /** Cap en degrés (0 = nord = -z, 90 = est = +x). */
  boussole(cap) {
    if (!pxParDegre && !construireBoussole()) return;
    const arrondi = Math.round(cap * 4) / 4;
    if (derniers.cap === arrondi) return;
    derniers.cap = arrondi;
    const decalage = largeurBoussole / 2 - (arrondi + 360) * pxParDegre;
    el.bande.style.transform = `translateX(${decalage.toFixed(1)}px)`;
  },

  /** Minicarte (≈ 12 images/s) + ligne d'info : vague en cours ou compte à rebours. */
  carte(dt, { joueur, ennemis, bonus, boites, demiArene, cap, vague, restants, entreVagues }) {
    if (!fondCarte) dessinerFondCarte(boites, demiArene);
    minuteurCarte -= dt;
    if (minuteurCarte <= 0) {
      minuteurCarte = 1 / 12;
      dessinerCarte(joueur, ennemis, bonus, cap);
    }
    const info = entreVagues > 0
      ? `Vague ${vague + 1} dans : 00:${deuxChiffres(Math.ceil(entreVagues))}`
      : `Vague ${vague} · ${deuxChiffres(restants)} hostile${restants > 1 ? 's' : ''}`;
    texte('carte', el.carteTexte, info);
  },

  marqueur(tete, mort) {
    el.marqueur.classList.add('actif');
    el.marqueur.classList.toggle('tete', tete && !mort);
    el.marqueur.classList.toggle('mort', mort);
    marqueurTemps = mort ? 0.25 : 0.1;
  },

  degats(n) {
    vignette = Math.min(1, vignette + 0.25 + n / 40);
  },

  /** Flash blanc-rouge des éclairs de la Tempête Nexus (0..1). */
  eclair(k) {
    const v = k.toFixed(2);
    if (derniers.eclair === v) return;
    derniers.eclair = v;
    el.eclair.style.opacity = v;
  },

  message(txt, duree = 2) {
    el.message.textContent = txt;
    el.message.classList.add('visible');
    messageTemps = duree;
  },

  fin(score, vague, record, nouveauRecord) {
    el.finStats.innerHTML =
      `Score : <strong>${score.toLocaleString('fr-FR')}</strong><br>` +
      `Vague atteinte : ${vague}<br>` +
      (nouveauRecord ? '<strong>Nouveau record !</strong>' : `Record : ${record.toLocaleString('fr-FR')}`);
  },

  /** Remplit une liste <ol> de scores ; `moi` met en valeur une entrée. */
  classement(ol, liste, moi = null) {
    ol.replaceChildren();
    if (liste.length === 0) {
      const li = document.createElement('li');
      li.className = 'vide';
      li.textContent = 'Aucun score pour le moment. Sois le premier !';
      ol.append(li);
      return;
    }
    liste.forEach((e, i) => {
      const li = document.createElement('li');
      if (moi && e.pseudo === moi.pseudo && e.score === moi.score) li.classList.add('moi');
      const rang = document.createElement('span');
      rang.className = 'rang';
      rang.textContent = String(i + 1);
      const pseudo = document.createElement('span');
      pseudo.className = 'pseudo';
      pseudo.textContent = e.pseudo;
      const vague = document.createElement('span');
      vague.className = 'vague-max';
      vague.textContent = `vague ${e.vague}`;
      const score = document.createElement('span');
      score.className = 'points';
      score.textContent = e.score.toLocaleString('fr-FR');
      li.append(rang, pseudo, vague, score);
      ol.append(li);
    });
  },

  record(r) {
    el.recordMenu.textContent = r > 0 ? `Record : ${r.toLocaleString('fr-FR')}` : '';
  },

  update(dt, vie, max) {
    // La vignette rouge persiste un peu quand la vie est basse
    const plancher = vie / max < 0.3 ? 0.35 + Math.sin(performance.now() / 200) * 0.1 : 0;
    vignette = Math.max(plancher, vignette - dt * 1.5);
    el.vignette.style.opacity = vignette.toFixed(3);

    if (marqueurTemps > 0 && (marqueurTemps -= dt) <= 0) el.marqueur.classList.remove('actif');
    if (messageTemps > 0 && (messageTemps -= dt) <= 0) el.message.classList.remove('visible');
  },
};
