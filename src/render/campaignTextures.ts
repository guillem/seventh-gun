// Campaign-only procedural canvas art. One hand-painted pack per authored map,
// deliberately *not* a recolor of the four generic maze themes in textures.ts.
// Helpers below are copied (not imported) so maze art can never shift under us.
import * as THREE from 'three';
import { makeRng } from '../sim/rng';

type Ctx = CanvasRenderingContext2D;

// ---------------------------------------------------------------- shared helpers

function canvas(size: number): { c: HTMLCanvasElement; g: Ctx } {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  return { c, g };
}

function toTiled(c: HTMLCanvasElement, repeat = 1): THREE.Texture {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function toDecal(c: HTMLCanvasElement): THREE.Texture {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function noise(g: Ctx, size: number, rng: () => number, amount: number, alpha: number): void {
  for (let i = 0; i < amount; i++) {
    const v = rng() * 255 | 0;
    g.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    g.fillRect(rng() * size, rng() * size, 1 + (rng() * 2 | 0), 1 + (rng() * 2 | 0));
  }
}

function speckle(g: Ctx, size: number, rng: () => number, count: number, color: string, rMin = 1, rMax = 3): void {
  g.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const r = rMin + rng() * (rMax - rMin);
    g.beginPath();
    g.arc(rng() * size, rng() * size, r, 0, Math.PI * 2);
    g.fill();
  }
}

// Draws the same strokes nine times on a 3x3 torus so cracks/veins/streaks that
// run off one edge come back in on the other — no screaming seams when tiled.
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

function wrapX(g: Ctx, size: number, draw: (g: Ctx) => void): void {
  for (const dx of [-size, 0, size]) {
    g.save();
    g.translate(dx, 0);
    draw(g);
    g.restore();
  }
}

function rivet(g: Ctx, x: number, y: number, r: number, hi: string, lo: string): void {
  g.fillStyle = lo;
  g.beginPath(); g.arc(x + 0.8, y + 0.9, r, 0, Math.PI * 2); g.fill();
  g.fillStyle = hi;
  g.beginPath(); g.arc(x, y, r * 0.8, 0, Math.PI * 2); g.fill();
}

// Period-locked slanted bars; period divides the tile so it wraps cleanly.
function chevronBand(g: Ctx, size: number, y: number, h: number, period: number, a: string, b: string): void {
  g.save();
  g.beginPath(); g.rect(0, y, size, h); g.clip();
  for (let i = -2; i <= size / period + 2; i++) {
    const x = i * period;
    g.fillStyle = i % 2 === 0 ? a : b;
    g.beginPath();
    g.moveTo(x, y + h);
    g.lineTo(x + period, y + h);
    g.lineTo(x + period + h * 0.7, y);
    g.lineTo(x + h * 0.7, y);
    g.closePath();
    g.fill();
  }
  g.restore();
}

const SEG_MASKS: readonly number[] = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f];

// Crunchy seven-segment digit — readable at nearest-filter distance, no font needed.
function segDigit(g: Ctx, d: number, x: number, y: number, w: number, h: number, t: number): void {
  const m = SEG_MASKS[d] ?? 0;
  const half = h / 2;
  if (m & 1) g.fillRect(x + t, y, w - 2 * t, t);
  if (m & 2) g.fillRect(x + w - t, y + t, t, half - t);
  if (m & 4) g.fillRect(x + w - t, y + half, t, half - t);
  if (m & 8) g.fillRect(x + t, y + h - t, w - 2 * t, t);
  if (m & 16) g.fillRect(x, y + half, t, half - t);
  if (m & 32) g.fillRect(x, y + t, t, half - t);
  if (m & 64) g.fillRect(x + t, y + half - t / 2, w - 2 * t, t);
}

function starPath(g: Ctx, cx: number, cy: number, r: number, points: number, skip: number): void {
  g.beginPath();
  for (let i = 0; i <= points; i++) {
    const a = -Math.PI / 2 + (i * skip * Math.PI * 2) / points;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
}

function seed(id: string, kind: string): () => number {
  return makeRng('camp-tex-' + id + '-' + kind).float;
}

// ================================================================ 1. FOUNDRY
// slag iron, poured plates, heat scale, hazard chevrons, ember cracks

function foundryWall(): HTMLCanvasElement {
  const { c, g } = canvas(128);
  const rng = seed('foundry', 'wall');
  g.fillStyle = '#2b2521';
  g.fillRect(0, 0, 128, 128);
  // poured-iron plates, 2x2 grid of 64 — a repeating panel grid, not random blobs
  for (let py = 0; py < 128; py += 64) {
    for (let px = 0; px < 128; px += 64) {
      const grd = g.createLinearGradient(0, py, 0, py + 64);
      grd.addColorStop(0, '#3c322a');
      grd.addColorStop(0.55, '#312820');
      grd.addColorStop(1, '#221c18');
      g.fillStyle = grd;
      g.fillRect(px + 3, py + 3, 58, 58);
      g.fillStyle = 'rgba(150,120,90,0.16)';
      g.fillRect(px + 3, py + 3, 58, 2);
      g.fillStyle = 'rgba(0,0,0,0.4)';
      g.fillRect(px + 3, py + 59, 58, 2);
      for (const [rx, ry] of [[10, 10], [54, 10], [10, 54], [54, 54]]) {
        rivet(g, px + rx, py + ry, 2.6, '#6a5a46', '#14100d');
      }
    }
  }
  // heat scale: oxide blooms and blue temper patches
  speckle(g, 128, rng, 26, 'rgba(126,70,28,0.22)', 3, 11);
  speckle(g, 128, rng, 14, 'rgba(72,86,120,0.13)', 3, 9);
  // ember cracks glowing through the slag
  wrapDraw(g, 128, (gg) => {
    const r2 = seed('foundry', 'crack');
    for (let i = 0; i < 9; i++) {
      let x = r2() * 128, y = r2() * 128;
      gg.strokeStyle = 'rgba(255,106,18,0.85)';
      gg.lineWidth = 1.2;
      gg.beginPath();
      gg.moveTo(x, y);
      for (let s = 0; s < 4; s++) {
        x += r2() * 22 - 11; y += r2() * 20 - 6;
        gg.lineTo(x, y);
      }
      gg.stroke();
      gg.strokeStyle = 'rgba(120,30,0,0.5)';
      gg.lineWidth = 3;
      gg.stroke();
    }
  });
  chevronBand(g, 128, 56, 14, 16, '#c8901f', '#1a140f');
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.fillRect(0, 54, 128, 2); g.fillRect(0, 70, 128, 2);
  noise(g, 128, rng, 900, 0.07);
  return c;
}

function foundryFloor(): HTMLCanvasElement {
  const { c, g } = canvas(128);
  const rng = seed('foundry', 'floor');
  g.fillStyle = '#1d1917';
  g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 32) {
    for (let x = 0; x < 128; x += 32) {
      const sh = 0.85 + rng() * 0.3;
      g.fillStyle = `rgb(${44 * sh | 0},${37 * sh | 0},${32 * sh | 0})`;
      g.fillRect(x + 2, y + 2, 28, 28);
      g.fillStyle = 'rgba(255,190,120,0.06)';
      g.fillRect(x + 2, y + 2, 28, 1);
    }
  }
  // ember running in the grout between cooled slabs
  for (let i = 0; i < 128; i += 32) {
    g.fillStyle = 'rgba(255,96,20,0.30)';
    g.fillRect(i, 0, 1.5, 128);
    g.fillRect(0, i, 128, 1.5);
  }
  speckle(g, 128, rng, 60, 'rgba(18,14,12,0.7)', 1, 4);
  speckle(g, 128, rng, 18, 'rgba(232,120,40,0.22)', 2, 6);
  noise(g, 128, rng, 1100, 0.08);
  return c;
}

function foundryCeiling(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  const rng = seed('foundry', 'ceil');
  g.fillStyle = '#161210';
  g.fillRect(0, 0, 64, 64);
  const glow = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  glow.addColorStop(0, 'rgba(150,64,20,0.22)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(0, 0, 64, 3); g.fillRect(0, 0, 3, 64);
  for (const x of [10, 32, 54]) for (const y of [10, 32, 54]) rivet(g, x, y, 2, '#4a3b2c', '#0b0908');
  speckle(g, 64, rng, 10, 'rgba(255,110,30,0.30)', 0.6, 1.4);
  noise(g, 64, rng, 380, 0.08);
  return c;
}

function foundryDoor(): HTMLCanvasElement {
  const { c, g } = canvas(128);
  const rng = seed('foundry', 'door');
  g.fillStyle = '#241d19';
  g.fillRect(0, 0, 128, 128);
  // twin blast leaves split down the middle, heavy hinge straps
  for (const lx of [4, 66]) {
    const grd = g.createLinearGradient(lx, 0, lx + 58, 0);
    grd.addColorStop(0, '#463a2e');
    grd.addColorStop(0.5, '#33291f');
    grd.addColorStop(1, '#221b14');
    g.fillStyle = grd;
    g.fillRect(lx, 4, 58, 120);
    g.strokeStyle = '#100c09';
    g.lineWidth = 3;
    g.strokeRect(lx, 4, 58, 120);
  }
  g.fillStyle = '#0d0a08';
  g.fillRect(62, 0, 4, 128);
  for (const sy of [18, 96]) {
    g.fillStyle = '#5a4a36';
    g.fillRect(6, sy, 116, 12);
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(6, sy + 9, 116, 3);
    for (let x = 12; x < 122; x += 14) rivet(g, x, sy + 5, 2.6, '#8a7454', '#100c09');
  }
  // ember slit — grated furnace viewport
  const slit = g.createLinearGradient(0, 52, 0, 78);
  slit.addColorStop(0, '#ffd07a');
  slit.addColorStop(0.5, '#ff6a12');
  slit.addColorStop(1, '#7c1f02');
  g.fillStyle = slit;
  g.fillRect(30, 52, 68, 26);
  g.fillStyle = '#100c09';
  for (let x = 30; x < 98; x += 8) g.fillRect(x, 52, 3, 26);
  g.strokeStyle = '#6b5940';
  g.lineWidth = 4;
  g.strokeRect(30, 52, 68, 26);
  chevronBand(g, 128, 110, 12, 16, '#c8901f', '#1a140f');
  speckle(g, 128, rng, 22, 'rgba(120,66,26,0.3)', 2, 7);
  noise(g, 128, rng, 500, 0.07);
  return c;
}

function foundryFurnaceStencil(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  g.strokeStyle = '#d8a23a';
  g.lineWidth = 3;
  // furnace mouth: arch over a hearth line
  g.beginPath();
  g.moveTo(12, 54); g.lineTo(12, 28);
  g.arc(32, 28, 20, Math.PI, 0);
  g.lineTo(52, 54);
  g.stroke();
  g.fillStyle = '#d8a23a';
  g.fillRect(8, 54, 48, 4);
  // three flame tongues inside the mouth
  for (const [fx, fh] of [[22, 16], [32, 24], [42, 14]]) {
    g.beginPath();
    g.moveTo(fx, 50);
    g.quadraticCurveTo(fx - 5, 50 - fh * 0.6, fx, 50 - fh);
    g.quadraticCurveTo(fx + 5, 50 - fh * 0.6, fx, 50);
    g.fill();
  }
  g.fillStyle = '#7c4a12';
  g.fillRect(8, 58, 48, 2);
  return c;
}

function foundryPourLadle(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  g.fillStyle = '#2a231d';
  // ladle bucket on trunnion
  g.beginPath();
  g.moveTo(14, 12); g.lineTo(46, 12); g.lineTo(40, 34); g.lineTo(20, 34);
  g.closePath(); g.fill();
  g.strokeStyle = '#6b5b44';
  g.lineWidth = 2.5;
  g.stroke();
  g.fillStyle = '#6b5b44';
  g.fillRect(6, 16, 8, 4); g.fillRect(50, 16, 8, 4);
  // pour stream + splash
  const pour = g.createLinearGradient(0, 34, 0, 62);
  pour.addColorStop(0, '#ffe08a');
  pour.addColorStop(0.6, '#ff7a1c');
  pour.addColorStop(1, 'rgba(180,40,0,0.25)');
  g.fillStyle = pour;
  g.beginPath();
  g.moveTo(28, 32); g.lineTo(34, 32); g.lineTo(38, 60); g.lineTo(24, 60);
  g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,150,40,0.85)';
  for (const [dx, dy, dr] of [[18, 52, 2], [46, 48, 1.6], [44, 58, 2.2]]) {
    g.beginPath(); g.arc(dx, dy, dr, 0, Math.PI * 2); g.fill();
  }
  return c;
}

function foundryHeatWarning(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  g.strokeStyle = '#e8c23a';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(32, 4); g.lineTo(60, 56); g.lineTo(4, 56); g.closePath();
  g.stroke();
  g.fillStyle = 'rgba(24,18,8,0.75)';
  g.fill();
  // rising heat waves
  g.strokeStyle = '#ff8a2a';
  g.lineWidth = 2.5;
  for (const wx of [22, 32, 42]) {
    g.beginPath();
    g.moveTo(wx, 50);
    g.bezierCurveTo(wx - 5, 42, wx + 5, 36, wx, 28);
    g.stroke();
  }
  g.fillStyle = '#e8c23a';
  g.fillRect(30, 20, 4, 6);
  return c;
}

// ================================================================ 2. GULLET
// wet mucosa, peristalsis folds, bile sheen — organic interior, not red industrial

function gulletWall(): HTMLCanvasElement {
  const { c, g } = canvas(128);
  const rng = seed('gullet', 'wall');
  const base = g.createLinearGradient(0, 0, 0, 128);
  base.addColorStop(0, '#7d3d48');
  base.addColorStop(0.5, '#662b38');
  base.addColorStop(1, '#4c1f2b');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 128);
  // peristalsis: four muscular ring folds, period 32 so they wrap vertically
  for (let y = 0; y < 128; y += 32) {
    const fold = g.createLinearGradient(0, y, 0, y + 32);
    fold.addColorStop(0, 'rgba(40,14,22,0.75)');
    fold.addColorStop(0.28, 'rgba(160,88,96,0.55)');
    fold.addColorStop(0.55, 'rgba(122,56,68,0.25)');
    fold.addColorStop(1, 'rgba(46,16,24,0.6)');
    g.fillStyle = fold;
    g.fillRect(0, y, 128, 32);
    g.fillStyle = 'rgba(255,206,196,0.20)';
    g.fillRect(0, y + 7, 128, 2);
  }
  // capillary web
  wrapDraw(g, 128, (gg) => {
    const r2 = seed('gullet', 'vein');
    for (let i = 0; i < 12; i++) {
      let x = r2() * 128, y = r2() * 128;
      gg.strokeStyle = `rgba(158,52,64,${0.4 + r2() * 0.35})`;
      gg.lineWidth = 1 + r2() * 1.8;
      gg.beginPath(); gg.moveTo(x, y);
      for (let s = 0; s < 4; s++) {
        const nx = x + r2() * 26 - 13, ny = y + r2() * 18 - 9;
        gg.quadraticCurveTo(x + 6, y - 4, nx, ny);
        x = nx; y = ny;
      }
      gg.stroke();
    }
  });
  // bile sheen and wet specular pooling in the fold troughs
  for (let i = 0; i < 22; i++) {
    const x = rng() * 128, y = rng() * 128, r = 4 + rng() * 12;
    const sg = g.createRadialGradient(x, y, 0, x, y, r);
    sg.addColorStop(0, 'rgba(206,220,96,0.20)');
    sg.addColorStop(1, 'rgba(206,220,96,0)');
    g.fillStyle = sg;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // mucus strands drooling off each fold
  for (let y = 0; y < 128; y += 32) {
    for (let i = 0; i < 5; i++) {
      const x = rng() * 128;
      g.strokeStyle = 'rgba(226,236,168,0.28)';
      g.lineWidth = 1 + rng();
      g.beginPath(); g.moveTo(x, y + 26); g.lineTo(x + rng() * 3 - 1.5, y + 32 + rng() * 6); g.stroke();
    }
  }
  speckle(g, 128, rng, 40, 'rgba(46,12,20,0.45)', 1, 3);
  noise(g, 128, rng, 1300, 0.07);
  return c;
}

function gulletFloor(): HTMLCanvasElement {
  const { c, g } = canvas(128);
  const rng = seed('gullet', 'floor');
  g.fillStyle = '#4a2430';
  g.fillRect(0, 0, 128, 128);
  // bile pools
  for (let i = 0; i < 12; i++) {
    const x = rng() * 128, y = rng() * 128, r = 10 + rng() * 22;
    wrapDraw(g, 128, (gg) => {
      const pg = gg.createRadialGradient(x, y, 0, x, y, r);
      pg.addColorStop(0, 'rgba(178,190,66,0.34)');
      pg.addColorStop(0.75, 'rgba(120,130,50,0.18)');
      pg.addColorStop(1, 'rgba(120,130,50,0)');
      gg.fillStyle = pg;
      gg.beginPath(); gg.arc(x, y, r, 0, Math.PI * 2); gg.fill();
    });
  }
  // villi nubs + wet ripple rings
  speckle(g, 128, rng, 90, 'rgba(140,64,72,0.5)', 1, 3.5);
  wrapDraw(g, 128, (gg) => {
    const r2 = seed('gullet', 'ripple');
    for (let i = 0; i < 7; i++) {
      const x = r2() * 128, y = r2() * 128;
      gg.strokeStyle = 'rgba(232,240,180,0.16)';
      gg.lineWidth = 1.5;
      for (let k = 1; k <= 3; k++) {
        gg.beginPath(); gg.ellipse(x, y, k * 6, k * 4, r2() * 3, 0, Math.PI * 2); gg.stroke();
      }
    }
  });
  noise(g, 128, rng, 1500, 0.09);
  return c;
}

function gulletCeiling(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  const rng = seed('gullet', 'ceil');
  g.fillStyle = '#3a1824';
  g.fillRect(0, 0, 64, 64);
  // hanging papillae
  for (let i = 0; i < 26; i++) {
    const x = rng() * 64, y = rng() * 64, r = 1.5 + rng() * 3;
    g.fillStyle = `rgba(${110 + rng() * 40 | 0},48,58,0.7)`;
    g.beginPath(); g.ellipse(x, y, r, r * 1.8, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(230,240,180,0.18)';
    g.beginPath(); g.arc(x, y + r * 1.6, 1, 0, Math.PI * 2); g.fill();
  }
  noise(g, 64, rng, 420, 0.09);
  return c;
}

function gulletDoor(): HTMLCanvasElement {
  const { c, g } = canvas(128);
  const rng = seed('gullet', 'door');
  const base = g.createRadialGradient(64, 64, 6, 64, 64, 80);
  base.addColorStop(0, '#2a0d16');
  base.addColorStop(0.5, '#6d2f3c');
  base.addColorStop(1, '#421823');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 128);
  // sphincter: radial muscle folds pulling into a wet vertical slit
  for (let i = 0; i < 34; i++) {
    const a = (Math.PI * 2 * i) / 34;
    g.strokeStyle = `rgba(${150 + (i % 3) * 18},${62 + (i % 2) * 14},76,0.55)`;
    g.lineWidth = 3 + (i % 3);
    g.beginPath();
    g.moveTo(64 + Math.cos(a) * 62, 64 + Math.sin(a) * 62);
    g.lineTo(64 + Math.cos(a) * 16, 64 + Math.sin(a) * 16);
    g.stroke();
  }
  for (const [r, col] of [[46, 'rgba(38,12,20,0.5)'], [30, 'rgba(196,120,120,0.35)'], [18, 'rgba(26,8,14,0.7)']] as const) {
    g.strokeStyle = col;
    g.lineWidth = 5;
    g.beginPath(); g.arc(64, 64, r, 0, Math.PI * 2); g.stroke();
  }
  g.fillStyle = '#160509';
  g.beginPath(); g.ellipse(64, 64, 6, 26, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(236,244,190,0.35)';
  g.beginPath(); g.ellipse(58, 54, 2.5, 10, 0.3, 0, Math.PI * 2); g.fill();
  // bile drool, no teeth
  for (let i = 0; i < 7; i++) {
    const x = 20 + rng() * 88;
    g.strokeStyle = 'rgba(206,220,110,0.3)';
    g.lineWidth = 1.5 + rng() * 2;
    g.beginPath(); g.moveTo(x, 92); g.lineTo(x + rng() * 4 - 2, 108 + rng() * 18); g.stroke();
  }
  noise(g, 128, rng, 700, 0.08);
  return c;
}

function gulletSphincterRing(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  for (let i = 0; i < 24; i++) {
    const a = (Math.PI * 2 * i) / 24;
    g.strokeStyle = i % 2 ? 'rgba(168,74,86,0.9)' : 'rgba(112,38,52,0.9)';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(32 + Math.cos(a) * 30, 32 + Math.sin(a) * 30);
    g.lineTo(32 + Math.cos(a) * 13, 32 + Math.sin(a) * 13);
    g.stroke();
  }
  g.strokeStyle = 'rgba(214,140,140,0.7)';
  g.lineWidth = 3;
  g.beginPath(); g.arc(32, 32, 22, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(18,6,10,0.9)';
  g.beginPath(); g.arc(32, 32, 11, 0, Math.PI * 2); g.fill();
  return c;
}

function gulletToothRidge(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  // gum ridge with curved, uneven fangs — a jaw, not a door trim
  g.fillStyle = '#8a3c48';
  g.beginPath();
  g.moveTo(0, 6);
  g.quadraticCurveTo(32, 22, 64, 6);
  g.lineTo(64, 0); g.lineTo(0, 0);
  g.closePath(); g.fill();
  for (let i = 0; i < 7; i++) {
    const x = 5 + i * 9, h = 14 + (i % 3) * 7;
    g.fillStyle = i % 2 ? '#e2d8b4' : '#cfc196';
    g.beginPath();
    g.moveTo(x - 4, 10);
    g.quadraticCurveTo(x - 2, 10 + h, x, 12 + h);
    g.quadraticCurveTo(x + 2, 10 + h, x + 4, 10);
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(120,70,60,0.35)';
    g.fillRect(x - 4, 10, 2, h * 0.6);
  }
  return c;
}

function gulletDrip(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  const rng = seed('gullet', 'drip');
  for (let i = 0; i < 5; i++) {
    const x = 8 + i * 12 + rng() * 4, len = 22 + rng() * 30;
    g.strokeStyle = 'rgba(198,214,96,0.75)';
    g.lineWidth = 2 + rng() * 2;
    g.beginPath();
    g.moveTo(x, 0);
    g.quadraticCurveTo(x + rng() * 5 - 2.5, len * 0.6, x, len);
    g.stroke();
    g.fillStyle = 'rgba(220,232,130,0.85)';
    g.beginPath(); g.ellipse(x, len + 3, 2.6, 4, 0, 0, Math.PI * 2); g.fill();
    if (rng() > 0.5) {
      g.beginPath(); g.arc(x + rng() * 4 - 2, len + 14 + rng() * 8, 1.6, 0, Math.PI * 2); g.fill();
    }
  }
  return c;
}

// ================================================================ 3. CATACOMBS
// bone-inlaid stone, ossuary niches, soot candles, burial glyphs

function catacombsWall(): HTMLCanvasElement {
  const { c, g } = canvas(128);
  const rng = seed('catacombs', 'wall');
  g.fillStyle = '#231f1c';
  g.fillRect(0, 0, 128, 128);
  // pale ashlar courses, 32 tall
  for (let y = 0; y < 128; y += 32) {
    const off = (y / 32) % 2 ? 21 : 0;
    for (let x = -42 + off; x < 128; x += 42) {
      const sh = 0.84 + rng() * 0.3;
      g.fillStyle = `rgb(${96 * sh | 0},${90 * sh | 0},${78 * sh | 0})`;
      g.fillRect(x + 2, y + 2, 38, 28);
      g.fillStyle = 'rgba(255,246,220,0.08)';
      g.fillRect(x + 2, y + 2, 38, 2);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(x + 2, y + 27, 38, 3);
    }
  }
  // two ossuary niches per tile: dark recess packed with femur ends and a skull
  for (const nx of [16, 80]) {
    g.fillStyle = '#0e0c0b';
    g.fillRect(nx, 38, 32, 52);
    g.beginPath(); g.arc(nx + 16, 38, 16, Math.PI, 0); g.fill();
    g.strokeStyle = '#6d6455';
    g.lineWidth = 2;
    g.strokeRect(nx, 38, 32, 52);
    for (let row = 0; row < 3; row++) {
      for (let k = 0; k < 4; k++) {
        const bx = nx + 4 + k * 7, by = 66 + row * 8;
        g.fillStyle = row % 2 ? '#cabf9e' : '#b3a888';
        g.beginPath(); g.arc(bx, by, 3, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(30,24,18,0.6)';
        g.beginPath(); g.arc(bx, by, 1.1, 0, Math.PI * 2); g.fill();
      }
    }
    // skull seated in the arch
    g.fillStyle = '#d3c7a4';
    g.beginPath(); g.ellipse(nx + 16, 48, 9, 10, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0d0b09';
    g.beginPath(); g.arc(nx + 12, 46, 2.6, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(nx + 20, 46, 2.6, 0, Math.PI * 2); g.fill();
    g.fillRect(nx + 14, 54, 5, 4);
    // soot plume from the candle ledge below
    const soot = g.createLinearGradient(0, 38, 0, 6);
    soot.addColorStop(0, 'rgba(12,10,9,0.6)');
    soot.addColorStop(1, 'rgba(12,10,9,0)');
    g.fillStyle = soot;
    g.fillRect(nx + 6, 6, 20, 32);
    g.fillStyle = '#e8dcb2';
    g.fillRect(nx + 13, 92, 6, 8);
    g.fillStyle = 'rgba(255,190,90,0.8)';
    g.beginPath(); g.ellipse(nx + 16, 90, 2, 4, 0, 0, Math.PI * 2); g.fill();
  }
  // burial glyphs carved into the lower course
  g.fillStyle = 'rgba(24,20,16,0.75)';
  for (let x = 4; x < 124; x += 10) {
    g.fillRect(x, 106, 2, 6 + (x % 3) * 3);
    if (x % 20 === 4) g.fillRect(x - 2, 116, 7, 2);
  }
  noise(g, 128, rng, 950, 0.08);
  return c;
}

function catacombsFloor(): HTMLCanvasElement {
  const { c, g } = canvas(128);
  const rng = seed('catacombs', 'floor');
  g.fillStyle = '#1a1815';
  g.fillRect(0, 0, 128, 128);
  // grave slabs with incised borders and glyph lines
  for (let y = 0; y < 128; y += 64) {
    for (let x = 0; x < 128; x += 64) {
      const sh = 0.85 + rng() * 0.25;
      g.fillStyle = `rgb(${74 * sh | 0},${70 * sh | 0},${60 * sh | 0})`;
      g.fillRect(x + 3, y + 3, 58, 58);
      g.strokeStyle = 'rgba(20,16,12,0.7)';
      g.lineWidth = 2;
      g.strokeRect(x + 8, y + 8, 48, 48);
      g.fillStyle = 'rgba(22,18,14,0.6)';
      for (let k = 0; k < 4; k++) g.fillRect(x + 14, y + 18 + k * 8, 20 + (k % 3) * 10, 2);
      g.fillStyle = 'rgba(206,196,166,0.35)';
      g.fillRect(x + 44, y + 16, 3, 18);
      g.fillRect(x + 39, y + 21, 13, 3);
    }
  }
  // bone dust and wax spatter
  speckle(g, 128, rng, 70, 'rgba(198,188,158,0.22)', 0.8, 2.4);
  speckle(g, 128, rng, 12, 'rgba(226,214,170,0.4)', 1.5, 4);
  noise(g, 128, rng, 900, 0.08);
  return c;
}

function catacombsCeiling(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  const rng = seed('catacombs', 'ceil');
  g.fillStyle = '#191713';
  g.fillRect(0, 0, 64, 64);
  // vault ribs crossing the bay
  g.strokeStyle = '#423d33';
  g.lineWidth = 5;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 64); g.moveTo(64, 0); g.lineTo(0, 64); g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.5)';
  g.lineWidth = 1.5;
  g.stroke();
  const soot = g.createRadialGradient(32, 32, 2, 32, 32, 26);
  soot.addColorStop(0, 'rgba(0,0,0,0.55)');
  soot.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = soot;
  g.fillRect(0, 0, 64, 64);
  noise(g, 64, rng, 420, 0.08);
  return c;
}

function catacombsDoor(): HTMLCanvasElement {
  const { c, g } = canvas(128);
  const rng = seed('catacombs', 'door');
  g.fillStyle = '#191612';
  g.fillRect(0, 0, 128, 128);
  // stone arch jambs
  g.fillStyle = '#5c5545';
  g.fillRect(0, 0, 20, 128); g.fillRect(108, 0, 20, 128);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (let y = 0; y < 128; y += 16) { g.fillRect(0, y, 20, 2); g.fillRect(108, y, 20, 2); }
  // skulls stacked along the arch
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI + (Math.PI * i) / 8;
    const x = 64 + Math.cos(a) * 48, y = 40 + Math.sin(a) * 30;
    g.fillStyle = i % 2 ? '#d6caa6' : '#bcb08e';
    g.beginPath(); g.ellipse(x, y, 8, 9, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0d0b09';
    g.beginPath(); g.arc(x - 3, y - 1, 2.2, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(x + 3, y - 1, 2.2, 0, Math.PI * 2); g.fill();
    g.fillRect(x - 2, y + 4, 4, 3);
  }
  // iron grille over the crypt dark
  g.fillStyle = '#0a0907';
  g.fillRect(22, 46, 84, 82);
  g.fillStyle = '#4a4136';
  for (let x = 26; x < 106; x += 12) g.fillRect(x, 46, 5, 82);
  for (const y of [62, 96]) g.fillRect(22, y, 84, 5);
  // bone crossbar latch
  g.fillStyle = '#ded2ac';
  g.fillRect(38, 84, 52, 7);
  g.beginPath(); g.arc(38, 87, 6, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(90, 87, 6, 0, Math.PI * 2); g.fill();
  // candle wax running down the jambs
  for (let i = 0; i < 6; i++) {
    const x = rng() > 0.5 ? 4 + rng() * 12 : 110 + rng() * 12;
    g.fillStyle = 'rgba(230,220,180,0.5)';
    g.fillRect(x, rng() * 60, 3, 12 + rng() * 26);
  }
  noise(g, 128, rng, 620, 0.08);
  return c;
}

function catacombsStackedSkulls(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  const draw = (x: number, y: number, r: number): void => {
    g.fillStyle = '#d3c7a4';
    g.beginPath(); g.ellipse(x, y, r, r * 1.05, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#100e0b';
    g.beginPath(); g.ellipse(x - r * 0.38, y - r * 0.1, r * 0.26, r * 0.32, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(x + r * 0.38, y - r * 0.1, r * 0.26, r * 0.32, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#b8ac8b';
    g.fillRect(x - r * 0.55, y + r * 0.6, r * 1.1, r * 0.5);
    g.fillStyle = '#100e0b';
    for (let k = -2; k <= 2; k++) g.fillRect(x + k * r * 0.24, y + r * 0.6, 1.5, r * 0.5);
  };
  draw(18, 44, 11); draw(44, 44, 11); draw(31, 20, 12);
  return c;
}

function catacombsEpitaph(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  // headstone tablet with carved glyph rows
  g.fillStyle = '#6d6555';
  g.beginPath();
  g.moveTo(10, 60); g.lineTo(10, 20);
  g.arc(32, 20, 22, Math.PI, 0);
  g.lineTo(54, 60);
  g.closePath(); g.fill();
  g.strokeStyle = '#3a352b';
  g.lineWidth = 2;
  g.stroke();
  g.fillStyle = 'rgba(22,18,14,0.8)';
  for (let k = 0; k < 5; k++) g.fillRect(16, 26 + k * 7, 32 - (k % 2) * 9, 3);
  g.fillStyle = 'rgba(220,210,180,0.5)';
  g.fillRect(30, 8, 4, 12); g.fillRect(26, 12, 12, 4);
  return c;
}

function catacombsBoneCross(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  const femur = (x1: number, y1: number, x2: number, y2: number): void => {
    g.strokeStyle = '#ded2ac';
    g.lineWidth = 7;
    g.lineCap = 'round';
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    g.fillStyle = '#efe4c2';
    for (const [ex, ey] of [[x1, y1], [x2, y2]] as const) {
      g.beginPath(); g.arc(ex - 3, ey, 4.5, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(ex + 3, ey, 4.5, 0, Math.PI * 2); g.fill();
    }
  };
  femur(12, 12, 52, 52);
  femur(52, 12, 12, 52);
  g.strokeStyle = 'rgba(60,52,40,0.5)';
  g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(14, 14); g.lineTo(50, 50); g.stroke();
  return c;
}

// ================================================================ 4. PIT
// rust gantry walls, open dirt floor, sick ochre overcast sky

function pitWall(): HTMLCanvasElement {
  const { c, g } = canvas(128);
  const rng = seed('pit', 'wall');
  g.fillStyle = '#4a3524';
  g.fillRect(0, 0, 128, 128);
  // corrugated sheet, period 8
  for (let x = 0; x < 128; x += 8) {
    const cg = g.createLinearGradient(x, 0, x + 8, 0);
    cg.addColorStop(0, '#5d4530');
    cg.addColorStop(0.45, '#6d523a');
    cg.addColorStop(1, '#33241a');
    g.fillStyle = cg;
    g.fillRect(x, 0, 8, 128);
  }
  // gantry I-beams at the tile edges (wrap into a continuous column run)
  for (const bx of [0, 64]) {
    g.fillStyle = '#4b3a2a';
    g.fillRect(bx - 7, 0, 14, 128);
    g.fillStyle = '#63503a';
    g.fillRect(bx - 3, 0, 6, 128);
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(bx + 4, 0, 3, 128);
    for (let y = 8; y < 128; y += 20) rivet(g, bx, y, 2.4, '#8b7350', '#161009');
  }
  // bolted flange band
  g.fillStyle = '#3a2b1e';
  g.fillRect(0, 92, 128, 14);
  g.fillStyle = 'rgba(0,0,0,0.4)';
  g.fillRect(0, 104, 128, 2);
  for (let x = 8; x < 128; x += 16) rivet(g, x, 99, 2.6, '#9a8058', '#161009');
  // rust bleed
  wrapDraw(g, 128, (gg) => {
    const r2 = seed('pit', 'rust');
    for (let i = 0; i < 16; i++) {
      const x = r2() * 128;
      gg.strokeStyle = `rgba(${150 + r2() * 60 | 0},${74 + r2() * 30 | 0},22,${0.16 + r2() * 0.3})`;
      gg.lineWidth = 2 + r2() * 5;
      gg.beginPath();
      gg.moveTo(x, r2() * 50);
      gg.lineTo(x + r2() * 6 - 3, 60 + r2() * 70);
      gg.stroke();
    }
  });
  speckle(g, 128, rng, 60, 'rgba(30,20,12,0.4)', 1, 4);
  noise(g, 128, rng, 1000, 0.08);
  return c;
}

function pitFloor(): HTMLCanvasElement {
  const { c, g } = canvas(128);
  const rng = seed('pit', 'floor');
  g.fillStyle = '#6b5730';
  g.fillRect(0, 0, 128, 128);
  // packed ochre dirt, graded in bands
  for (let y = 0; y < 128; y += 4) {
    g.fillStyle = `rgba(${90 + rng() * 40 | 0},${74 + rng() * 30 | 0},${38 + rng() * 20 | 0},0.35)`;
    g.fillRect(0, y, 128, 4);
  }
  // drag ruts running the full width so they tile
  for (const ry of [30, 40, 92, 102]) {
    g.fillStyle = 'rgba(40,30,16,0.45)';
    g.fillRect(0, ry, 128, 5);
    g.fillStyle = 'rgba(190,164,100,0.16)';
    g.fillRect(0, ry - 2, 128, 2);
  }
  // sunken grating strip
  g.fillStyle = '#2c2318';
  g.fillRect(0, 58, 128, 16);
  g.fillStyle = '#4c3f2a';
  for (let x = 2; x < 128; x += 9) g.fillRect(x, 58, 5, 16);
  // gravel and rust-water pooling
  speckle(g, 128, rng, 140, 'rgba(48,38,22,0.55)', 0.8, 3);
  speckle(g, 128, rng, 40, 'rgba(206,182,120,0.3)', 0.8, 2.2);
  for (let i = 0; i < 5; i++) {
    const x = rng() * 128, y = rng() * 128;
    g.fillStyle = 'rgba(120,70,26,0.28)';
    g.beginPath(); g.ellipse(x, y, 6 + rng() * 12, 4 + rng() * 7, rng() * 3, 0, Math.PI * 2); g.fill();
  }
  noise(g, 128, rng, 1200, 0.09);
  return c;
}

function pitCeiling(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  const rng = seed('pit', 'ceil');
  // open gantry mesh with pit daylight leaking through
  g.fillStyle = 'rgba(150,132,74,0.55)';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#3a2c1c';
  for (let x = 0; x < 64; x += 16) g.fillRect(x, 0, 6, 64);
  for (let y = 0; y < 64; y += 16) g.fillRect(0, y, 64, 6);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (let x = 0; x < 64; x += 16) g.fillRect(x + 4, 0, 2, 64);
  for (let x = 8; x < 64; x += 16) for (let y = 8; y < 64; y += 16) rivet(g, x, y, 1.8, '#7c6540', '#171008');
  noise(g, 64, rng, 380, 0.08);
  return c;
}

function pitSky(): HTMLCanvasElement {
  const { c, g } = canvas(512);
  const rng = seed('pit', 'sky');
  // sick ochre overcast: no stars, no blue — a lid of dust
  const grd = g.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0, '#3b2f16');
  grd.addColorStop(0.35, '#6d5a24');
  grd.addColorStop(0.62, '#a98d3a');
  grd.addColorStop(0.82, '#c4a854');
  grd.addColorStop(1, '#7a6530');
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 512);
  // smeared cloud decks, wrapped in x
  for (let i = 0; i < 40; i++) {
    const x = rng() * 512, y = 60 + rng() * 340, rx = 60 + rng() * 150, ry = 12 + rng() * 30;
    wrapX(g, 512, (gg) => {
      const cg = gg.createRadialGradient(x, y, 0, x, y, rx);
      const bright = rng() > 0.5;
      cg.addColorStop(0, bright ? 'rgba(226,204,132,0.20)' : 'rgba(58,44,18,0.22)');
      cg.addColorStop(1, 'rgba(0,0,0,0)');
      gg.fillStyle = cg;
      gg.beginPath(); gg.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); gg.fill();
    });
  }
  // dim smothered sun
  const sun = g.createRadialGradient(150, 200, 4, 150, 200, 120);
  sun.addColorStop(0, 'rgba(255,236,168,0.55)');
  sun.addColorStop(0.25, 'rgba(226,190,96,0.22)');
  sun.addColorStop(1, 'rgba(180,150,60,0)');
  g.fillStyle = sun;
  g.fillRect(30, 80, 240, 240);
  // airborne grit
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(60,48,22,${0.05 + rng() * 0.18})`;
    g.fillRect(rng() * 512, rng() * 512, 1 + (rng() * 2 | 0), 1);
  }
  return c;
}

function pitDoor(): HTMLCanvasElement {
  const { c, g } = canvas(128);
  const rng = seed('pit', 'door');
  g.fillStyle = '#2e2318';
  g.fillRect(0, 0, 128, 128);
  // roll-up cargo shutter: horizontal slats with a rolled highlight each
  for (let y = 18; y < 128; y += 12) {
    const sg = g.createLinearGradient(0, y, 0, y + 12);
    sg.addColorStop(0, '#7a6141');
    sg.addColorStop(0.35, '#5c482f');
    sg.addColorStop(1, '#33271a');
    g.fillStyle = sg;
    g.fillRect(6, y, 116, 11);
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(6, y + 11, 116, 1);
  }
  // winch housing across the head
  g.fillStyle = '#463525';
  g.fillRect(0, 0, 128, 18);
  g.fillStyle = '#8a3c1c';
  g.fillRect(46, 3, 36, 12);
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(46, 11, 36, 4);
  for (let x = 6; x < 128; x += 14) rivet(g, x, 9, 2.4, '#9b8158', '#171008');
  // side rails + drive chain
  g.fillStyle = '#392c1e';
  g.fillRect(0, 18, 8, 110); g.fillRect(120, 18, 8, 110);
  g.fillStyle = '#6f5c3c';
  for (let y = 22; y < 128; y += 9) {
    g.beginPath(); g.ellipse(124, y, 2.6, 4, 0, 0, Math.PI * 2); g.fill();
  }
  // rust eating the lower slats
  wrapX(g, 128, (gg) => {
    for (let i = 0; i < 14; i++) {
      const x = rng() * 128, y = 70 + rng() * 58;
      gg.fillStyle = `rgba(${160 + rng() * 50 | 0},${72 + rng() * 26 | 0},20,${0.18 + rng() * 0.28})`;
      gg.beginPath(); gg.ellipse(x, y, 4 + rng() * 12, 3 + rng() * 7, rng() * 3, 0, Math.PI * 2); gg.fill();
    }
  });
  noise(g, 128, rng, 620, 0.08);
  return c;
}

function pitCraneGlyph(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  g.strokeStyle = '#e0b24a';
  g.lineWidth = 3;
  // lattice jib + mast
  g.beginPath(); g.moveTo(10, 58); g.lineTo(10, 10); g.lineTo(54, 10); g.stroke();
  g.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.moveTo(12 + i * 9, 10); g.lineTo(21 + i * 9, 16); g.stroke();
  }
  g.beginPath(); g.moveTo(12, 16); g.lineTo(54, 16); g.stroke();
  // hoist line and hook
  g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(48, 16); g.lineTo(48, 38); g.stroke();
  g.beginPath(); g.arc(44, 42, 6, -Math.PI / 3, Math.PI); g.stroke();
  g.fillStyle = '#e0b24a';
  g.fillRect(4, 56, 22, 5);
  return c;
}

function pitFallHazard(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  // square sign: figure tipping off a broken ledge
  g.fillStyle = 'rgba(20,16,8,0.8)';
  g.fillRect(4, 4, 56, 56);
  g.strokeStyle = '#e8c23a';
  g.lineWidth = 3;
  g.strokeRect(4, 4, 56, 56);
  g.fillStyle = '#e8c23a';
  g.fillRect(8, 44, 22, 5);
  g.beginPath(); g.moveTo(30, 44); g.lineTo(40, 49); g.lineTo(30, 49); g.closePath(); g.fill();
  // tipping figure
  g.beginPath(); g.arc(36, 20, 5, 0, Math.PI * 2); g.fill();
  g.save();
  g.translate(38, 28); g.rotate(0.5);
  g.fillRect(-3, 0, 6, 14);
  g.fillRect(-12, 2, 10, 3);
  g.fillRect(-2, 14, 4, 10);
  g.restore();
  // fall arrow
  g.beginPath(); g.moveTo(50, 30); g.lineTo(50, 48); g.lineTo(46, 44); g.moveTo(50, 48); g.lineTo(54, 44);
  g.strokeStyle = '#e8c23a'; g.lineWidth = 2.5; g.stroke();
  return c;
}

function pitRimRust(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  const rng = seed('pit', 'rimrust');
  // corroded lip of a gantry rim: jagged eaten edge with exposed bolts
  g.fillStyle = '#7a4a18';
  g.beginPath();
  g.moveTo(0, 6);
  for (let x = 0; x <= 64; x += 6) g.lineTo(x, 6 + rng() * 12);
  g.lineTo(64, 40);
  for (let x = 64; x >= 0; x -= 6) g.lineTo(x, 34 + rng() * 14);
  g.closePath(); g.fill();
  g.fillStyle = 'rgba(190,96,24,0.55)';
  for (let i = 0; i < 26; i++) {
    g.beginPath(); g.arc(rng() * 64, 8 + rng() * 34, 1 + rng() * 4, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = 'rgba(30,18,8,0.6)';
  for (let i = 0; i < 14; i++) g.fillRect(rng() * 60, 10 + rng() * 28, 2 + rng() * 6, 2);
  for (const bx of [12, 32, 52]) rivet(g, bx, 24, 3, '#b08b52', '#1c1108');
  return c;
}

// ================================================================ 5. SPIRE
// cold grey composite, copper traces, elevation marks, antenna lattice

function spireWall(): HTMLCanvasElement {
  const { c, g } = canvas(128);
  const rng = seed('spire', 'wall');
  g.fillStyle = '#2e343a';
  g.fillRect(0, 0, 128, 128);
  // chamfered composite panels
  for (let y = 0; y < 128; y += 64) {
    for (let x = 0; x < 128; x += 64) {
      const pg = g.createLinearGradient(x, y, x, y + 64);
      pg.addColorStop(0, '#5a636b');
      pg.addColorStop(0.6, '#474f57');
      pg.addColorStop(1, '#39424a');
      g.fillStyle = pg;
      g.beginPath();
      g.moveTo(x + 9, y + 3); g.lineTo(x + 55, y + 3); g.lineTo(x + 61, y + 9);
      g.lineTo(x + 61, y + 55); g.lineTo(x + 55, y + 61); g.lineTo(x + 9, y + 61);
      g.lineTo(x + 3, y + 55); g.lineTo(x + 3, y + 9);
      g.closePath(); g.fill();
      g.strokeStyle = '#1d2227';
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = 'rgba(226,238,248,0.10)';
      g.fillRect(x + 9, y + 4, 46, 2);
    }
  }
  // copper traces — warm metal, never neon
  wrapDraw(g, 128, (gg) => {
    const r2 = seed('spire', 'trace');
    for (let i = 0; i < 8; i++) {
      let x = 8 + r2() * 112, y = 8 + r2() * 112;
      gg.strokeStyle = '#c07a3c';
      gg.lineWidth = 1.6;
      gg.beginPath(); gg.moveTo(x, y);
      for (let s = 0; s < 4; s++) {
        if (r2() > 0.5) x += (r2() > 0.5 ? 1 : -1) * (8 + r2() * 22);
        else y += (r2() > 0.5 ? 1 : -1) * (8 + r2() * 22);
        gg.lineTo(x, y);
      }
      gg.stroke();
      gg.fillStyle = '#e0a05a';
      gg.beginPath(); gg.arc(x, y, 2.4, 0, Math.PI * 2); gg.fill();
    }
  });
  // elevation tick ladder up the seam
  g.fillStyle = '#9fb0bd';
  for (let y = 4; y < 128; y += 8) g.fillRect(62, y, y % 32 === 4 ? 8 : 4, 2);
  g.fillStyle = '#cddae4';
  segDigit(g, 7, 70, 8, 9, 15, 2);
  // antenna lattice recess
  g.fillStyle = '#12171b';
  g.fillRect(84, 76, 38, 44);
  g.strokeStyle = '#8b98a3';
  g.lineWidth = 1.4;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.moveTo(84, 76 + i * 11); g.lineTo(122, 87 + i * 11);
    g.moveTo(122, 76 + i * 11); g.lineTo(84, 87 + i * 11);
    g.stroke();
  }
  g.strokeStyle = '#aab7c2';
  g.lineWidth = 2;
  g.strokeRect(84, 76, 38, 44);
  noise(g, 128, rng, 700, 0.05);
  return c;
}

function spireFloor(): HTMLCanvasElement {
  const { c, g } = canvas(128);
  const rng = seed('spire', 'floor');
  g.fillStyle = '#333b42';
  g.fillRect(0, 0, 128, 128);
  // perforated deck plate
  for (let y = 4; y < 128; y += 8) {
    for (let x = 4 + ((y / 8) % 2 ? 4 : 0); x < 128; x += 8) {
      g.fillStyle = 'rgba(12,16,20,0.65)';
      g.beginPath(); g.arc(x, y, 1.8, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(190,206,220,0.10)';
      g.beginPath(); g.arc(x - 0.6, y - 0.6, 0.9, 0, Math.PI * 2); g.fill();
    }
  }
  // copper inlay seams on the 64 grid
  for (const p of [0, 64]) {
    g.fillStyle = '#1a2026';
    g.fillRect(p, 0, 5, 128); g.fillRect(0, p, 128, 5);
    g.fillStyle = '#b3743a';
    g.fillRect(p + 2, 0, 1.5, 128); g.fillRect(0, p + 2, 128, 1.5);
  }
  // anti-slip tread strips
  for (const ty of [26, 90]) {
    g.fillStyle = 'rgba(150,166,178,0.18)';
    g.fillRect(0, ty, 128, 7);
    g.fillStyle = 'rgba(10,14,18,0.5)';
    for (let x = 0; x < 128; x += 6) g.fillRect(x, ty, 3, 7);
  }
  noise(g, 128, rng, 650, 0.05);
  return c;
}

function spireCeiling(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  const rng = seed('spire', 'ceil');
  g.fillStyle = '#1b2126';
  g.fillRect(0, 0, 64, 64);
  // truss lattice with a cold light strip
  g.strokeStyle = '#59656f';
  g.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.moveTo(i * 16, 0); g.lineTo(i * 16 + 16, 64);
    g.moveTo(i * 16 + 16, 0); g.lineTo(i * 16, 64);
    g.stroke();
  }
  const strip = g.createLinearGradient(0, 26, 0, 38);
  strip.addColorStop(0, 'rgba(206,230,255,0.10)');
  strip.addColorStop(0.5, 'rgba(226,242,255,0.55)');
  strip.addColorStop(1, 'rgba(206,230,255,0.10)');
  g.fillStyle = strip;
  g.fillRect(0, 26, 64, 12);
  g.fillStyle = '#39424a';
  g.fillRect(0, 24, 64, 2); g.fillRect(0, 38, 64, 2);
  noise(g, 64, rng, 300, 0.05);
  return c;
}

function spireDoor(): HTMLCanvasElement {
  const { c, g } = canvas(128);
  const rng = seed('spire', 'door');
  g.fillStyle = '#20262c';
  g.fillRect(0, 0, 128, 128);
  // two chamfered leaves meeting on a centre seam
  for (const lx of [2, 66]) {
    const pg = g.createLinearGradient(lx, 0, lx + 60, 0);
    pg.addColorStop(0, '#4c555d');
    pg.addColorStop(0.5, '#616b74');
    pg.addColorStop(1, '#39424a');
    g.fillStyle = pg;
    g.beginPath();
    g.moveTo(lx + 8, 2); g.lineTo(lx + 60, 2); g.lineTo(lx + 60, 126);
    g.lineTo(lx + 8, 126); g.lineTo(lx, 118); g.lineTo(lx, 10);
    g.closePath(); g.fill();
    g.strokeStyle = '#161b20';
    g.lineWidth = 2;
    g.stroke();
  }
  g.fillStyle = '#0e1216';
  g.fillRect(62, 0, 4, 128);
  // copper trace jumping the seam
  g.strokeStyle = '#c07a3c';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(20, 96); g.lineTo(52, 96); g.lineTo(52, 72); g.lineTo(76, 72); g.lineTo(76, 100); g.lineTo(108, 100);
  g.stroke();
  g.fillStyle = '#e0a05a';
  for (const [px, py] of [[20, 96], [108, 100], [64, 72]] as const) {
    g.beginPath(); g.arc(px, py, 3, 0, Math.PI * 2); g.fill();
  }
  // elevation readout window
  g.fillStyle = '#0a1014';
  g.fillRect(34, 24, 60, 30);
  g.strokeStyle = '#8b98a3';
  g.lineWidth = 2;
  g.strokeRect(34, 24, 60, 30);
  g.fillStyle = '#9ad8ff';
  segDigit(g, 1, 42, 30, 12, 18, 3);
  segDigit(g, 8, 60, 30, 12, 18, 3);
  segDigit(g, 3, 78, 30, 12, 18, 3);
  // mag clamps top and bottom
  for (const cy of [8, 116]) {
    g.fillStyle = '#788692';
    g.fillRect(50, cy, 28, 6);
    g.fillStyle = '#c07a3c';
    g.fillRect(56, cy + 2, 16, 2);
  }
  noise(g, 128, rng, 500, 0.05);
  return c;
}

function spireFloorNumeral(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  // level plate: big seven-segment 7 on a bracket
  g.fillStyle = 'rgba(28,34,40,0.9)';
  g.fillRect(8, 10, 48, 44);
  g.strokeStyle = '#c07a3c';
  g.lineWidth = 2.5;
  g.strokeRect(8, 10, 48, 44);
  g.fillStyle = '#dfeaf4';
  segDigit(g, 7, 22, 16, 22, 32, 5);
  g.fillStyle = '#c07a3c';
  g.fillRect(14, 50, 36, 2);
  return c;
}

function spireVisorStripe(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  // sensor visor: copper bezel, cold slit
  g.fillStyle = '#39424a';
  g.beginPath();
  g.moveTo(2, 26); g.lineTo(62, 22); g.lineTo(62, 42); g.lineTo(2, 38);
  g.closePath(); g.fill();
  const slit = g.createLinearGradient(0, 28, 0, 38);
  slit.addColorStop(0, 'rgba(180,220,255,0.35)');
  slit.addColorStop(0.5, '#dff2ff');
  slit.addColorStop(1, 'rgba(120,170,220,0.3)');
  g.fillStyle = slit;
  g.fillRect(7, 28, 50, 8);
  g.fillStyle = '#c07a3c';
  g.fillRect(2, 22, 4, 18); g.fillRect(58, 20, 4, 20);
  g.fillStyle = 'rgba(20,28,34,0.7)';
  for (let x = 10; x < 58; x += 8) g.fillRect(x, 28, 2, 8);
  return c;
}

function spireDish(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  // parabolic dish on a strut
  g.fillStyle = '#8d99a4';
  g.beginPath(); g.ellipse(30, 26, 22, 20, -0.3, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#5b666f';
  g.beginPath(); g.ellipse(30, 26, 15, 13, -0.3, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#c07a3c';
  g.lineWidth = 2;
  g.beginPath(); g.ellipse(30, 26, 22, 20, -0.3, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(30, 26); g.lineTo(50, 12); g.stroke();
  g.fillStyle = '#e0a05a';
  g.beginPath(); g.arc(50, 12, 3.5, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#6f7a85';
  g.fillRect(27, 44, 6, 18);
  g.fillRect(18, 60, 24, 4);
  g.strokeStyle = '#6f7a85';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(30, 44); g.lineTo(18, 60); g.moveTo(30, 44); g.lineTo(42, 60); g.stroke();
  return c;
}

// ================================================================ 6. WARD
// clinical siege: cracked tile, quarantine yellow, barred cells

function wardWall(): HTMLCanvasElement {
  const { c, g } = canvas(128);
  const rng = seed('ward', 'wall');
  g.fillStyle = '#7d8a80';
  g.fillRect(0, 0, 128, 128);
  // 16px clinical tile with grout
  for (let y = 0; y < 128; y += 16) {
    for (let x = 0; x < 128; x += 16) {
      const sh = 0.9 + rng() * 0.16;
      g.fillStyle = `rgb(${188 * sh | 0},${202 * sh | 0},${190 * sh | 0})`;
      g.fillRect(x + 1, y + 1, 14, 14);
      g.fillStyle = 'rgba(255,255,255,0.10)';
      g.fillRect(x + 1, y + 1, 14, 2);
      if (rng() > 0.78) {
        g.fillStyle = `rgba(${120 + rng() * 40 | 0},${110 + rng() * 30 | 0},70,${0.12 + rng() * 0.2})`;
        g.fillRect(x + 1, y + 1, 14, 14);
      }
    }
  }
  // mould creeping in the grout
  g.fillStyle = 'rgba(58,70,48,0.35)';
  for (let i = 0; i < 128; i += 16) { g.fillRect(i - 1, 0, 3, 128); g.fillRect(0, i - 1, 128, 3); }
  // cracks running across tiles
  wrapDraw(g, 128, (gg) => {
    const r2 = seed('ward', 'crack');
    for (let i = 0; i < 8; i++) {
      let x = r2() * 128, y = r2() * 128;
      gg.strokeStyle = 'rgba(30,36,32,0.65)';
      gg.lineWidth = 1.2;
      gg.beginPath(); gg.moveTo(x, y);
      for (let s = 0; s < 5; s++) { x += r2() * 26 - 13; y += r2() * 26 - 13; gg.lineTo(x, y); }
      gg.stroke();
    }
  });
  // barred cell window into the dark
  g.fillStyle = '#0d1210';
  g.fillRect(20, 14, 88, 44);
  g.strokeStyle = '#5c6660';
  g.lineWidth = 4;
  g.strokeRect(20, 14, 88, 44);
  g.fillStyle = '#8e9a92';
  for (let x = 26; x < 106; x += 11) g.fillRect(x, 14, 4, 44);
  g.fillStyle = 'rgba(0,0,0,0.5)';
  for (let x = 26; x < 106; x += 11) g.fillRect(x + 3, 14, 1.5, 44);
  // quarantine yellow band along the base
  g.fillStyle = '#d8b820';
  g.fillRect(0, 100, 128, 18);
  g.fillStyle = '#1a1a12';
  g.fillRect(0, 100, 128, 2); g.fillRect(0, 116, 128, 2);
  for (let x = 4; x < 128; x += 16) g.fillRect(x, 106, 8, 6);
  noise(g, 128, rng, 900, 0.06);
  return c;
}

function wardFloor(): HTMLCanvasElement {
  const { c, g } = canvas(128);
  const rng = seed('ward', 'floor');
  g.fillStyle = '#6f7a72';
  g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 32) {
    for (let x = 0; x < 128; x += 32) {
      const sh = 0.88 + rng() * 0.2;
      g.fillStyle = `rgb(${170 * sh | 0},${182 * sh | 0},${172 * sh | 0})`;
      g.fillRect(x + 2, y + 2, 28, 28);
    }
  }
  g.fillStyle = 'rgba(52,60,52,0.45)';
  for (let i = 0; i < 128; i += 32) { g.fillRect(i, 0, 3, 128); g.fillRect(0, i, 128, 3); }
  // containment line across the room
  g.fillStyle = '#d8b820';
  g.fillRect(0, 58, 128, 10);
  g.fillStyle = 'rgba(40,36,10,0.5)';
  g.fillRect(0, 58, 128, 2); g.fillRect(0, 66, 128, 2);
  // drain grate
  g.fillStyle = '#39423c';
  g.beginPath(); g.arc(96, 100, 12, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#10140f';
  for (let i = -10; i <= 10; i += 4) g.fillRect(86, 100 + i, 20, 2);
  // spill stains and crack web
  for (let i = 0; i < 8; i++) {
    const x = rng() * 128, y = rng() * 128;
    g.fillStyle = `rgba(${90 + rng() * 50 | 0},${76 + rng() * 30 | 0},50,0.2)`;
    g.beginPath(); g.ellipse(x, y, 6 + rng() * 14, 4 + rng() * 9, rng() * 3, 0, Math.PI * 2); g.fill();
  }
  wrapDraw(g, 128, (gg) => {
    const r2 = seed('ward', 'floorcrack');
    for (let i = 0; i < 6; i++) {
      let x = r2() * 128, y = r2() * 128;
      gg.strokeStyle = 'rgba(28,34,30,0.6)';
      gg.lineWidth = 1.3;
      gg.beginPath(); gg.moveTo(x, y);
      for (let s = 0; s < 4; s++) { x += r2() * 30 - 15; y += r2() * 30 - 15; gg.lineTo(x, y); }
      gg.stroke();
    }
  });
  noise(g, 128, rng, 850, 0.07);
  return c;
}

function wardCeiling(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  const rng = seed('ward', 'ceil');
  g.fillStyle = '#3d443f';
  g.fillRect(0, 0, 64, 64);
  // sagging acoustic panels
  for (let y = 0; y < 64; y += 32) {
    for (let x = 0; x < 64; x += 32) {
      g.fillStyle = '#78827a';
      g.fillRect(x + 2, y + 2, 28, 28);
      g.fillStyle = 'rgba(120,104,52,0.25)';
      g.beginPath(); g.ellipse(x + 16 + rng() * 6 - 3, y + 16, 8 + rng() * 5, 6 + rng() * 4, 0, 0, Math.PI * 2); g.fill();
      speckle(g, 64, rng, 6, 'rgba(40,46,40,0.25)', 0.6, 1.6);
    }
  }
  // one dead light panel
  g.fillStyle = 'rgba(226,236,214,0.5)';
  g.fillRect(36, 4, 24, 24);
  g.fillStyle = 'rgba(40,46,40,0.4)';
  for (let x = 36; x < 60; x += 5) g.fillRect(x, 4, 2, 24);
  noise(g, 64, rng, 340, 0.06);
  return c;
}

function wardDoor(): HTMLCanvasElement {
  const { c, g } = canvas(128);
  const rng = seed('ward', 'door');
  const pg = g.createLinearGradient(0, 0, 128, 0);
  pg.addColorStop(0, '#95a89c');
  pg.addColorStop(0.5, '#aebfb2');
  pg.addColorStop(1, '#7e9088');
  g.fillStyle = pg;
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#4d5a52';
  g.lineWidth = 4;
  g.strokeRect(2, 2, 124, 124);
  // wired-glass observation window
  g.fillStyle = '#1b2622';
  g.fillRect(30, 14, 68, 46);
  g.strokeStyle = '#5f6d64';
  g.lineWidth = 3;
  g.strokeRect(30, 14, 68, 46);
  g.strokeStyle = 'rgba(190,208,196,0.35)';
  g.lineWidth = 1;
  for (let x = 34; x < 98; x += 6) { g.beginPath(); g.moveTo(x, 14); g.lineTo(x, 60); g.stroke(); }
  for (let y = 18; y < 60; y += 6) { g.beginPath(); g.moveTo(30, y); g.lineTo(98, y); g.stroke(); }
  // quarantine strip + sealed hasp
  g.fillStyle = '#d8b820';
  g.fillRect(0, 66, 128, 16);
  g.fillStyle = '#1a1a12';
  g.fillRect(0, 66, 128, 2); g.fillRect(0, 80, 128, 2);
  for (let x = 6; x < 128; x += 18) g.fillRect(x, 70, 9, 8);
  g.fillStyle = '#4d5a52';
  g.fillRect(52, 88, 24, 14);
  g.fillStyle = '#2a332e';
  g.beginPath(); g.arc(64, 88, 7, Math.PI, 0); g.fill();
  g.fillStyle = '#8fa094';
  g.fillRect(60, 92, 8, 6);
  // kick plate and scuffs
  g.fillStyle = '#6f8078';
  g.fillRect(6, 108, 116, 16);
  for (let i = 0; i < 18; i++) {
    g.strokeStyle = `rgba(60,70,62,${0.2 + rng() * 0.3})`;
    g.lineWidth = 1 + rng();
    g.beginPath();
    const x = rng() * 120;
    g.moveTo(x, 108 + rng() * 14); g.lineTo(x + rng() * 14 - 7, 108 + rng() * 14); g.stroke();
  }
  noise(g, 128, rng, 600, 0.06);
  return c;
}

function wardBiohazard(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  g.fillStyle = '#d8b820';
  g.strokeStyle = '#171712';
  g.lineWidth = 2;
  // three trefoil rings
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
    const cx = 32 + Math.cos(a) * 15, cy = 34 + Math.sin(a) * 15;
    g.beginPath(); g.arc(cx, cy, 13, 0, Math.PI * 2); g.fill(); g.stroke();
    g.save();
    g.fillStyle = 'rgba(0,0,0,0)';
    g.restore();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.arc(cx, cy, 6.5, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'source-over';
  }
  g.fillStyle = '#171712';
  g.beginPath(); g.arc(32, 34, 7, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#d8b820';
  g.beginPath(); g.arc(32, 34, 4, 0, Math.PI * 2); g.fill();
  return c;
}

function wardCotStencil(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  // side-view cot: frame, mattress, wheels
  g.strokeStyle = '#cfe0d4';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(6, 34); g.lineTo(58, 34);
  g.moveTo(6, 34); g.lineTo(6, 20);
  g.moveTo(58, 34); g.lineTo(58, 26);
  g.stroke();
  g.fillStyle = '#cfe0d4';
  g.fillRect(8, 26, 48, 8);
  g.fillStyle = 'rgba(207,224,212,0.5)';
  g.fillRect(10, 20, 14, 7);
  g.strokeStyle = '#cfe0d4';
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(12, 34); g.lineTo(12, 48);
  g.moveTo(52, 34); g.lineTo(52, 48);
  g.stroke();
  g.beginPath(); g.arc(12, 52, 4, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(52, 52, 4, 0, Math.PI * 2); g.stroke();
  // rails
  g.lineWidth = 1.8;
  for (let x = 16; x < 50; x += 6) { g.beginPath(); g.moveTo(x, 20); g.lineTo(x, 26); g.stroke(); }
  return c;
}

function wardKeySigil(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  // warded key: circular bow, long shank, cut bit
  g.strokeStyle = '#e6d27a';
  g.lineWidth = 4;
  g.beginPath(); g.arc(18, 20, 10, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#e6d27a';
  g.fillRect(15, 28, 6, 28);
  g.fillRect(21, 42, 10, 5);
  g.fillRect(21, 50, 14, 5);
  // ward cuts
  g.fillStyle = 'rgba(30,26,10,0.7)';
  g.fillRect(15, 36, 6, 2);
  g.beginPath(); g.arc(18, 20, 4, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#e6d27a';
  g.fillRect(40, 14, 4, 12);
  g.fillRect(36, 12, 12, 4);
  return c;
}

// ================================================================ 7. SANCTUM
// inlaid gold on void, apse glow, seventh-gun motif

function sanctumWall(): HTMLCanvasElement {
  const { c, g } = canvas(128);
  const rng = seed('sanctum', 'wall');
  g.fillStyle = '#0a0910';
  g.fillRect(0, 0, 128, 128);
  // pointed arch bays, two per tile
  for (const bx of [0, 64]) {
    const void_ = g.createLinearGradient(0, 0, 0, 128);
    void_.addColorStop(0, '#14121c');
    void_.addColorStop(1, '#08070c');
    g.fillStyle = void_;
    g.fillRect(bx + 6, 10, 52, 112);
    g.strokeStyle = '#d9b45c';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(bx + 6, 122); g.lineTo(bx + 6, 44);
    g.lineTo(bx + 32, 10); g.lineTo(bx + 58, 44);
    g.lineTo(bx + 58, 122);
    g.stroke();
    // filigree flourishes inside the arch head
    g.strokeStyle = 'rgba(196,158,78,0.75)';
    g.lineWidth = 1.4;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.arc(bx + 32, 46 + i * 6, 14 - i * 4, Math.PI * 1.15, Math.PI * 1.85);
      g.stroke();
    }
    // small heptagram inlay at the bay centre
    g.strokeStyle = '#e8c877';
    g.lineWidth = 1.6;
    starPath(g, bx + 32, 84, 15, 7, 3);
    g.stroke();
  }
  // gold pinstripe borders on the tile edges
  g.fillStyle = '#d9b45c';
  g.fillRect(0, 0, 128, 2); g.fillRect(0, 126, 128, 2);
  g.fillStyle = 'rgba(217,180,92,0.35)';
  g.fillRect(0, 4, 128, 1); g.fillRect(0, 123, 128, 1);
  // gold dust caught in the void
  speckle(g, 128, rng, 40, 'rgba(226,190,110,0.18)', 0.6, 1.6);
  noise(g, 128, rng, 500, 0.05);
  return c;
}

function sanctumFloor(): HTMLCanvasElement {
  const { c, g } = canvas(128);
  const rng = seed('sanctum', 'floor');
  g.fillStyle = '#0c0b11';
  g.fillRect(0, 0, 128, 128);
  // black marble veined with gold
  wrapDraw(g, 128, (gg) => {
    const r2 = seed('sanctum', 'vein');
    for (let i = 0; i < 10; i++) {
      let x = r2() * 128, y = r2() * 128;
      gg.strokeStyle = `rgba(196,158,78,${0.14 + r2() * 0.2})`;
      gg.lineWidth = 0.8 + r2() * 1.4;
      gg.beginPath(); gg.moveTo(x, y);
      for (let s = 0; s < 5; s++) {
        const nx = x + r2() * 40 - 20, ny = y + r2() * 40 - 20;
        gg.quadraticCurveTo(x + 8, y - 8, nx, ny);
        x = nx; y = ny;
      }
      gg.stroke();
    }
  });
  // radiating gold rays from the tile centre into a heptagram inlay
  g.strokeStyle = 'rgba(217,180,92,0.35)';
  g.lineWidth = 1;
  for (let i = 0; i < 28; i++) {
    const a = (Math.PI * 2 * i) / 28;
    g.beginPath();
    g.moveTo(64 + Math.cos(a) * 22, 64 + Math.sin(a) * 22);
    g.lineTo(64 + Math.cos(a) * 58, 64 + Math.sin(a) * 58);
    g.stroke();
  }
  g.strokeStyle = '#d9b45c';
  g.lineWidth = 2;
  starPath(g, 64, 64, 30, 7, 3);
  g.stroke();
  g.beginPath(); g.arc(64, 64, 34, 0, Math.PI * 2); g.stroke();
  // border fillet so tiles read as one great pavement
  g.strokeStyle = 'rgba(217,180,92,0.5)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, 126, 126);
  speckle(g, 128, rng, 26, 'rgba(226,190,110,0.14)', 0.6, 1.8);
  noise(g, 128, rng, 500, 0.05);
  return c;
}

function sanctumCeiling(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  const rng = seed('sanctum', 'ceil');
  g.fillStyle = '#07060b';
  g.fillRect(0, 0, 64, 64);
  // apse glow
  const apse = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  apse.addColorStop(0, 'rgba(230,190,104,0.30)');
  apse.addColorStop(0.5, 'rgba(160,124,54,0.12)');
  apse.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = apse;
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(217,180,92,0.55)';
  g.lineWidth = 1.4;
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * 2 * i) / 8;
    g.beginPath();
    g.moveTo(32 + Math.cos(a) * 8, 32 + Math.sin(a) * 8);
    g.lineTo(32 + Math.cos(a) * 30, 32 + Math.sin(a) * 30);
    g.stroke();
  }
  speckle(g, 64, rng, 20, 'rgba(240,214,150,0.3)', 0.5, 1.3);
  noise(g, 64, rng, 260, 0.05);
  return c;
}

function sanctumDoor(): HTMLCanvasElement {
  const { c, g } = canvas(128);
  const rng = seed('sanctum', 'door');
  g.fillStyle = '#08070c';
  g.fillRect(0, 0, 128, 128);
  // apse glow bleeding around the leaf
  const glow = g.createRadialGradient(64, 70, 6, 64, 70, 78);
  glow.addColorStop(0, 'rgba(232,196,112,0.28)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, 128, 128);
  // pointed gold arch portal
  g.fillStyle = '#12101a';
  g.beginPath();
  g.moveTo(14, 126); g.lineTo(14, 50); g.lineTo(64, 6); g.lineTo(114, 50); g.lineTo(114, 126);
  g.closePath(); g.fill();
  g.strokeStyle = '#d9b45c';
  g.lineWidth = 4;
  g.stroke();
  // seven gold bars, each capped with a gem — the seventh gun's tally
  for (let i = 0; i < 7; i++) {
    const x = 22 + i * 13.5;
    g.fillStyle = i === 6 ? '#f0d189' : '#a8873f';
    g.fillRect(x, 62, 5, 58);
    g.fillStyle = i === 6 ? '#fff0c0' : '#d9b45c';
    g.beginPath(); g.arc(x + 2.5, 58, 4, 0, Math.PI * 2); g.fill();
  }
  // radiating rays under the arch head
  g.strokeStyle = 'rgba(217,180,92,0.5)';
  g.lineWidth = 1.4;
  for (let i = 0; i < 11; i++) {
    const a = Math.PI + (Math.PI * i) / 10;
    g.beginPath();
    g.moveTo(64 + Math.cos(a) * 12, 44 + Math.sin(a) * 12);
    g.lineTo(64 + Math.cos(a) * 34, 44 + Math.sin(a) * 34);
    g.stroke();
  }
  // keyhole sigil
  g.fillStyle = '#f2dda0';
  g.beginPath(); g.arc(64, 40, 7, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#08070c';
  g.beginPath(); g.arc(64, 39, 3, 0, Math.PI * 2); g.fill();
  g.fillRect(62.5, 39, 3, 8);
  speckle(g, 128, rng, 26, 'rgba(240,214,150,0.16)', 0.6, 1.6);
  noise(g, 128, rng, 420, 0.05);
  return c;
}

function sanctumHeptagram(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  g.strokeStyle = '#f0d189';
  g.lineWidth = 2.5;
  g.shadowColor = '#e8c877';
  g.shadowBlur = 6;
  starPath(g, 32, 32, 26, 7, 3);
  g.stroke();
  g.lineWidth = 1.6;
  g.beginPath(); g.arc(32, 32, 29, 0, Math.PI * 2); g.stroke();
  g.shadowBlur = 0;
  g.fillStyle = 'rgba(240,209,137,0.65)';
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 7;
    g.beginPath(); g.arc(32 + Math.cos(a) * 26, 32 + Math.sin(a) * 26, 2.2, 0, Math.PI * 2); g.fill();
  }
  return c;
}

function sanctumNaveSaintMark(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  // icon of a haloed figure, gold on nothing
  g.strokeStyle = '#d9b45c';
  g.lineWidth = 2;
  g.beginPath(); g.arc(32, 18, 11, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#c49e4e';
  g.beginPath(); g.arc(32, 20, 7, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#d9b45c';
  g.beginPath();
  g.moveTo(32, 28); g.lineTo(48, 46); g.lineTo(44, 58); g.lineTo(20, 58); g.lineTo(16, 46);
  g.closePath(); g.fill();
  g.fillStyle = '#0d0b12';
  g.fillRect(30, 36, 4, 18);
  g.fillRect(24, 42, 16, 4);
  g.strokeStyle = 'rgba(240,214,150,0.8)';
  g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(16, 46); g.lineTo(48, 46); g.stroke();
  return c;
}

function sanctumGunSeven(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  // gun-7: the seventh gun's silhouette with its numeral struck through it
  g.fillStyle = '#e8c877';
  g.fillRect(8, 26, 34, 9);          // receiver
  g.fillRect(40, 28, 18, 5);         // barrel
  g.fillRect(12, 35, 9, 16);         // grip block
  g.beginPath();
  g.moveTo(12, 51); g.lineTo(21, 51); g.lineTo(25, 40); g.lineTo(16, 40);
  g.closePath(); g.fill();
  g.fillStyle = '#a8873f';
  g.fillRect(26, 34, 12, 4);         // magazine well
  g.fillRect(30, 20, 6, 6);          // sight
  g.strokeStyle = '#e8c877';
  g.lineWidth = 2;
  g.beginPath(); g.arc(27, 40, 6, 0, Math.PI); g.stroke();  // trigger guard
  // struck numeral seven
  g.fillStyle = '#fff0c0';
  g.fillRect(40, 44, 18, 4);
  g.beginPath();
  g.moveTo(58, 48); g.lineTo(52, 48); g.lineTo(44, 62); g.lineTo(50, 62);
  g.closePath(); g.fill();
  return c;
}

// ---------------------------------------------------------------- registry

export const CAMPAIGN_ART_IDS = ['foundry', 'gullet', 'catacombs', 'pit', 'spire', 'ward', 'sanctum'] as const;
export type CampaignArtId = typeof CAMPAIGN_ART_IDS[number];

export interface CampaignTextureLib {
  walls: THREE.Texture;
  floors: THREE.Texture;
  ceilings: THREE.Texture;
  door: THREE.Texture;
  sky?: THREE.Texture;
  extraDecals: { id: string; tex: THREE.Texture }[];
}

// Cheap identity strings the unit test can read without a canvas.
export const CAMPAIGN_PACK_MARKERS: Record<CampaignArtId, string> = {
  foundry: 'slag-iron-chevrons',
  gullet: 'mucosa-bile-peristalsis',
  catacombs: 'ossuary-bone-inlay',
  pit: 'gantry-ochre-sky',
  spire: 'copper-traces-lattice',
  ward: 'quarantine-cracked-tile',
  sanctum: 'gold-void-heptagram',
};

export function campaignArtIdFromIndex(n: number): CampaignArtId {
  const i = Math.min(7, Math.max(1, Math.floor(n) || 1));
  return CAMPAIGN_ART_IDS[i - 1];
}

type PackBuilder = () => CampaignTextureLib;

const BUILDERS: Record<CampaignArtId, PackBuilder> = {
  foundry: () => ({
    walls: toTiled(foundryWall()),
    floors: toTiled(foundryFloor()),
    ceilings: toTiled(foundryCeiling()),
    door: toTiled(foundryDoor()),
    extraDecals: [
      { id: 'foundry-furnace-stencil', tex: toDecal(foundryFurnaceStencil()) },
      { id: 'foundry-pour-ladle', tex: toDecal(foundryPourLadle()) },
      { id: 'foundry-heat-warning', tex: toDecal(foundryHeatWarning()) },
    ],
  }),
  gullet: () => ({
    walls: toTiled(gulletWall()),
    floors: toTiled(gulletFloor()),
    ceilings: toTiled(gulletCeiling()),
    door: toTiled(gulletDoor()),
    extraDecals: [
      { id: 'gullet-sphincter-ring', tex: toDecal(gulletSphincterRing()) },
      { id: 'gullet-tooth-ridge', tex: toDecal(gulletToothRidge()) },
      { id: 'gullet-drip', tex: toDecal(gulletDrip()) },
    ],
  }),
  catacombs: () => ({
    walls: toTiled(catacombsWall()),
    floors: toTiled(catacombsFloor()),
    ceilings: toTiled(catacombsCeiling()),
    door: toTiled(catacombsDoor()),
    extraDecals: [
      { id: 'catacombs-stacked-skulls', tex: toDecal(catacombsStackedSkulls()) },
      { id: 'catacombs-epitaph', tex: toDecal(catacombsEpitaph()) },
      { id: 'catacombs-bone-cross', tex: toDecal(catacombsBoneCross()) },
    ],
  }),
  pit: () => ({
    walls: toTiled(pitWall()),
    floors: toTiled(pitFloor()),
    ceilings: toTiled(pitCeiling()),
    door: toTiled(pitDoor()),
    sky: toTiled(pitSky()),
    extraDecals: [
      { id: 'pit-crane-glyph', tex: toDecal(pitCraneGlyph()) },
      { id: 'pit-fall-hazard', tex: toDecal(pitFallHazard()) },
      { id: 'pit-rim-rust', tex: toDecal(pitRimRust()) },
    ],
  }),
  spire: () => ({
    walls: toTiled(spireWall()),
    floors: toTiled(spireFloor()),
    ceilings: toTiled(spireCeiling()),
    door: toTiled(spireDoor()),
    extraDecals: [
      { id: 'spire-floor-numeral', tex: toDecal(spireFloorNumeral()) },
      { id: 'spire-visor-stripe', tex: toDecal(spireVisorStripe()) },
      { id: 'spire-dish', tex: toDecal(spireDish()) },
    ],
  }),
  ward: () => ({
    walls: toTiled(wardWall()),
    floors: toTiled(wardFloor()),
    ceilings: toTiled(wardCeiling()),
    door: toTiled(wardDoor()),
    extraDecals: [
      { id: 'ward-biohazard', tex: toDecal(wardBiohazard()) },
      { id: 'ward-cot-stencil', tex: toDecal(wardCotStencil()) },
      { id: 'ward-key-sigil', tex: toDecal(wardKeySigil()) },
    ],
  }),
  sanctum: () => ({
    walls: toTiled(sanctumWall()),
    floors: toTiled(sanctumFloor()),
    ceilings: toTiled(sanctumCeiling()),
    door: toTiled(sanctumDoor()),
    extraDecals: [
      { id: 'sanctum-heptagram', tex: toDecal(sanctumHeptagram()) },
      { id: 'sanctum-nave-saint-mark', tex: toDecal(sanctumNaveSaintMark()) },
      { id: 'sanctum-gun-7', tex: toDecal(sanctumGunSeven()) },
    ],
  }),
};

const packCache = new Map<CampaignArtId, CampaignTextureLib>();

export function getCampaignTextures(id: CampaignArtId): CampaignTextureLib {
  const hit = packCache.get(id);
  if (hit) return hit;
  const built = BUILDERS[id]();
  packCache.set(id, built);
  return built;
}
