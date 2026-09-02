// Procedural canvas textures — the entire art budget. Nearest-filtered,
// crunchy but readable. Renderer-side only.
import * as THREE from 'three';
import { makeRng } from '../sim/rng';
import type { EnemyType } from '../sim/types';

// Painted projectile sprites live next door; re-exported here so callers keep
// a single art entry point.
export { getProjectileSprite, isProjectileKind, PROJECTILE_KINDS, type ProjectileKind } from './projectiles';

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

function speckle(g: Ctx, size: number, rng: () => number, count: number, color: string, rMin = 1, rMax = 3): void {
  for (let i = 0; i < count; i++) {
    const x = rng() * size, y = rng() * size, r = rMin + rng() * (rMax - rMin);
    g.fillStyle = color;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
}

// Draws the same strokes nine times on a 3x3 torus so seams/veins/cracks that
// run off one edge come back in on the other — no screaming seam when the
// texture tiles. Copied from campaignTextures.ts on purpose: the two art files
// stay independent so a tweak in one can never shift the other.
function wrapDraw(g: Ctx, size: number, draw: (g: Ctx) => void): void {
  for (const dx of [-size, 0, size]) {
    for (const dy of [-size, 0, size]) {
      g.save();
      g.translate(dx, dy);
      draw(g);
      g.restore();
    }
  }
}

// ---------------------------------------------------------------- walls

function wallIndustrial(): HTMLCanvasElement {
  const { c, g } = canvas(128);
  const rng = makeRng('tex-ind').float;
  g.fillStyle = '#3d443a';
  g.fillRect(0, 0, 128, 128);
  // vertical panel seams
  for (let x = 0; x < 128; x += 32) {
    g.fillStyle = '#2a302a';
    g.fillRect(x, 0, 3, 128);
    g.fillStyle = '#4c5449';
    g.fillRect(x + 3, 0, 1, 128);
  }
  // horizontal seam
  g.fillStyle = '#2a302a';
  g.fillRect(0, 62, 128, 3);
  // rivets
  for (let x = 12; x < 128; x += 32) {
    for (const y of [8, 54, 72, 118]) {
      g.fillStyle = '#5a6355';
      g.beginPath(); g.arc(x, y, 2.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#20261f';
      g.beginPath(); g.arc(x + 0.8, y + 0.8, 1.2, 0, Math.PI * 2); g.fill();
    }
  }
  // rust streaks
  for (let i = 0; i < 14; i++) {
    const x = rng() * 128;
    g.strokeStyle = `rgba(96,58,30,${0.15 + rng() * 0.25})`;
    g.lineWidth = 1 + rng() * 3;
    g.beginPath(); g.moveTo(x, rng() * 40);
    g.lineTo(x + (rng() * 6 - 3), 60 + rng() * 68); g.stroke();
  }
  // hazard stripe block
  if (rng() > 0.5) {
    const bx = 32 + ((rng() * 2 | 0) * 32);
    g.save();
    g.beginPath(); g.rect(bx + 6, 70, 20, 24); g.clip();
    for (let i = -24; i < 24; i += 8) {
      g.fillStyle = i % 16 === 0 ? '#8a7a2a' : '#1c1c18';
      g.beginPath();
      g.moveTo(bx + 6 + i, 94); g.lineTo(bx + 6 + i + 6, 94);
      g.lineTo(bx + 6 + i + 14, 70); g.lineTo(bx + 6 + i + 8, 70);
      g.fill();
    }
    g.restore();
  }
  noise(g, 128, rng, 900, 0.06);
  speckle(g, 128, rng, 40, 'rgba(20,24,20,0.5)');
  return c;
}

function wallOrganic(): HTMLCanvasElement {
  const { c, g } = canvas(128);
  const rng = makeRng('tex-org').float;
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#4a1719');
  grad.addColorStop(0.5, '#5c1e1d');
  grad.addColorStop(1, '#3d1214');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  // veins
  for (let i = 0; i < 10; i++) {
    g.strokeStyle = `rgba(120,40,45,${0.5 + rng() * 0.4})`;
    g.lineWidth = 1.5 + rng() * 3;
    g.beginPath();
    let x = rng() * 128, y = rng() * 128;
    g.moveTo(x, y);
    for (let s = 0; s < 5; s++) {
      x += rng() * 40 - 20; y += rng() * 40 - 20;
      g.quadraticCurveTo(x + rng() * 10, y + rng() * 10, x, y);
    }
    g.stroke();
    g.strokeStyle = 'rgba(180,90,80,0.25)';
    g.lineWidth = 0.8;
    g.stroke();
  }
  // pustules
  for (let i = 0; i < 16; i++) {
    const x = rng() * 128, y = rng() * 128, r = 2 + rng() * 5;
    const pg = g.createRadialGradient(x, y, 0, x, y, r);
    pg.addColorStop(0, 'rgba(190,120,60,0.8)');
    pg.addColorStop(1, 'rgba(90,30,30,0)');
    g.fillStyle = pg;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // ribs (bone arcs)
  for (let i = 0; i < 3; i++) {
    const x = 20 + i * 40 + rng() * 8;
    g.strokeStyle = 'rgba(210,200,180,0.35)';
    g.lineWidth = 4 + rng() * 3;
    g.beginPath();
    g.arc(x, 64, 26 + rng() * 8, Math.PI * 0.2, Math.PI * 0.8);
    g.stroke();
  }
  noise(g, 128, rng, 1400, 0.08);
  return c;
}

function wallStone(): HTMLCanvasElement {
  const { c, g } = canvas(128);
  const rng = makeRng('tex-sto').float;
  g.fillStyle = '#23262c';
  g.fillRect(0, 0, 128, 128);
  const bh = 24;
  for (let row = 0, y = 0; y < 128; row++, y += bh) {
    const offset = row % 2 ? 20 : 0;
    for (let x = -40 + offset; x < 128; x += 40) {
      const shade = 0.82 + rng() * 0.3;
      const r = (58 * shade) | 0, gg = (64 * shade) | 0, b = (74 * shade) | 0;
      g.fillStyle = `rgb(${r},${gg},${b})`;
      g.fillRect(x + 2, y + 2, 36, bh - 4);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(x + 2, y + 2, 36, 2);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(x + 2, y + bh - 4, 36, 2);
      // cracks
      if (rng() > 0.6) {
        g.strokeStyle = 'rgba(10,10,14,0.6)';
        g.lineWidth = 1;
        g.beginPath();
        let cx = x + 6 + rng() * 24, cy = y + 4;
        g.moveTo(cx, cy);
        for (let s = 0; s < 3; s++) { cx += rng() * 8 - 4; cy += 5 + rng() * 4; g.lineTo(cx, cy); }
        g.stroke();
      }
      // moss
      if (rng() > 0.7) {
        g.fillStyle = `rgba(58,${90 + rng() * 30 | 0},52,0.45)`;
        g.fillRect(x + 2, y + bh - 8 - rng() * 4, 10 + rng() * 16, 6);
      }
    }
  }
  noise(g, 128, rng, 900, 0.07);
  return c;
}

function wallTech(): HTMLCanvasElement {
  const { c, g } = canvas(128);
  const rng = makeRng('tex-tec').float;
  g.fillStyle = '#191623';
  g.fillRect(0, 0, 128, 128);
  for (let x = 0; x < 128; x += 64) {
    g.fillStyle = '#221e2e';
    g.fillRect(x + 2, 2, 60, 124);
    g.strokeStyle = '#0e0c14';
    g.lineWidth = 2;
    g.strokeRect(x + 2, 2, 60, 124);
  }
  // glowing circuit traces
  const glow = ['#39d7ff', '#b13bff', '#39ff9e'];
  for (let i = 0; i < 7; i++) {
    g.strokeStyle = glow[i % glow.length];
    g.lineWidth = 1.4;
    g.shadowColor = g.strokeStyle as string;
    g.shadowBlur = 4;
    g.beginPath();
    let x = 8 + rng() * 112, y = 8 + rng() * 112;
    g.moveTo(x, y);
    for (let s = 0; s < 4; s++) {
      if (rng() > 0.5) x += (rng() > 0.5 ? 1 : -1) * (10 + rng() * 24);
      else y += (rng() > 0.5 ? 1 : -1) * (10 + rng() * 24);
      g.lineTo(x, y);
    }
    g.stroke();
    g.fillStyle = g.strokeStyle as string;
    g.beginPath(); g.arc(x, y, 2, 0, Math.PI * 2); g.fill();
  }
  g.shadowBlur = 0;
  // vent grille
  for (let y = 20; y < 50; y += 6) {
    g.fillStyle = '#0a0910';
    g.fillRect(20, y, 28, 3);
  }
  noise(g, 128, rng, 700, 0.05);
  return c;
}

// ---------------------------------------------------------------- floors / ceilings

function floorIndustrial(): HTMLCanvasElement {
  const { c, g } = canvas(128);
  const rng = makeRng('tex-find').float;
  g.fillStyle = '#2c2f2a';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#232620';
  g.fillRect(0, 0, 128, 6); g.fillRect(0, 0, 6, 128);
  for (let x = 12; x < 128; x += 22) {
    for (let y = 12; y < 128; y += 22) {
      g.fillStyle = `rgba(0,0,0,${0.25 + rng() * 0.2})`;
      g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(90,96,86,0.5)';
      g.beginPath(); g.arc(x - 0.8, y - 0.8, 2.4, 0, Math.PI * 2); g.fill();
    }
  }
  // grate slots
  for (let i = 0; i < 20; i++) {
    g.fillStyle = 'rgba(12,14,12,0.6)';
    g.fillRect(rng() * 120, rng() * 120, 2 + rng() * 10, 3);
  }
  noise(g, 128, rng, 1000, 0.07);
  return c;
}

function floorOrganic(): HTMLCanvasElement {
  const { c, g } = canvas(128);
  const rng = makeRng('tex-forg').float;
  g.fillStyle = '#3a1416';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 40; i++) {
    const x = rng() * 128, y = rng() * 128, r = 4 + rng() * 14;
    const pg = g.createRadialGradient(x, y, 0, x, y, r);
    pg.addColorStop(0, `rgba(96,34,36,${0.35 + rng() * 0.3})`);
    pg.addColorStop(1, 'rgba(40,12,14,0)');
    g.fillStyle = pg;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // cartilage grid
  g.strokeStyle = 'rgba(150,70,60,0.28)';
  g.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.moveTo(0, i * 22 + rng() * 8);
    g.bezierCurveTo(40, i * 22 + rng() * 16 - 8, 90, i * 22 + rng() * 16 - 8, 128, i * 22 + rng() * 8);
    g.stroke();
  }
  noise(g, 128, rng, 1600, 0.09);
  return c;
}

function floorStone(): HTMLCanvasElement {
  const { c, g } = canvas(128);
  const rng = makeRng('tex-fsto').float;
  g.fillStyle = '#1c1f24';
  g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 32) {
    const off = (y / 32) % 2 ? 32 : 0;
    for (let x = -32 + off; x < 128; x += 64) {
      const shade = 0.75 + rng() * 0.35;
      g.fillStyle = `rgb(${44 * shade | 0},${48 * shade | 0},${56 * shade | 0})`;
      g.fillRect(x + 3, y + 3, 58, 26);
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(x + 3, y + 3, 58, 2);
    }
  }
  // puddle sheen
  for (let i = 0; i < 5; i++) {
    const x = rng() * 128, y = rng() * 128;
    g.fillStyle = 'rgba(50,80,90,0.25)';
    g.beginPath(); g.ellipse(x, y, 6 + rng() * 10, 4 + rng() * 6, rng() * 3, 0, Math.PI * 2); g.fill();
  }
  noise(g, 128, rng, 900, 0.08);
  return c;
}

function floorTech(): HTMLCanvasElement {
  const { c, g } = canvas(128);
  const rng = makeRng('tex-ftec').float;
  g.fillStyle = '#15121d';
  g.fillRect(0, 0, 128, 128);
  // hex plates
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const cx = 14 + col * 26 + (row % 2 ? 13 : 0), cy = 14 + row * 26;
      g.fillStyle = '#1e1a2a';
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = Math.PI / 3 * k + Math.PI / 6;
        const px = cx + Math.cos(a) * 11, py = cy + Math.sin(a) * 11;
        if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.closePath(); g.fill();
      g.strokeStyle = '#0c0a12';
      g.lineWidth = 2;
      g.stroke();
      if (rng() > 0.75) {
        g.fillStyle = 'rgba(57,215,255,0.5)';
        g.beginPath(); g.arc(cx, cy, 3, 0, Math.PI * 2); g.fill();
      }
    }
  }
  noise(g, 128, rng, 600, 0.05);
  return c;
}

function ceilingDark(base: string): HTMLCanvasElement {
  const { c, g } = canvas(64);
  const rng = makeRng('tex-ceil' + base).float;
  g.fillStyle = base;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(0, 0, 64, 3); g.fillRect(0, 0, 3, 64);
  for (let i = 0; i < 30; i++) {
    g.fillStyle = `rgba(0,0,0,${rng() * 0.25})`;
    g.fillRect(rng() * 64, rng() * 64, 3 + rng() * 8, 3 + rng() * 8);
  }
  noise(g, 64, rng, 400, 0.06);
  return c;
}

function doorTexture(): HTMLCanvasElement {
  const { c, g } = canvas(128);
  const rng = makeRng('tex-door').float;
  g.fillStyle = '#2d2a33';
  g.fillRect(0, 0, 128, 128);
  // alien metal plates
  for (let y = 0; y < 128; y += 42) {
    g.fillStyle = '#38343f';
    g.fillRect(6, y + 6, 116, 30);
    g.strokeStyle = '#17151c';
    g.lineWidth = 3;
    g.strokeRect(6, y + 6, 116, 30);
  }
  // central rune circle
  g.strokeStyle = '#ff7a1a';
  g.lineWidth = 3;
  g.shadowColor = '#ff7a1a';
  g.shadowBlur = 8;
  g.beginPath(); g.arc(64, 64, 30, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(64, 64, 20, 0, Math.PI * 2); g.stroke();
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 4 * i;
    g.beginPath();
    g.moveTo(64 + Math.cos(a) * 20, 64 + Math.sin(a) * 20);
    g.lineTo(64 + Math.cos(a) * 30, 64 + Math.sin(a) * 30);
    g.stroke();
  }
  g.shadowBlur = 0;
  // teeth at bottom
  for (let x = 8; x < 120; x += 16) {
    g.fillStyle = '#c9bfa8';
    g.beginPath();
    g.moveTo(x, 128); g.lineTo(x + 8, 108); g.lineTo(x + 16, 128);
    g.fill();
  }
  noise(g, 128, rng, 500, 0.06);
  return c;
}

// ---------------------------------------------------------------- sky

function skyTexture(): HTMLCanvasElement {
  const { c, g } = canvas(512);
  const rng = makeRng('tex-sky').float;
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#1a0508');
  grad.addColorStop(0.45, '#2b0a10');
  grad.addColorStop(0.7, '#160409');
  grad.addColorStop(1, '#050205');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  // nebula blobs
  for (let i = 0; i < 26; i++) {
    const x = rng() * 512, y = rng() * 512, r = 30 + rng() * 90;
    const pg = g.createRadialGradient(x, y, 0, x, y, r);
    const hue = rng() > 0.5 ? '150,30,60' : '80,20,110';
    pg.addColorStop(0, `rgba(${hue},${0.10 + rng() * 0.12})`);
    pg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = pg;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // stars
  for (let i = 0; i < 420; i++) {
    const b = 0.25 + rng() * 0.75;
    g.fillStyle = rng() > 0.9 ? `rgba(255,200,160,${b})` : `rgba(220,225,255,${b})`;
    const s = rng() > 0.92 ? 2 : 1;
    g.fillRect(rng() * 512, rng() * 512, s, s);
  }
  // a distant dying planet
  g.fillStyle = 'rgba(120,50,40,0.5)';
  g.beginPath(); g.arc(150, 110, 26, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(60,20,20,0.6)';
  g.beginPath(); g.arc(142, 104, 8, 0, Math.PI * 2); g.fill();
  return c;
}

// ---------------------------------------------------------------- decals (transparent)

function decalRune(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  const rng = makeRng('dec-rune').float;
  g.strokeStyle = '#2dff7a';
  g.lineWidth = 2.5;
  g.shadowColor = '#2dff7a';
  g.shadowBlur = 6;
  g.beginPath(); g.arc(32, 32, 24, 0, Math.PI * 2); g.stroke();
  g.beginPath();
  g.moveTo(32, 12); g.lineTo(46, 40); g.lineTo(18, 40); g.closePath(); g.stroke();
  g.beginPath(); g.moveTo(32, 52); g.lineTo(32, 24); g.stroke();
  for (let i = 0; i < 6; i++) {
    const a = rng() * Math.PI * 2;
    g.beginPath();
    g.moveTo(32 + Math.cos(a) * 24, 32 + Math.sin(a) * 24);
    g.lineTo(32 + Math.cos(a) * 29, 32 + Math.sin(a) * 29);
    g.stroke();
  }
  return c;
}

function decalSkull(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  g.fillStyle = '#cfc4a6';
  g.beginPath(); g.ellipse(32, 30, 18, 20, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#151210';
  g.beginPath(); g.ellipse(24, 26, 5.5, 7, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(40, 26, 5.5, 7, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(32, 42, 4, 5, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#cfc4a6';
  g.fillRect(20, 48, 24, 10);
  g.fillStyle = '#151210';
  for (let x = 22; x < 44; x += 5) g.fillRect(x, 48, 2.5, 9);
  // alien brow ridges
  g.strokeStyle = '#8f866e';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(18, 18); g.quadraticCurveTo(32, 8, 46, 18); g.stroke();
  // horns
  g.fillStyle = '#a89d80';
  g.beginPath(); g.moveTo(16, 22); g.quadraticCurveTo(2, 14, 6, 2); g.quadraticCurveTo(12, 12, 20, 16); g.fill();
  g.beginPath(); g.moveTo(48, 22); g.quadraticCurveTo(62, 14, 58, 2); g.quadraticCurveTo(52, 12, 44, 16); g.fill();
  return c;
}

function decalTendrils(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  const rng = makeRng('dec-tend').float;
  for (let t = 0; t < 7; t++) {
    const x0 = 8 + t * 8 + rng() * 4;
    g.strokeStyle = `rgba(${90 + rng() * 40 | 0},${30 + rng() * 20 | 0},40,0.9)`;
    g.lineWidth = 2 + rng() * 2.5;
    g.beginPath();
    g.moveTo(x0, 0);
    let x = x0, y = 0;
    for (let s = 0; s < 5; s++) {
      const nx = x + (rng() * 10 - 5), ny = y + 10 + rng() * 6;
      g.quadraticCurveTo(x, (y + ny) / 2, nx, ny);
      x = nx; y = ny;
    }
    g.stroke();
    // thorns
    g.fillStyle = 'rgba(200,170,150,0.8)';
    for (let s = 0; s < 3; s++) {
      g.beginPath();
      g.arc(x0 + rng() * 8 - 4, 10 + rng() * 40, 1.5, 0, Math.PI * 2);
      g.fill();
    }
  }
  return c;
}

function decalPentagram(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  g.strokeStyle = '#c92a2a';
  g.lineWidth = 2.5;
  g.shadowColor = '#ff3030';
  g.shadowBlur = 7;
  g.beginPath(); g.arc(32, 32, 26, 0, Math.PI * 2); g.stroke();
  g.beginPath();
  for (let i = 0; i <= 5; i++) {
    const a = -Math.PI / 2 + i * (Math.PI * 4 / 5);
    const x = 32 + Math.cos(a) * 24, y = 32 + Math.sin(a) * 24;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.stroke();
  return c;
}

function decalLamp(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  g.fillStyle = '#20241f';
  g.fillRect(14, 8, 36, 48);
  const grad = g.createLinearGradient(0, 10, 0, 54);
  grad.addColorStop(0, '#ffe9b0');
  grad.addColorStop(1, '#7a5a1e');
  g.fillStyle = grad;
  g.fillRect(18, 12, 28, 40);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (let y = 16; y < 52; y += 8) g.fillRect(18, y, 28, 2);
  return c;
}

// ---------------------------------------------------------------- sprites

function particleSprite(): HTMLCanvasElement {
  const { c, g } = canvas(32);
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 15);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
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

function flashSprite(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  g.translate(32, 32);
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, 30);
  grad.addColorStop(0, 'rgba(255,255,230,1)');
  grad.addColorStop(0.3, 'rgba(255,220,120,0.9)');
  grad.addColorStop(1, 'rgba(255,140,30,0)');
  g.fillStyle = grad;
  // star spikes
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i;
    const r1 = i % 2 === 0 ? 30 : 10;
    g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    const a2 = a + Math.PI / 8;
    g.lineTo(Math.cos(a2) * 5, Math.sin(a2) * 5);
  }
  g.closePath();
  g.fill();
  g.beginPath(); g.arc(0, 0, 9, 0, Math.PI * 2); g.fill();
  return c;
}

function glowSprite(): HTMLCanvasElement {
  const { c, g } = canvas(32);
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 15);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.25)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return c;
}

// ---------------------------------------------------------------- skins for enemies
// Enemy hides are the closest art the player ever gets to — a slab fills half
// the screen when it charges. They get the same treatment as the campaign
// packs: painted plate structure, seams, wear and a colour story per creature,
// wrapped on the torus so the tiling never draws a hard line across a limb.

// Sub-seeds keep each pass independent, so retuning one pass doesn't reshuffle
// the rest. wrapDraw callbacks must re-seed *inside* the callback, otherwise
// the nine torus copies would each draw different strokes and defeat the point.
function skinRng(id: string, part?: string): () => number {
  return makeRng(part ? id + '-' + part : id).float;
}

// One armoured scute: shadowed socket, plate body, lit crown, dark undercut.
function scute(g: Ctx, x: number, y: number, w: number, h: number, body: string, crown: string, edge: string): void {
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.moveTo(x - 1, y + h * 0.45);
  g.quadraticCurveTo(x + w * 0.5, y - 2, x + w + 1, y + h * 0.45);
  g.quadraticCurveTo(x + w * 0.5, y + h + 3, x - 1, y + h * 0.45);
  g.closePath(); g.fill();
  g.fillStyle = body;
  g.beginPath();
  g.moveTo(x, y + h * 0.45);
  g.quadraticCurveTo(x + w * 0.5, y, x + w, y + h * 0.45);
  g.quadraticCurveTo(x + w * 0.5, y + h, x, y + h * 0.45);
  g.closePath(); g.fill();
  g.strokeStyle = crown;
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(x + 2, y + h * 0.42);
  g.quadraticCurveTo(x + w * 0.5, y + 1.5, x + w - 2, y + h * 0.42);
  g.stroke();
  g.strokeStyle = edge;
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(x + 2, y + h * 0.5);
  g.quadraticCurveTo(x + w * 0.5, y + h - 1, x + w - 2, y + h * 0.5);
  g.stroke();
}

// Suture rung: the staples holding implanted hardware into meat.
function suture(g: Ctx, x: number, y: number, len: number, vertical: boolean, color: string, hi: string): void {
  for (let i = 0; i < len; i += 5) {
    const px = vertical ? x : x + i, py = vertical ? y + i : y;
    g.fillStyle = color;
    g.fillRect(vertical ? px - 3 : px, vertical ? py : py - 3, vertical ? 7 : 2, vertical ? 2 : 7);
    g.fillStyle = hi;
    g.fillRect(vertical ? px - 3 : px, vertical ? py : py - 3, vertical ? 7 : 1, vertical ? 1 : 7);
  }
}

// A short row of keratin teeth — jaw plates, hooks, mandible ridges.
function teethRow(g: Ctx, x: number, y: number, count: number, w: number, h: number, up: boolean, color: string, shade: string): void {
  for (let i = 0; i < count; i++) {
    const tx = x + i * w;
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(tx, y);
    g.lineTo(tx + w * 0.5, y + (up ? -h : h));
    g.lineTo(tx + w, y);
    g.closePath(); g.fill();
    g.fillStyle = shade;
    g.beginPath();
    g.moveTo(tx + w * 0.5, y + (up ? -h : h));
    g.lineTo(tx + w, y);
    g.lineTo(tx + w * 0.72, y);
    g.closePath(); g.fill();
  }
}

// HUSK — a rotted trooper whose own implants have gone septic: olive meat,
// chitin plates screwed over it, sutured seams, jaw hooks, cold veins.
function skinHusk(): HTMLCanvasElement {
  const S = 128;
  const { c, g } = canvas(S);
  const rng = skinRng('skin-husk');
  g.fillStyle = '#4a5340';
  g.fillRect(0, 0, S, S);
  // top-lit wash so the hide reads with a direction even under flat lambert
  const wash = g.createLinearGradient(0, 0, 0, S);
  wash.addColorStop(0, 'rgba(104,114,82,0.45)');
  wash.addColorStop(0.5, 'rgba(74,83,64,0)');
  wash.addColorStop(1, 'rgba(22,28,20,0.5)');
  g.fillStyle = wash;
  g.fillRect(0, 0, S, S);
  // necrotic rot blooming under the plates
  for (let i = 0; i < 30; i++) {
    const x = rng() * S, y = rng() * S, r = 5 + rng() * 15;
    const bg = g.createRadialGradient(x, y, 0, x, y, r);
    bg.addColorStop(0, `rgba(${96 + rng() * 30 | 0},${104 + rng() * 22 | 0},${56 + rng() * 18 | 0},0.45)`);
    bg.addColorStop(0.62, 'rgba(60,68,44,0.2)');
    bg.addColorStop(1, 'rgba(40,48,34,0)');
    g.fillStyle = bg;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // cold veins running under the surface, wrapped across the tile edge
  wrapDraw(g, S, (gg) => {
    const r = skinRng('skin-husk', 'vein');
    for (let i = 0; i < 10; i++) {
      let x = r() * S, y = r() * S;
      gg.strokeStyle = 'rgba(26,34,26,0.6)';
      gg.lineWidth = 2.4;
      gg.beginPath(); gg.moveTo(x, y);
      for (let s = 0; s < 5; s++) {
        const nx = x + r() * 30 - 15, ny = y + r() * 28 - 8;
        gg.quadraticCurveTo(x + r() * 10 - 5, (y + ny) / 2, nx, ny);
        x = nx; y = ny;
      }
      gg.stroke();
      gg.strokeStyle = 'rgba(126,56,50,0.35)';
      gg.lineWidth = 0.9;
      gg.stroke();
    }
  });
  // biomechanical plating: four staggered scute rows, period 32 so it tiles
  wrapDraw(g, S, (gg) => {
    const r = skinRng('skin-husk', 'plate');
    for (let row = 0; row < 4; row++) {
      const y = row * 32, off = row % 2 ? 16 : 0;
      for (let x = off; x < S; x += 32) {
        const v = 0.85 + r() * 0.3;
        scute(gg, x + 2, y + 3, 28, 26,
          `rgba(${86 * v | 0},${96 * v | 0},${70 * v | 0},0.92)`,
          'rgba(160,172,132,0.5)', 'rgba(18,24,16,0.6)');
        // bolt studs pinning the plate down
        for (const bx of [x + 6, x + 26]) {
          gg.fillStyle = 'rgba(20,24,18,0.7)';
          gg.beginPath(); gg.arc(bx + 0.8, y + 16.8, 2.2, 0, Math.PI * 2); gg.fill();
          gg.fillStyle = 'rgba(138,146,120,0.8)';
          gg.beginPath(); gg.arc(bx, y + 16, 1.8, 0, Math.PI * 2); gg.fill();
        }
      }
    }
  });
  // implant seams: dark channels stapled shut
  for (const y of [32, 96]) {
    g.fillStyle = 'rgba(16,20,14,0.6)';
    g.fillRect(0, y - 2, S, 4);
    g.fillStyle = 'rgba(122,132,98,0.35)';
    g.fillRect(0, y + 2, S, 1);
    suture(g, 4, y, S - 4, false, 'rgba(150,156,132,0.7)', 'rgba(214,218,196,0.55)');
  }
  // jaw hooks biting along the lower seam
  teethRow(g, 12, 96, 6, 8, 7, true, 'rgba(198,190,158,0.85)', 'rgba(120,112,88,0.8)');
  teethRow(g, 76, 32, 5, 8, 6, false, 'rgba(186,178,146,0.75)', 'rgba(110,104,80,0.8)');
  // wet pores and open sores
  for (let i = 0; i < 22; i++) {
    const x = rng() * S, y = rng() * S, r = 1.4 + rng() * 3;
    g.fillStyle = 'rgba(24,16,14,0.55)';
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(146,74,52,0.4)';
    g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.5, 0, Math.PI * 2); g.fill();
  }
  speckle(g, S, rng, 40, 'rgba(30,38,26,0.45)', 0.8, 2.2);
  noise(g, S, rng, 1100, 0.09);
  return c;
}

// SLAB — armoured brute. Rust-hide over a bolted carapace: thick overlapping
// plates, iron staples, old scars, gouges down to the dark meat.
function skinSlab(): HTMLCanvasElement {
  const S = 128;
  const { c, g } = canvas(S);
  const rng = skinRng('skin-slab');
  g.fillStyle = '#6e4438';
  g.fillRect(0, 0, S, S);
  const wash = g.createLinearGradient(0, 0, 0, S);
  wash.addColorStop(0, 'rgba(146,96,74,0.42)');
  wash.addColorStop(0.55, 'rgba(110,68,56,0)');
  wash.addColorStop(1, 'rgba(34,18,14,0.55)');
  g.fillStyle = wash;
  g.fillRect(0, 0, S, S);
  // pebbled hide showing between the plates
  for (let i = 0; i < 150; i++) {
    const x = rng() * S, y = rng() * S, r = 1 + rng() * 3.5;
    g.fillStyle = `rgba(${118 + rng() * 40 | 0},${74 + rng() * 26 | 0},${58 + rng() * 20 | 0},0.5)`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(38,20,16,0.3)';
    g.beginPath(); g.arc(x + r * 0.4, y + r * 0.5, r * 0.6, 0, Math.PI * 2); g.fill();
  }
  // carapace: heavy overlapping plates, two per row, four staggered rows.
  // Periods 64/32 both divide the tile, so the plate grid meets itself cleanly.
  wrapDraw(g, S, (gg) => {
    const r = skinRng('skin-slab', 'plate');
    for (let row = 0; row < 4; row++) {
      const y = row * 32 + 2, off = row % 2 ? 32 : 0;
      for (let x = off; x < S + off; x += 64) {
        const v = 0.85 + r() * 0.35;
        scute(gg, x + 3, y, 58, 30,
          `rgba(${132 * v | 0},${82 * v | 0},${62 * v | 0},0.95)`,
          'rgba(214,158,116,0.45)', 'rgba(28,12,10,0.65)');
        // rust bloom eating the plate rim
        gg.fillStyle = `rgba(${150 + r() * 40 | 0},${68 + r() * 30 | 0},26,0.28)`;
        gg.beginPath(); gg.ellipse(x + 14 + r() * 34, y + 20 + r() * 8, 7 + r() * 10, 3 + r() * 4, r() * 3, 0, Math.PI * 2); gg.fill();
        // iron staples pinning the plate to the one beneath
        for (const sx of [x + 14, x + 32, x + 50]) {
          gg.fillStyle = 'rgba(26,16,12,0.7)';
          gg.fillRect(sx - 1, y + 24, 4, 7);
          gg.fillStyle = 'rgba(158,142,126,0.8)';
          gg.fillRect(sx - 1, y + 24, 4, 2);
        }
      }
    }
  });
  // old scar seams: pale keloid ridges, healed over
  wrapDraw(g, S, (gg) => {
    const r = skinRng('skin-slab', 'scar');
    for (let i = 0; i < 5; i++) {
      let x = r() * S, y = r() * S;
      const a = r() * Math.PI * 2;
      gg.strokeStyle = 'rgba(210,166,140,0.4)';
      gg.lineWidth = 3 + r() * 2;
      gg.beginPath(); gg.moveTo(x, y);
      for (let s = 0; s < 4; s++) {
        x += Math.cos(a) * 14 + r() * 8 - 4;
        y += Math.sin(a) * 14 + r() * 8 - 4;
        gg.lineTo(x, y);
      }
      gg.stroke();
      gg.strokeStyle = 'rgba(48,22,18,0.45)';
      gg.lineWidth = 1;
      gg.stroke();
    }
  });
  // gouges: cracked plate, dark meat and a wet rim underneath
  for (let i = 0; i < 7; i++) {
    const x = 8 + rng() * (S - 16), y = 8 + rng() * (S - 16), w = 6 + rng() * 12, h = 3 + rng() * 5;
    const a = rng() * Math.PI;
    g.fillStyle = 'rgba(18,8,8,0.75)';
    g.beginPath(); g.ellipse(x, y, w, h, a, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(142,44,38,0.55)';
    g.beginPath(); g.ellipse(x, y, w * 0.6, h * 0.5, a, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(226,178,146,0.35)';
    g.lineWidth = 1.4;
    g.beginPath(); g.ellipse(x, y, w + 1.5, h + 1.5, a, Math.PI * 0.9, Math.PI * 2.1); g.stroke();
  }
  // rust bleeding downward off the staples
  wrapDraw(g, S, (gg) => {
    const r = skinRng('skin-slab', 'rust');
    for (let i = 0; i < 12; i++) {
      const x = r() * S, y = r() * S;
      gg.strokeStyle = `rgba(${132 + r() * 40 | 0},${58 + r() * 24 | 0},20,${0.16 + r() * 0.2})`;
      gg.lineWidth = 1 + r() * 3;
      gg.beginPath(); gg.moveTo(x, y);
      gg.lineTo(x + r() * 5 - 2.5, y + 10 + r() * 22);
      gg.stroke();
    }
  });
  speckle(g, S, rng, 44, 'rgba(32,16,12,0.45)', 0.8, 2.4);
  noise(g, S, rng, 900, 0.09);
  return c;
}

// HIEROPHANT — finer than the brutes: tessellated bone plate with gold inlay,
// and the void burning violet in every gap between the plates.
function skinHierophant(): HTMLCanvasElement {
  const S = 128;
  const { c, g } = canvas(S);
  const rng = skinRng('skin-hier');
  g.fillStyle = '#2c2433';
  g.fillRect(0, 0, S, S);
  // the void beneath: uneven purple depth, so the gaps aren't dead flat
  for (let i = 0; i < 20; i++) {
    const x = rng() * S, y = rng() * S, r = 10 + rng() * 22;
    const vg = g.createRadialGradient(x, y, 0, x, y, r);
    vg.addColorStop(0, 'rgba(70,34,96,0.5)');
    vg.addColorStop(1, 'rgba(30,20,44,0)');
    g.fillStyle = vg;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // void veins burning through, wrapped so no vein dies at an edge
  wrapDraw(g, S, (gg) => {
    const r = skinRng('skin-hier', 'vein');
    gg.shadowColor = '#b13bff';
    gg.shadowBlur = 4;
    for (let i = 0; i < 11; i++) {
      let x = r() * S, y = r() * S;
      gg.strokeStyle = `rgba(177,59,255,${0.4 + r() * 0.4})`;
      gg.lineWidth = 1 + r() * 1.6;
      gg.beginPath(); gg.moveTo(x, y);
      for (let s = 0; s < 4; s++) {
        const nx = x + r() * 36 - 18, ny = y + r() * 36 - 18;
        gg.quadraticCurveTo(x + r() * 12 - 6, (y + ny) / 2, nx, ny);
        x = nx; y = ny;
      }
      gg.stroke();
    }
    gg.shadowBlur = 0;
  });
  // fine bone plates: a small tessellation, 8 columns x 8 rows, jittered
  wrapDraw(g, S, (gg) => {
    const r = skinRng('skin-hier', 'bone');
    const cell = 16;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if (r() > 0.86) continue;                       // a missing plate lets the void show
        const cx = col * cell + cell / 2 + (row % 2 ? cell / 2 : 0);
        const cy = row * cell + cell / 2;
        const w = cell * (0.36 + r() * 0.1), h = cell * (0.34 + r() * 0.1);
        const v = 0.88 + r() * 0.22;
        gg.fillStyle = 'rgba(24,16,32,0.7)';
        gg.beginPath(); gg.ellipse(cx + 0.8, cy + 1, w + 1.2, h + 1.2, 0, 0, Math.PI * 2); gg.fill();
        gg.fillStyle = `rgba(${218 * v | 0},${208 * v | 0},${184 * v | 0},0.95)`;
        gg.beginPath(); gg.ellipse(cx, cy, w, h, 0, 0, Math.PI * 2); gg.fill();
        // incised growth lines across the plate
        gg.strokeStyle = 'rgba(126,116,96,0.45)';
        gg.lineWidth = 0.7;
        for (let k = -1; k <= 1; k++) {
          gg.beginPath();
          gg.moveTo(cx - w * 0.8, cy + k * h * 0.4);
          gg.quadraticCurveTo(cx, cy + k * h * 0.4 - 1.4, cx + w * 0.8, cy + k * h * 0.4);
          gg.stroke();
        }
        gg.fillStyle = 'rgba(255,252,238,0.5)';
        gg.beginPath(); gg.ellipse(cx - w * 0.2, cy - h * 0.35, w * 0.42, h * 0.24, 0, 0, Math.PI * 2); gg.fill();
      }
    }
  });
  // gold inlay tracing the plate seams — priest, not animal
  wrapDraw(g, S, (gg) => {
    const r = skinRng('skin-hier', 'gold');
    gg.strokeStyle = 'rgba(232,200,119,0.7)';
    for (let i = 0; i < 7; i++) {
      let x = r() * S, y = r() * S;
      gg.lineWidth = 1.3;
      gg.beginPath(); gg.moveTo(x, y);
      for (let s = 0; s < 5; s++) {
        if (r() > 0.5) x += (r() > 0.5 ? 1 : -1) * (8 + r() * 14);
        else y += (r() > 0.5 ? 1 : -1) * (8 + r() * 14);
        gg.lineTo(x, y);
      }
      gg.stroke();
      gg.fillStyle = 'rgba(246,222,158,0.8)';
      gg.beginPath(); gg.arc(x, y, 1.6, 0, Math.PI * 2); gg.fill();
    }
  });
  // small votive sigils struck into the bone
  for (let i = 0; i < 4; i++) {
    const x = 16 + rng() * (S - 32), y = 16 + rng() * (S - 32), r = 5 + rng() * 4;
    g.strokeStyle = 'rgba(214,180,104,0.6)';
    g.lineWidth = 1.2;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
    g.beginPath();
    for (let k = 0; k <= 7; k++) {
      const a = -Math.PI / 2 + k * (Math.PI * 6 / 7);
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.stroke();
  }
  speckle(g, S, rng, 30, 'rgba(20,12,28,0.45)', 0.8, 2);
  noise(g, S, rng, 700, 0.08);
  return c;
}

// FIEND — the big horned one. Dark crimson hide split by cooling ember seams,
// with banded keratin ridges where the horn plate breaks the surface.
function skinFiend(): HTMLCanvasElement {
  const S = 128;
  const { c, g } = canvas(S);
  const rng = skinRng('skin-fiend');
  g.fillStyle = '#3a0f16';
  g.fillRect(0, 0, S, S);
  const wash = g.createLinearGradient(0, 0, 0, S);
  wash.addColorStop(0, 'rgba(96,24,32,0.5)');
  wash.addColorStop(0.5, 'rgba(58,15,22,0)');
  wash.addColorStop(1, 'rgba(12,4,6,0.6)');
  g.fillStyle = wash;
  g.fillRect(0, 0, S, S);
  // charred blotches — this thing has been burning from the inside for a while
  for (let i = 0; i < 26; i++) {
    const x = rng() * S, y = rng() * S, r = 6 + rng() * 18;
    const bg = g.createRadialGradient(x, y, 0, x, y, r);
    bg.addColorStop(0, 'rgba(18,8,10,0.5)');
    bg.addColorStop(1, 'rgba(18,8,10,0)');
    g.fillStyle = bg;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // scale rows: small overlapping crimson scales, period 16 in both axes
  wrapDraw(g, S, (gg) => {
    const r = skinRng('skin-fiend', 'scale');
    for (let row = 0; row < 16; row++) {
      const y = row * 8, off = row % 2 ? 8 : 0;
      for (let x = off; x < S; x += 16) {
        const v = 0.8 + r() * 0.45;
        gg.fillStyle = `rgba(${104 * v | 0},${28 * v | 0},${34 * v | 0},0.75)`;
        gg.beginPath();
        gg.moveTo(x, y + 8);
        gg.quadraticCurveTo(x + 8, y - 2, x + 16, y + 8);
        gg.closePath(); gg.fill();
        gg.strokeStyle = 'rgba(10,3,5,0.5)';
        gg.lineWidth = 0.8;
        gg.stroke();
        gg.strokeStyle = 'rgba(190,96,80,0.28)';
        gg.beginPath();
        gg.moveTo(x + 2, y + 7);
        gg.quadraticCurveTo(x + 8, y + 0.5, x + 14, y + 7);
        gg.stroke();
      }
    }
  });
  // ember seams: cracks in the hide with heat still in them
  wrapDraw(g, S, (gg) => {
    const r = skinRng('skin-fiend', 'ember');
    for (let i = 0; i < 9; i++) {
      let x = r() * S, y = r() * S;
      const pts: [number, number][] = [[x, y]];
      for (let s = 0; s < 5; s++) {
        x += r() * 30 - 15; y += r() * 30 - 15;
        pts.push([x, y]);
      }
      // char shoulder first, then the glowing crack inside it
      gg.strokeStyle = 'rgba(14,4,4,0.7)';
      gg.lineWidth = 5;
      gg.beginPath();
      gg.moveTo(pts[0][0], pts[0][1]);
      for (const [px, py] of pts.slice(1)) gg.lineTo(px, py);
      gg.stroke();
      gg.shadowColor = '#ff7a2a';
      gg.shadowBlur = 5;
      gg.strokeStyle = `rgba(255,${110 + r() * 60 | 0},34,${0.6 + r() * 0.3})`;
      gg.lineWidth = 1.6;
      gg.stroke();
      gg.strokeStyle = 'rgba(255,232,178,0.65)';
      gg.lineWidth = 0.7;
      gg.stroke();
      gg.shadowBlur = 0;
    }
  });
  // keratin ridges: banded horn plate pushing up through the hide
  wrapDraw(g, S, (gg) => {
    const r = skinRng('skin-fiend', 'horn');
    for (const bx of [18, 62, 104]) {
      const w = 12 + r() * 6;
      const grad = gg.createLinearGradient(bx, 0, bx + w, 0);
      grad.addColorStop(0, 'rgba(58,40,30,0.9)');
      grad.addColorStop(0.4, 'rgba(198,166,124,0.92)');
      grad.addColorStop(0.75, 'rgba(140,110,78,0.9)');
      grad.addColorStop(1, 'rgba(40,26,20,0.9)');
      gg.fillStyle = grad;
      gg.fillRect(bx, 0, w, S);
      // growth bands across the ridge (spacing divides the tile, so the
      // banding keeps its cadence where the skin wraps)
      for (let y = 0; y < S; y += 8) {
        gg.fillStyle = `rgba(46,30,22,${0.2 + r() * 0.3})`;
        gg.fillRect(bx, y, w, 1.6);
        gg.fillStyle = 'rgba(232,206,164,0.25)';
        gg.fillRect(bx, y + 2, w, 1);
      }
      // chipped edges so the ridge isn't a clean stripe
      for (let i = 0; i < 8; i++) {
        gg.fillStyle = 'rgba(24,8,10,0.55)';
        const cy = r() * S;
        gg.beginPath(); gg.ellipse(r() > 0.5 ? bx : bx + w, cy, 1.5 + r() * 2.5, 2 + r() * 4, 0, 0, Math.PI * 2); gg.fill();
      }
    }
  });
  // spurs erupting off the ridges
  teethRow(g, 30, 40, 4, 7, 9, true, 'rgba(206,176,134,0.9)', 'rgba(110,84,58,0.85)');
  teethRow(g, 74, 100, 4, 7, 8, false, 'rgba(196,166,126,0.85)', 'rgba(100,76,52,0.85)');
  // ember motes drifting off the hot seams
  speckle(g, S, rng, 26, 'rgba(255,150,60,0.5)', 0.8, 2);
  speckle(g, S, rng, 30, 'rgba(16,5,8,0.5)', 0.8, 2.4);
  noise(g, S, rng, 1000, 0.09);
  return c;
}

// CRAWLER — unchanged vibe (violet chitin, red dorsal line), just given the
// banding and spiracles it always implied.
function skinCrawler(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  const rng = makeRng('skin-crawler').float;
  g.fillStyle = '#241726';
  g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 30; i++) {
    g.fillStyle = `rgba(${70 + rng() * 40 | 0},${30 + rng() * 20 | 0},${60 + rng() * 30 | 0},0.45)`;
    g.beginPath(); g.arc(rng() * 64, rng() * 64, 2 + rng() * 6, 0, Math.PI * 2); g.fill();
  }
  // chitin banding across the segments, with a wet gloss on each band
  for (let y = 8; y < 64; y += 16) {
    g.fillStyle = 'rgba(12,6,14,0.5)';
    g.fillRect(0, y, 64, 3);
    g.fillStyle = 'rgba(150,96,150,0.22)';
    g.fillRect(0, y + 3, 64, 1.5);
  }
  // spiracles either side of the spine
  for (let x = 6; x < 64; x += 16) {
    for (const y of [24, 40]) {
      g.fillStyle = 'rgba(10,4,10,0.7)';
      g.beginPath(); g.ellipse(x, y, 2.2, 1.4, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(188,84,90,0.35)';
      g.beginPath(); g.ellipse(x - 0.4, y - 0.4, 1, 0.7, 0, 0, Math.PI * 2); g.fill();
    }
  }
  g.strokeStyle = 'rgba(200,60,60,0.5)';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, 32); g.lineTo(64, 32); g.stroke();
  g.strokeStyle = 'rgba(255,150,140,0.3)';
  g.lineWidth = 0.8;
  g.beginPath(); g.moveTo(0, 31); g.lineTo(64, 31); g.stroke();
  noise(g, 64, rng, 300, 0.12);
  return c;
}

// WISP — unchanged vibe (cold blue haze), plus the ectoplasm swirl and a
// couple of brighter cores drifting inside it.
function skinWisp(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  const rng = makeRng('skin-wisp').float;
  g.fillStyle = '#1a2035';
  g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(${40 + rng() * 30 | 0},${80 + rng() * 60 | 0},${140 + rng() * 80 | 0},0.5)`;
    g.beginPath(); g.arc(rng() * 64, rng() * 64, 1 + rng() * 4, 0, Math.PI * 2); g.fill();
  }
  // ectoplasm filaments curling through the haze
  wrapDraw(g, 64, (gg) => {
    const r = makeRng('skin-wisp-swirl').float;
    for (let i = 0; i < 7; i++) {
      let x = r() * 64, y = r() * 64;
      gg.strokeStyle = `rgba(${120 + r() * 60 | 0},${190 + r() * 50 | 0},255,${0.18 + r() * 0.22})`;
      gg.lineWidth = 1 + r() * 2;
      gg.beginPath(); gg.moveTo(x, y);
      for (let s = 0; s < 4; s++) {
        const nx = x + r() * 22 - 11, ny = y + r() * 22 - 11;
        gg.quadraticCurveTo(x + r() * 8 - 4, (y + ny) / 2, nx, ny);
        x = nx; y = ny;
      }
      gg.stroke();
    }
  });
  // cold cores burning inside the shell
  for (let i = 0; i < 5; i++) {
    const x = rng() * 64, y = rng() * 64, r = 3 + rng() * 5;
    const cg = g.createRadialGradient(x, y, 0, x, y, r);
    cg.addColorStop(0, 'rgba(226,244,255,0.65)');
    cg.addColorStop(1, 'rgba(90,150,220,0)');
    g.fillStyle = cg;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  noise(g, 64, rng, 300, 0.1);
  return c;
}

// ---------------------------------------------------------------- registry

export interface TextureLib {
  walls: Record<'industrial' | 'organic' | 'stone' | 'tech', THREE.Texture>;
  floors: Record<'industrial' | 'organic' | 'stone' | 'tech', THREE.Texture>;
  ceilings: Record<'industrial' | 'organic' | 'stone' | 'tech', THREE.Texture>;
  door: THREE.Texture;
  sky: THREE.Texture;
  decals: Record<'rune' | 'skull' | 'tendrils' | 'pentagram' | 'lamp', THREE.Texture>;
  particle: THREE.Texture;
  shadow: THREE.Texture;
  flash: THREE.Texture;
  glow: THREE.Texture;
  skins: Record<EnemyType, THREE.Texture>;
}

let cached: TextureLib | null = null;

export function getTextures(): TextureLib {
  if (cached) return cached;
  cached = {
    walls: {
      industrial: toTexture(wallIndustrial()),
      organic: toTexture(wallOrganic()),
      stone: toTexture(wallStone()),
      tech: toTexture(wallTech()),
    },
    floors: {
      industrial: toTexture(floorIndustrial()),
      organic: toTexture(floorOrganic()),
      stone: toTexture(floorStone()),
      tech: toTexture(floorTech()),
    },
    ceilings: {
      industrial: toTexture(ceilingDark('#232621')),
      organic: toTexture(ceilingDark('#2c1012')),
      stone: toTexture(ceilingDark('#191b1f')),
      tech: toTexture(ceilingDark('#17141f')),
    },
    door: toTexture(doorTexture()),
    sky: toTexture(skyTexture()),
    decals: {
      rune: toTexture(decalRune()),
      skull: toTexture(decalSkull()),
      tendrils: toTexture(decalTendrils()),
      pentagram: toTexture(decalPentagram()),
      lamp: toTexture(decalLamp()),
    },
    particle: toTexture(particleSprite()),
    shadow: toTexture(shadowBlob()),
    flash: toTexture(flashSprite()),
    glow: toTexture(glowSprite()),
    skins: {
      husk: toTexture(skinHusk()),
      crawler: toTexture(skinCrawler()),
      slab: toTexture(skinSlab()),
      wisp: toTexture(skinWisp()),
      hierophant: toTexture(skinHierophant()),
      fiend: toTexture(skinFiend()),
    },
  };
  return cached;
}
