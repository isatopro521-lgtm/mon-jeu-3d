// Voix du film (film.js) : les répliques sont des fichiers audio pré-enregistrés, livrés avec le site
// (audio/film/voix-00.mp3 … voix-27.mp3, MP3 mono, un par réplique, dans l'ordre des TEXTES avec `voix:`).
// - lus par le même AudioContext que la musique (déverrouillé par le clic « Lancer le film ») :
//   la voix marche partout, même sans voix française installée sur l'appareil ;
// - pause/reprise : la suspension de l'AudioContext met la voix en pause avec la musique ;
// - un fichier qui ne se charge pas → repli sur la synthèse vocale du navigateur (speechSynthesis)
//   pour cette réplique ; sans voix française non plus → sous-titres seuls, sans erreur ;
// - onParle(true/false) prévient le film pour baisser la musique pendant que la voix parle.

export const NB_REPLIQUES = 28;
const DOSSIER = 'audio/film/';
const VOLUME_VOIX = 1.5; // (avant le volume général) : la voix domine nettement la musique

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

/** decodeAudioData compatible ancien Safari (fonctions de rappel seulement). */
function decoder(ctx, donnees) {
  return new Promise((ok, ko) => {
    try {
      const p = ctx.decodeAudioData(donnees, ok, ko);
      if (p && typeof p.then === 'function') p.then(ok, ko);
    } catch (e) { ko(e); }
  });
}

export class Voix {
  constructor({ onParle = () => {}, onChange = () => {} } = {}) {
    this.synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
    this.onParle = onParle;
    this.onChange = () => {};
    this.voixParRole = {};
    this.voixSysteme = false; // voix française du navigateur (repli)
    this.actif = true;
    this.enCours = 0;      // répliques en train d'être dites
    this.file = [];        // énoncés gardés (sinon Chrome peut oublier les événements onend)
    this.generation = 0;   // change à chaque annulation : les anciens événements sont ignorés
    // fichiers audio
    this.ctx = null;
    this.gain = null;
    this.tampons = new Array(NB_REPLIQUES).fill(null);  // AudioBuffer décodés
    this.echecs = new Array(NB_REPLIQUES).fill(false);  // fichier introuvable / illisible
    this.donnees = new Array(NB_REPLIQUES).fill(null);  // promesses des ArrayBuffer téléchargés
    this.sources = [];     // AudioBufferSourceNode en cours
    this.stats = { charges: 0, decodes: 0, echecs: 0, lancees: 0, synthese: 0 }; // (tests)
    try { this.actif = localStorage.getItem('film-voix') !== 'non'; } catch { /* stockage indisponible */ }
    this.telecharger();
    if (this.synth) {
      this.choisirVoix();
      try { this.synth.addEventListener?.('voiceschanged', () => this.choisirVoix()); } catch { /* ancien navigateur */ }
    }
    this.onChange = onChange; // (pas d'appel pendant la construction)
  }

  /** Les fichiers suffisent : le bouton Voix est toujours proposé. */
  get disponible() { return true; }

  /** Télécharge les fichiers dès l'ouverture de la page (le décodage attend l'AudioContext). */
  telecharger() {
    if (typeof fetch !== 'function') { this.echecs.fill(true); return; }
    for (let i = 0; i < NB_REPLIQUES; i++) {
      const url = `${DOSSIER}voix-${String(i).padStart(2, '0')}.mp3`;
      this.donnees[i] = fetch(url)
        .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.arrayBuffer(); })
        .then((b) => { this.stats.charges++; return b; })
        .catch(() => { this.echecs[i] = true; this.stats.echecs++; return null; });
    }
  }

  /**
   * À appeler pendant le clic sur « Lancer le film » (AudioContext de la musique déjà créé) :
   * branche la voix sur le volume général et décode les fichiers.
   */
  preparer(ctx, sortie) {
    if (!ctx || this.ctx === ctx) return;
    this.ctx = ctx;
    try {
      this.gain = ctx.createGain();
      this.gain.gain.value = VOLUME_VOIX;
      this.gain.connect(sortie);
      // tampon muet : finit de déverrouiller l'audio sur les anciens iPhone
      const muet = ctx.createBufferSource();
      muet.buffer = ctx.createBuffer(1, 1, 22050);
      muet.connect(ctx.destination);
      muet.start(0);
    } catch { /* audio indisponible : repli sur la synthèse */ }
    for (let i = 0; i < NB_REPLIQUES; i++) {
      this.donnees[i]?.then((b) => {
        if (!b) return null;
        return decoder(ctx, b).then((tampon) => { this.tampons[i] = tampon; this.stats.decodes++; });
      }).catch(() => { this.echecs[i] = true; this.stats.echecs++; });
    }
  }

  /** Repli : choisit une voix française du navigateur pour chaque personnage. */
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
    this.voixSysteme = !!premiere;
  }

  basculer() {
    this.actif = !this.actif;
    try { localStorage.setItem('film-voix', this.actif ? 'oui' : 'non'); } catch { /* stockage indisponible */ }
    if (!this.actif) this.annuler();
    else this.debloquer(); // (clic) autorise la parole de repli sur téléphone
    this.onChange();
  }

  /**
   * À appeler pendant le clic : iOS et Android n'autorisent la synthèse vocale (repli) qu'à partir
   * d'un geste de l'utilisateur. Un énoncé muet suffit à la « déverrouiller ».
   */
  debloquer() {
    this.annuler();
    if (!this.synth || !this.actif || this.debloquee) return;
    if (!this.voixSysteme) this.choisirVoix();
    if (!this.voixSysteme) return;
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      u.lang = 'fr-FR';
      this.synth.speak(u);
      this.debloquee = true;
    } catch { /* synthèse refusée : fichiers ou sous-titres seuls */ }
  }

  /**
   * Dit la réplique n° `index` (personnage `role`, texte brut), en commençant `decalage` secondes
   * après son début (reprise en cours de réplique). Coupe la réplique précédente.
   * Renvoie true si quelque chose est dit.
   */
  dire(index, role, texte, decalage = 0) {
    if (!this.actif) return false;
    const tampon = this.tampons[index];
    if (tampon && this.ctx && this.gain) {
      if (decalage > tampon.duration - 0.25) return false; // réplique déjà presque finie
      this.annuler();
      const gen = this.generation;
      try {
        const src = this.ctx.createBufferSource();
        src.buffer = tampon;
        src.connect(this.gain);
        src.onended = () => {
          const i = this.sources.indexOf(src);
          if (i >= 0) this.sources.splice(i, 1);
          if (gen === this.generation) this.changerParle(-1);
        };
        this.sources.push(src);
        this.changerParle(1);
        src.start(0, Math.max(0, decalage));
        this.stats.lancees++;
        return true;
      } catch {
        this.changerParle(-1);
        return false;
      }
    }
    // fichier pas (encore) disponible : synthèse vocale du navigateur, au début de la réplique seulement
    if (decalage > 0.6) return false;
    return this.direSynthese(role, texte);
  }

  direSynthese(role, texte) {
    if (!this.synth || !this.voixSysteme) return false;
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
      this.stats.synthese++;
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
    for (const s of this.sources) { try { s.stop(); } catch { /* déjà arrêtée */ } }
    this.sources.length = 0;
    if (this.enCours > 0) { this.enCours = 0; this.onParle(false); }
    if (!this.synth) return;
    try {
      this.synth.cancel();
      this.synth.resume(); // Chrome peut rester « en pause » après un cancel
    } catch { /* rien à arrêter */ }
  }

  /** Pause : les fichiers s'arrêtent avec l'AudioContext suspendu ; la synthèse est mise en pause. */
  pause() {
    if (!this.synth || this.file.length === 0) return;
    try { this.synth.pause(); } catch { /* non pris en charge */ }
  }

  reprendre() {
    if (!this.synth || this.file.length === 0) return;
    try { this.synth.resume(); } catch { /* non pris en charge */ }
    // Android ne sait pas reprendre : la phrase en pause est perdue, on remet la musique à niveau
    const gen = this.generation;
    setTimeout(() => {
      if (gen !== this.generation || !this.synth || this.synth.speaking || this.synth.pending) return;
      this.file.length = 0;
      if (this.enCours > 0 && this.sources.length === 0) { this.enCours = 0; this.onParle(false); }
    }, 400);
  }
}
