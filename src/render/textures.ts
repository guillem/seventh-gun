// Procedural canvas textures — the entire art budget. Nearest-filtered,
// crunchy but readable. Renderer-side only.
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

function speckle(g: Ctx, size: number, rng: () => number, count: number, color: string, rMin = 1, rMax = 3): void {
  for (let i = 0; i < count; i++) {
    const x = rng() * size, y = rng() * size, r = rMin + rng() * (rMax - rMin);
    g.fillStyle = color;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
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

function skinHusk(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  const rng = makeRng('skin-husk').float;
  g.fillStyle = '#4a5340';
  g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(${60 + rng() * 30 | 0},${70 + rng() * 25 | 0},${50 + rng() * 20 | 0},0.5)`;
    g.beginPath(); g.arc(rng() * 64, rng() * 64, 1 + rng() * 5, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 8; i++) {
    g.strokeStyle = 'rgba(110,40,40,0.5)';
    g.lineWidth = 1 + rng();
    g.beginPath();
    g.moveTo(rng() * 64, rng() * 64);
    g.lineTo(rng() * 64, rng() * 64);
    g.stroke();
  }
  noise(g, 64, rng, 400, 0.1);
  return c;
}

function skinCrawler(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  const rng = makeRng('skin-crawler').float;
  g.fillStyle = '#241726';
  g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 30; i++) {
    g.fillStyle = `rgba(${70 + rng() * 40 | 0},${30 + rng() * 20 | 0},${60 + rng() * 30 | 0},0.45)`;
    g.beginPath(); g.arc(rng() * 64, rng() * 64, 2 + rng() * 6, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = 'rgba(200,60,60,0.5)';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, 32); g.lineTo(64, 32); g.stroke();
  noise(g, 64, rng, 300, 0.12);
  return c;
}

function skinSlab(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  const rng = makeRng('skin-slab').float;
  g.fillStyle = '#6e4438';
  g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 50; i++) {
    g.fillStyle = `rgba(${100 + rng() * 40 | 0},${70 + rng() * 25 | 0},${55 + rng() * 20 | 0},0.5)`;
    g.beginPath(); g.arc(rng() * 64, rng() * 64, 2 + rng() * 7, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 10; i++) {
    g.strokeStyle = 'rgba(40,20,18,0.6)';
    g.lineWidth = 2 + rng() * 2;
    g.beginPath();
    g.moveTo(rng() * 64, rng() * 64);
    g.lineTo(rng() * 64, rng() * 64);
    g.stroke();
  }
  noise(g, 64, rng, 350, 0.1);
  return c;
}

function skinWisp(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  const rng = makeRng('skin-wisp').float;
  g.fillStyle = '#1a2035';
  g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(${40 + rng() * 30 | 0},${80 + rng() * 60 | 0},${140 + rng() * 80 | 0},0.5)`;
    g.beginPath(); g.arc(rng() * 64, rng() * 64, 1 + rng() * 4, 0, Math.PI * 2); g.fill();
  }
  noise(g, 64, rng, 300, 0.1);
  return c;
}

function skinHierophant(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  const rng = makeRng('skin-hier').float;
  g.fillStyle = '#2c2433';
  g.fillRect(0, 0, 64, 64);
  // bone armor plates
  for (let i = 0; i < 8; i++) {
    const x = rng() * 64, y = rng() * 64;
    g.fillStyle = 'rgba(190,180,160,0.7)';
    g.beginPath(); g.ellipse(x, y, 4 + rng() * 8, 3 + rng() * 5, rng() * 3, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 6; i++) {
    g.strokeStyle = 'rgba(177,59,255,0.5)';
    g.lineWidth = 1.5;
    g.shadowColor = '#b13bff';
    g.shadowBlur = 3;
    g.beginPath();
    g.moveTo(rng() * 64, rng() * 64);
    g.lineTo(rng() * 64, rng() * 64);
    g.stroke();
  }
  g.shadowBlur = 0;
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
  skins: Record<'husk' | 'crawler' | 'slab' | 'wisp' | 'hierophant', THREE.Texture>;
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
    },
  };
  return cached;
}
