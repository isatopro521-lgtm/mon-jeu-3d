import { CLASSEMENT_EN_LIGNE } from './config.js';

// Classement des meilleurs scores. La source est choisie automatiquement :
//  1. en ligne (Supabase), si src/config.js est rempli → commun à tous les joueurs ;
//  2. base partagée de la page Claude, quand le jeu y est ouvert ;
//  3. sinon, classement local (sur cet appareil).
// Le score est toujours aussi gardé en local, même si l'envoi en ligne échoue.

const TAILLE = 10;
const CLE_LOCAL = 'mon-jeu-3d-classement';
const CLE_PSEUDO = 'mon-jeu-3d-pseudo';

export function nettoyerPseudo(p) {
  return String(p ?? '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 16);
}

export function lirePseudo() {
  try { return localStorage.getItem(CLE_PSEUDO) || ''; } catch { return ''; }
}

function ecrirePseudo(p) {
  try { localStorage.setItem(CLE_PSEUDO, p); } catch { /* stockage indisponible */ }
}

function valide(e) {
  return e && typeof e.pseudo === 'string' && Number.isFinite(e.score) && Number.isFinite(e.vague);
}

const local = {
  nom: 'Sur cet appareil',
  async meilleurs() {
    try {
      const l = JSON.parse(localStorage.getItem(CLE_LOCAL));
      return Array.isArray(l) ? l.filter(valide) : [];
    } catch {
      return [];
    }
  },
  async envoyer(entree) {
    const l = await local.meilleurs();
    l.push(entree);
    l.sort((a, b) => b.score - a.score);
    try { localStorage.setItem(CLE_LOCAL, JSON.stringify(l.slice(0, TAILLE))); } catch { /* indisponible */ }
  },
};

function enLigne({ url, cle }) {
  const base = url.replace(/\/+$/, '');
  const entetes = { apikey: cle, Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' };
  return {
    nom: 'Classement mondial',
    async meilleurs() {
      const r = await fetch(`${base}/rest/v1/scores?select=pseudo,score,vague&order=score.desc&limit=${TAILLE}`, { headers: entetes });
      if (!r.ok) throw new Error(`Erreur ${r.status}`);
      return (await r.json()).filter(valide);
    },
    async envoyer(entree) {
      const r = await fetch(`${base}/rest/v1/scores`, {
        method: 'POST',
        headers: { ...entetes, Prefer: 'return=minimal' },
        body: JSON.stringify(entree),
      });
      if (!r.ok) throw new Error(`Erreur ${r.status}`);
    },
  };
}

// Base partagée de la page Claude : un document par joueur (son meilleur score)
async function baseClaude() {
  const use = window.claude?.use;
  if (!use) return null;
  const delai = new Promise((r) => setTimeout(() => r(null), 5000));
  const db = await Promise.race([use('db'), delai]);
  if (!db) return null;
  const user = await Promise.race([use('user'), delai]);
  const id = await user?.id?.().catch(() => null);
  const scores = db.collection('scores');
  return {
    nom: 'Classement partagé',
    async meilleurs() {
      const snap = await scores.orderBy('score', 'desc').limit(TAILLE).get();
      return snap.docs.map((d) => d.data()).filter(valide);
    },
    async envoyer(entree) {
      if (!id) throw new Error('non connecté');
      const ref = scores.doc(id);
      const ancien = await ref.get();
      if (ancien.exists && ancien.data().score >= entree.score) return;
      await ref.set(entree);
    },
  };
}

let source = local;
const pret = (async () => {
  try {
    if (CLASSEMENT_EN_LIGNE.url && CLASSEMENT_EN_LIGNE.cle) source = enLigne(CLASSEMENT_EN_LIGNE);
    else source = (await baseClaude()) ?? local;
  } catch {
    source = local;
  }
})();

export const classement = {
  get nom() { return source.nom; },

  /** Les meilleurs scores. En cas de problème réseau, renvoie le classement local. */
  async meilleurs() {
    await pret;
    try {
      return { liste: await source.meilleurs(), nom: source.nom, erreur: false };
    } catch {
      return { liste: await local.meilleurs(), nom: local.nom, erreur: source !== local };
    }
  },

  /** Enregistre un score. Renvoie true si l'envoi à la source principale a réussi. */
  async envoyer(pseudo, score, vague) {
    await pret;
    const entree = { pseudo: nettoyerPseudo(pseudo) || 'Anonyme', score: Math.round(score), vague };
    ecrirePseudo(entree.pseudo);
    if (source !== local) await local.envoyer(entree);
    try {
      await source.envoyer(entree);
      return true;
    } catch {
      return false;
    }
  },
};
