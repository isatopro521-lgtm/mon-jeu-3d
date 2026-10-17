import * as THREE from 'three';

// Post-traitement léger (qualité haute seulement) :
//  - rendu de la scène en HDR (demi-flottants) avec anticrénelage multi-échantillons (MSAA),
//  - halo lumineux (« bloom ») discret sur ce qui dépasse la luminosité normale : néons, visières,
//    flammes de bouche, soleil… (chaîne de flous réduits, très peu coûteuse),
//  - reflet du soleil quand il est dans le champ, vignettage, tone mapping ACES et sortie sRGB.
// En qualité moyenne/basse (téléphones), on garde le rendu direct, sans aucun coût.

const NIVEAUX_FLOU = 5;
const SEUIL = 1.0;        // luminance à partir de laquelle ça « bave »
const GENOU = 0.6;        // transition douce autour du seuil
const FORCE_HALO = 0.55;
const VIGNETTE = 0.32;

// Matières lumineuses : plus intenses quand le halo est actif (sinon elles saturent sans briller)
const lumineux = new Map(); // matière → { base: Color, facteur }

/** Déclare une matière lumineuse : sa couleur est multipliée par `facteur` quand le halo est actif. */
export function declarerLumineux(mat, facteur = 2.5) {
  if (!mat || lumineux.has(mat)) return mat;
  const prop = mat.emissive && !mat.isMeshBasicMaterial ? 'emissive' : 'color';
  lumineux.set(mat, { prop, base: mat[prop].clone(), facteur });
  if (actif) mat[prop].copy(lumineux.get(mat).base).multiplyScalar(facteur);
  return mat;
}
let actif = false;
function intensifier(oui) {
  actif = oui;
  for (const [mat, l] of lumineux) {
    // la couleur de base a pu changer depuis (ex. feux qui clignotent) : on repart de la valeur courante
    mat[l.prop].copy(l.base).multiplyScalar(oui ? l.facteur : 1);
  }
}

const vertexPlein = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// Extraction des zones lumineuses (seuil doux) + première réduction
const fragSeuil = /* glsl */`
  uniform sampler2D tCouleur;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tCouleur, vUv + uTexel * vec2(-1.0, -1.0)).rgb
           + texture2D(tCouleur, vUv + uTexel * vec2( 1.0, -1.0)).rgb
           + texture2D(tCouleur, vUv + uTexel * vec2(-1.0,  1.0)).rgb
           + texture2D(tCouleur, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
    c *= 0.25;
    float l = max(c.r, max(c.g, c.b));
    float doux = clamp(l - ${SEUIL.toFixed(2)} + ${GENOU.toFixed(2)}, 0.0, 2.0 * ${GENOU.toFixed(2)});
    doux = doux * doux / (4.0 * ${GENOU.toFixed(2)} + 1e-4);
    float k = max(doux, l - ${SEUIL.toFixed(2)}) / max(l, 1e-4);
    gl_FragColor = vec4(min(c * k, vec3(40.0)), 1.0);
  }`;

// Flou « dual filter » (Kawase) : réduction puis agrandissement
const fragReduire = /* glsl */`
  uniform sampler2D tSource;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tSource, vUv).rgb * 4.0;
    c += texture2D(tSource, vUv - uTexel).rgb;
    c += texture2D(tSource, vUv + uTexel).rgb;
    c += texture2D(tSource, vUv + vec2(uTexel.x, -uTexel.y)).rgb;
    c += texture2D(tSource, vUv - vec2(uTexel.x, -uTexel.y)).rgb;
    gl_FragColor = vec4(c / 8.0, 1.0);
  }`;
const fragAgrandir = /* glsl */`
  uniform sampler2D tSource;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    vec2 t = uTexel;
    vec3 c = texture2D(tSource, vUv + vec2(-t.x * 2.0, 0.0)).rgb;
    c += texture2D(tSource, vUv + vec2(-t.x, t.y)).rgb * 2.0;
    c += texture2D(tSource, vUv + vec2(0.0, t.y * 2.0)).rgb;
    c += texture2D(tSource, vUv + vec2(t.x, t.y)).rgb * 2.0;
    c += texture2D(tSource, vUv + vec2(t.x * 2.0, 0.0)).rgb;
    c += texture2D(tSource, vUv + vec2(t.x, -t.y)).rgb * 2.0;
    c += texture2D(tSource, vUv + vec2(0.0, -t.y * 2.0)).rgb;
    c += texture2D(tSource, vUv + vec2(-t.x, -t.y)).rgb * 2.0;
    gl_FragColor = vec4(c / 12.0, 1.0);
  }`;

// Composition finale : scène + halo + reflet du soleil, vignette, ACES, sRGB
const fragFinal = /* glsl */`
  uniform sampler2D tCouleur;
  uniform sampler2D tHalo;
  uniform float uForce, uVignette, uExposition, uAspect;
  uniform vec3 uSoleil;   // xy : position à l'écran (0..1), z : intensité (0 si hors champ)
  varying vec2 vUv;
  vec3 aces(vec3 x) { // même courbe que THREE.ACESFilmicToneMapping
    const mat3 entree = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
    const mat3 sortie = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
    x *= uExposition / 0.6;
    x = entree * x;
    vec3 a = x * (x + 0.0245786) - 0.000090537;
    vec3 b = x * (0.983729 * x + 0.4329510) + 0.238081;
    return clamp(sortie * (a / b), 0.0, 1.0);
  }
  vec3 versSRGB(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }
  void main() {
    vec3 c = texture2D(tCouleur, vUv).rgb + texture2D(tHalo, vUv).rgb * uForce;
    // reflet doux autour du soleil (diffusion dans l'objectif)
    vec2 d = (vUv - uSoleil.xy) * vec2(uAspect, 1.0);
    c += vec3(1.0, 0.78, 0.5) * uSoleil.z * (0.18 / (1.0 + dot(d, d) * 60.0));
    // vignettage
    vec2 v = vUv - 0.5;
    c *= 1.0 - uVignette * smoothstep(0.25, 0.85, dot(v, v) * 2.2);
    gl_FragColor = vec4(versSRGB(aces(c)), 1.0);
  }`;

function passe(fragmentShader, uniforms) {
  return new THREE.ShaderMaterial({ vertexShader: vertexPlein, fragmentShader, uniforms, depthTest: false, depthWrite: false });
}

export class PostTraitement {
  constructor(renderer, { soleil } = {}) {
    this.renderer = renderer;
    renderer.info.autoReset = false; // plusieurs passes par image : compteurs remis à zéro dans rendre()
    this.directionSoleil = soleil; // Vector3 (direction vers le soleil), pour le reflet
    this.actif = false;
    this.cible = null;
    this.flous = [];
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.matSeuil = passe(fragSeuil, { tCouleur: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.matReduire = passe(fragReduire, { tSource: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.matAgrandir = passe(fragAgrandir, { tSource: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.matFinal = passe(fragFinal, {
      tCouleur: { value: null }, tHalo: { value: null },
      uForce: { value: FORCE_HALO }, uVignette: { value: VIGNETTE },
      uExposition: { value: renderer.toneMappingExposure }, uAspect: { value: 1 },
      uSoleil: { value: new THREE.Vector3() },
    });
    this.taille = new THREE.Vector2();
    this._v = new THREE.Vector3();
  }

  /** Active ou coupe le post-traitement (appelé par le système de qualité). */
  activer(oui) {
    if (oui === this.actif) return;
    this.actif = oui;
    intensifier(oui);
    if (!oui) this.liberer();
  }

  liberer() {
    this.cible?.dispose();
    this.cible = null;
    for (const f of this.flous) f.dispose();
    this.flous.length = 0;
    this.taille.set(0, 0);
  }

  /** (Re)crée les tampons à la taille de l'écran. */
  preparer(l, h) {
    this.liberer();
    this.taille.set(l, h);
    const capable = this.renderer.capabilities.isWebGL2;
    this.cible = new THREE.WebGLRenderTarget(l, h, {
      type: THREE.HalfFloatType, samples: capable ? 4 : 0, depthBuffer: true,
    });
    let w = l, hh = h;
    for (let i = 0; i < NIVEAUX_FLOU; i++) {
      w = Math.max(1, Math.round(w / 2));
      hh = Math.max(1, Math.round(hh / 2));
      this.flous.push(new THREE.WebGLRenderTarget(w, hh, { type: THREE.HalfFloatType, depthBuffer: false }));
    }
  }

  dessiner(mat, cible) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(cible);
    this.renderer.render(this.scene, this.cam);
  }

  /** Rendu d'une image : direct si inactif, sinon scène HDR → halo → composition. */
  rendre(scene, camera) {
    const R = this.renderer;
    R.info.reset();
    if (!this.actif) { R.render(scene, camera); return; }
    R.getDrawingBufferSize(this._taille ??= new THREE.Vector2());
    if (!this.cible || !this._taille.equals(this.taille)) this.preparer(this._taille.x, this._taille.y);

    R.setRenderTarget(this.cible);
    R.render(scene, camera);

    // halo : seuil + réductions successives, puis remontée en additionnant
    const f = this.flous;
    this.matSeuil.uniforms.tCouleur.value = this.cible.texture;
    this.matSeuil.uniforms.uTexel.value.set(1 / this.taille.x, 1 / this.taille.y);
    this.dessiner(this.matSeuil, f[0]);
    for (let i = 1; i < f.length; i++) {
      this.matReduire.uniforms.tSource.value = f[i - 1].texture;
      this.matReduire.uniforms.uTexel.value.set(1 / f[i - 1].width, 1 / f[i - 1].height);
      this.dessiner(this.matReduire, f[i]);
    }
    this.matAgrandir.blending = THREE.AdditiveBlending;
    const effacer = R.autoClear;
    R.autoClear = false; // on additionne chaque niveau agrandi au niveau du dessus
    for (let i = f.length - 1; i > 0; i--) {
      this.matAgrandir.uniforms.tSource.value = f[i].texture;
      this.matAgrandir.uniforms.uTexel.value.set(0.5 / f[i].width, 0.5 / f[i].height);
      this.dessiner(this.matAgrandir, f[i - 1]);
    }
    R.autoClear = effacer;

    // soleil à l'écran ?
    const u = this.matFinal.uniforms;
    u.uSoleil.value.z = 0;
    if (this.directionSoleil) {
      const p = this._v.copy(this.directionSoleil).multiplyScalar(1000).add(camera.position).project(camera);
      if (p.z < 1 && Math.abs(p.x) < 1.4 && Math.abs(p.y) < 1.4) {
        u.uSoleil.value.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5, 1 - Math.max(Math.abs(p.x), Math.abs(p.y)) / 1.4);
      }
    }
    u.tCouleur.value = this.cible.texture;
    u.tHalo.value = f[0].texture;
    u.uAspect.value = this.taille.x / this.taille.y;
    u.uExposition.value = R.toneMappingExposure;
    this.dessiner(this.matFinal, null);
  }
}
