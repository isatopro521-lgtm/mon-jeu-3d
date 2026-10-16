import * as THREE from 'three';

// Niveaux de qualité graphique (haute / moyenne / basse) + mode Auto.
// Auto : démarre en haute sur PC, moyenne sur téléphone (ou au dernier niveau retenu),
// mesure les images/s pendant la partie et descend d'un niveau si c'est trop lent.
// Il ne remonte jamais tout seul (évite le yo-yo).

export const NIVEAUX = ['haute', 'moyenne', 'basse'];
export const CHOIX = ['auto', ...NIVEAUX];
const NOMS = { auto: 'Auto', haute: 'Haute', moyenne: 'Moyenne', basse: 'Basse' };

const SEUIL_IPS = 40;            // en dessous : on descend d'un niveau
const FENETRE = 2;               // s : moyenne glissante des images/s
const IGNORER_DEBUT = 2;         // s ignorées au début de partie / après une pause
const ECART_BAISSES = 4;         // s minimum entre deux baisses
const CLE_CHOIX = 'nexus-qualite';
const CLE_AUTO = 'nexus-qualite-auto';

/** Réglages de chaque niveau (densites : part des instances dessinées). */
const REGLAGES = {
  haute: {
    pixelRatio: (tactile) => Math.min(devicePixelRatio, tactile ? 1.5 : 2),
    ombres: true, tailleOmbres: (tactile) => (tactile ? 1024 : 2048), ombresDouces: true,
    herbe: 1, foret: 1, buissons: 1, rochers: 1, detailsEau: true, pluie: 1,
  },
  moyenne: {
    pixelRatio: () => Math.min(devicePixelRatio, 1),
    ombres: true, tailleOmbres: () => 1024, ombresDouces: false,
    herbe: 0.55, foret: 0.65, buissons: 0.6, rochers: 0.6, detailsEau: true, pluie: 0.6,
  },
  basse: {
    pixelRatio: () => Math.min(devicePixelRatio, 0.75),
    ombres: false, tailleOmbres: () => 512, ombresDouces: false,
    herbe: 0.25, foret: 0.35, buissons: 0.35, rochers: 0, detailsEau: false, pluie: 0.3,
  },
};

function lire(cle) {
  try { return localStorage.getItem(cle); } catch { return null; }
}
function ecrire(cle, valeur) {
  try { localStorage.setItem(cle, valeur); } catch { /* stockage indisponible */ }
}

export class Qualite {
  constructor({ renderer, scene, monde, tempete, estTactile, onChange }) {
    this.renderer = renderer;
    this.scene = scene;
    this.monde = monde;
    this.tempete = tempete;
    this.tactile = estTactile;
    this.onChange = onChange;

    // Instances réglables : on retient le nombre maximal construit
    const d = monde.decor;
    this.groupes = {
      herbe: [monde.herbe],
      foret: d.foret,
      buissons: [d.buissons, monde.buissonsArene],
      rochers: [d.rochers],
    };
    for (const liste of Object.values(this.groupes)) for (const m of liste) m.userData.max = m.count;

    const choix = lire(CLE_CHOIX);
    this.choix = CHOIX.includes(choix) ? choix : 'auto';
    const auto = lire(CLE_AUTO);
    this.niveauAuto = NIVEAUX.includes(auto) ? auto : (estTactile ? 'moyenne' : 'haute');
    this.niveau = null;
    this.ips = 0;
    this.images = [];
    this.ignorer = IGNORER_DEBUT;
    this.depuisBaisse = ECART_BAISSES;
    this.appliquer(this.choix === 'auto' ? this.niveauAuto : this.choix);
  }

  /** Texte du bouton : « Qualité : Auto (Moyenne) », « Qualité : Basse »… */
  get libelle() {
    return this.choix === 'auto' ? `Qualité : Auto (${NOMS[this.niveau]})` : `Qualité : ${NOMS[this.choix]}`;
  }

  /** Bouton du menu : Auto → Haute → Moyenne → Basse → Auto… (mémorisé). */
  cycler() {
    this.choix = CHOIX[(CHOIX.indexOf(this.choix) + 1) % CHOIX.length];
    ecrire(CLE_CHOIX, this.choix);
    this.appliquer(this.choix === 'auto' ? this.niveauAuto : this.choix);
    this.reprise();
  }

  /** À appeler au début d'une partie et après une pause : les premières secondes sont ignorées. */
  reprise() {
    this.images.length = 0;
    this.ignorer = IGNORER_DEBUT;
  }

  appliquer(niveau) {
    if (niveau === this.niveau) return;
    const r = REGLAGES[niveau];
    const R = this.renderer;
    this.niveau = niveau;

    R.setPixelRatio(r.pixelRatio(this.tactile));
    R.setSize(innerWidth, innerHeight);

    // Ombres : changer de type ou les couper oblige à recompiler les matériaux
    const soleil = this.monde.ciel.soleil;
    const type = r.ombresDouces ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    const taille = r.tailleOmbres(this.tactile);
    if (R.shadowMap.enabled !== r.ombres || R.shadowMap.type !== type) {
      R.shadowMap.enabled = r.ombres;
      R.shadowMap.type = type;
      this.scene.traverse((o) => {
        if (!o.material) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.needsUpdate = true;
      });
    }
    soleil.castShadow = r.ombres;
    if (soleil.shadow.mapSize.x !== taille) {
      soleil.shadow.mapSize.set(taille, taille);
      soleil.shadow.map?.dispose();
      soleil.shadow.map = null;
    }

    // Densité du décor (les instances sont réparties au hasard : les N premières suffisent)
    for (const [nom, liste] of Object.entries(this.groupes)) {
      for (const m of liste) {
        m.count = Math.floor(m.userData.max * r[nom]);
        m.visible = m.count > 0;
      }
    }
    for (const m of this.monde.decor.eau) m.visible = r.detailsEau;
    this.tempete.densitePluie(r.pluie);
    this.onChange?.(this);
  }

  /**
   * Appelé à chaque image avec le temps réel écoulé (s). `enJeu` : faux en menu/pause.
   * Mode Auto : descend d'un niveau si la moyenne glissante passe sous 40 i/s.
   */
  mesurer(dtReel, enJeu) {
    const t = performance.now() / 1000;
    if (!enJeu) { this.reprise(); return; }
    if (this.ignorer > 0) { this.ignorer -= dtReel; return; }
    this.images.push(t);
    while (this.images.length && t - this.images[0] > FENETRE) this.images.shift();
    const duree = t - this.images[0];
    if (duree < FENETRE * 0.9) return;
    this.ips = (this.images.length - 1) / duree;

    this.depuisBaisse += dtReel;
    if (this.choix !== 'auto' || this.ips >= SEUIL_IPS || this.depuisBaisse < ECART_BAISSES) return;
    const i = NIVEAUX.indexOf(this.niveau);
    if (i >= NIVEAUX.length - 1) return;
    this.niveauAuto = NIVEAUX[i + 1];
    ecrire(CLE_AUTO, this.niveauAuto);
    this.depuisBaisse = 0;
    this.appliquer(this.niveauAuto);
    this.reprise();
  }
}
