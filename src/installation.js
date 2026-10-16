// Aide à l'installation du jeu comme une app (PWA), affichée dans le menu :
//  - iPhone / iPad : bannière « Partager → Sur l'écran d'accueil » (Safari n'a pas de bouton d'installation) ;
//  - Android / Chrome / Edge : bouton « Installer le jeu » (événement beforeinstallprompt).
// La bannière se ferme avec × et ce choix est mémorisé sur l'appareil.

const CLE_FERMEE = 'mon-jeu-3d-installation-fermee';

/** Vrai si le jeu tourne déjà comme une app installée. */
export function estInstalle() {
  return navigator.standalone === true ||
    matchMedia('(display-mode: standalone)').matches ||
    matchMedia('(display-mode: fullscreen)').matches;
}

/** iPhone, iPod ou iPad (les iPad récents se présentent comme un Mac tactile). */
export function estIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function lireFermee() {
  try { return localStorage.getItem(CLE_FERMEE) === '1'; } catch { return false; }
}
function ecrireFermee() {
  try { localStorage.setItem(CLE_FERMEE, '1'); } catch { /* stockage indisponible */ }
}

export function initInstallation() {
  const bloc = document.getElementById('installer');
  const texte = document.getElementById('installer-texte');
  const bouton = document.getElementById('btn-installer');
  const fermer = document.getElementById('btn-installer-fermer');
  if (!bloc || estInstalle() || lireFermee()) return;

  let invite = null; // événement beforeinstallprompt gardé pour plus tard

  const cacher = () => bloc.classList.add('cache');
  fermer.addEventListener('click', () => { ecrireFermee(); cacher(); });

  if (estIOS()) {
    texte.innerHTML = 'Installe le jeu : <strong>Partager</strong> <span class="ico-partager" aria-hidden="true"></span>'
      + ' → <strong>Sur l’écran d’accueil</strong>';
    bouton.classList.add('cache');
    bloc.classList.remove('cache');
    return;
  }

  // Android / ordinateur : le navigateur propose l'installation quand le jeu est installable
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    invite = e;
    texte.textContent = 'Plein écran, même hors ligne :';
    bouton.classList.remove('cache');
    bloc.classList.remove('cache');
  });
  bouton.addEventListener('click', async () => {
    if (!invite) return;
    invite.prompt();
    try { await invite.userChoice; } catch { /* ignoré */ }
    invite = null;
    cacher();
  });
  addEventListener('appinstalled', () => { invite = null; cacher(); });
}
