const $ = (id) => document.getElementById(id);

const el = {
  hud: $('hud'),
  vignette: $('vignette'),
  marqueur: $('marqueur'),
  vague: $('vague'),
  restants: $('restants'),
  score: $('score'),
  vieRemplissage: $('vie-remplissage'),
  vieTexte: $('vie-texte'),
  armeNom: $('arme-nom'),
  munChargeur: $('mun-chargeur'),
  munMax: $('mun-max'),
  rechargeTexte: $('recharge-texte'),
  message: $('message'),
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

export const hud = {
  ecran(nom) {
    for (const [cle, e] of Object.entries(el.ecrans)) e.classList.toggle('cache', cle !== nom);
    el.hud.classList.toggle('cache', nom === 'menu' || nom === 'classement');
    if (nom) {
      el.message.classList.remove('visible');
      messageTemps = 0;
    }
  },

  vie(vie, max) {
    const p = Math.max(0, vie / max) * 100;
    if (derniers.vie === p) return;
    derniers.vie = p;
    el.vieRemplissage.style.width = `${p}%`;
    el.vieRemplissage.classList.toggle('bas', p < 30);
    el.vieTexte.textContent = Math.ceil(vie);
  },

  munitions(nom, chargeur, max, enRecharge) {
    texte('arme', el.armeNom, nom);
    texte('chargeur', el.munChargeur, String(chargeur));
    texte('max', el.munMax, ` / ${max}`);
    el.munChargeur.classList.toggle('vide', chargeur === 0);
    texte('recharge', el.rechargeTexte, enRecharge ? 'Rechargement…' : chargeur === 0 ? 'R pour recharger' : '');
  },

  vague(n, restants) {
    texte('vague', el.vague, `Vague ${n}`);
    texte('restants', el.restants, restants > 0 ? `${restants} ennemi${restants > 1 ? 's' : ''}` : '');
  },

  score(s) {
    texte('score', el.score, s.toLocaleString('fr-FR'));
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
