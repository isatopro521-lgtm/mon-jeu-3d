import * as THREE from 'three';

const SENSIBILITE = 0.005;   // radians par pixel glissé
const RAYON_JOYSTICK = 55;   // px
const SEUIL_SPRINT = 0.9;    // joystick poussé presque à fond vers l'avant
const PITCH_MAX = Math.PI / 2 - 0.05;

const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

/** Vrai sur téléphone / tablette (pointeur principal tactile). `?tactile` force ce mode. */
export const estTactile =
  new URLSearchParams(location.search).has('tactile') ||
  matchMedia('(pointer: coarse)').matches ||
  (navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches);

/**
 * Commandes tactiles :
 *  - moitié gauche de l'écran : joystick virtuel (apparaît sous le doigt)
 *  - moitié droite : glisser pour viser
 *  - boutons : tir (on peut aussi viser en glissant dessus), saut, recharge, arme, pause
 */
export class ControlesTactiles {
  constructor(camera, { onTir, onSaut, onRecharge, onArme, onPause }) {
    this.camera = camera;
    this.axe = { x: 0, y: 0 }; // x : droite, y : avant
    this.sprint = false;
    this.doigtJoystick = null;
    this.origine = { x: 0, y: 0 };
    this.doigtsVisee = new Map(); // pointerId -> dernière position

    const $ = (id) => document.getElementById(id);
    this.joystick = $('joystick');
    this.bouton = $('joystick-bouton');

    const zone = $('zone-tactile');
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (e.clientX < innerWidth * 0.45 && this.doigtJoystick === null) {
        this.demarrerJoystick(e);
      } else {
        this.doigtsVisee.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      zone.setPointerCapture(e.pointerId);
    });
    zone.addEventListener('pointermove', (e) => this.deplacer(e));
    for (const type of ['pointerup', 'pointercancel']) zone.addEventListener(type, (e) => this.relacher(e));

    // Bouton de tir : appuyer pour tirer, glisser dessus pour viser en même temps
    const tir = $('t-tir');
    tir.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      tir.setPointerCapture(e.pointerId);
      tir.classList.add('appuye');
      this.doigtsVisee.set(e.pointerId, { x: e.clientX, y: e.clientY });
      onTir(true);
    });
    tir.addEventListener('pointermove', (e) => this.deplacer(e));
    for (const type of ['pointerup', 'pointercancel']) {
      tir.addEventListener(type, (e) => {
        tir.classList.remove('appuye');
        this.doigtsVisee.delete(e.pointerId);
        onTir(false);
      });
    }

    const appui = (id, surAppui, surRelache) => {
      const el = $(id);
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        el.classList.add('appuye');
        surAppui();
      });
      for (const type of ['pointerup', 'pointercancel']) {
        el.addEventListener(type, () => {
          el.classList.remove('appuye');
          surRelache?.();
        });
      }
    };
    appui('t-saut', () => onSaut(true), () => onSaut(false));
    appui('t-recharge', onRecharge);
    appui('t-arme', onArme);
    appui('t-pause', onPause);
  }

  demarrerJoystick(e) {
    this.doigtJoystick = e.pointerId;
    this.origine.x = e.clientX;
    this.origine.y = e.clientY;
    this.joystick.style.left = `${e.clientX}px`;
    this.joystick.style.top = `${e.clientY}px`;
    this.joystick.classList.add('actif');
  }

  deplacer(e) {
    if (e.pointerId === this.doigtJoystick) {
      let dx = e.clientX - this.origine.x;
      let dy = e.clientY - this.origine.y;
      const d = Math.hypot(dx, dy);
      if (d > RAYON_JOYSTICK) {
        dx *= RAYON_JOYSTICK / d;
        dy *= RAYON_JOYSTICK / d;
      }
      this.bouton.style.transform = `translate(${dx}px, ${dy}px)`;
      this.axe.x = dx / RAYON_JOYSTICK;
      this.axe.y = -dy / RAYON_JOYSTICK;
      this.sprint = this.axe.y > SEUIL_SPRINT;
      return;
    }
    const dernier = this.doigtsVisee.get(e.pointerId);
    if (!dernier) return;
    this.regarder(e.clientX - dernier.x, e.clientY - dernier.y);
    dernier.x = e.clientX;
    dernier.y = e.clientY;
  }

  relacher(e) {
    if (e.pointerId === this.doigtJoystick) this.lacherJoystick();
    this.doigtsVisee.delete(e.pointerId);
  }

  lacherJoystick() {
    this.doigtJoystick = null;
    this.axe.x = this.axe.y = 0;
    this.sprint = false;
    this.bouton.style.transform = '';
    this.joystick.style.left = this.joystick.style.top = '';
    this.joystick.classList.remove('actif');
  }

  regarder(dx, dy) {
    _euler.setFromQuaternion(this.camera.quaternion);
    _euler.y -= dx * SENSIBILITE;
    _euler.x = THREE.MathUtils.clamp(_euler.x - dy * SENSIBILITE, -PITCH_MAX, PITCH_MAX);
    this.camera.quaternion.setFromEuler(_euler);
  }

  reinitialiser() {
    this.lacherJoystick();
    this.doigtsVisee.clear();
    for (const el of document.querySelectorAll('.t-btn.appuye')) el.classList.remove('appuye');
  }
}

/** Plein écran + paysage quand le navigateur l'autorise (sinon on ignore). */
export function pleinEcranPaysage() {
  try {
    const p = document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
    Promise.resolve(p)
      .then(() => screen.orientation?.lock?.('landscape'))
      .catch(() => {});
  } catch { /* non disponible */ }
}
