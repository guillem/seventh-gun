// First-person gun art: the shared material vocabulary every viewmodel is
// built from, and the four 64px canvas skins behind it. Canvas 2d only. The
// helpers are copied from textures.ts / playerArt.ts on purpose — the art
// files stay independent so a tweak to the enemy skins or the marine can
// never shift the guns, and vice versa.
//
// The language itself (hands, materials, framing) is written up at the top
// of viewmodels.ts. This file only supplies the paint.
//
// Value rule for every skin here: a Lambert tint can only DARKEN a map, so
// each skin is drawn pale (mean 0.7–0.85) and the tint in gunPalette() pulls
// it down to its final value. The viewmodel scene is lit by a warm key from
// upper-left plus ambient (renderer.ts), and the player mostly sees the
// left/top faces of the gun, so a lit face lands near tint x 1.1 and an
// unlit one near tint x 0.5. Aim materials at where the LIT face should be.
import * as THREE from 'three';
import { makeRng } from '../sim/rng';

type Ctx = CanvasRenderingContext2D;

function canvas(size: number): { c: HTMLCanvasElement; g: Ctx } {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  return { c, g };
}

function toTexture(c: HTMLCanvasElement, repeat = 1): THREE.Texture {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function noise(g: Ctx, size: number, rng: () => number, amount: number, alpha: number): void {
  for (let i = 0; i < amount; i++) {
    const x = rng() * size, y = rng() * size;
    const v = rng() * 255 | 0;
    g.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    g.fillRect(x, y, 1 + (rng() * 2 | 0), 1 + (rng() * 2 | 0));
  }
}

// GUNMETAL — pale machined steel. Fine longitudinal brushing (runs along the
// slide / barrel on a box side face, across the top — which reads as slide
// serrations, and is fine), a lit-top / grimed-bottom gradient so a cylinder
// shades itself, one groove near each end so a slide or receiver reads as a
// machined part and not a painted brick, a few scratches. No rivets — a gun
// is milled, not riveted, and that is the one thing that separates it from
// the marine's armour plate at a glance.
function skinGunmetal(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  const rng = makeRng('gun-gunmetal').float;
  g.fillStyle = '#c4c8cc';
  g.fillRect(0, 0, 64, 64);
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.2)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(24,26,30,0.26)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  // brushing: many faint full-width lines, a few darker
  for (let y = 0; y < 64; y += 1) {
    const a = rng() < 0.18 ? 0.16 : 0.06;
    g.fillStyle = rng() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(30,34,40,${a})`;
    g.fillRect(0, y, 64, 1);
  }
  // end grooves: a dark cut with a pale lip behind it
  for (const x of [9, 53]) {
    g.fillStyle = 'rgba(30,34,40,0.55)';
    g.fillRect(x, 0, 2, 64);
    g.fillStyle = 'rgba(255,255,255,0.4)';
    g.fillRect(x + 2, 0, 1, 64);
  }
  // scratches: short, thin, mostly along the grain
  for (let i = 0; i < 10; i++) {
    const x = rng() * 64, y = rng() * 64, len = 4 + rng() * 10, a = (rng() - 0.5) * 0.5;
    g.strokeStyle = rng() < 0.5 ? 'rgba(255,255,255,0.45)' : 'rgba(40,44,50,0.4)';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  }
  noise(g, 64, rng, 180, 0.07);
  return c;
}

// GRIP — pale warm stock material with a diamond knurl and a plain border,
// so a panel wrapped round a grip or a forend reads as checkered rubber /
// polymer with a moulded edge. Warm so it separates from the cold hands and
// cold steel even at a glance in the corner of the eye.
function skinGrip(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  const rng = makeRng('gun-grip').float;
  g.fillStyle = '#cdbaa6';
  g.fillRect(0, 0, 64, 64);
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1, 'rgba(40,30,24,0.22)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  // knurl: two diagonal line families
  g.lineWidth = 1.2;
  for (let k = -64; k < 128; k += 6) {
    g.strokeStyle = 'rgba(50,36,28,0.42)';
    g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 64, 64); g.stroke();
    g.beginPath(); g.moveTo(k + 64, 0); g.lineTo(k, 64); g.stroke();
  }
  // moulded border: plain band with a dark inner edge
  g.fillStyle = '#c3b09c';
  g.fillRect(0, 0, 64, 4); g.fillRect(0, 60, 64, 4);
  g.fillRect(0, 0, 4, 64); g.fillRect(60, 0, 4, 64);
  g.strokeStyle = 'rgba(40,28,22,0.55)';
  g.lineWidth = 1;
  g.strokeRect(4.5, 4.5, 55, 55);
  noise(g, 64, rng, 160, 0.08);
  return c;
}

// GLOVE — the marine's dark ribbed under-suit (playerArt.ts skinSuit,
// copied): tight horizontal ribbing with a faint ridge highlight and two
// stitched panel lines. Same drawing, so the hand in front of the camera
// is visibly the same suit the arena marine wears.
function skinGlove(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  const rng = makeRng('gun-glove').float;
  g.fillStyle = '#3c4047';
  g.fillRect(0, 0, 64, 64);
  for (let y = 2; y < 64; y += 8) {
    g.fillStyle = 'rgba(10,12,14,0.7)';
    g.fillRect(0, y + 3, 64, 2);
    g.fillStyle = 'rgba(130,136,144,0.35)';
    g.fillRect(0, y, 64, 1);
  }
  for (const x of [16, 48]) {
    g.fillStyle = 'rgba(12,14,16,0.65)';
    g.fillRect(x, 0, 2, 64);
    g.fillStyle = 'rgba(90,96,104,0.25)';
    g.fillRect(x + 2, 0, 1, 64);
  }
  noise(g, 64, rng, 220, 0.1);
  return c;
}

// GAUNTLET — the marine's armour plate (playerArt.ts skinPlate, copied):
// near-white steel with two panel seams, rivets at the crossings, scratches
// and a lit-top gradient. Tinted to the marine's gauntlet grey in
// gunPalette() so the cuff on the wrist is the same part as on the avatar.
function skinGauntlet(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  const rng = makeRng('gun-gauntlet').float;
  g.fillStyle = '#dedcd4';
  g.fillRect(0, 0, 64, 64);
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.18)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(30,32,36,0.22)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  for (const x of [21, 43]) {
    g.fillStyle = 'rgba(40,44,48,0.6)';
    g.fillRect(x, 0, 2, 64);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(x + 2, 0, 1, 64);
  }
  g.fillStyle = 'rgba(40,44,48,0.6)';
  g.fillRect(0, 31, 64, 2);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(0, 33, 64, 1);
  for (const [x, y] of [[21, 31], [43, 31], [10, 6], [32, 6], [54, 6], [10, 58], [32, 58], [54, 58]]) {
    g.fillStyle = 'rgba(30,32,36,0.7)';
    g.beginPath(); g.arc(x + 1, y + 1, 1.8, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.beginPath(); g.arc(x + 0.5, y + 0.5, 0.9, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 14; i++) {
    const x = rng() * 64, y = rng() * 64, len = 3 + rng() * 9, a = (rng() - 0.5) * 1.2;
    g.strokeStyle = rng() < 0.5 ? 'rgba(255,255,255,0.45)' : 'rgba(50,54,60,0.4)';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  }
  noise(g, 64, rng, 200, 0.07);
  return c;
}

export interface GunArt {
  gunmetal: THREE.Texture;
  grip: THREE.Texture;
  glove: THREE.Texture;
  gauntlet: THREE.Texture;
}

let cache: GunArt | null = null;

export function getGunArt(): GunArt {
  if (cache) return cache;
  cache = {
    gunmetal: toTexture(skinGunmetal()),
    grip: toTexture(skinGrip()),
    glove: toTexture(skinGlove()),
    gauntlet: toTexture(skinGauntlet()),
  };
  return cache;
}

// ------------------------------------------------------------ the palette
//
// Six materials, and every gun is made of exactly these. Names are the
// vocabulary the builders speak; do not add a seventh grey inside a builder.
//
//   steel    — the gun's pale body metal: slides, barrels, receivers' tops,
//              the muzzle block. The material that carries the silhouette.
//   iron     — near-black map-less metal: frames, trigger guards, bores,
//              undersides, teeth. Everything that should read as a shadow
//              shape against the steel. Same hex as the marine's `black`.
//   grip     — the ONE warm material: grip panels, forends, stocks. The
//              hand-contact parts, so the eye finds where the gun is held.
//   glove    — the hands. Marine under-suit, dark ribbed.
//   gauntlet — the wrist cuff. Marine armour plate at the marine's steel tint.
//   hot(c)   — unlit accent, at most ONE small element per gun, in that gun's
//              muzzle-flash colour (renderer.ts fireVisual colours) so the
//              gun's tell and its flash agree.
//
// Materials are created fresh per build: the world pickup copy gets radial
// fog patched onto its materials by pickups.ts and the viewmodel copy must
// not, so instances are never shared between the two.
/**
 * Per-gun muzzle-flash colour, indexed by gunId - 1. THE single source of
 * truth: `renderer.ts` fireVisual paints the flash from this, and each
 * viewmodel's one hot element is built from the same entry, so a gun's tell
 * and its flash cannot drift apart. They had — the Sunlance wore yellow
 * rings while flashing cyan — because the list existed twice.
 * Locked by tests/unit/gunArt.test.ts.
 */
export const GUN_FLASH: readonly number[] = [
  0xffe2a0, // 1 viper pistol   — warm pale
  0xffc23a, // 2 ripjaw shotgun — amber
  0xffd28a, // 3 hornet chaingun
  0xb8ff7a, // 4 spiker         — yellow-green
  0x9aff5a, // 5 bile launcher  — green
  0x9ff4ff, // 6 sunlance       — cyan
  0xb44dff, // 7 the seventh    — void violet
];

export interface GunPalette {
  steel: THREE.MeshLambertMaterial;
  iron: THREE.MeshLambertMaterial;
  grip: THREE.MeshLambertMaterial;
  glove: THREE.MeshLambertMaterial;
  gauntlet: THREE.MeshLambertMaterial;
  hot: (color: number) => THREE.MeshBasicMaterial;
}

export function gunPalette(): GunPalette {
  const art = getGunArt();
  return {
    steel: new THREE.MeshLambertMaterial({ map: art.gunmetal, color: 0x9ea4aa }),
    iron: new THREE.MeshLambertMaterial({ color: 0x1c1e22 }),
    grip: new THREE.MeshLambertMaterial({ map: art.grip, color: 0x6e5646 }),
    glove: new THREE.MeshLambertMaterial({ map: art.glove, color: 0xffffff }),
    gauntlet: new THREE.MeshLambertMaterial({ map: art.gauntlet, color: 0x848c84 }),
    hot: (color: number) => new THREE.MeshBasicMaterial({ color }),
  };
}
