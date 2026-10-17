import { nettoyerPseudo } from './scores.js';

// Partage du jeu et défis entre amis.
//  - lien partagé : https://…/mon-jeu-3d/?defi=<score>&nom=<pseudo> ;
//  - navigator.share quand le navigateur le propose (téléphone), sinon copie dans le presse-papiers ;
//  - à l'ouverture d'un lien ?defi=…, bandeau dans le menu puis résultat du défi en fin de partie.
// Les paramètres de l'adresse sont validés et bornés, et toujours affichés avec textContent.

// Adresse publique du jeu : on partage toujours celle-ci (même depuis itch.io ou en local)
export const URL_JEU = 'https://isatopro521-lgtm.github.io/mon-jeu-3d/';
const SCORE_MAX = 10_000_000; // même borne que le classement en ligne

/** Score de défi valide (entier de 1 à 10 millions), sinon null. */
function lireScore(v) {
  if (typeof v !== 'string' || !/^\d{1,8}$/.test(v)) return null;
  const n = Number(v);
  return n >= 1 && n <= SCORE_MAX ? n : null;
}

/** Défi contenu dans l'adresse de la page ({ score, nom }), ou null. */
export function lireDefi(recherche = location.search) {
  const p = new URLSearchParams(recherche);
  const score = lireScore(p.get('defi'));
  if (score === null) return null;
  return { score, nom: nettoyerPseudo(p.get('nom')) || 'Un ami' };
}

/** Lien de défi à partager. Sans score (ou score nul) : simple lien vers le jeu. */
export function lienDefi(score, nom) {
  const s = Math.round(Number(score) || 0);
  if (s < 1) return URL_JEU;
  const p = new URLSearchParams({ defi: String(Math.min(s, SCORE_MAX)) });
  const n = nettoyerPseudo(nom);
  if (n) p.set('nom', n);
  return `${URL_JEU}?${p}`;
}

function fr(n) { return n.toLocaleString('fr-FR'); }

/** Copie un texte : API presse-papiers, sinon ancienne méthode (zone de texte + execCommand). */
async function copier(texte) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texte);
      return true;
    }
  } catch { /* on tente l'ancienne méthode */ }
  const zone = document.createElement('textarea');
  zone.value = texte;
  zone.setAttribute('readonly', '');
  zone.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  document.body.append(zone);
  zone.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  zone.remove();
  return ok;
}

/**
 * Partage le jeu (avec un score à battre si `score` > 0).
 * Renvoie { resultat, url } ; resultat : 'partage', 'copie', 'annule' ou 'echec'
 * (le lien est alors affiché pour une copie à la main).
 */
export async function partager({ score = 0, vague = 0, nom = '' } = {}) {
  const url = lienDefi(score, nom);
  const texte = score > 0
    ? `J'ai fait ${fr(Math.round(score))} points${vague > 0 ? ` (vague ${vague})` : ''} sur NEXUS FRONTIER, `
      + 'un FPS gratuit dans le navigateur. Tu peux me battre ?'
    : 'Viens jouer à NEXUS FRONTIER : un FPS de survie gratuit, sur PC et téléphone, sans installation !';
  const donnees = { title: 'NEXUS FRONTIER', text: texte, url };

  if (navigator.share && (!navigator.canShare || navigator.canShare(donnees))) {
    try {
      await navigator.share(donnees);
      return { resultat: 'partage', url };
    } catch (e) {
      if (e && e.name === 'AbortError') return { resultat: 'annule', url };
      // autre erreur (pas de geste utilisateur, partage bloqué…) : on copie le lien à la place
    }
  }
  return { resultat: (await copier(`${texte} ${url}`)) ? 'copie' : 'echec', url };
}

/** Message de confirmation à afficher après partager(). */
export function messagePartage({ resultat, url }, score) {
  if (resultat === 'partage') return 'Merci pour le partage !';
  if (resultat === 'copie') {
    return score > 0
      ? 'Lien du défi copié : colle-le à un ami (WhatsApp, Discord, SMS…).'
      : 'Lien du jeu copié : colle-le à tes amis !';
  }
  if (resultat === 'annule') return '';
  return `Copie impossible : partage ce lien → ${url}`;
}

/** Remplit le bandeau du menu « <nom> te défie : bats <score> points ! ». */
export function afficherBandeauDefi(element, defi) {
  if (!element) return;
  element.replaceChildren();
  if (!defi) { element.classList.add('cache'); return; }
  const nom = document.createElement('strong');
  nom.textContent = defi.nom;
  const score = document.createElement('strong');
  score.className = 'defi-score';
  score.textContent = `${fr(defi.score)} points`;
  element.append(nom, ' te défie : bats ', score, ' !');
  element.classList.remove('cache');
}

/** Texte du résultat du défi en fin de partie. */
export function resultatDefi(defi, score) {
  if (!defi) return '';
  if (score > defi.score) return `Défi relevé ! Tu as battu ${defi.nom} (${fr(defi.score)} points). Renvoie-lui le défi !`;
  if (score === defi.score) return `Égalité parfaite avec ${defi.nom} : ${fr(defi.score)} points. Encore un effort !`;
  return `Défi pas encore relevé : il te manque ${fr(defi.score - score)} points pour battre ${defi.nom}. Rejoue !`;
}
