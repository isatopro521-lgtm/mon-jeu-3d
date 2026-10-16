export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/**
 * Repousse un cylindre vertical (pieds en `pos`, rayon, hauteur) hors des boîtes.
 * Les boîtes sur lesquelles on se tient (sommet sous les pieds) sont ignorées.
 */
export function collisionCercleBoites(pos, rayon, hauteur, boites) {
  for (const b of boites) {
    if (pos.y >= b.max.y - 0.05 || pos.y + hauteur <= b.min.y) continue;
    const cx = clamp(pos.x, b.min.x, b.max.x);
    const cz = clamp(pos.z, b.min.z, b.max.z);
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= rayon * rayon) continue;

    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      const k = (rayon - d) / d;
      pos.x += dx * k;
      pos.z += dz * k;
    } else {
      // Centre à l'intérieur de la boîte : on sort par le côté le plus proche
      const g = pos.x - b.min.x, dr = b.max.x - pos.x;
      const ar = pos.z - b.min.z, av = b.max.z - pos.z;
      const m = Math.min(g, dr, ar, av);
      if (m === g) pos.x = b.min.x - rayon;
      else if (m === dr) pos.x = b.max.x + rayon;
      else if (m === ar) pos.z = b.min.z - rayon;
      else pos.z = b.max.z + rayon;
    }
  }
}

/** Hauteur du sol sous (x, z) : sommet de boîte le plus haut qui était sous les pieds (`yPieds`). */
export function hauteurSol(x, z, yPieds, rayon, boites) {
  let h = 0;
  const r = rayon * 0.7;
  for (const b of boites) {
    if (b.max.y > yPieds + 0.05) continue;
    if (x + r > b.min.x && x - r < b.max.x && z + r > b.min.z && z - r < b.max.z) {
      h = Math.max(h, b.max.y);
    }
  }
  return h;
}

export function melanger(tableau) {
  for (let i = tableau.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tableau[i], tableau[j]] = [tableau[j], tableau[i]];
  }
  return tableau;
}
