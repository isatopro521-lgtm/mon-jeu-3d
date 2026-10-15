import * as THREE from 'three';

export const DEMI_ARENE = 30;

// Points d'apparition des ennemis (bords de l'arène)
export const POINTS_APPARITION = [
  [-26, -26], [0, -27], [26, -26],
  [-27, 0], [27, 0],
  [-26, 26], [0, 27], [26, 26],
];

function textureCanvas(taille, dessiner) {
  const c = document.createElement('canvas');
  c.width = c.height = taille;
  dessiner(c.getContext('2d'), taille);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function textureSol() {
  return textureCanvas(256, (g, t) => {
    g.fillStyle = '#3b4250';
    g.fillRect(0, 0, t, t);
    for (let i = 0; i < 900; i++) {
      const v = 50 + Math.random() * 25;
      g.fillStyle = `rgba(${v},${v + 4},${v + 12},0.35)`;
      g.fillRect(Math.random() * t, Math.random() * t, 2, 2);
    }
    g.strokeStyle = '#272c36';
    g.lineWidth = 4;
    g.strokeRect(0, 0, t, t);
    g.strokeStyle = 'rgba(255,140,60,0.25)';
    g.lineWidth = 2;
    g.strokeRect(t / 2 - 10, t / 2 - 10, 20, 20);
  });
}

function textureCaisse() {
  return textureCanvas(128, (g, t) => {
    g.fillStyle = '#8a6a3c';
    g.fillRect(0, 0, t, t);
    g.strokeStyle = '#5b4426';
    g.lineWidth = 10;
    g.strokeRect(5, 5, t - 10, t - 10);
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(8, 8); g.lineTo(t - 8, t - 8);
    g.moveTo(t - 8, 8); g.lineTo(8, t - 8);
    g.stroke();
  });
}

function textureMur() {
  return textureCanvas(128, (g, t) => {
    g.fillStyle = '#5a6272';
    g.fillRect(0, 0, t, t);
    g.strokeStyle = '#444b58';
    g.lineWidth = 3;
    for (let y = 0; y < t; y += 32) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(t, y); g.stroke();
      const dec = (y / 32) % 2 ? 32 : 0;
      for (let x = dec; x < t; x += 64) {
        g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 32); g.stroke();
      }
    }
  });
}

export function creerMonde(scene) {
  const obstacles = []; // meshes qui bloquent la vue et les balles
  const boites = [];    // Box3 pour les collisions

  scene.background = new THREE.Color(0x1b2130);
  scene.fog = new THREE.Fog(0x1b2130, 35, 95);

  // Éclairage
  scene.add(new THREE.HemisphereLight(0xbcd0ff, 0x4a3a2e, 1.5));
  const soleil = new THREE.DirectionalLight(0xffdcb0, 2.4);
  soleil.position.set(18, 35, 12);
  soleil.castShadow = true;
  soleil.shadow.mapSize.set(2048, 2048);
  const ombre = soleil.shadow.camera;
  ombre.left = ombre.bottom = -DEMI_ARENE - 2;
  ombre.right = ombre.top = DEMI_ARENE + 2;
  ombre.near = 1;
  ombre.far = 90;
  soleil.shadow.bias = -0.0005;
  scene.add(soleil);

  // Sol
  const texSol = textureSol();
  texSol.repeat.set(DEMI_ARENE, DEMI_ARENE);
  const sol = new THREE.Mesh(
    new THREE.PlaneGeometry(DEMI_ARENE * 2, DEMI_ARENE * 2),
    new THREE.MeshStandardMaterial({ map: texSol, roughness: 0.9 }),
  );
  sol.rotation.x = -Math.PI / 2;
  sol.receiveShadow = true;
  scene.add(sol);

  const texMur = textureMur();
  const texCaisse = textureCaisse();
  const materiaux = {
    mur: new THREE.MeshStandardMaterial({ map: texMur, roughness: 0.85 }),
    caisse: new THREE.MeshStandardMaterial({ map: texCaisse, roughness: 0.8 }),
    pilier: new THREE.MeshStandardMaterial({ color: 0x6b7385, roughness: 0.6, metalness: 0.2 }),
    plateforme: new THREE.MeshStandardMaterial({ color: 0x46505f, roughness: 0.7, metalness: 0.3 }),
    neon: new THREE.MeshBasicMaterial({ color: 0xff6a3c }),
  };

  function bloc(x, z, largeur, hauteur, profondeur, materiau, y = 0) {
    const geo = new THREE.BoxGeometry(largeur, hauteur, profondeur);
    if (materiau === materiaux.mur) {
      // Répète la texture selon la taille du mur
      const uv = geo.attributes.uv;
      const n = geo.attributes.normal;
      for (let i = 0; i < uv.count; i++) {
        const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
        const su = ax > 0.5 ? profondeur : largeur;
        const sv = ay > 0.5 ? profondeur : hauteur;
        uv.setXY(i, uv.getX(i) * su / 2, uv.getY(i) * sv / 2);
      }
    }
    const m = new THREE.Mesh(geo, materiau);
    m.position.set(x, y + hauteur / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    obstacles.push(m);
    boites.push(new THREE.Box3().setFromObject(m));
    return m;
  }

  // Murs d'enceinte
  const H = 5, L = DEMI_ARENE * 2 + 2;
  bloc(0, -DEMI_ARENE - 0.5, L, H, 1, materiaux.mur);
  bloc(0, DEMI_ARENE + 0.5, L, H, 1, materiaux.mur);
  bloc(-DEMI_ARENE - 0.5, 0, 1, H, L, materiaux.mur);
  bloc(DEMI_ARENE + 0.5, 0, 1, H, L, materiaux.mur);

  // Bande lumineuse en haut des murs
  for (const [x, z, w, d] of [
    [0, -DEMI_ARENE, L - 2, 0.1], [0, DEMI_ARENE, L - 2, 0.1],
    [-DEMI_ARENE, 0, 0.1, L - 2], [DEMI_ARENE, 0, 0.1, L - 2],
  ]) {
    const neon = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), materiaux.neon);
    neon.position.set(x, H - 0.4, z);
    scene.add(neon);
  }

  // Plateforme centrale (on peut sauter dessus)
  bloc(0, 0, 5, 1, 5, materiaux.plateforme);

  // Piliers
  for (const [x, z] of [[-10, -10], [10, -10], [-10, 10], [10, 10]]) {
    bloc(x, z, 1.6, 6, 1.6, materiaux.pilier);
  }

  // Murets
  bloc(18, 0, 1, 1.3, 8, materiaux.mur);
  bloc(-18, 0, 1, 1.3, 8, materiaux.mur);
  bloc(0, 18, 8, 1.3, 1, materiaux.mur);
  bloc(0, -18, 8, 1.3, 1, materiaux.mur);

  // Caisses
  for (const [x, z, t] of [
    [-20, -12, 2], [20, 12, 2], [-12, 20, 2], [12, -20, 2],
    [22, -22, 1.6], [-22, 22, 1.6], [-21.8, -14, 1.2], [21.8, 14, 1.2],
    [6, 10, 1.4], [-6, -10, 1.4],
  ]) {
    bloc(x, z, t, t, t, materiaux.caisse);
  }
  // Caisses empilées
  bloc(14, -20, 2, 2, 2, materiaux.caisse);
  bloc(14, -20, 1.4, 1.4, 1.4, materiaux.caisse, 2);
  bloc(-14, 20, 2, 2, 2, materiaux.caisse);
  bloc(-14, 20, 1.4, 1.4, 1.4, materiaux.caisse, 2);

  return {
    obstacles,
    boites,
    surfaces: [sol, ...obstacles], // tout ce que les balles peuvent toucher
  };
}
