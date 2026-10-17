import * as THREE from 'three';
import { aleatoire } from './utils.js';
import { textureNuage } from './textures.js';

// Ciel de fin d'après-midi (heure dorée) : dégradé + soleil bas, nuages, brouillard bleuté,
// lumières, et carte d'environnement (reflets des métaux et de l'eau).

export const DIRECTION_SOLEIL = new THREE.Vector3(-0.8, 0.4, -0.5).normalize();
const RAYON_CIEL = 1400;
// Brume atmosphérique : les montagnes lointaines se fondent dans la couleur de l'horizon
const DENSITE_BROUILLARD = 0.00135;

const COULEURS = {
  zenith: new THREE.Color(0x2058b8),
  horizon: new THREE.Color(0xb9d2ea),
  soleilHalo: new THREE.Color(0xffc27a),
  brouillard: new THREE.Color(0xa8bdd6),
  // Tempête Nexus
  zenithT: new THREE.Color(0x1a0405),
  horizonT: new THREE.Color(0x7a1c16),
  brouillardT: new THREE.Color(0x3a1414),
};

const vertexCiel = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * p;
    gl_Position.z = gl_Position.w; // toujours au fond
  }`;

const fragmentCiel = /* glsl */`
  uniform vec3 uZenith, uHorizon, uHalo, uSoleil;
  uniform float uTempete, uEclair;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y, -0.2, 1.0);
    vec3 c = mix(uHorizon, uZenith, pow(max(h, 0.0), 0.55));
    float s = max(dot(d, uSoleil), 0.0);
    // halo chaud autour du soleil + disque
    c = mix(c, uHalo, pow(s, 6.0) * 0.55 * (1.0 - uTempete));
    c += uHalo * pow(s, 60.0) * 0.6 * (1.0 - uTempete);
    c += vec3(1.0, 0.95, 0.85) * smoothstep(0.9993, 0.9997, s) * 3.0 * (1.0 - uTempete);
    // sous l'horizon : brume claire
    c = mix(c, uHorizon * 0.95, smoothstep(0.0, -0.15, d.y));
    c += vec3(1.0, 0.75, 0.75) * uEclair;
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export function creerCiel(scene, renderer, { qualite = 'haute', tailleOmbres = 2048 } = {}) {
  const uniforms = {
    uZenith: { value: COULEURS.zenith.clone() },
    uHorizon: { value: COULEURS.horizon.clone() },
    uHalo: { value: COULEURS.soleilHalo.clone() },
    uSoleil: { value: DIRECTION_SOLEIL.clone() },
    uTempete: { value: 0 },
    uEclair: { value: 0 },
  };
  const matCiel = new THREE.ShaderMaterial({
    uniforms, vertexShader: vertexCiel, fragmentShader: fragmentCiel,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const ciel = new THREE.Mesh(new THREE.SphereGeometry(RAYON_CIEL, 32, 16), matCiel);
  ciel.frustumCulled = false;
  ciel.renderOrder = -10;
  scene.add(ciel);

  // Environnement (reflets) calculé une fois à partir du ciel
  const pmrem = new THREE.PMREMGenerator(renderer);
  const sceneEnv = new THREE.Scene();
  sceneEnv.add(new THREE.Mesh(ciel.geometry, matCiel));
  const sol = new THREE.Mesh(new THREE.CircleGeometry(RAYON_CIEL * 0.9, 16).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x4a4a3a }));
  sol.position.y = -2;
  sceneEnv.add(sol);
  scene.environment = pmrem.fromScene(sceneEnv, 0, 1, RAYON_CIEL * 2).texture;
  pmrem.dispose();

  scene.background = null;
  scene.fog = new THREE.FogExp2(COULEURS.brouillard.clone(), DENSITE_BROUILLARD);

  // Lumières : soleil bas et chaud, ciel froid
  const hemi = new THREE.HemisphereLight(0xb0ccff, 0x6a5a3c, 1.5);
  scene.add(hemi);
  const soleil = new THREE.DirectionalLight(0xffc68e, 4.2);
  soleil.position.copy(DIRECTION_SOLEIL).multiplyScalar(120);
  soleil.castShadow = true;
  soleil.shadow.mapSize.set(tailleOmbres, tailleOmbres);
  const o = soleil.shadow.camera;
  o.left = o.bottom = -46;
  o.right = o.top = 46;
  o.near = 20;
  o.far = 260;
  soleil.shadow.bias = -0.0006;
  soleil.shadow.normalBias = 0.04;
  scene.add(soleil, soleil.target);

  // Nuages : quads tournés vers le centre, fusionnés en un seul maillage
  const r = aleatoire(77);
  const nb = qualite === 'haute' ? 46 : 26;
  const pos = [], uv = [], col = [], idx = [];
  const centre = new THREE.Vector3(), droite = new THREE.Vector3(), haut = new THREE.Vector3();
  for (let i = 0; i < nb; i++) {
    const a = r() * Math.PI * 2;
    const dist = 950 + r() * 330;
    const y = 260 + r() * 380;
    centre.set(Math.cos(a) * dist, y, Math.sin(a) * dist);
    const w = 260 + r() * 380, h = w * (0.32 + r() * 0.14);
    droite.set(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(w / 2);
    haut.set(0, h / 2, 0);
    // côté soleil : bords dorés
    const k = Math.max(0, Math.cos(a) * DIRECTION_SOLEIL.x + Math.sin(a) * DIRECTION_SOLEIL.z);
    const teinte = [1, 1 - k * 0.12, 1 - k * 0.3];
    const b = pos.length / 3;
    for (const [sx, sy, u, v] of [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]]) {
      pos.push(centre.x + droite.x * sx, centre.y + haut.y * sy, centre.z + droite.z * sx);
      uv.push(i % 2 ? 1 - u : u, v); // un nuage sur deux en miroir (variété)
      col.push(...teinte);
    }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const geoNuages = new THREE.BufferGeometry();
  geoNuages.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geoNuages.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geoNuages.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geoNuages.setIndex(idx);
  const matNuages = new THREE.MeshBasicMaterial({
    map: textureNuage(), vertexColors: true, transparent: true, depthWrite: false,
    fog: false, side: THREE.DoubleSide, opacity: 0.95,
  });
  const nuages = new THREE.Mesh(geoNuages, matNuages);
  nuages.renderOrder = -9;
  nuages.frustumCulled = false;
  scene.add(nuages);

  const base = {
    hemi: hemi.intensity, soleil: soleil.intensity,
    hemiCiel: hemi.color.clone(), soleilCouleur: soleil.color.clone(),
  };
  const tmp = new THREE.Color();
  const ROUGE_NUAGE = new THREE.Color(0.35, 0.08, 0.07);
  let tempete = -1;

  return {
    soleil, hemi, nuages, uniforms,
    /** Ombres : la caméra d'ombre suit le centre de l'arène (fixe). */
    update(dt, t) {
      nuages.rotation.y = t * 0.002;
    },
    /** k = 0 (temps normal) → 1 (Tempête Nexus) ; `eclair` = flash 0..1. */
    ambiance(k, eclair = 0) {
      uniforms.uEclair.value = eclair * 0.6;
      if (k === tempete && eclair === 0) return;
      tempete = k;
      uniforms.uTempete.value = k;
      uniforms.uZenith.value.copy(COULEURS.zenith).lerp(COULEURS.zenithT, k);
      uniforms.uHorizon.value.copy(COULEURS.horizon).lerp(COULEURS.horizonT, k);
      scene.fog.color.copy(COULEURS.brouillard).lerp(COULEURS.brouillardT, k);
      scene.fog.density = DENSITE_BROUILLARD + k * 0.0035;
      matNuages.color.setRGB(1, 1, 1).lerp(ROUGE_NUAGE, k);
      hemi.color.copy(base.hemiCiel).lerp(tmp.setRGB(1, 0.35, 0.3), k);
      hemi.intensity = base.hemi * (1 - k * 0.35) + eclair * 4;
      soleil.intensity = base.soleil * (1 - k * 0.8);
    },
  };
}
