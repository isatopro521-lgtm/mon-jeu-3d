// Sons générés avec la Web Audio API (aucun fichier audio nécessaire).

let ctx = null;
let maitre = null;
let tamponBruit = null;

export function initAudio() {
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      maitre = ctx.createGain();
      maitre.gain.value = 0.45;
      maitre.connect(ctx.destination);
      tamponBruit = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const donnees = tamponBruit.getChannelData(0);
      for (let i = 0; i < donnees.length; i++) donnees[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    ctx = null;
  }
}

/** Contexte audio partagé (utilisé par le film pour sa musique) : null tant que initAudio() n'a pas réussi. */
export function contexteAudio() {
  return ctx ? { ctx, maitre } : null;
}

function bruit(duree, frequence, volume, delai = 0, type = 'lowpass') {
  if (!ctx) return;
  const t = ctx.currentTime + delai;
  const src = ctx.createBufferSource();
  src.buffer = tamponBruit;
  const filtre = ctx.createBiquadFilter();
  filtre.type = type;
  filtre.frequency.value = frequence;
  const g = ctx.createGain();
  g.gain.setValueAtTime(volume, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + duree);
  src.connect(filtre).connect(g).connect(maitre);
  src.start(t, Math.random() * 0.5);
  src.stop(t + duree);
}

function ton(f0, f1, duree, volume, type = 'square', delai = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + delai;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(f1, t + duree);
  const g = ctx.createGain();
  g.gain.setValueAtTime(volume, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + duree);
  osc.connect(g).connect(maitre);
  osc.start(t);
  osc.stop(t + duree);
}

// Voix des ennemis : « aboiement radio » filtré (masque à gaz), court et discret.
// Une seule voix à la fois au maximum toutes les `ecart` secondes, pour ne jamais saturer.
let prochaineVoix = 0;
function voix(f0, f1, duree, volume, formant, type = 'sawtooth', ecart = 0.18) {
  if (!ctx || ctx.currentTime < prochaineVoix) return;
  prochaineVoix = ctx.currentTime + ecart;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(f1, t + duree);
  // vibrato rapide : rend la voix moins « bip »
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 28 + Math.random() * 10;
  const prof = ctx.createGain();
  prof.gain.value = f0 * 0.06;
  lfo.connect(prof).connect(osc.frequency);
  const filtre = ctx.createBiquadFilter();
  filtre.type = 'bandpass';
  filtre.frequency.value = formant;
  filtre.Q.value = 3;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(volume, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, t + duree);
  osc.connect(filtre).connect(g).connect(maitre);
  osc.start(t); lfo.start(t);
  osc.stop(t + duree); lfo.stop(t + duree);
}

export const sons = {
  // Voix : `grave` = true pour le mech (grondement mécanique)
  alerte: (grave = false) => grave
    ? voix(70, 110, 0.35, 0.22, 380, 'sawtooth', 0.25)
    : voix(260 + Math.random() * 60, 420, 0.16, 0.16, 1400, 'sawtooth', 0.25),
  douleur: (grave = false) => grave
    ? voix(90, 55, 0.2, 0.16, 300)
    : voix(330 + Math.random() * 80, 190, 0.13, 0.13, 1100),
  criMort: (grave = false) => grave
    ? voix(110, 30, 0.7, 0.22, 260, 'sawtooth', 0.1)
    : voix(300 + Math.random() * 60, 90, 0.32, 0.15, 900, 'sawtooth', 0.1),

  tir: () => { bruit(0.12, 2600, 0.5); ton(170, 55, 0.08, 0.25); },
  pompe: () => { bruit(0.35, 1300, 0.9); ton(110, 35, 0.18, 0.4); },
  vide: () => ton(900, 700, 0.03, 0.1),
  recharge: () => { ton(420, 300, 0.05, 0.1); ton(650, 520, 0.05, 0.1, 'square', 0.35); },
  touche: () => ton(1300, 900, 0.05, 0.1, 'triangle'),
  tete: () => ton(1900, 1500, 0.09, 0.15, 'triangle'),
  mortEnnemi: () => { ton(320, 45, 0.4, 0.22, 'sawtooth'); bruit(0.3, 700, 0.3); },
  degat: () => { ton(170, 70, 0.22, 0.35, 'sawtooth'); bruit(0.1, 400, 0.3); },
  tirEnnemi: () => ton(760, 180, 0.22, 0.1, 'sine'),
  coup: () => bruit(0.15, 500, 0.6),
  apparition: () => ton(120, 480, 0.3, 0.06, 'sine'),
  vague: () => [440, 554, 659, 880].forEach((f, i) => ton(f, f, 0.16, 0.13, 'triangle', i * 0.11)),
  soin: () => { ton(500, 1000, 0.2, 0.15, 'sine'); ton(750, 1500, 0.2, 0.1, 'sine', 0.1); },
  // Goupille puis souffle du lancer
  lancerGrenade: () => { ton(2200, 1900, 0.03, 0.08, 'square'); bruit(0.18, 1500, 0.25, 0.05, 'bandpass'); },
  rebondGrenade: (force = 0.5) => ton(1100, 800, 0.05, 0.03 + 0.12 * force, 'triangle'),
  // Explosion grave : grondement filtré + chute de fréquence ; `k` règle le volume selon la distance
  explosion: (k = 1) => {
    bruit(1.4, 320, 1.3 * k);
    bruit(0.35, 2400, 0.5 * k);
    ton(95, 28, 0.9, 0.6 * k, 'sine');
    ton(60, 22, 1.3, 0.35 * k, 'triangle', 0.03);
  },
  // Tonnerre : craquement puis grondement, retardé selon la distance de l'éclair
  tonnerre: (delai = 0.3, k = 1) => {
    bruit(0.25, 3000, 0.35 * k, delai, 'highpass');
    bruit(2.2, 180, 1.1 * k, delai + 0.05);
    ton(55, 25, 1.8, 0.35 * k, 'sine', delai + 0.05);
  },
  ramasserGrenade: () => { ton(2000, 1800, 0.03, 0.08, 'square'); ton(420, 840, 0.14, 0.12, 'triangle', 0.04); },
};
