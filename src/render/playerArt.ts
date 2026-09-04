// Remote-player (marine) art: the two 64px skins and the contact-shadow blob
// the arena avatar wears. Canvas 2d only. The helpers are copied from
// textures.ts on purpose — the art files stay independent so a tweak to the
// enemy skins can never shift the marine, and vice versa.
//
// Two skins only. The marine's read is shape + one team colour, not surface
// noise: a pale scratched PLATE that a Lambert tint turns into the team
// colour (a tint can only darken a map, so the map must start bright), and a
// dark ribbed SUIT for everything soft between the plates.
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

// PLATE — near-white armour steel: two panel seams, a rivet at each crossing,
// a handful of scratches, and a lit-top / grimed-bottom gradient so a plate
// wrapped round a cylinder or dome shades itself. Mean value stays around
// 0.85 so the team tint lands close to the palette value.
function skinPlate(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  const rng = makeRng('skin-marine-plate').float;
  g.fillStyle = '#dedcd4';
  g.fillRect(0, 0, 64, 64);
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.18)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(30,32,36,0.22)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  // panel seams: a dark groove with a pale lip below/right of it
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
  // rivets at the seam crossings and along the top edge
  for (const [x, y] of [[21, 31], [43, 31], [10, 6], [32, 6], [54, 6], [10, 58], [32, 58], [54, 58]]) {
    g.fillStyle = 'rgba(30,32,36,0.7)';
    g.beginPath(); g.arc(x + 1, y + 1, 1.8, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.beginPath(); g.arc(x + 0.5, y + 0.5, 0.9, 0, Math.PI * 2); g.fill();
  }
  // scratches: short, thin, mostly diagonal
  for (let i = 0; i < 14; i++) {
    const x = rng() * 64, y = rng() * 64, len = 3 + rng() * 9, a = (rng() - 0.5) * 1.2;
    g.strokeStyle = rng() < 0.5 ? 'rgba(255,255,255,0.45)' : 'rgba(50,54,60,0.4)';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  }
  noise(g, 64, rng, 200, 0.07);
  return c;
}

// SUIT — dark kevlar under-armour: tight horizontal ribbing with a faint
// ridge highlight, two stitched panel lines, kept quiet so a limb wrapped in
// it reads as padded, not striped.
function skinSuit(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  const rng = makeRng('skin-marine-suit').float;
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

function shadowBlob(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

export interface PlayerArt {
  plate: THREE.Texture;
  suit: THREE.Texture;
  shadow: THREE.Texture;
}

let cache: PlayerArt | null = null;

export function getPlayerArt(): PlayerArt {
  if (cache) return cache;
  cache = {
    plate: toTexture(skinPlate()),
    suit: toTexture(skinSuit()),
    shadow: toTexture(shadowBlob()),
  };
  return cache;
}
