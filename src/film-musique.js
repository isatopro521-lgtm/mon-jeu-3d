// Musique et ambiance du film (film.js), synthétisées en direct avec la Web Audio API.
// La partition est écrite en « temps du film » (secondes) : à chaque image, on programme les notes
// des 0,3 s à venir. Pause = contexte audio suspendu ; Recommencer = nouveau bus (l'ancien s'éteint).

const AVANCE = 0.3; // s de musique programmée à l'avance

const NOTE = (n) => 440 * 2 ** ((n - 69) / 12); // numéro MIDI → Hz

// Accords (MIDI) — la mineur, couleur « épique »
const LAm = [57, 60, 64], FA = [53, 57, 60], DO = [55, 60, 64], SOL = [55, 59, 62];
const RACINE = new Map([[LAm, 45], [FA, 41], [DO, 48], [SOL, 43]]);
// Thème (leitmotiv) : une note par temps
const THEME = [69, 72, 76, 74, 72, 71, 72, 69, 67, 69, 71, 72, 74, 76, 72, 69];

// Sections : début, fin (s), tempo, fonction appelée à chaque temps (i = numéro du temps, te = instant)
const SECTIONS = [
  { d: 0, f: 16, bpm: 60, fn: prologue },
  { d: 16, f: 36, bpm: 80, fn: arrivee },
  { d: 36, f: 52, bpm: 70, fn: tension },
  { d: 52, f: 86.1, bpm: 128, fn: combat },
  { d: 86.1, f: 98, bpm: 64, fn: apres },
  { d: 98, f: 118, bpm: 72, fn: epilogue },
];

// Événements ponctuels : [instant, fonction]
const PONCTUELS = [
  [9, (m, te) => m.impact(te, 0.5)],                  // titre
  [21.4, (m, te) => m.radio(te)],
  [25.9, (m, te) => m.radio(te)],
  [47, (m, te) => m.radio(te)],
  [49, (m, te) => m.montee(te, 3, 0.18)],             // juste avant le combat
  [52, (m, te) => m.impact(te, 0.6)],
  [64.5, (m, te) => m.montee(te, 2.5, 0.08)],
  [67.2, (m, te) => m.impact(te, 0.8)],               // arrivée du mech
  [84, (m, te) => m.montee(te, 2.1, 0.2)],
  [86.1, (m, te) => m.impact(te, 1)],                 // explosion
  [91.9, (m, te) => m.radio(te)],
  [98.4, (m, te) => m.radio(te)],
  [115.5, (m, te) => m.fondu(te, 2.5)],               // fin du générique
];

function prologue(m, i, te) {
  const accord = [LAm, FA, DO, SOL][Math.floor(i / 4) % 4];
  if (i % 4 === 0) {
    m.nappe(te, accord, 4.3, i >= 8 ? 0.11 : 0.08, i >= 8 ? 1800 : 900);
    if (i >= 8) m.basse(te, RACINE.get(accord) - 12, 4, 0.16);
  }
  // arpège de cloches, plus présent après le titre
  m.cloche(te, accord[i % 3] + 12, i >= 9 ? 0.05 : 0.035);
  if (i >= 9) m.cloche(te + 0.5, accord[(i + 1) % 3] + 24, 0.02);
}

function arrivee(m, i, te) {
  const accord = [LAm, FA, DO, SOL][Math.floor(i / 8) % 4];
  if (i % 8 === 0) {
    m.nappe(te, accord, 6.3, 0.09, 1200);
    m.basse(te, RACINE.get(accord) - 12, 6, 0.12);
  }
  if (i % 2 === 0) m.pulsation(te, RACINE.get(accord), 0.07);
  if (i % 4 === 1) m.cloche(te, THEME[(i / 4 | 0) % THEME.length], 0.035);
}

function tension(m, i, te) {
  if (i % 8 === 0) m.nappe(te, [45, 46, 57], 7.2, 0.08, 500); // la + si bémol : dissonance
  if (te >= 41) {
    // battement de cœur
    m.grosseCaisse(te, 0.35);
    m.grosseCaisse(te + 0.22, 0.2);
  }
  if (te >= 46) {
    m.charleston(te, 0.03);
    m.charleston(te + 0.43, 0.02);
  }
  if (i % 4 === 2) m.cloche(te, 81, 0.02);
}

function combat(m, i, te) {
  if (te > 85.55) return; // silence avant l'explosion
  const b = 60 / 128;
  const mesure = Math.floor(i / 4), temps = i % 4;
  const accord = [LAm, LAm, FA, SOL][mesure % 4];
  const r = RACINE.get(accord) - 12;
  const tempete = te >= 67;
  // batterie
  if (tempete || temps % 2 === 0) m.grosseCaisse(te, tempete ? 0.5 : 0.45);
  if (temps % 2 === 1) m.caisseClaire(te, 0.32);
  m.charleston(te, 0.04);
  m.charleston(te + b / 2, 0.06);
  // basse en croches
  const motif = [0, 0, 12, 0, 0, 12, 0, 7];
  m.basse(te, r + motif[temps * 2], b * 0.45, 0.14);
  m.basse(te + b / 2, r + motif[temps * 2 + 1], b * 0.45, 0.12);
  // nappe et cuivres
  if (temps === 0) {
    m.nappe(te, accord, b * 4 + 0.1, 0.06, tempete ? 2200 : 1500);
    if (te >= 57) m.cuivre(te, accord, 0.35, tempete ? 0.07 : 0.05);
    if (tempete) m.impact(te, 0.25);
  }
  if (te >= 76 && temps === 2) m.cuivre(te, accord, 0.3, 0.06);
}

function apres(m, i, te) {
  if (te < 91) {
    // ralenti : nappe grave suspendue
    if (i === 0) m.nappe(te + 0.3, [45, 52, 57], 4.6, 0.09, 700);
    if (i % 2 === 1) m.cloche(te, 76, 0.025);
    return;
  }
  // victoire : progression majeure
  const accord = [DO, SOL, LAm, FA][Math.floor((i - 6) / 4) % 4];
  if ((i - 6) % 4 === 0) {
    m.nappe(te, accord, 3.9, 0.1, 1600);
    m.basse(te, RACINE.get(accord) - 12, 3.7, 0.12);
  }
  m.cloche(te, accord[i % 3] + 12, 0.03);
}

function epilogue(m, i, te) {
  const accord = [FA, DO, SOL, LAm][Math.floor(i / 4) % 4];
  const generique = te >= 108;
  if (i % 4 === 0) {
    m.nappe(te, accord, 3.5, generique ? 0.08 : 0.12, generique ? 1100 : 2000);
    m.basse(te, RACINE.get(accord) - 12, 3.3, generique ? 0.08 : 0.13);
  }
  // le thème, à la cloche
  m.cloche(te, THEME[i % THEME.length], generique ? 0.04 : 0.055);
  if (!generique && i % 2 === 0) m.cloche(te, THEME[i % THEME.length] - 12, 0.025);
}

export class Musique {
  constructor(ctx, sortie) {
    this.ctx = ctx;
    this.sortie = sortie;
    this.T = 0;
    this.jusque = 0;
    this.bus = null;
    this.sources = [];
    // bruit blanc (2 s, en boucle) pour la batterie, le vent, la pluie et la radio
    this.tamponBruit = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.tamponBruit.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.reinitialiser();
  }

  /** Repart de zéro : l'ancien bus s'éteint en douceur, un nouveau est créé. */
  reinitialiser() {
    const ctx = this.ctx;
    if (this.bus) {
      const ancien = this.bus;
      ancien.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      for (const s of this.sources) { try { s.stop(ctx.currentTime + 0.4); } catch { /* déjà arrêtée */ } }
      setTimeout(() => ancien.disconnect(), 600);
    }
    this.sources = [];
    this.bus = ctx.createGain();
    this.bus.gain.value = 1;
    // compresseur : évite la saturation quand tout joue en même temps
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    this.musique = ctx.createGain();
    this.musique.gain.value = 0.85;
    this.musique.connect(comp).connect(this.bus);
    this.bus.connect(this.sortie);
    this.jusque = 0;
    this.prochainPonctuel = 0;
    this.niveauVent = -1;
    this.niveauPluie = -1;
    // ambiance continue : vent (bruit filtré qui ondule) et pluie (pendant la tempête)
    this.vent = this.boucleBruit('bandpass', 420, 0.8);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const prof = ctx.createGain();
    prof.gain.value = 180;
    lfo.connect(prof).connect(this.vent.filtre.frequency);
    lfo.start();
    this.sources.push(lfo);
    this.pluie = this.boucleBruit('highpass', 2600, 0.5);
  }

  boucleBruit(type, frequence, q) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.tamponBruit;
    src.loop = true;
    const filtre = ctx.createBiquadFilter();
    filtre.type = type;
    filtre.frequency.value = frequence;
    filtre.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filtre).connect(gain).connect(this.bus);
    src.start();
    this.sources.push(src);
    return { filtre, gain };
  }

  /**
   * À appeler à chaque image avec le temps du film `T` et l'intensité de la tempête `k` (0..1).
   */
  planifier(T, k = 0) {
    this.T = T;
    const fin = T + AVANCE;
    const debut = Math.max(this.jusque, T);
    if (fin > debut) {
      for (const s of SECTIONS) {
        if (s.f <= debut || s.d >= fin) continue;
        const b = 60 / s.bpm;
        for (let i = Math.max(0, Math.ceil((debut - s.d) / b - 1e-6)); ; i++) {
          const te = s.d + i * b;
          if (te >= fin || te >= s.f) break;
          if (te >= debut) s.fn(this, i, te);
        }
      }
      while (this.prochainPonctuel < PONCTUELS.length && PONCTUELS[this.prochainPonctuel][0] < fin) {
        const [te, fn] = PONCTUELS[this.prochainPonctuel++];
        if (te >= debut - 0.05) fn(this, te);
      }
      this.jusque = fin;
    }
    // ambiance
    const vent = T < 52 ? 0.07 : T < 98 ? 0.03 : T < 108 ? 0.05 : 0;
    if (Math.abs(vent - this.niveauVent) > 0.001) {
      this.niveauVent = vent;
      this.vent.gain.gain.setTargetAtTime(vent, this.ctx.currentTime, 0.6);
    }
    const pluie = Math.round(k * 20) / 20 * 0.09;
    if (Math.abs(pluie - this.niveauPluie) > 0.001) {
      this.niveauPluie = pluie;
      this.pluie.gain.gain.setTargetAtTime(pluie, this.ctx.currentTime, 0.4);
    }
  }

  /** Instant du contexte audio correspondant au temps du film `te` (null si déjà passé). */
  quand(te) {
    const d = te - this.T;
    if (d < -0.05) return null;
    return this.ctx.currentTime + Math.max(0, d);
  }

  enveloppe(t, vol, attaque, duree, sortie = this.musique) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attaque);
    g.gain.setValueAtTime(vol, t + Math.max(attaque, duree * 0.65));
    g.gain.linearRampToValueAtTime(0.0001, t + duree);
    g.connect(sortie);
    return g;
  }

  osc(type, f, t, duree, sortie, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = detune;
    o.connect(sortie);
    o.start(t);
    o.stop(t + duree + 0.05);
    return o;
  }

  // ---------- Instruments ----------

  /** Nappe : dents de scie désaccordées, filtrées, attaque et chute lentes. */
  nappe(te, notes, duree, vol, coupure = 1400) {
    const t = this.quand(te);
    if (t === null) return;
    const g = this.enveloppe(t, vol / notes.length, Math.min(1.2, duree * 0.3), duree);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = coupure;
    f.connect(g);
    for (const n of notes) {
      this.osc('sawtooth', NOTE(n), t, duree, f, -8);
      this.osc('sawtooth', NOTE(n), t, duree, f, 8);
    }
  }

  basse(te, n, duree, vol) {
    const t = this.quand(te);
    if (t === null) return;
    const g = this.enveloppe(t, vol, 0.02, duree);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    f.connect(g);
    this.osc('sawtooth', NOTE(n), t, duree, f);
    this.osc('sine', NOTE(n - 12), t, duree, g);
  }

  pulsation(te, n, vol) {
    const t = this.quand(te);
    if (t === null) return;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    g.connect(this.musique);
    this.osc('triangle', NOTE(n - 12), t, 0.5, g);
  }

  /** Cloche : sinus + partiel aigu, chute exponentielle. */
  cloche(te, n, vol) {
    const t = this.quand(te);
    if (t === null) return;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    g.connect(this.musique);
    this.osc('sine', NOTE(n), t, 1.8, g);
    const g2 = this.ctx.createGain();
    g2.gain.value = 0.3;
    g2.connect(g);
    this.osc('sine', NOTE(n) * 2.76, t, 0.6, g2);
  }

  /** Cuivres : accord en dents de scie dont le filtre s'ouvre (attaque « brass »). */
  cuivre(te, notes, duree, vol) {
    const t = this.quand(te);
    if (t === null) return;
    const g = this.enveloppe(t, vol / notes.length, 0.04, duree);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + 0.08);
    f.frequency.exponentialRampToValueAtTime(700, t + duree);
    f.connect(g);
    for (const n of notes) this.osc('sawtooth', NOTE(n - 12), t, duree, f);
  }

  grosseCaisse(te, vol) {
    const t = this.quand(te);
    if (t === null) return;
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.22);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(this.musique);
    o.start(t);
    o.stop(t + 0.32);
  }

  bruit(t, duree, type, frequence, vol, sortie = this.musique, q = 0.8) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.tamponBruit;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = frequence;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duree);
    src.connect(f).connect(g).connect(sortie);
    src.start(t, Math.random());
    src.stop(t + duree + 0.02);
    return f;
  }

  caisseClaire(te, vol) {
    const t = this.quand(te);
    if (t === null) return;
    this.bruit(t, 0.18, 'bandpass', 1900, vol);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol * 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    g.connect(this.musique);
    this.osc('triangle', 190, t, 0.12, g);
  }

  charleston(te, vol) {
    const t = this.quand(te);
    if (t === null) return;
    this.bruit(t, 0.05, 'highpass', 7500, vol);
  }

  /** Impact grave (titre, explosion) : sinus qui plonge + souffle. */
  impact(te, vol) {
    const t = this.quand(te);
    if (t === null) return;
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 1.6);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol * 0.7, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
    o.connect(g).connect(this.musique);
    o.start(t);
    o.stop(t + 1.85);
    this.bruit(t, 1.2, 'lowpass', 500, vol * 0.35);
  }

  /** Montée de tension : souffle dont le filtre monte. */
  montee(te, duree, vol) {
    const t = this.quand(te);
    if (t === null) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.tamponBruit;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(5000, t + duree);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + duree * 0.95);
    g.gain.linearRampToValueAtTime(0.0001, t + duree);
    src.connect(f).connect(g).connect(this.musique);
    src.start(t);
    src.stop(t + duree + 0.05);
  }

  /** Grésillement de radio (avant une réplique radio). */
  radio(te) {
    const t = this.quand(te);
    if (t === null) return;
    this.bruit(t, 0.25, 'bandpass', 2400, 0.12, this.bus, 3);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.03, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    g.connect(this.bus);
    this.osc('square', 1250, t, 0.09, g);
  }

  /** Fondu de sortie de tout le bus (fin du générique). */
  fondu(te, duree) {
    const t = this.quand(te);
    if (t === null) return;
    this.bus.gain.setValueAtTime(1, t);
    this.bus.gain.linearRampToValueAtTime(0.0001, t + duree);
  }
}
