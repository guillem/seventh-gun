// Projectile art. Every enemy/energy bolt in flight is something the player is
// meant to *read and dodge*, so each one is painted as a hot core, a coloured
// corona and a kind-specific spray of detail (containment arcs, flame tongues,
// caustic globules, lens spikes, void swirl) instead of a flat shaded ball.
// Canvas 2d only; helpers are copied from textures.ts so bolt art can never
// shift the wall/skin art under us.
import * as THREE from 'three';
import { makeRng } from '../sim/rng';

type Ctx = CanvasRenderingContext2D;

export type ProjectileKind = 'plasma' | 'spit' | 'fireball' | 'bolt' | 'orb';

export const PROJECTILE_KINDS: readonly ProjectileKind[] = ['plasma', 'spit', 'fireball', 'bolt', 'orb'];

export function isProjectileKind(kind: string): kind is ProjectileKind {
  return (PROJECTILE_KINDS as readonly string[]).includes(kind);
}

// ---------------------------------------------------------------- helpers

function canvas(size: number): { c: HTMLCanvasElement; g: Ctx } {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  return { c, g };
}

// Bolts are billboards, never tiled: clamp so the corona can't wrap onto
// itself. Nearest + SRGB to match the rest of the art budget.
function toSprite(c: HTMLCanvasElement): THREE.Texture {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function seed(kind: string, part: string): () => number {
  return makeRng('proj-' + kind + '-' + part).float;
}

function speckle(g: Ctx, rng: () => number, count: number, cx: number, cy: number, spread: number, color: string, rMin = 0.8, rMax = 2.4): void {
  g.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2, d = spread * (0.25 + rng() * 0.75);
    g.beginPath();
    g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rMin + rng() * (rMax - rMin), 0, Math.PI * 2);
    g.fill();
  }
}

// Soft additive falloff: the corona every bolt sits inside.
function halo(g: Ctx, cx: number, cy: number, r: number, stops: [number, string][]): void {
  const rg = g.createRadialGradient(cx, cy, 0, cx, cy, r);
  for (const [at, col] of stops) rg.addColorStop(at, col);
  g.fillStyle = rg;
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
}

// A tapered spike from the core outward — flame tongue, lens flare, spark.
function spike(g: Ctx, cx: number, cy: number, a: number, r0: number, r1: number, wide: number, color: string): void {
  const nx = Math.cos(a + Math.PI / 2) * wide, ny = Math.sin(a + Math.PI / 2) * wide;
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(cx + Math.cos(a) * r0 + nx, cy + Math.sin(a) * r0 + ny);
  g.quadraticCurveTo(cx + Math.cos(a) * r1 * 0.7, cy + Math.sin(a) * r1 * 0.7, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
  g.quadraticCurveTo(cx + Math.cos(a) * r1 * 0.7, cy + Math.sin(a) * r1 * 0.7, cx + Math.cos(a) * r0 - nx, cy + Math.sin(a) * r0 - ny);
  g.closePath(); g.fill();
}

// Jagged arc used for containment lightning and void crackle.
function crackle(g: Ctx, rng: () => number, cx: number, cy: number, a: number, r0: number, r1: number, steps: number): void {
  g.beginPath();
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const rr = r0 + (r1 - r0) * t;
    const aa = a + (rng() - 0.5) * 0.5 * (1 - Math.abs(t - 0.5) * 1.4);
    const x = cx + Math.cos(aa) * rr, y = cy + Math.sin(aa) * rr;
    if (s === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.stroke();
}

// ---------------------------------------------------------------- painters
// All bolts are painted at 128 on a transparent canvas; the fx layer draws
// them additively so the black background never shows.

const S = 128;
const C = 64;

// PLASMA — a caged ball of green fire: containment hexes with lightning
// stitched between them, white-hot at the middle.
function plasmaSprite(): HTMLCanvasElement {
  const { c, g } = canvas(S);
  const rng = seed('plasma', 'body');
  halo(g, C, C, 60, [
    [0, 'rgba(120,255,150,0.55)'],
    [0.35, 'rgba(58,220,110,0.32)'],
    [0.72, 'rgba(20,140,70,0.12)'],
    [1, 'rgba(10,60,30,0)'],
  ]);
  // twin containment hexes, one counter-rotated
  for (const [rot, r, w, col] of [[0.0, 40, 3, 'rgba(150,255,180,0.75)'], [Math.PI / 6, 30, 2, 'rgba(90,235,140,0.5)']] as const) {
    g.strokeStyle = col;
    g.lineWidth = w;
    g.beginPath();
    for (let k = 0; k <= 6; k++) {
      const a = Math.PI / 3 * k + rot;
      const x = C + Math.cos(a) * r, y = C + Math.sin(a) * r;
      if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
    // node bead at each vertex
    g.fillStyle = col;
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 3 * k + rot;
      g.beginPath(); g.arc(C + Math.cos(a) * r, C + Math.sin(a) * r, w * 0.9, 0, Math.PI * 2); g.fill();
    }
  }
  // lightning stitched from the core out to the cage
  g.strokeStyle = 'rgba(200,255,215,0.8)';
  g.lineWidth = 1.6;
  for (let i = 0; i < 9; i++) crackle(g, rng, C, C, rng() * Math.PI * 2, 8, 26 + rng() * 16, 5);
  // hot core
  halo(g, C, C, 22, [
    [0, 'rgba(255,255,255,1)'],
    [0.3, 'rgba(220,255,225,0.9)'],
    [0.62, 'rgba(90,255,130,0.45)'],
    [1, 'rgba(40,200,90,0)'],
  ]);
  speckle(g, rng, 18, C, C, 52, 'rgba(190,255,200,0.7)');
  return c;
}

// SPIT — a wobbling acid globule: dark caustic rim, bright bile body,
// trailing droplets that have flicked off it.
function spitSprite(): HTMLCanvasElement {
  const { c, g } = canvas(S);
  const rng = seed('spit', 'body');
  halo(g, C, C, 54, [
    [0, 'rgba(170,220,60,0.4)'],
    [0.5, 'rgba(120,180,30,0.18)'],
    [1, 'rgba(60,90,10,0)'],
  ]);
  // the blob: a lumpy closed curve, not a circle
  const lobes = 9;
  const rr: number[] = [];
  for (let i = 0; i < lobes; i++) rr.push(28 + rng() * 12);
  const pt = (i: number, k: number): [number, number] => {
    const a = (Math.PI * 2 / lobes) * i;
    return [C + Math.cos(a) * rr[i % lobes] * k, C + Math.sin(a) * rr[i % lobes] * k];
  };
  const blob = (k: number, fill: string): void => {
    g.fillStyle = fill;
    g.beginPath();
    const [sx, sy] = pt(0, k);
    g.moveTo(sx, sy);
    for (let i = 1; i <= lobes; i++) {
      const [px, py] = pt(i - 1, k), [nx, ny] = pt(i, k);
      g.quadraticCurveTo((px + nx) / 2 + (rng() - 0.5) * 6, (py + ny) / 2 + (rng() - 0.5) * 6, nx, ny);
    }
    g.closePath(); g.fill();
  };
  blob(1.0, 'rgba(88,120,18,0.85)');
  blob(0.82, 'rgba(168,224,44,0.9)');
  blob(0.5, 'rgba(226,255,140,0.95)');
  // caustic highlight offset up-left, like a wet meniscus
  halo(g, C - 9, C - 10, 18, [
    [0, 'rgba(255,255,220,0.85)'],
    [0.5, 'rgba(220,255,120,0.35)'],
    [1, 'rgba(180,230,60,0)'],
  ]);
  // bubbles inside the globule
  for (let i = 0; i < 7; i++) {
    const a = rng() * Math.PI * 2, d = rng() * 22;
    const x = C + Math.cos(a) * d, y = C + Math.sin(a) * d, r = 2 + rng() * 4;
    g.strokeStyle = 'rgba(70,100,10,0.7)';
    g.lineWidth = 1.4;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(240,255,180,0.5)';
    g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.45, 0, Math.PI * 2); g.fill();
  }
  // flicked droplets
  for (let i = 0; i < 10; i++) {
    const a = rng() * Math.PI * 2, d = 36 + rng() * 20;
    const x = C + Math.cos(a) * d, y = C + Math.sin(a) * d, r = 1.5 + rng() * 3;
    g.fillStyle = 'rgba(190,240,70,0.8)';
    g.beginPath(); g.ellipse(x, y, r, r * 1.6, a, 0, Math.PI * 2); g.fill();
  }
  speckle(g, rng, 14, C, C, 50, 'rgba(230,255,150,0.55)', 0.8, 1.8);
  return c;
}

// FIREBALL — rolling combustion: sooty outer smoke, orange body, licking
// tongues and a white detonation heart.
function fireballSprite(): HTMLCanvasElement {
  const { c, g } = canvas(S);
  const rng = seed('fireball', 'body');
  // soot shell first so flame paints over it
  halo(g, C, C, 63, [
    [0, 'rgba(60,26,10,0.0)'],
    [0.62, 'rgba(70,32,14,0.3)'],
    [0.86, 'rgba(40,18,10,0.22)'],
    [1, 'rgba(20,8,4,0)'],
  ]);
  // flame tongues around the rim, long and short alternating
  for (let i = 0; i < 14; i++) {
    const a = (Math.PI * 2 / 14) * i + rng() * 0.2;
    const len = 40 + rng() * 22;
    spike(g, C, C, a, 12, len, 6 + rng() * 5, i % 2 ? 'rgba(255,120,26,0.6)' : 'rgba(255,180,60,0.5)');
  }
  halo(g, C, C, 44, [
    [0, 'rgba(255,214,120,0.95)'],
    [0.34, 'rgba(255,140,40,0.8)'],
    [0.7, 'rgba(200,60,12,0.4)'],
    [1, 'rgba(120,30,6,0)'],
  ]);
  // inner tongues, tighter and hotter
  for (let i = 0; i < 9; i++) {
    spike(g, C, C, rng() * Math.PI * 2, 6, 20 + rng() * 12, 4 + rng() * 3, 'rgba(255,236,170,0.55)');
  }
  // detonation heart
  halo(g, C, C, 20, [
    [0, 'rgba(255,255,248,1)'],
    [0.34, 'rgba(255,236,170,0.9)'],
    [0.7, 'rgba(255,160,50,0.5)'],
    [1, 'rgba(255,110,20,0)'],
  ]);
  // embers thrown clear of the ball
  speckle(g, rng, 22, C, C, 60, 'rgba(255,196,90,0.85)', 0.8, 2.6);
  speckle(g, rng, 10, C, C, 58, 'rgba(255,246,210,0.9)', 0.8, 1.6);
  return c;
}

// BOLT — a needle of charged light: tiny core, hard lens spikes, thin
// shock ring. Reads as fast even standing still.
function boltSprite(): HTMLCanvasElement {
  const { c, g } = canvas(S);
  const rng = seed('bolt', 'body');
  halo(g, C, C, 46, [
    [0, 'rgba(120,230,255,0.5)'],
    [0.4, 'rgba(50,170,235,0.25)'],
    [1, 'rgba(10,60,110,0)'],
  ]);
  // four-point lens flare
  for (let i = 0; i < 4; i++) {
    const a = (Math.PI / 2) * i;
    spike(g, C, C, a, 4, i % 2 ? 60 : 44, 3.5, 'rgba(190,246,255,0.55)');
  }
  // secondary short spikes between the arms
  for (let i = 0; i < 4; i++) {
    spike(g, C, C, (Math.PI / 2) * i + Math.PI / 4, 3, 22, 2, 'rgba(140,230,255,0.4)');
  }
  // thin shock ring with a couple of arc breaks
  g.strokeStyle = 'rgba(160,240,255,0.6)';
  g.lineWidth = 1.6;
  g.beginPath(); g.arc(C, C, 24, 0.2, Math.PI * 0.9); g.stroke();
  g.beginPath(); g.arc(C, C, 24, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
  // crackle spitting off the core
  g.strokeStyle = 'rgba(220,252,255,0.75)';
  g.lineWidth = 1.2;
  for (let i = 0; i < 6; i++) crackle(g, rng, C, C, rng() * Math.PI * 2, 6, 18 + rng() * 14, 4);
  // needle core
  halo(g, C, C, 14, [
    [0, 'rgba(255,255,255,1)'],
    [0.35, 'rgba(215,250,255,0.9)'],
    [1, 'rgba(90,210,255,0)'],
  ]);
  speckle(g, rng, 10, C, C, 44, 'rgba(200,246,255,0.6)', 0.8, 1.6);
  return c;
}

// ORB — hierophant void shot: a dark eye with a burning violet rim, spiral
// arms winding in and a broken halo.
function orbSprite(): HTMLCanvasElement {
  const { c, g } = canvas(S);
  const rng = seed('orb', 'body');
  halo(g, C, C, 60, [
    [0, 'rgba(190,90,255,0.5)'],
    [0.42, 'rgba(130,50,220,0.3)'],
    [0.78, 'rgba(70,20,130,0.14)'],
    [1, 'rgba(30,6,60,0)'],
  ]);
  // spiral arms drawn from outside in
  g.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const a0 = (Math.PI * 2 / 5) * i + rng() * 0.4;
    g.strokeStyle = `rgba(${210 + rng() * 40 | 0},${140 + rng() * 60 | 0},255,${0.35 + rng() * 0.3})`;
    g.lineWidth = 1.4 + rng() * 2.4;
    g.beginPath();
    for (let s = 0; s <= 14; s++) {
      const t = s / 14;
      const a = a0 + t * 2.1, r = 48 * (1 - t) + 12;
      const x = C + Math.cos(a) * r, y = C + Math.sin(a) * r;
      if (s === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
  g.lineCap = 'butt';
  // burning rim, then the void pupil punched back out of it
  halo(g, C, C, 30, [
    [0, 'rgba(240,210,255,0.95)'],
    [0.55, 'rgba(196,77,255,0.85)'],
    [0.9, 'rgba(110,30,190,0.4)'],
    [1, 'rgba(60,10,110,0)'],
  ]);
  g.globalCompositeOperation = 'destination-out';
  halo(g, C, C, 15, [
    [0, 'rgba(0,0,0,0.95)'],
    [0.7, 'rgba(0,0,0,0.7)'],
    [1, 'rgba(0,0,0,0)'],
  ]);
  g.globalCompositeOperation = 'source-over';
  // a single ember of light left burning at the pupil's centre
  halo(g, C, C, 6, [
    [0, 'rgba(255,240,255,0.9)'],
    [1, 'rgba(200,120,255,0)'],
  ]);
  // broken halo with nodes
  g.strokeStyle = 'rgba(215,165,255,0.7)';
  g.lineWidth = 2;
  g.beginPath(); g.arc(C, C, 44, 0.35, Math.PI * 0.85); g.stroke();
  g.beginPath(); g.arc(C, C, 44, Math.PI * 1.1, Math.PI * 1.8); g.stroke();
  for (let i = 0; i < 7; i++) {
    const a = rng() * Math.PI * 2;
    g.fillStyle = 'rgba(238,205,255,0.8)';
    g.beginPath(); g.arc(C + Math.cos(a) * 44, C + Math.sin(a) * 44, 1.6 + rng() * 2, 0, Math.PI * 2); g.fill();
  }
  speckle(g, rng, 16, C, C, 56, 'rgba(206,140,255,0.6)');
  return c;
}

// ---------------------------------------------------------------- registry

const PAINTERS: Record<ProjectileKind, () => HTMLCanvasElement> = {
  plasma: plasmaSprite,
  spit: spitSprite,
  fireball: fireballSprite,
  bolt: boltSprite,
  orb: orbSprite,
};

const spriteCache = new Map<ProjectileKind, THREE.Texture>();

export function getProjectileSprite(kind: ProjectileKind): THREE.Texture {
  const hit = spriteCache.get(kind);
  if (hit) return hit;
  const tex = toSprite(PAINTERS[kind]());
  spriteCache.set(kind, tex);
  return tex;
}
