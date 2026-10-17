// Voix du film (film.js) : les répliques sont dites à voix haute par la synthèse vocale du navigateur
// (Web Speech API, `speechSynthesis`), en même temps que les sous-titres. Aucun serveur, aucune clé.
// - une voix française (fr-FR de préférence) ; chaque personnage a son timbre (hauteur, débit) ;
// - pas de voix française disponible → sous-titres seuls, sans erreur ;
// - les phrases sont dites une par une (Chrome coupe les énoncés trop longs) ;
// - onParle(true/false) prévient le film pour baisser la musique pendant que la voix parle.

const PERSONNAGES = {
  // narrateur : grave et posé
  narrateur: { genre: 'homme', hauteur: 0.72, debit: 0.86, volume: 1 },
  // l'héroïne : voix claire, décidée
  varga: { genre: 'femme', hauteur: 1.08, debit: 1.04, volume: 1 },
  // la base, à la radio : sèche et rapide
  base: { genre: 'homme', hauteur: 0.92, debit: 1.12, volume: 0.9 },
};

// Prénoms de voix connues (Windows, macOS/iOS, Android, Chrome) pour deviner homme / femme
const FEMMES = /am[ée]lie|audrey|aur[ée]lie|marie|julie|hortense|denise|c[ée]line|l[ée]a|virginie|eloise|[ée]lo[iï]se|vivienne|brigitte|chantal|google fran|jacqueline|yvette|coralie|charline|sylvie|female|femme/i;
const HOMMES = /thomas|nicolas|paul|henri|claude|mathieu|r[ée]mi|jean|antoine|guillaume|gerard|g[ée]rard|alain|daniel|jerome|j[ée]r[ôo]me|maxime|yves|fabrice|male|homme/i;

/** Découpe un texte en phrases (Chrome interrompt parfois les énoncés de plus de ~15 s), regroupées en blocs courts. */
export function decouperPhrases(texte) {
  const morceaux = texte.replace(/\s+/g, ' ').trim().match(/[.!?…]*[^.!?…]+(?:\s*[.!?…])*/g) || [];
  // phrases regroupées par blocs de 120 caractères au plus (fluide, mais jamais trop long)
  const blocs = [];
  for (const m of morceaux.map((x) => x.trim()).filter((x) => /[\p{L}\d]/u.test(x))) {
    const dernier = blocs.length - 1;
    if (dernier >= 0 && blocs[dernier].length + m.length < 120) blocs[dernier] += ` ${m}`;
    else blocs.push(m);
  }
  return blocs;
}

export class Voix {
  constructor({ onParle = () => {}, onChange = () => {} } = {}) {
    this.synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
    this.onParle = onParle;
    this.onChange = () => {};
    this.voixParRole = {};
    this.disponible = false;
    this.actif = true;
    this.enCours = 0;      // énoncés en train d'être dits
    this.file = [];        // références gardées (sinon Chrome peut oublier les événements onend)
    this.generation = 0;   // change à chaque annulation : les anciens événements sont ignorés
    try { this.actif = localStorage.getItem('film-voix') !== 'non'; } catch { /* stockage indisponible */ }
    if (!this.synth) { this.onChange = onChange; return; }
    this.choisirVoix();
    this.onChange = onChange; // (pas d'appel pendant la construction)
    // les voix arrivent souvent après le chargement de la page
    try { this.synth.addEventListener?.('voiceschanged', () => this.choisirVoix()); } catch { /* ancien navigateur */ }
  }

  /** Choisit une voix française pour chaque personnage (deux voix différentes si possible). */
  choisirVoix() {
    let liste = [];
    try { liste = this.synth.getVoices() || []; } catch { liste = []; }
    const fr = liste.filter((v) => /^fr/i.test(v.lang || ''));
    const note = (v) => (/^fr[-_]FR/i.test(v.lang) ? 4 : 0)
      + (/natural|neural|online|premium|enhanced|google/i.test(v.name) ? 2 : 0)
      + (v.localService === false ? 0.5 : 0);
    fr.sort((a, b) => note(b) - note(a));
    const femme = fr.find((v) => FEMMES.test(v.name)) || null;
    const homme = fr.find((v) => HOMMES.test(v.name)) || null;
    const premiere = fr[0] || null;
    const autre = fr.find((v) => v !== (homme || premiere)) || null;
    this.voixParRole = {
      narrateur: homme || premiere,
      varga: femme || premiere,
      base: (homme && fr.find((v) => v !== homme && HOMMES.test(v.name))) || autre || homme || premiere,
    };
    const avant = this.disponible;
    this.disponible = !!premiere;
    if (avant !== this.disponible) this.onChange();
  }

  get utilisable() { return !!this.synth && this.disponible && this.actif; }

  basculer() {
    this.actif = !this.actif;
    try { localStorage.setItem('film-voix', this.actif ? 'oui' : 'non'); } catch { /* stockage indisponible */ }
    if (!this.actif) this.annuler();
    else this.debloquer(); // (clic) autorise la parole sur téléphone
    this.onChange();
  }

  /**
   * À appeler pendant le clic sur « Lancer le film » : iOS et Android n'autorisent la parole
   * qu'à partir d'un geste de l'utilisateur. Un énoncé muet suffit à « déverrouiller » la voix.
   */
  debloquer() {
    if (!this.synth) return;
    if (!this.disponible) this.choisirVoix();
    this.annuler();
    if (!this.utilisable || this.debloquee) return;
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      u.lang = 'fr-FR';
      this.synth.speak(u);
      this.debloquee = true;
    } catch { /* synthèse refusée : sous-titres seuls */ }
  }

  /** Dit une réplique (texte brut) avec la voix du personnage. Coupe la réplique précédente. */
  dire(role, texte) {
    if (!this.utilisable) return false;
    const p = PERSONNAGES[role] || PERSONNAGES.narrateur;
    const voix = this.voixParRole[role] || this.voixParRole.narrateur;
    this.annuler();
    const gen = this.generation;
    try {
      for (const phrase of decouperPhrases(texte)) {
        const u = new SpeechSynthesisUtterance(phrase);
        if (voix) u.voice = voix;
        u.lang = voix?.lang || 'fr-FR';
        u.pitch = p.hauteur;
        u.rate = p.debit;
        u.volume = p.volume;
        u.onstart = () => { if (gen === this.generation) this.changerParle(1); };
        u.onend = u.onerror = () => {
          if (gen !== this.generation) return;
          this.changerParle(-1);
          const i = this.file.indexOf(u);
          if (i >= 0) this.file.splice(i, 1);
        };
        this.file.push(u);
        this.synth.speak(u);
      }
      return true;
    } catch {
      return false; // synthèse indisponible : sous-titres seuls
    }
  }

  changerParle(d) {
    const avant = this.enCours > 0;
    this.enCours = Math.max(0, this.enCours + d);
    if (avant !== this.enCours > 0) this.onParle(this.enCours > 0);
  }

  /** Arrête net la parole (recommencer, son coupé, voix désactivée, fin du film). */
  annuler() {
    this.generation++;
    this.file.length = 0;
    if (this.enCours > 0) { this.enCours = 0; this.onParle(false); }
    if (!this.synth) return;
    try {
      this.synth.cancel();
      this.synth.resume(); // Chrome peut rester « en pause » après un cancel
    } catch { /* rien à arrêter */ }
  }

  pause() {
    if (!this.synth) return;
    try { this.synth.pause(); } catch { /* non pris en charge */ }
  }

  reprendre() {
    if (!this.synth) return;
    try { this.synth.resume(); } catch { /* non pris en charge */ }
    // Android ne sait pas reprendre : la phrase en pause est perdue, on remet la musique à niveau
    const gen = this.generation;
    setTimeout(() => {
      if (gen !== this.generation || !this.synth || this.synth.speaking || this.synth.pending) return;
      this.file.length = 0;
      if (this.enCours > 0) { this.enCours = 0; this.onParle(false); }
    }, 400);
  }
}
