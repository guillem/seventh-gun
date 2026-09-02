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
// cold stone / copper ascent: masonry, elevation marks, antenna lattice
// (not neon circuit panels, not a mesh ceiling, not a purple numeric wall)

function spireWall(): HTMLCanvasElement {
  const { c, g } = canvas(128);
  const rng = seed('spire', 'wall');
  g.fillStyle = '#3a3c3e';
  g.fillRect(0, 0, 128, 128);
  // ashlar masonry — staggered cold stone courses, mortar not panel seams
  const courses = [0, 20, 42, 62, 84, 106];
  for (let i = 0; i < courses.length; i++) {
    const y = courses[i];
    const h = (courses[i + 1] ?? 128) - y;
    const stagger = (i % 2) * 16;
    for (let x = -stagger; x < 128; x += 32) {
      const shade = 0.86 + rng() * 0.18;
      const r = (72 * shade) | 0, gv = (74 * shade) | 0, b = (76 * shade) | 0;
      const pg = g.createLinearGradient(x, y, x, y + h);
      pg.addColorStop(0, `rgb(${r + 10},${gv + 10},${b + 8})`);
      pg.addColorStop(1, `rgb(${r - 8},${gv - 8},${b - 6})`);
      g.fillStyle = pg;
      g.fillRect(x + 1, y + 1, 30, h - 2);
      g.fillStyle = 'rgba(210,208,200,0.10)';
      g.fillRect(x + 3, y + 2, 24, 1);
      g.fillStyle = 'rgba(18,16,14,0.28)';
      g.fillRect(x + 2, y + h - 3, 26, 1);
    }
  }
  g.fillStyle = '#2a2c2e';
  for (const y of courses) g.fillRect(0, y, 128, 2);
  wrapDraw(g, 128, (gg) => {
    gg.fillStyle = '#2a2c2e';
    for (let x = 0; x < 128; x += 32) gg.fillRect(x, 0, 2, 128);
  });
  // copper weather band — a single horizontal strap, not a circuit trace
  g.fillStyle = '#6a3e22';
  g.fillRect(0, 60, 128, 5);
  g.fillStyle = '#b8733a';
  g.fillRect(0, 61, 128, 2);
  g.fillStyle = '#d4a06a';
  g.fillRect(0, 61, 128, 1);
  for (const x of [8, 40, 72, 104]) rivet(g, x, 62, 2, '#e0b07a', '#4a2814');
  // carved elevation marks on a stone pilaster
  g.fillStyle = '#4e5052';
  g.fillRect(4, 0, 14, 128);
  g.fillStyle = '#2e3032';
  g.fillRect(5, 0, 1, 128); g.fillRect(16, 0, 1, 128);
  g.fillStyle = '#c4b49a';
  for (let y = 6; y < 128; y += 10) g.fillRect(7, y, y % 40 === 6 ? 9 : 5, 2);
  g.fillStyle = '#b8733a';
  g.fillRect(8, 8, 6, 2);
  // antenna lattice in a recessed masonry window (copper wires, stone frame)
  g.fillStyle = '#1c1d1e';
  g.fillRect(86, 78, 36, 42);
  g.strokeStyle = '#5c4030';
  g.lineWidth = 3;
  g.strokeRect(86, 78, 36, 42);
  g.strokeStyle = '#b8733a';
  g.lineWidth = 1.3;
  for (let i = 1; i < 4; i++) {
    g.beginPath(); g.moveTo(86 + i * 9, 78); g.lineTo(86 + i * 9, 120); g.stroke();
    g.beginPath(); g.moveTo(86, 78 + i * 10); g.lineTo(122, 78 + i * 10); g.stroke();
  }
  speckle(g, 128, rng, 40, 'rgba(20,18,16,0.45)', 1, 3);
  noise(g, 128, rng, 650, 0.05);
  return c;
}

function spireFloor(): HTMLCanvasElement {
  const { c, g } = canvas(128);
  const rng = seed('spire', 'floor');
  g.fillStyle = '#3e3f41';
  g.fillRect(0, 0, 128, 128);
  // worn stone flags
  for (let y = 0; y < 128; y += 32) {
    for (let x = 0; x < 128; x += 32) {
      const shade = 0.88 + rng() * 0.16;
      g.fillStyle = `rgb(${(68 * shade) | 0},${(66 * shade) | 0},${(62 * shade) | 0})`;
      g.fillRect(x + 2, y + 2, 28, 28);
      g.fillStyle = 'rgba(200,196,186,0.08)';
      g.fillRect(x + 3, y + 3, 20, 2);
    }
  }
  g.fillStyle = '#2a2b2c';
  for (let i = 0; i < 128; i += 32) {
    g.fillRect(i, 0, 2, 128); g.fillRect(0, i, 128, 2);
  }
  // copper inlay cross — drainage, not a tech grid
  g.fillStyle = '#5a3218';
  g.fillRect(62, 0, 5, 128); g.fillRect(0, 62, 128, 5);
  g.fillStyle = '#b8733a';
  g.fillRect(63, 0, 2, 128); g.fillRect(0, 63, 128, 2);
  speckle(g, 128, rng, 28, 'rgba(22,20,18,0.5)', 1, 4);
  noise(g, 128, rng, 600, 0.05);
  return c;
}

function spireCeiling(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  const rng = seed('spire', 'ceil');
  g.fillStyle = '#2c2d2e';
  g.fillRect(0, 0, 64, 64);
  // stone coffer — not a wire mesh / truss lattice
  g.fillStyle = '#242526';
  g.fillRect(8, 8, 48, 48);
  g.strokeStyle = '#4a4c4e';
  g.lineWidth = 3;
  g.strokeRect(8, 8, 48, 48);
  g.fillStyle = '#363738';
  g.fillRect(14, 14, 36, 36);
  // copper tie rod across the vault
  g.fillStyle = '#6a3e22';
  g.fillRect(0, 30, 64, 5);
  g.fillStyle = '#b8733a';
  g.fillRect(0, 31, 64, 2);
  for (const x of [12, 32, 52]) rivet(g, x, 32, 2, '#e0b07a', '#4a2814');
  noise(g, 64, rng, 280, 0.05);
  return c;
}

function spireDoor(): HTMLCanvasElement {
  const { c, g } = canvas(128);
  const rng = seed('spire', 'door');
  g.fillStyle = '#2a2b2c';
  g.fillRect(0, 0, 128, 128);
  // two masonry leaves, copper hinge straps — stone, not a purple terminal
  for (const lx of [4, 66]) {
    const pg = g.createLinearGradient(lx, 0, lx + 58, 0);
    pg.addColorStop(0, '#5a5c5e');
    pg.addColorStop(0.5, '#4a4c4e');
    pg.addColorStop(1, '#3a3c3e');
    g.fillStyle = pg;
    g.fillRect(lx, 4, 58, 120);
    g.strokeStyle = '#1c1d1e';
    g.lineWidth = 2;
    g.strokeRect(lx, 4, 58, 120);
    // mortar courses on the leaf
    g.fillStyle = 'rgba(24,22,20,0.45)';
    for (let y = 16; y < 120; y += 14) g.fillRect(lx + 4, y, 50, 1);
  }
  g.fillStyle = '#1a1b1c';
  g.fillRect(62, 0, 4, 128);
  // copper straps
  for (const sy of [18, 96]) {
    g.fillStyle = '#6a3e22';
    g.fillRect(10, sy, 108, 10);
    g.fillStyle = '#b8733a';
    g.fillRect(10, sy + 2, 108, 5);
    for (const x of [18, 44, 84, 110]) rivet(g, x, sy + 5, 2.4, '#e0b07a', '#4a2814');
  }
  // carved elevation plaque (incised stone, not a glowing 7-segment readout)
  g.fillStyle = '#323436';
  g.fillRect(40, 36, 48, 36);
  g.strokeStyle = '#b8733a';
  g.lineWidth = 2;
  g.strokeRect(40, 36, 48, 36);
  g.fillStyle = '#c4b49a';
  g.fillRect(50, 42, 6, 24);
  g.fillRect(50, 42, 22, 6);
  g.fillRect(66, 42, 6, 24);
  g.fillStyle = '#8a7a62';
  g.fillRect(44, 66, 40, 2);
  noise(g, 128, rng, 480, 0.05);
  return c;
}

function spireFloorNumeral(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  // landing plaque: carved masonry 7, copper frame
  g.fillStyle = 'rgba(48,46,42,0.92)';
  g.fillRect(8, 10, 48, 44);
  g.strokeStyle = '#b8733a';
  g.lineWidth = 2.5;
  g.strokeRect(8, 10, 48, 44);
  g.fillStyle = '#c4b49a';
  g.fillRect(18, 16, 28, 6);
  g.fillRect(36, 16, 7, 30);
  g.fillStyle = '#6a3e22';
  g.fillRect(14, 50, 36, 2);
  return c;
}

function spireVisorStripe(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  // observation slit in masonry, copper bezel — dark, not a neon visor
  g.fillStyle = '#4a4c4e';
  g.beginPath();
  g.moveTo(2, 26); g.lineTo(62, 22); g.lineTo(62, 42); g.lineTo(2, 38);
  g.closePath(); g.fill();
  g.fillStyle = '#1a1612';
  g.fillRect(8, 28, 48, 8);
  g.fillStyle = '#b8733a';
  g.fillRect(2, 22, 4, 18); g.fillRect(58, 20, 4, 20);
  g.fillStyle = 'rgba(180,150,100,0.18)';
  g.fillRect(8, 30, 48, 2);
  return c;
}

function spireDish(): HTMLCanvasElement {
  const { c, g } = canvas(64);
  // tarnished copper dish on a masonry strut (roof antenna)
  g.fillStyle = '#8a5a32';
  g.beginPath(); g.ellipse(30, 26, 22, 20, -0.3, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#5a3418';
  g.beginPath(); g.ellipse(30, 26, 15, 13, -0.3, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#c48a4a';
  g.lineWidth = 2;
  g.beginPath(); g.ellipse(30, 26, 22, 20, -0.3, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(30, 26); g.lineTo(50, 12); g.stroke();
  g.fillStyle = '#d4a06a';
  g.beginPath(); g.arc(50, 12, 3.5, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#4a4c4e';
  g.fillRect(27, 44, 6, 18);
  g.fillRect(18, 60, 24, 4);
  g.strokeStyle = '#4a4c4e';
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
  /** Optional ClampToEdge plates. Missing → sibling / getCampaignHeroDecals(); empty → no-op. */
  heroDecals?: CampaignHeroDecal[];
}

// Cheap identity strings the unit test can read without a canvas.
export const CAMPAIGN_PACK_MARKERS: Record<CampaignArtId, string> = {
  foundry: 'slag-iron-chevrons',
  gullet: 'mucosa-bile-peristalsis',
  catacombs: 'ossuary-bone-inlay',
  pit: 'gantry-ochre-sky',
  spire: 'masonry-copper-ascent',
  ward: 'quarantine-cracked-tile',
  sanctum: 'gold-void-heptagram',
};

export function campaignArtIdFromIndex(n: number): CampaignArtId {
  const i = Math.min(7, Math.max(1, Math.floor(n) || 1));
  return CAMPAIGN_ART_IDS[i - 1];
}

/** Seed forms: `campaign:01-foundry`, `campaign:03`, `campaign:foundry`. */
export function campaignArtIdFromSeed(seed: string): CampaignArtId | undefined {
  if (!seed.startsWith('campaign:')) return undefined;
  const rest = seed.slice('campaign:'.length);
  const numbered = /^0?([1-7])(?:-|$)/.exec(rest);
  if (numbered) return campaignArtIdFromIndex(Number(numbered[1]));
  const name = rest.replace(/^\d+-/, '');
  return (CAMPAIGN_ART_IDS as readonly string[]).includes(name)
    ? name as CampaignArtId
    : undefined;
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

// ================================================================ HERO PLATES
// Big non-tiling one-off canvases: each is meant to be hung once, in the one
// place a player will stop and look at. Clamped, never repeated.

function heroSeed(id: string): () => number {
  return makeRng('camp-hero-' + id).float;
}

function toHero(c: HTMLCanvasElement): THREE.Texture {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Ring of inward-pointing teeth around a maw.
function radialTeeth(
  g: Ctx, cx: number, cy: number, r: number, len: number, count: number,
  fill: string, shade: string,
): void {
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count;
    const w = (Math.PI * 2) / count * 0.42;
    g.fillStyle = i % 2 ? fill : shade;
    g.beginPath();
    g.moveTo(cx + Math.cos(a - w) * r, cy + Math.sin(a - w) * r);
    g.lineTo(cx + Math.cos(a + w) * r, cy + Math.sin(a + w) * r);
    g.lineTo(cx + Math.cos(a) * (r - len), cy + Math.sin(a) * (r - len));
    g.closePath();
    g.fill();
  }
}

function ironPlateField(g: Ctx, size: number, rng: () => number, base: string, plate: string, step: number): void {
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += step) {
    for (let x = 0; x < size; x += step) {
      const sh = 0.85 + rng() * 0.3;
      const m = /#(..)(..)(..)/.exec(plate);
      const r = m ? parseInt(m[1], 16) : 60, gg = m ? parseInt(m[2], 16) : 60, b = m ? parseInt(m[3], 16) : 60;
      g.fillStyle = `rgb(${r * sh | 0},${gg * sh | 0},${b * sh | 0})`;
      g.fillRect(x + 3, y + 3, step - 6, step - 6);
      g.fillStyle = 'rgba(255,240,210,0.06)';
      g.fillRect(x + 3, y + 3, step - 6, 2);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(x + 3, y + step - 5, step - 6, 2);
    }
  }
}

// ---------------------------------------------------------------- 1. furnace maw

function heroFurnaceMouth(): HTMLCanvasElement {
  const S = 512;
  const { c, g } = canvas(S);
  const rng = heroSeed('foundry-furnace-mouth');
  ironPlateField(g, S, rng, '#1d1815', '#3a3028', 128);
  for (let x = 16; x < S; x += 128) for (let y = 16; y < S; y += 128) rivet(g, x, y, 5, '#6d5b44', '#120e0b');
  // heat bloom washing the plates around the maw
  const bloom = g.createRadialGradient(256, 268, 40, 256, 268, 300);
  bloom.addColorStop(0, 'rgba(255,132,32,0.42)');
  bloom.addColorStop(0.45, 'rgba(180,64,12,0.18)');
  bloom.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = bloom;
  g.fillRect(0, 0, S, S);
  // outer iron lips: a heavy bevelled ring
  for (const [r, col] of [[212, '#4a3c2c'], [196, '#645033'], [182, '#2a2118']] as const) {
    g.strokeStyle = col;
    g.lineWidth = 26;
    g.beginPath(); g.arc(256, 268, r, 0, Math.PI * 2); g.stroke();
  }
  for (let i = 0; i < 28; i++) {
    const a = (Math.PI * 2 * i) / 28;
    rivet(g, 256 + Math.cos(a) * 206, 268 + Math.sin(a) * 206, 6, '#9a8058', '#140f0a');
  }
  // molten interior
  const core = g.createRadialGradient(256, 276, 6, 256, 268, 176);
  core.addColorStop(0, '#fffbe6');
  core.addColorStop(0.16, '#ffd867');
  core.addColorStop(0.42, '#ff7a10');
  core.addColorStop(0.72, '#b32c02');
  core.addColorStop(1, '#2c0a02');
  g.fillStyle = core;
  g.beginPath(); g.arc(256, 268, 176, 0, Math.PI * 2); g.fill();
  // convection swirls in the melt
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2, d = 30 + rng() * 130;
    g.strokeStyle = `rgba(255,${170 + rng() * 60 | 0},70,${0.12 + rng() * 0.25})`;
    g.lineWidth = 2 + rng() * 6;
    g.beginPath();
    g.arc(256, 268, d, a, a + 0.5 + rng() * 1.1);
    g.stroke();
  }
  // chevron teeth biting into the melt
  radialTeeth(g, 256, 268, 176, 54, 26, '#3a2e22', '#241c14');
  radialTeeth(g, 256, 268, 148, 30, 26, 'rgba(20,14,10,0.55)', 'rgba(60,44,28,0.5)');
  // slag drips off the lower lip, glowing at the tips
  for (let i = 0; i < 22; i++) {
    const a = Math.PI * (0.12 + rng() * 0.76);
    const x = 256 + Math.cos(a) * 190, y = 268 + Math.sin(a) * 190;
    const len = 30 + rng() * 120;
    const dg = g.createLinearGradient(x, y, x, y + len);
    dg.addColorStop(0, '#6a3a12');
    dg.addColorStop(0.55, '#c85c10');
    dg.addColorStop(1, '#ffca62');
    g.fillStyle = dg;
    g.fillRect(x - 4 - rng() * 4, y, 6 + rng() * 8, len);
    g.fillStyle = 'rgba(255,206,110,0.9)';
    g.beginPath(); g.arc(x, y + len + 4, 4 + rng() * 4, 0, Math.PI * 2); g.fill();
  }
  // sparks lifting off
  for (let i = 0; i < 90; i++) {
    const a = rng() * Math.PI * 2, d = 180 + rng() * 150;
    g.fillStyle = `rgba(255,${150 + rng() * 90 | 0},60,${0.2 + rng() * 0.6})`;
    g.fillRect(256 + Math.cos(a) * d, 268 + Math.sin(a) * d, 2 + (rng() * 3 | 0), 2);
  }
  chevronBand(g, S, 470, 34, 48, '#c8901f', '#1a140f');
  speckle(g, S, rng, 90, 'rgba(18,12,8,0.45)', 2, 9);
  noise(g, S, rng, 2600, 0.06);
  return c;
}

// ---------------------------------------------------------------- 2. pour crucible

function heroPourCrucible(): HTMLCanvasElement {
  const S = 256;
  const { c, g } = canvas(S);
  const rng = heroSeed('foundry-pour-crucible');
  // ambient heat halo only — the alcove wall shows through
  const halo = g.createRadialGradient(120, 190, 10, 120, 190, 150);
  halo.addColorStop(0, 'rgba(255,140,40,0.30)');
  halo.addColorStop(1, 'rgba(255,110,20,0)');
  g.fillStyle = halo;
  g.fillRect(0, 0, S, S);
  // gantry hanger and trunnion yoke
  g.fillStyle = '#3b3128';
  g.fillRect(96, 0, 16, 40);
  g.fillRect(40, 34, 128, 12);
  for (const tx of [46, 162]) rivet(g, tx, 40, 5, '#9a8058', '#141009');
  // tilted crucible
  g.save();
  g.translate(104, 76);
  g.rotate(-0.42);
  const body = g.createLinearGradient(-70, 0, 70, 0);
  body.addColorStop(0, '#5c4c38');
  body.addColorStop(0.4, '#33291f');
  body.addColorStop(1, '#1c1611');
  g.fillStyle = body;
  g.beginPath();
  g.moveTo(-70, -34); g.lineTo(70, -34); g.lineTo(52, 56); g.lineTo(-52, 56);
  g.closePath(); g.fill();
  g.strokeStyle = '#6f5c40';
  g.lineWidth = 7;
  g.stroke();
  g.fillStyle = '#ffd36a';
  g.fillRect(-70, -38, 140, 8);
  for (let i = -60; i < 70; i += 18) rivet(g, i, 30, 4.5, '#8b7350', '#120e09');
  g.restore();
  // pour stream, widening and cooling as it falls
  const stream = g.createLinearGradient(0, 70, 0, 236);
  stream.addColorStop(0, '#fff6cf');
  stream.addColorStop(0.3, '#ffd061');
  stream.addColorStop(0.7, '#ff7c14');
  stream.addColorStop(1, 'rgba(180,44,4,0.5)');
  g.fillStyle = stream;
  g.beginPath();
  g.moveTo(150, 66); g.lineTo(176, 74); g.lineTo(160, 236); g.lineTo(112, 236);
  g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,230,0.55)';
  g.fillRect(150, 74, 7, 150);
  // splash pool
  const pool = g.createRadialGradient(136, 238, 4, 136, 238, 74);
  pool.addColorStop(0, '#ffe79a');
  pool.addColorStop(0.4, '#ff8a1e');
  pool.addColorStop(1, 'rgba(120,26,0,0)');
  g.fillStyle = pool;
  g.beginPath(); g.ellipse(136, 240, 74, 22, 0, 0, Math.PI * 2); g.fill();
  // sparks arcing away from the pour
  for (let i = 0; i < 70; i++) {
    const a = -Math.PI * (0.1 + rng() * 0.8), d = 20 + rng() * 90;
    g.fillStyle = `rgba(255,${170 + rng() * 70 | 0},80,${0.25 + rng() * 0.6})`;
    g.fillRect(136 + Math.cos(a) * d * 1.4, 236 + Math.sin(a) * d * 0.7, 2 + (rng() * 2 | 0), 2);
  }
  return c;
}

// ---------------------------------------------------------------- 3. sphincter maw

function heroSphincterMaw(): HTMLCanvasElement {
  const S = 512;
  const { c, g } = canvas(S);
  const rng = heroSeed('gullet-sphincter-maw');
  // wet tissue field, lit from the mouth
  const field = g.createRadialGradient(256, 256, 40, 256, 256, 330);
  field.addColorStop(0, '#8a4450');
  field.addColorStop(0.45, '#6a2c3a');
  field.addColorStop(1, '#38141f');
  g.fillStyle = field;
  g.fillRect(0, 0, S, S);
  // radial muscle folds dragging into the maw
  for (let i = 0; i < 96; i++) {
    const a = (Math.PI * 2 * i) / 96 + rng() * 0.02;
    g.strokeStyle = `rgba(${140 + rng() * 50 | 0},${52 + rng() * 34 | 0},${66 + rng() * 20 | 0},${0.3 + rng() * 0.4})`;
    g.lineWidth = 5 + rng() * 12;
    g.beginPath();
    g.moveTo(256 + Math.cos(a) * 360, 256 + Math.sin(a) * 360);
    g.quadraticCurveTo(256 + Math.cos(a + 0.16) * 200, 256 + Math.sin(a + 0.16) * 200, 256 + Math.cos(a) * 130, 256 + Math.sin(a) * 130);
    g.stroke();
  }
  // capillary web over the folds
  for (let i = 0; i < 60; i++) {
    let x = 256 + Math.cos(rng() * 7) * (140 + rng() * 200), y = 256 + Math.sin(rng() * 7) * (140 + rng() * 200);
    g.strokeStyle = `rgba(198,66,74,${0.2 + rng() * 0.35})`;
    g.lineWidth = 1 + rng() * 2.5;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 4; s++) {
      const nx = x + rng() * 60 - 30, ny = y + rng() * 60 - 30;
      g.quadraticCurveTo(x + 10, y - 10, nx, ny);
      x = nx; y = ny;
    }
    g.stroke();
  }
  // concentric muscle rings
  for (const [r, w, col] of [[196, 26, 'rgba(56,20,30,0.5)'], [166, 18, 'rgba(206,132,132,0.28)'], [140, 22, 'rgba(40,12,20,0.6)']] as const) {
    g.strokeStyle = col;
    g.lineWidth = w;
    g.beginPath(); g.arc(256, 256, r, 0, Math.PI * 2); g.stroke();
  }
  // teeth ringing the throat
  radialTeeth(g, 256, 256, 130, 44, 30, '#e6dcb4', '#c3b58c');
  radialTeeth(g, 256, 256, 96, 26, 30, 'rgba(120,80,72,0.5)', 'rgba(190,170,130,0.6)');
  // throat: a wet dark well
  const throat = g.createRadialGradient(256, 262, 4, 256, 256, 96);
  throat.addColorStop(0, '#050203');
  throat.addColorStop(0.6, '#2a0a14');
  throat.addColorStop(1, '#571e2a');
  g.fillStyle = throat;
  g.beginPath(); g.arc(256, 256, 92, 0, Math.PI * 2); g.fill();
  // bile gloss: specular sheen off the upper folds
  for (let i = 0; i < 26; i++) {
    const a = -Math.PI * (0.15 + rng() * 0.7), d = 110 + rng() * 190;
    const x = 256 + Math.cos(a) * d, y = 256 + Math.sin(a) * d, r = 10 + rng() * 34;
    const sg = g.createRadialGradient(x, y, 0, x, y, r);
    sg.addColorStop(0, 'rgba(214,228,110,0.26)');
    sg.addColorStop(1, 'rgba(214,228,110,0)');
    g.fillStyle = sg;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // drool bridging the maw
  for (let i = 0; i < 12; i++) {
    const x = 150 + rng() * 212;
    g.strokeStyle = 'rgba(228,238,168,0.4)';
    g.lineWidth = 2 + rng() * 4;
    g.beginPath();
    g.moveTo(x, 176 + rng() * 30);
    g.quadraticCurveTo(x + rng() * 20 - 10, 300, x + rng() * 30 - 15, 360 + rng() * 100);
    g.stroke();
  }
  speckle(g, S, rng, 120, 'rgba(50,14,24,0.4)', 2, 8);
  noise(g, S, rng, 3200, 0.07);
  return c;
}

// ---------------------------------------------------------------- 4. uvula idol

function heroUvulaIdol(): HTMLCanvasElement {
  const S = 256;
  const { c, g } = canvas(S);
  const rng = heroSeed('gullet-uvula-idol');
  // fleshy root spreading across the ceiling
  const root = g.createRadialGradient(128, 10, 6, 128, 10, 120);
  root.addColorStop(0, '#8c4652');
  root.addColorStop(1, 'rgba(90,36,46,0)');
  g.fillStyle = root;
  g.beginPath(); g.ellipse(128, 12, 110, 40, 0, 0, Math.PI * 2); g.fill();
  // pendulous lobe
  const lobe = g.createLinearGradient(80, 0, 180, 220);
  lobe.addColorStop(0, '#a25a64');
  lobe.addColorStop(0.5, '#7b3040');
  lobe.addColorStop(1, '#43151f');
  g.fillStyle = lobe;
  g.beginPath();
  g.moveTo(96, 8);
  g.bezierCurveTo(72, 90, 78, 168, 128, 216);
  g.bezierCurveTo(178, 168, 184, 90, 160, 8);
  g.closePath(); g.fill();
  // idol face pressed out from inside the flesh
  g.fillStyle = 'rgba(30,8,16,0.72)';
  g.beginPath(); g.ellipse(108, 104, 13, 19, 0.2, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(150, 104, 13, 19, -0.2, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(228,238,168,0.45)';
  g.beginPath(); g.arc(112, 100, 4, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(154, 100, 4, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(24,6,12,0.8)';
  g.beginPath();
  g.moveTo(112, 150); g.quadraticCurveTo(128, 166, 146, 150);
  g.quadraticCurveTo(128, 178, 112, 150);
  g.closePath(); g.fill();
  g.fillStyle = '#e6dcb4';
  for (let i = 0; i < 5; i++) g.fillRect(114 + i * 7, 152, 4, 7 + (i % 2) * 4);
  // veins and wet crest highlight
  for (let i = 0; i < 16; i++) {
    let x = 96 + rng() * 64, y = 12 + rng() * 180;
    g.strokeStyle = `rgba(196,72,80,${0.25 + rng() * 0.35})`;
    g.lineWidth = 1 + rng() * 2.5;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 3; s++) { x += rng() * 24 - 12; y += rng() * 26; g.lineTo(x, y); }
    g.stroke();
  }
  g.fillStyle = 'rgba(240,190,190,0.22)';
  g.beginPath(); g.ellipse(106, 70, 9, 40, 0.22, 0, Math.PI * 2); g.fill();
  // drips off the tip
  for (let i = 0; i < 5; i++) {
    const x = 112 + rng() * 32, len = 12 + rng() * 30;
    g.strokeStyle = 'rgba(206,220,110,0.55)';
    g.lineWidth = 2 + rng() * 2;
    g.beginPath(); g.moveTo(x, 212); g.lineTo(x + rng() * 6 - 3, 212 + len); g.stroke();
    g.fillStyle = 'rgba(222,234,140,0.75)';
    g.beginPath(); g.ellipse(x, 214 + len, 3, 4.5, 0, 0, Math.PI * 2); g.fill();
  }
  return c;
}

// ---------------------------------------------------------------- 5. ossuary faces

function heroOssuaryFaces(): HTMLCanvasElement {
  const S = 512;
  const { c, g } = canvas(S);
  const rng = heroSeed('catacombs-ossuary-faces');
  ironPlateField(g, S, rng, '#181513', '#615949', 128);
  const skull = (x: number, y: number, r: number, tilt: number): void => {
    g.save();
    g.translate(x, y); g.rotate(tilt);
    g.fillStyle = `rgb(${196 + rng() * 30 | 0},${184 + rng() * 24 | 0},${150 + rng() * 20 | 0})`;
    g.beginPath(); g.ellipse(0, 0, r, r * 1.08, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(20,16,12,0.92)';
    g.beginPath(); g.ellipse(-r * 0.38, -r * 0.08, r * 0.27, r * 0.34, 0.1, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(r * 0.38, -r * 0.08, r * 0.27, r * 0.34, -0.1, 0, Math.PI * 2); g.fill();
    g.beginPath();
    g.moveTo(0, r * 0.16); g.lineTo(-r * 0.15, r * 0.44); g.lineTo(r * 0.15, r * 0.44);
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(178,166,134,1)';
    g.fillRect(-r * 0.56, r * 0.58, r * 1.12, r * 0.46);
    g.fillStyle = 'rgba(20,16,12,0.85)';
    for (let k = -2; k <= 2; k++) g.fillRect(k * r * 0.24 - 1, r * 0.58, 2.5, r * 0.46);
    g.restore();
  };
  // three arcaded niches packed with the dead
  for (let n = 0; n < 3; n++) {
    const nx = 26 + n * 160;
    g.fillStyle = '#0b0908';
    g.fillRect(nx, 96, 132, 300);
    g.beginPath(); g.arc(nx + 66, 96, 66, Math.PI, 0); g.fill();
    g.strokeStyle = '#7b7160';
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(nx, 396); g.lineTo(nx, 96);
    g.arc(nx + 66, 96, 66, Math.PI, 0);
    g.lineTo(nx + 132, 396);
    g.stroke();
    // courses of femur ends alternating with skull rows
    for (let row = 0; row < 4; row++) {
      const by = 148 + row * 62;
      for (let k = 0; k < 6; k++) {
        const bx = nx + 14 + k * 21;
        g.fillStyle = row % 2 ? '#cabf9e' : '#b1a687';
        g.beginPath(); g.arc(bx, by, 9, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(28,22,16,0.55)';
        g.beginPath(); g.arc(bx, by, 3.4, 0, Math.PI * 2); g.fill();
      }
      for (let k = 0; k < 3; k++) skull(nx + 26 + k * 42, by + 32, 17, rng() * 0.3 - 0.15);
    }
    // candle ledge and its soot plume
    const soot = g.createLinearGradient(0, 96, 0, 0);
    soot.addColorStop(0, 'rgba(10,8,7,0.75)');
    soot.addColorStop(1, 'rgba(10,8,7,0)');
    g.fillStyle = soot;
    g.fillRect(nx + 20, 0, 92, 96);
    for (let k = 0; k < 3; k++) {
      const cx2 = nx + 30 + k * 36;
      g.fillStyle = '#e8dcb2';
      g.fillRect(cx2, 402, 12, 26 + rng() * 12);
      const fl = g.createRadialGradient(cx2 + 6, 396, 1, cx2 + 6, 396, 22);
      fl.addColorStop(0, 'rgba(255,222,150,0.95)');
      fl.addColorStop(0.3, 'rgba(255,168,60,0.45)');
      fl.addColorStop(1, 'rgba(255,140,30,0)');
      g.fillStyle = fl;
      g.fillRect(cx2 - 18, 372, 48, 48);
    }
  }
  // big centre skull crowning the wall
  skull(256, 58, 40, 0);
  // burial glyph band along the base
  g.fillStyle = 'rgba(22,18,14,0.8)';
  for (let x = 12; x < S - 8; x += 22) {
    g.fillRect(x, 452, 5, 16 + (x % 5) * 5);
    if (x % 66 === 12) g.fillRect(x - 6, 476, 18, 5);
  }
  speckle(g, S, rng, 180, 'rgba(206,196,166,0.16)', 1, 4);
  noise(g, S, rng, 2600, 0.08);
  return c;
}

// ---------------------------------------------------------------- 6. burial saint

function heroBurialSaint(): HTMLCanvasElement {
  const S = 256;
  const { c, g } = canvas(S);
  const rng = heroSeed('catacombs-burial-saint');
  // halo of small skulls
  g.strokeStyle = 'rgba(226,214,178,0.55)';
  g.lineWidth = 3;
  g.beginPath(); g.arc(128, 62, 46, 0, Math.PI * 2); g.stroke();
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (i - 4) * 0.36;
    const x = 128 + Math.cos(a) * 46, y = 62 + Math.sin(a) * 46;
    g.fillStyle = '#ded2ac';
    g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#141110';
    g.fillRect(x - 3, y - 1, 2, 3); g.fillRect(x + 1, y - 1, 2, 3);
  }
  // bone robe
  const robe = g.createLinearGradient(0, 80, 0, 250);
  robe.addColorStop(0, '#cfc3a0');
  robe.addColorStop(0.6, '#9a8f74');
  robe.addColorStop(1, '#4b4436');
  g.fillStyle = robe;
  g.beginPath();
  g.moveTo(128, 84);
  g.lineTo(196, 150); g.lineTo(206, 250); g.lineTo(50, 250); g.lineTo(60, 150);
  g.closePath(); g.fill();
  // robe folds are rib-shaped
  g.strokeStyle = 'rgba(60,52,40,0.55)';
  g.lineWidth = 3;
  for (let i = 0; i < 7; i++) {
    g.beginPath();
    g.moveTo(70 + i * 3, 150 + i * 13);
    g.quadraticCurveTo(128, 138 + i * 15, 186 - i * 3, 150 + i * 13);
    g.stroke();
  }
  // skull head
  g.fillStyle = '#e2d7b4';
  g.beginPath(); g.ellipse(128, 62, 30, 34, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#0f0d0b';
  g.beginPath(); g.ellipse(116, 58, 8.5, 11, 0.1, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(141, 58, 8.5, 11, -0.1, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(128, 68); g.lineTo(122, 82); g.lineTo(134, 82); g.closePath(); g.fill();
  g.fillStyle = '#cbbf9c';
  g.fillRect(110, 88, 36, 14);
  g.fillStyle = '#0f0d0b';
  for (let x = 113; x < 145; x += 6) g.fillRect(x, 88, 2.5, 13);
  // crossed femurs held to the chest
  g.strokeStyle = '#efe4c2';
  g.lineWidth = 9;
  g.lineCap = 'round';
  g.beginPath(); g.moveTo(94, 200); g.lineTo(164, 132); g.stroke();
  g.beginPath(); g.moveTo(164, 200); g.lineTo(94, 132); g.stroke();
  g.fillStyle = '#f6ecca';
  for (const [ex, ey] of [[94, 200], [164, 132], [164, 200], [94, 132]] as const) {
    g.beginPath(); g.arc(ex - 4, ey, 6, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(ex + 4, ey, 6, 0, Math.PI * 2); g.fill();
  }
  g.lineCap = 'butt';
  // epitaph plinth
  g.fillStyle = '#6d6555';
  g.fillRect(38, 236, 180, 20);
  g.fillStyle = 'rgba(20,16,12,0.75)';
  for (let k = 0; k < 4; k++) g.fillRect(52 + k * 42, 243, 30 - (k % 2) * 10, 5);
  speckle(g, S, rng, 40, 'rgba(210,200,170,0.18)', 1, 3);
  return c;
}

// ---------------------------------------------------------------- 7. demonic idol

function heroDemonicIdol(): HTMLCanvasElement {
  const S = 512;
  const { c, g } = canvas(S);
  const rng = heroSeed('pit-demonic-idol');
  // corroded plate the idol is bolted to
  ironPlateField(g, S, rng, '#3a2a1a', '#6a5232', 170);
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(${150 + rng() * 60 | 0},${74 + rng() * 30 | 0},20,${0.12 + rng() * 0.3})`;
    g.beginPath(); g.ellipse(rng() * S, rng() * S, 8 + rng() * 40, 5 + rng() * 24, rng() * 3, 0, Math.PI * 2); g.fill();
  }
  // horns
  g.fillStyle = '#4a3a24';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(256 + s * 80, 190);
    g.quadraticCurveTo(256 + s * 210, 120, 256 + s * 236, 12);
    g.quadraticCurveTo(256 + s * 150, 92, 256 + s * 108, 148);
    g.closePath(); g.fill();
    g.strokeStyle = '#7e6438';
    g.lineWidth = 4;
    g.stroke();
    for (let k = 0; k < 5; k++) {
      g.strokeStyle = 'rgba(20,12,6,0.5)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(256 + s * (100 + k * 26), 168 - k * 26);
      g.lineTo(256 + s * (130 + k * 26), 150 - k * 26);
      g.stroke();
    }
  }
  // head mass
  const head = g.createRadialGradient(256, 250, 20, 256, 280, 200);
  head.addColorStop(0, '#8a6b3e');
  head.addColorStop(0.55, '#57411f');
  head.addColorStop(1, '#241a0e');
  g.fillStyle = head;
  g.beginPath();
  g.moveTo(96, 210);
  g.quadraticCurveTo(120, 96, 256, 92);
  g.quadraticCurveTo(392, 96, 416, 210);
  g.quadraticCurveTo(400, 400, 256, 476);
  g.quadraticCurveTo(112, 400, 96, 210);
  g.closePath(); g.fill();
  g.strokeStyle = '#241a0e';
  g.lineWidth = 6;
  g.stroke();
  // riveted brow band
  g.fillStyle = '#3a2c18';
  g.fillRect(112, 186, 288, 30);
  for (let x = 126; x < 400; x += 30) rivet(g, x, 201, 6, '#a0885a', '#140d06');
  // hollow burning eyes
  for (const s of [-1, 1]) {
    const ex = 256 + s * 74, ey = 262;
    g.fillStyle = '#100a04';
    g.beginPath();
    g.moveTo(ex - 52, ey - 26); g.lineTo(ex + 46, ey - 6); g.lineTo(ex + 30, ey + 34); g.lineTo(ex - 44, ey + 20);
    g.closePath(); g.fill();
    const eg = g.createRadialGradient(ex - 4, ey + 4, 2, ex - 4, ey + 4, 44);
    eg.addColorStop(0, '#ffd98a');
    eg.addColorStop(0.35, '#ff7a12');
    eg.addColorStop(1, 'rgba(180,50,0,0)');
    g.fillStyle = eg;
    g.beginPath(); g.ellipse(ex - 4, ey + 4, 40, 26, 0, 0, Math.PI * 2); g.fill();
  }
  // bolted iron jaw with teeth
  g.fillStyle = '#2e2314';
  g.beginPath();
  g.moveTo(150, 348); g.lineTo(362, 348); g.lineTo(322, 452); g.lineTo(190, 452);
  g.closePath(); g.fill();
  g.strokeStyle = '#7e6438';
  g.lineWidth = 5;
  g.stroke();
  for (let i = 0; i < 9; i++) {
    const x = 166 + i * 21;
    g.fillStyle = i % 2 ? '#b5a077' : '#8d7c5a';
    g.beginPath();
    g.moveTo(x, 350); g.lineTo(x + 17, 350); g.lineTo(x + 8, 350 + 26 + (i % 3) * 12);
    g.closePath(); g.fill();
  }
  for (let x = 168; x < 350; x += 34) rivet(g, x, 430, 6, '#a0885a', '#140d06');
  // hanging chains at the temples
  for (const s of [-1, 1]) {
    for (let k = 0; k < 8; k++) {
      g.strokeStyle = '#6d5a3a';
      g.lineWidth = 4;
      g.beginPath();
      g.ellipse(256 + s * 178 + k * s * 3, 320 + k * 22, 6, 10, 0, 0, Math.PI * 2);
      g.stroke();
    }
  }
  speckle(g, S, rng, 140, 'rgba(30,18,8,0.4)', 2, 9);
  noise(g, S, rng, 2800, 0.08);
  return c;
}

// ---------------------------------------------------------------- 8. crane god

function heroCraneGod(): HTMLCanvasElement {
  const S = 256;
  const { c, g } = canvas(S);
  const rng = heroSeed('pit-crane-god');
  // ochre haze behind the silhouette
  const haze = g.createRadialGradient(128, 110, 8, 128, 110, 150);
  haze.addColorStop(0, 'rgba(210,180,96,0.34)');
  haze.addColorStop(1, 'rgba(150,124,58,0)');
  g.fillStyle = haze;
  g.fillRect(0, 0, S, S);
  const strut = (x1: number, y1: number, x2: number, y2: number, w: number): void => {
    g.strokeStyle = '#241a0e';
    g.lineWidth = w;
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  };
  // lattice mast
  strut(96, 250, 104, 40, 9); strut(160, 250, 152, 40, 9);
  for (let y = 44; y < 250; y += 22) {
    strut(98 + (250 - y) * 0.005, y, 158, y + 12, 4);
    strut(158, y, 98, y + 12, 4);
    strut(98, y, 158, y, 3);
  }
  // jib arm reaching out like a god's arm
  strut(104, 44, 244, 92, 8);
  strut(104, 62, 240, 108, 6);
  for (let i = 0; i < 8; i++) {
    strut(104 + i * 17, 44 + i * 6, 104 + i * 17 + 9, 62 + i * 6, 3);
    strut(104 + i * 17 + 9, 62 + i * 6, 121 + i * 17, 50 + i * 6, 3);
  }
  // counterweight block
  g.fillStyle = '#241a0e';
  g.fillRect(56, 40, 46, 34);
  g.fillStyle = 'rgba(180,120,40,0.35)';
  g.fillRect(56, 40, 46, 5);
  // hoist line, hook-head and chain arms
  strut(226, 96, 226, 150, 3);
  g.fillStyle = '#241a0e';
  g.beginPath(); g.arc(226, 168, 20, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#241a0e';
  g.lineWidth = 7;
  g.beginPath(); g.arc(226, 186, 18, -Math.PI * 0.9, Math.PI * 0.55); g.stroke();
  g.fillStyle = 'rgba(255,196,90,0.55)';
  g.beginPath(); g.arc(220, 164, 4, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(233, 164, 4, 0, Math.PI * 2); g.fill();
  for (const s of [-1, 1]) {
    for (let k = 0; k < 6; k++) {
      g.strokeStyle = '#241a0e';
      g.lineWidth = 3;
      g.beginPath(); g.ellipse(226 + s * (24 + k * 5), 174 + k * 14, 5, 8, s * 0.2, 0, Math.PI * 2); g.stroke();
    }
  }
  // grit blowing past
  for (let i = 0; i < 120; i++) {
    g.fillStyle = `rgba(80,62,28,${0.06 + rng() * 0.2})`;
    g.fillRect(rng() * S, rng() * S, 1 + (rng() * 3 | 0), 1);
  }
  return c;
}

// ---------------------------------------------------------------- 9. dish eye

function heroDishEye(): HTMLCanvasElement {
  const S = 512;
  const { c, g } = canvas(S);
  const rng = heroSeed('spire-dish-eye');
  // cold composite backdrop
  ironPlateField(g, S, rng, '#1d2227', '#4b545c', 128);
  // copper traces radiating out to the panel edges
  for (let i = 0; i < 26; i++) {
    const a = (Math.PI * 2 * i) / 26;
    g.strokeStyle = 'rgba(192,122,60,0.85)';
    g.lineWidth = 2.4;
    g.beginPath();
    let x = 256 + Math.cos(a) * 180, y = 256 + Math.sin(a) * 180;
    g.moveTo(x, y);
    for (let s = 0; s < 3; s++) {
      if (s % 2 === 0) x += Math.cos(a) * (26 + rng() * 34);
      else y += Math.sin(a) * (26 + rng() * 34);
      g.lineTo(x, y);
    }
    g.stroke();
    g.fillStyle = '#e0a05a';
    g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
  }
  // dish rim: the eye's outer sclera
  for (const [r, w, col] of [[186, 16, '#8d99a4'], [172, 8, '#39424a'], [160, 6, '#aeb9c3']] as const) {
    g.strokeStyle = col;
    g.lineWidth = w;
    g.beginPath(); g.arc(256, 256, r, 0, Math.PI * 2); g.stroke();
  }
  const dish = g.createRadialGradient(230, 232, 12, 256, 256, 168);
  dish.addColorStop(0, '#c3ced8');
  dish.addColorStop(0.5, '#7f8b95');
  dish.addColorStop(1, '#414a52');
  g.fillStyle = dish;
  g.beginPath(); g.arc(256, 256, 164, 0, Math.PI * 2); g.fill();
  // dish panel seams (the eye's fibres)
  g.strokeStyle = 'rgba(30,38,44,0.6)';
  g.lineWidth = 2;
  for (let i = 0; i < 32; i++) {
    const a = (Math.PI * 2 * i) / 32;
    g.beginPath();
    g.moveTo(256 + Math.cos(a) * 30, 256 + Math.sin(a) * 30);
    g.lineTo(256 + Math.cos(a) * 164, 256 + Math.sin(a) * 164);
    g.stroke();
  }
  for (const r of [58, 92, 128]) {
    g.beginPath(); g.arc(256, 256, r, 0, Math.PI * 2); g.stroke();
  }
  // copper iris
  const iris = g.createRadialGradient(256, 256, 8, 256, 256, 92);
  iris.addColorStop(0, '#f0c07c');
  iris.addColorStop(0.45, '#c07a3c');
  iris.addColorStop(1, '#6a3d18');
  g.fillStyle = iris;
  g.beginPath(); g.arc(256, 256, 90, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(60,32,10,0.5)';
  g.lineWidth = 2;
  for (let i = 0; i < 40; i++) {
    const a = (Math.PI * 2 * i) / 40;
    g.beginPath();
    g.moveTo(256 + Math.cos(a) * 34, 256 + Math.sin(a) * 34);
    g.lineTo(256 + Math.cos(a) * 90, 256 + Math.sin(a) * 90);
    g.stroke();
  }
  // pupil: the feed horn, cold and lit
  g.fillStyle = '#0a1014';
  g.beginPath(); g.arc(256, 256, 34, 0, Math.PI * 2); g.fill();
  const glint = g.createRadialGradient(244, 244, 1, 246, 246, 26);
  glint.addColorStop(0, 'rgba(226,244,255,0.95)');
  glint.addColorStop(0.3, 'rgba(140,200,240,0.35)');
  glint.addColorStop(1, 'rgba(80,140,200,0)');
  g.fillStyle = glint;
  g.beginPath(); g.arc(248, 246, 26, 0, Math.PI * 2); g.fill();
  // feed struts crossing the dish face
  g.strokeStyle = '#9aa6b1';
  g.lineWidth = 6;
  for (const a of [-Math.PI / 2, Math.PI / 6, Math.PI * 0.83]) {
    g.beginPath();
    g.moveTo(256 + Math.cos(a) * 160, 256 + Math.sin(a) * 160);
    g.lineTo(256, 256);
    g.stroke();
  }
  // elevation ticks and a level readout on the mount
  g.fillStyle = '#cddae4';
  for (let y = 30; y < 482; y += 24) g.fillRect(14, y, y % 96 === 30 ? 22 : 12, 4);
  segDigit(g, 7, 44, 26, 22, 34, 5);
  g.fillStyle = '#c07a3c';
  g.fillRect(12, 496, 120, 4);
  noise(g, S, rng, 2000, 0.05);
  return c;
}

// ---------------------------------------------------------------- 10. visor mask

function heroVisorMask(): HTMLCanvasElement {
  const S = 256;
  const { c, g } = canvas(S);
  const rng = heroSeed('spire-visor-mask');
  // helmet shell
  const shell = g.createLinearGradient(0, 20, 0, 236);
  shell.addColorStop(0, '#8b98a3');
  shell.addColorStop(0.45, '#5b666f');
  shell.addColorStop(1, '#2b333a');
  g.fillStyle = shell;
  g.beginPath();
  g.moveTo(50, 96);
  g.quadraticCurveTo(58, 20, 128, 18);
  g.quadraticCurveTo(198, 20, 206, 96);
  g.lineTo(198, 186);
  g.quadraticCurveTo(128, 240, 58, 186);
  g.closePath(); g.fill();
  g.strokeStyle = '#1a2025';
  g.lineWidth = 5;
  g.stroke();
  // crown ridge with copper inlay
  g.fillStyle = '#39424a';
  g.fillRect(118, 20, 20, 76);
  g.fillStyle = '#c07a3c';
  g.fillRect(124, 22, 8, 72);
  // visor slit, cold and bright
  g.fillStyle = '#0b1216';
  g.beginPath();
  g.moveTo(58, 108); g.lineTo(198, 100); g.lineTo(198, 148); g.lineTo(58, 152);
  g.closePath(); g.fill();
  const slit = g.createLinearGradient(0, 108, 0, 146);
  slit.addColorStop(0, 'rgba(150,200,244,0.3)');
  slit.addColorStop(0.45, '#e4f4ff');
  slit.addColorStop(1, 'rgba(96,152,206,0.4)');
  g.fillStyle = slit;
  g.fillRect(66, 112, 124, 30);
  g.fillStyle = 'rgba(14,22,28,0.75)';
  for (let x = 72; x < 190; x += 12) g.fillRect(x, 110, 3, 34);
  g.fillStyle = '#c07a3c';
  g.fillRect(54, 100, 8, 56); g.fillRect(194, 96, 8, 56);
  // breather vents and chin plate
  g.fillStyle = '#39424a';
  g.beginPath();
  g.moveTo(86, 166); g.lineTo(170, 166); g.lineTo(158, 214); g.lineTo(98, 214);
  g.closePath(); g.fill();
  g.fillStyle = '#0d1418';
  for (let y = 174; y < 210; y += 9) g.fillRect(98, y, 60, 5);
  g.fillStyle = '#c07a3c';
  g.beginPath(); g.arc(128, 224, 9, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#1a2025';
  g.beginPath(); g.arc(128, 224, 4, 0, Math.PI * 2); g.fill();
  // scuffs
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = `rgba(200,216,228,${0.05 + rng() * 0.16})`;
    g.lineWidth = 1 + rng() * 2;
    const x = 60 + rng() * 140, y = 24 + rng() * 190;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + rng() * 20 - 10, y + rng() * 8 - 4); g.stroke();
  }
  return c;
}

// ---------------------------------------------------------------- 11. quarantine mural

function heroQuarantineMural(): HTMLCanvasElement {
  const S = 512;
  const { c, g } = canvas(S);
  const rng = heroSeed('ward-quarantine-mural');
  // cracked clinical tile field
  for (let y = 0; y < S; y += 32) {
    for (let x = 0; x < S; x += 32) {
      const sh = 0.86 + rng() * 0.2;
      g.fillStyle = `rgb(${190 * sh | 0},${204 * sh | 0},${192 * sh | 0})`;
      g.fillRect(x + 2, y + 2, 28, 28);
      if (rng() > 0.8) {
        g.fillStyle = `rgba(${120 + rng() * 40 | 0},${104 + rng() * 30 | 0},64,${0.1 + rng() * 0.24})`;
        g.fillRect(x + 2, y + 2, 28, 28);
      }
      g.fillStyle = 'rgba(255,255,255,0.09)';
      g.fillRect(x + 2, y + 2, 28, 2);
    }
  }
  g.fillStyle = 'rgba(56,68,54,0.4)';
  for (let i = 0; i <= S; i += 32) { g.fillRect(i - 1, 0, 3, S); g.fillRect(0, i - 1, S, 3); }
  for (let i = 0; i < 26; i++) {
    let x = rng() * S, y = rng() * S;
    g.strokeStyle = 'rgba(28,34,30,0.6)';
    g.lineWidth = 1 + rng() * 2;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 6; s++) { x += rng() * 70 - 35; y += rng() * 70 - 35; g.lineTo(x, y); }
    g.stroke();
  }
  // barred cell window, top right
  g.fillStyle = '#0d1210';
  g.fillRect(300, 40, 176, 130);
  g.strokeStyle = '#59635d';
  g.lineWidth = 8;
  g.strokeRect(300, 40, 176, 130);
  g.fillStyle = '#8e9a92';
  for (let x = 310; x < 470; x += 22) g.fillRect(x, 40, 8, 130);
  g.fillStyle = 'rgba(0,0,0,0.5)';
  for (let x = 310; x < 470; x += 22) g.fillRect(x + 6, 40, 3, 130);
  // a hand of something pressed between the bars
  g.fillStyle = 'rgba(158,150,128,0.6)';
  g.beginPath(); g.ellipse(356, 116, 14, 20, 0.2, 0, Math.PI * 2); g.fill();
  for (let k = 0; k < 4; k++) g.fillRect(344 + k * 8, 84, 5, 24);
  // row of cot silhouettes along the bottom
  for (let i = 0; i < 4; i++) {
    const bx = 22 + i * 122;
    g.fillStyle = 'rgba(74,86,78,0.85)';
    g.fillRect(bx, 396, 96, 14);
    g.fillRect(bx + 6, 410, 8, 34);
    g.fillRect(bx + 82, 410, 8, 34);
    g.fillStyle = 'rgba(206,222,210,0.5)';
    g.fillRect(bx + 4, 384, 88, 14);
    g.fillStyle = 'rgba(120,104,52,0.3)';
    g.beginPath(); g.ellipse(bx + 40 + rng() * 20, 392, 14 + rng() * 10, 6, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(74,86,78,0.8)';
    g.lineWidth = 3;
    for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(bx + 12 + k * 18, 372); g.lineTo(bx + 12 + k * 18, 386); g.stroke(); }
  }
  // giant biohazard stencil, centre-left
  const bx0 = 152, by0 = 210;
  g.fillStyle = '#d8b820';
  g.strokeStyle = '#171712';
  g.lineWidth = 5;
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
    const cx2 = bx0 + Math.cos(a) * 52, cy2 = by0 + Math.sin(a) * 52;
    g.beginPath(); g.arc(cx2, cy2, 45, 0, Math.PI * 2); g.fill(); g.stroke();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.arc(cx2, cy2, 22, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'source-over';
  }
  g.fillStyle = '#171712';
  g.beginPath(); g.arc(bx0, by0, 24, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#d8b820';
  g.beginPath(); g.arc(bx0, by0, 14, 0, Math.PI * 2); g.fill();
  // quarantine tape strung diagonally across the whole mural
  for (const [ax, ay, bx1, by1] of [[-30, 300, 542, 214], [-30, 226, 542, 336]] as const) {
    g.save();
    const ang = Math.atan2(by1 - ay, bx1 - ax);
    g.translate(ax, ay); g.rotate(ang);
    const len = Math.hypot(bx1 - ax, by1 - ay);
    g.fillStyle = '#d8b820';
    g.fillRect(0, -15, len, 30);
    g.fillStyle = '#171712';
    g.fillRect(0, -15, len, 3); g.fillRect(0, 12, len, 3);
    for (let x = 8; x < len; x += 46) g.fillRect(x, -8, 22, 16);
    g.restore();
  }
  // stains and mould creep
  for (let i = 0; i < 22; i++) {
    g.fillStyle = `rgba(${86 + rng() * 40 | 0},${74 + rng() * 26 | 0},46,${0.1 + rng() * 0.2})`;
    g.beginPath(); g.ellipse(rng() * S, rng() * S, 10 + rng() * 40, 6 + rng() * 24, rng() * 3, 0, Math.PI * 2); g.fill();
  }
  noise(g, S, rng, 2400, 0.06);
  return c;
}

// ---------------------------------------------------------------- 12. isolation cot

function heroIsolationCot(): HTMLCanvasElement {
  const S = 256;
  const { c, g } = canvas(S);
  const rng = heroSeed('ward-isolation-cot');
  // frame
  g.fillStyle = '#5d6a62';
  g.fillRect(24, 132, 208, 12);
  g.fillRect(30, 144, 12, 74);
  g.fillRect(214, 144, 12, 74);
  g.fillStyle = '#454f49';
  for (const wx of [36, 220]) {
    g.beginPath(); g.arc(wx, 226, 11, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#78847b';
    g.beginPath(); g.arc(wx, 226, 5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#454f49';
  }
  // head and foot rails
  g.strokeStyle = '#5d6a62';
  g.lineWidth = 7;
  g.beginPath(); g.moveTo(28, 132); g.lineTo(28, 62); g.lineTo(78, 62); g.lineTo(78, 132); g.stroke();
  for (let x = 36; x < 78; x += 12) { g.beginPath(); g.moveTo(x, 62); g.lineTo(x, 132); g.stroke(); }
  g.beginPath(); g.moveTo(228, 132); g.lineTo(228, 88); g.lineTo(188, 88); g.lineTo(188, 132); g.stroke();
  // stained mattress
  const mat = g.createLinearGradient(0, 100, 0, 134);
  mat.addColorStop(0, '#d5decf');
  mat.addColorStop(1, '#98a596');
  g.fillStyle = mat;
  g.fillRect(38, 100, 180, 34);
  g.strokeStyle = 'rgba(70,80,72,0.6)';
  g.lineWidth = 2;
  g.strokeRect(38, 100, 180, 34);
  for (let i = 0; i < 14; i++) {
    const sx = 44 + rng() * 160, sy = 102 + rng() * 28;
    g.fillStyle = `rgba(${110 + rng() * 50 | 0},${84 + rng() * 30 | 0},${44 + rng() * 20 | 0},${0.16 + rng() * 0.34})`;
    g.beginPath(); g.ellipse(sx, sy, 6 + rng() * 22, 4 + rng() * 12, rng() * 3, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = 'rgba(120,26,26,0.35)';
  g.beginPath(); g.ellipse(150, 118, 26, 12, 0.3, 0, Math.PI * 2); g.fill();
  // restraint straps, buckled and hanging loose
  for (const sx of [72, 128, 184]) {
    g.fillStyle = '#3f4741';
    g.fillRect(sx - 6, 98, 12, 38);
    g.save();
    g.translate(sx, 136); g.rotate(0.3 + rng() * 0.5);
    g.fillRect(-5, 0, 10, 44 + rng() * 26);
    g.restore();
    g.fillStyle = '#9aa69c';
    g.fillRect(sx - 9, 112, 18, 9);
    g.fillStyle = '#2a312c';
    g.fillRect(sx - 2, 114, 4, 5);
  }
  // IV pole and drip bag
  g.fillStyle = '#7d8a82';
  g.fillRect(238, 30, 6, 190);
  g.fillRect(228, 220, 26, 5);
  g.fillStyle = 'rgba(206,222,180,0.7)';
  g.beginPath();
  g.moveTo(214, 40); g.lineTo(240, 40); g.lineTo(240, 82); g.lineTo(214, 82);
  g.closePath(); g.fill();
  g.strokeStyle = 'rgba(60,70,60,0.6)';
  g.lineWidth = 2;
  g.stroke();
  g.strokeStyle = 'rgba(180,196,176,0.8)';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(226, 82); g.quadraticCurveTo(214, 112, 196, 108); g.stroke();
  // yellow quarantine tag tied to the rail
  g.fillStyle = '#d8b820';
  g.save(); g.translate(60, 140); g.rotate(0.18);
  g.fillRect(0, 0, 34, 22);
  g.fillStyle = '#171712';
  g.fillRect(3, 5, 26, 3); g.fillRect(3, 12, 18, 3);
  g.restore();
  return c;
}

// ---------------------------------------------------------------- 13. gun reliquary

function heroGunReliquary(): HTMLCanvasElement {
  const S = 512;
  const { c, g } = canvas(S);
  const rng = heroSeed('sanctum-gun-reliquary');
  g.fillStyle = '#07060b';
  g.fillRect(0, 0, S, S);
  // apse glow behind the shrine
  const apse = g.createRadialGradient(256, 250, 10, 256, 250, 300);
  apse.addColorStop(0, 'rgba(240,206,124,0.42)');
  apse.addColorStop(0.4, 'rgba(168,132,58,0.16)');
  apse.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = apse;
  g.fillRect(0, 0, S, S);
  // radiant rays
  g.strokeStyle = 'rgba(217,180,92,0.32)';
  for (let i = 0; i < 48; i++) {
    const a = (Math.PI * 2 * i) / 48;
    g.lineWidth = i % 4 === 0 ? 5 : 2;
    g.beginPath();
    g.moveTo(256 + Math.cos(a) * 90, 250 + Math.sin(a) * 90);
    g.lineTo(256 + Math.cos(a) * 300, 250 + Math.sin(a) * 300);
    g.stroke();
  }
  // heptagram inlay behind the case
  g.strokeStyle = 'rgba(232,200,119,0.55)';
  g.lineWidth = 4;
  starPath(g, 256, 250, 190, 7, 3);
  g.stroke();
  g.beginPath(); g.arc(256, 250, 196, 0, Math.PI * 2); g.stroke();
  // reliquary case: gold pointed-arch shrine
  g.fillStyle = '#100e18';
  g.beginPath();
  g.moveTo(150, 452); g.lineTo(150, 190); g.lineTo(256, 96); g.lineTo(362, 190); g.lineTo(362, 452);
  g.closePath(); g.fill();
  g.strokeStyle = '#d9b45c';
  g.lineWidth = 8;
  g.stroke();
  g.strokeStyle = 'rgba(196,158,78,0.8)';
  g.lineWidth = 3;
  g.strokeRect(164, 200, 184, 240);
  // filigree in the arch head
  for (let i = 0; i < 4; i++) {
    g.strokeStyle = `rgba(217,180,92,${0.75 - i * 0.12})`;
    g.lineWidth = 3;
    g.beginPath(); g.arc(256, 178, 60 - i * 14, Math.PI * 1.12, Math.PI * 1.88); g.stroke();
  }
  // the seventh gun, enshrined
  g.save();
  g.translate(256, 316); g.rotate(-0.22);
  g.fillStyle = '#f0d189';
  g.fillRect(-100, -18, 128, 30);       // receiver
  g.fillRect(28, -12, 78, 18);          // barrel
  g.fillStyle = '#c49e4e';
  g.fillRect(96, -16, 14, 26);          // muzzle brake
  g.fillRect(-30, 12, 46, 14);          // magazine
  g.fillStyle = '#f0d189';
  g.beginPath();
  g.moveTo(-96, 12); g.lineTo(-64, 12); g.lineTo(-48, 78); g.lineTo(-82, 78);
  g.closePath(); g.fill();               // grip
  g.strokeStyle = '#f0d189';
  g.lineWidth = 7;
  g.beginPath(); g.arc(-46, 18, 22, 0, Math.PI); g.stroke();  // trigger guard
  g.fillStyle = '#c49e4e';
  g.fillRect(-40, -34, 22, 16);          // sight block
  g.fillStyle = 'rgba(255,246,214,0.6)';
  g.fillRect(-100, -18, 128, 4);         // highlight along the top rail
  g.restore();
  // seven votive candles across the altar step
  g.fillStyle = '#1a1622';
  g.fillRect(132, 452, 248, 44);
  g.strokeStyle = '#d9b45c';
  g.lineWidth = 4;
  g.strokeRect(132, 452, 248, 44);
  for (let i = 0; i < 7; i++) {
    const x = 154 + i * 34;
    g.fillStyle = i === 6 ? '#fff0c0' : '#e8dcb2';
    g.fillRect(x, 424, 12, 30);
    const fl = g.createRadialGradient(x + 6, 418, 1, x + 6, 418, 20);
    fl.addColorStop(0, 'rgba(255,244,196,0.95)');
    fl.addColorStop(0.35, 'rgba(240,196,96,0.4)');
    fl.addColorStop(1, 'rgba(220,170,60,0)');
    g.fillStyle = fl;
    g.fillRect(x - 14, 396, 40, 44);
  }
  // gold dust in the void
  speckle(g, S, rng, 140, 'rgba(232,206,142,0.2)', 1, 3);
  noise(g, S, rng, 1400, 0.04);
  return c;
}

// ---------------------------------------------------------------- 14. demon head

function heroDemonHead(): HTMLCanvasElement {
  const S = 512;
  const { c, g } = canvas(S);
  const rng = heroSeed('sanctum-demon-head');
  g.fillStyle = '#06050a';
  g.fillRect(0, 0, S, S);
  // heptagram halo behind the head
  const halo = g.createRadialGradient(256, 236, 20, 256, 236, 260);
  halo.addColorStop(0, 'rgba(236,200,120,0.34)');
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = halo;
  g.fillRect(0, 0, S, S);
  g.strokeStyle = '#e8c877';
  g.lineWidth = 5;
  starPath(g, 256, 236, 216, 7, 3);
  g.stroke();
  g.lineWidth = 3;
  g.beginPath(); g.arc(256, 236, 224, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(256, 236, 236, 0, Math.PI * 2); g.stroke();
  // tympanum horns sweeping out along the arch
  g.fillStyle = '#d9b45c';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(256 + s * 76, 148);
    g.quadraticCurveTo(256 + s * 206, 92, 256 + s * 222, 8);
    g.quadraticCurveTo(256 + s * 156, 76, 256 + s * 104, 116);
    g.closePath(); g.fill();
    g.strokeStyle = '#8e6f2e';
    g.lineWidth = 3;
    g.stroke();
  }
  // head: gold relief on void
  const face = g.createLinearGradient(0, 130, 0, 440);
  face.addColorStop(0, '#f0d189');
  face.addColorStop(0.5, '#c49e4e');
  face.addColorStop(1, '#7a5c22');
  g.fillStyle = face;
  g.beginPath();
  g.moveTo(120, 210);
  g.quadraticCurveTo(146, 118, 256, 116);
  g.quadraticCurveTo(366, 118, 392, 210);
  g.quadraticCurveTo(376, 372, 256, 446);
  g.quadraticCurveTo(136, 372, 120, 210);
  g.closePath(); g.fill();
  g.strokeStyle = '#3a2c10';
  g.lineWidth = 5;
  g.stroke();
  // brow, cheekbones, incised relief lines
  g.strokeStyle = 'rgba(58,44,16,0.75)';
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(146, 214); g.quadraticCurveTo(256, 176, 366, 214);
  g.stroke();
  g.lineWidth = 4;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.moveTo(150 + i * 8, 250 + i * 26); g.quadraticCurveTo(256, 232 + i * 30, 362 - i * 8, 250 + i * 26);
    g.stroke();
  }
  // eyes: void sockets with an ember iris
  for (const s of [-1, 1]) {
    const ex = 256 + s * 66, ey = 254;
    g.fillStyle = '#06050a';
    g.beginPath();
    g.moveTo(ex - s * 54, ey - 20); g.lineTo(ex + s * 44, ey - 4);
    g.lineTo(ex + s * 32, ey + 34); g.lineTo(ex - s * 46, ey + 18);
    g.closePath(); g.fill();
    const eg = g.createRadialGradient(ex, ey + 6, 2, ex, ey + 6, 34);
    eg.addColorStop(0, '#fff2c8');
    eg.addColorStop(0.35, '#e8a53a');
    eg.addColorStop(1, 'rgba(180,120,20,0)');
    g.fillStyle = eg;
    g.beginPath(); g.ellipse(ex, ey + 6, 30, 20, 0, 0, Math.PI * 2); g.fill();
  }
  // nose ridge and fanged mouth
  g.fillStyle = 'rgba(58,44,16,0.7)';
  g.beginPath();
  g.moveTo(256, 274); g.lineTo(236, 330); g.lineTo(276, 330);
  g.closePath(); g.fill();
  g.fillStyle = '#100c06';
  g.beginPath();
  g.moveTo(166, 350); g.quadraticCurveTo(256, 328, 346, 350);
  g.quadraticCurveTo(256, 424, 166, 350);
  g.closePath(); g.fill();
  for (let i = 0; i < 11; i++) {
    const x = 176 + i * 15;
    g.fillStyle = i % 2 ? '#f0d189' : '#c49e4e';
    g.beginPath();
    g.moveTo(x, 344); g.lineTo(x + 13, 344); g.lineTo(x + 6, 344 + 18 + (i % 3) * 12);
    g.closePath(); g.fill();
    g.beginPath();
    g.moveTo(x + 2, 392); g.lineTo(x + 15, 392); g.lineTo(x + 8, 392 - 12 - (i % 2) * 10);
    g.closePath(); g.fill();
  }
  // seven gold studs ringing the tympanum edge
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 7;
    g.fillStyle = '#f0d189';
    g.beginPath(); g.arc(256 + Math.cos(a) * 216, 236 + Math.sin(a) * 216, 9, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#06050a';
    g.beginPath(); g.arc(256 + Math.cos(a) * 216, 236 + Math.sin(a) * 216, 3.5, 0, Math.PI * 2); g.fill();
  }
  speckle(g, S, rng, 120, 'rgba(232,206,142,0.16)', 1, 3);
  noise(g, S, rng, 1600, 0.05);
  return c;
}

// ---------------------------------------------------------------- 15. nave rose

function heroNaveRose(): HTMLCanvasElement {
  const S = 256;
  const { c, g } = canvas(S);
  const rng = heroSeed('sanctum-nave-rose');
  // glass glow, clipped to the window round
  g.save();
  g.beginPath(); g.arc(128, 128, 122, 0, Math.PI * 2); g.clip();
  const glass = g.createRadialGradient(128, 128, 6, 128, 128, 122);
  glass.addColorStop(0, '#fff0c0');
  glass.addColorStop(0.35, '#e0a83e');
  glass.addColorStop(0.7, '#7a4c14');
  glass.addColorStop(1, '#1c1206');
  g.fillStyle = glass;
  g.fillRect(0, 0, S, S);
  // fourteen petal lights radiating from the boss
  for (let i = 0; i < 14; i++) {
    const a = (Math.PI * 2 * i) / 14;
    g.fillStyle = i % 2 ? 'rgba(255,226,150,0.55)' : 'rgba(150,72,20,0.45)';
    g.beginPath();
    g.moveTo(128 + Math.cos(a) * 34, 128 + Math.sin(a) * 34);
    g.quadraticCurveTo(128 + Math.cos(a + 0.22) * 88, 128 + Math.sin(a + 0.22) * 88, 128 + Math.cos(a) * 118, 128 + Math.sin(a) * 118);
    g.quadraticCurveTo(128 + Math.cos(a - 0.22) * 88, 128 + Math.sin(a - 0.22) * 88, 128 + Math.cos(a) * 34, 128 + Math.sin(a) * 34);
    g.closePath(); g.fill();
  }
  // outer ring of small lights
  for (let i = 0; i < 21; i++) {
    const a = (Math.PI * 2 * i) / 21;
    g.fillStyle = i % 3 === 0 ? 'rgba(255,240,190,0.7)' : 'rgba(180,110,34,0.5)';
    g.beginPath(); g.arc(128 + Math.cos(a) * 104, 128 + Math.sin(a) * 104, 11, 0, Math.PI * 2); g.fill();
  }
  g.restore();
  // gold tracery over the glass
  g.strokeStyle = '#d9b45c';
  g.lineWidth = 5;
  for (let i = 0; i < 14; i++) {
    const a = (Math.PI * 2 * i) / 14;
    g.beginPath();
    g.moveTo(128 + Math.cos(a) * 30, 128 + Math.sin(a) * 30);
    g.lineTo(128 + Math.cos(a) * 118, 128 + Math.sin(a) * 118);
    g.stroke();
  }
  for (const r of [30, 62, 92, 118]) {
    g.lineWidth = r === 118 ? 9 : 4;
    g.beginPath(); g.arc(128, 128, r, 0, Math.PI * 2); g.stroke();
  }
  // heptagram boss at the centre
  g.strokeStyle = '#fff0c0';
  g.lineWidth = 4;
  starPath(g, 128, 128, 46, 7, 3);
  g.stroke();
  g.fillStyle = 'rgba(255,244,206,0.85)';
  g.beginPath(); g.arc(128, 128, 15, 0, Math.PI * 2); g.fill();
  // heavy stone surround ring
  g.strokeStyle = '#26202c';
  g.lineWidth = 14;
  g.beginPath(); g.arc(128, 128, 128, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = 'rgba(217,180,92,0.6)';
  g.lineWidth = 3;
  g.beginPath(); g.arc(128, 128, 122, 0, Math.PI * 2); g.stroke();
  speckle(g, S, rng, 30, 'rgba(255,238,180,0.18)', 0.8, 2);
  return c;
}

// ---------------------------------------------------------------- 16. slag titan

function heroSlagTitan(): HTMLCanvasElement {
  const S = 512;
  const { c, g } = canvas(S);
  const rng = heroSeed('foundry-slag-titan');
  ironPlateField(g, S, rng, '#151110', '#332a22', 128);
  // the far wall is lit from below by the pour floor
  const up = g.createLinearGradient(0, S, 0, 120);
  up.addColorStop(0, 'rgba(255,120,26,0.34)');
  up.addColorStop(1, 'rgba(60,20,4,0)');
  g.fillStyle = up;
  g.fillRect(0, 0, S, S);

  // Cast-iron body, poured in one piece: shoulders wider than the frame, so the
  // titan reads as too big for the room it is standing in.
  const body = (fill: string | CanvasGradient, inset: number): void => {
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(24 + inset, 500);
    g.lineTo(48 + inset, 250);          // left flank
    g.lineTo(16 + inset, 186);          // left shoulder pauldron
    g.lineTo(96 + inset, 150);
    g.lineTo(174 + inset, 118);         // trapezius
    g.lineTo(196 + inset, 60);          // jaw line
    g.lineTo(316 - inset, 60);
    g.lineTo(338 - inset, 118);
    g.lineTo(416 - inset, 150);
    g.lineTo(496 - inset, 186);
    g.lineTo(464 - inset, 250);
    g.lineTo(488 - inset, 500);
    g.closePath();
    g.fill();
  };
  body('#0d0a08', 0);
  const skin = g.createLinearGradient(0, 60, 0, 500);
  skin.addColorStop(0, '#5b4c39');
  skin.addColorStop(0.42, '#3a3026');
  skin.addColorStop(1, '#221a14');
  body(skin, 8);

  // hammered facets across the chest — big flat planes catching the floor light
  for (let i = 0; i < 26; i++) {
    const x = 40 + rng() * 432, y = 150 + rng() * 300;
    const w = 30 + rng() * 90, h = 22 + rng() * 60;
    g.fillStyle = rng() < 0.5 ? 'rgba(255,222,178,0.05)' : 'rgba(0,0,0,0.24)';
    g.beginPath();
    g.moveTo(x, y); g.lineTo(x + w, y - 10 + rng() * 20); g.lineTo(x + w * 0.8, y + h); g.lineTo(x - 8, y + h * 0.9);
    g.closePath(); g.fill();
  }

  // brow slab and sunken furnace eyes
  g.fillStyle = '#1a1410';
  g.fillRect(196, 60, 120, 30);
  g.fillStyle = '#463a2c';
  g.fillRect(190, 84, 132, 14);
  for (const ex of [226, 288] as const) {
    const eye = g.createRadialGradient(ex, 108, 2, ex, 108, 26);
    eye.addColorStop(0, '#fff3cd');
    eye.addColorStop(0.3, '#ffab34');
    eye.addColorStop(0.7, '#c33c04');
    eye.addColorStop(1, 'rgba(90,20,0,0)');
    g.fillStyle = eye;
    g.beginPath(); g.arc(ex, 108, 26, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#120c08';
    g.fillRect(ex - 16, 96, 32, 5);
  }
  // clenched mouth grate
  g.fillStyle = '#0b0806';
  g.fillRect(214, 126, 84, 20);
  g.fillStyle = '#ff8c1e';
  for (let x = 218; x < 296; x += 10) g.fillRect(x, 128, 4, 16);

  // arms folded across the belly — two heavy poured bars
  for (const [ax, ay, rot] of [[128, 322, 0.22], [384, 322, -0.22]] as const) {
    g.save();
    g.translate(ax, ay); g.rotate(rot);
    g.fillStyle = '#2c241b';
    g.fillRect(-52, -34, 190, 68);
    g.strokeStyle = '#5f4f3a';
    g.lineWidth = 5;
    g.strokeRect(-52, -34, 190, 68);
    g.fillStyle = 'rgba(255,226,180,0.07)';
    g.fillRect(-52, -34, 190, 8);
    for (let k = -40; k < 130; k += 26) rivet(g, k, 22, 5, '#8c7350', '#100c08');
    g.restore();
  }

  // heat cracks: molten seams branching through the iron, brightest at the base
  const crack = (x: number, y: number, a: number, len: number, w: number, depth: number): void => {
    if (depth <= 0 || len < 6) return;
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    const glow = 0.25 + (y / S) * 0.6;
    g.strokeStyle = `rgba(255,${120 + rng() * 90 | 0},32,${glow})`;
    g.lineWidth = w;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
    g.strokeStyle = `rgba(255,242,196,${glow * 0.5})`;
    g.lineWidth = Math.max(1, w * 0.35);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
    crack(x2, y2, a + (rng() - 0.5) * 0.9, len * 0.78, w * 0.7, depth - 1);
    if (rng() < 0.55) crack(x2, y2, a + (rng() - 0.5) * 2.2, len * 0.55, w * 0.6, depth - 1);
  };
  for (let i = 0; i < 14; i++) crack(60 + rng() * 400, 460 + rng() * 40, -Math.PI / 2 + (rng() - 0.5) * 1.3, 40 + rng() * 34, 6, 5);
  for (let i = 0; i < 7; i++) crack(120 + rng() * 280, 180 + rng() * 140, rng() * Math.PI * 2, 26 + rng() * 22, 4, 4);

  // slag crusting up the legs
  for (let i = 0; i < 40; i++) {
    const x = 30 + rng() * 452, y = 400 + rng() * 110;
    g.fillStyle = `rgba(${60 + rng() * 50 | 0},${40 + rng() * 30 | 0},28,0.7)`;
    g.beginPath(); g.ellipse(x, y, 8 + rng() * 22, 4 + rng() * 10, rng(), 0, Math.PI * 2); g.fill();
  }
  chevronBand(g, S, 486, 26, 48, '#c8901f', '#191310');
  speckle(g, S, rng, 110, 'rgba(16,10,6,0.4)', 2, 8);
  noise(g, S, rng, 2800, 0.07);
  return c;
}

// ---------------------------------------------------------------- 17. hazard gate

function heroHazardGate(): HTMLCanvasElement {
  const S = 256;
  const { c, g } = canvas(S);
  const rng = heroSeed('foundry-hazard-gate');
  // scorched frame plate
  g.fillStyle = '#241d17';
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#332a20';
  g.fillRect(6, 6, S - 12, S - 12);
  noise(g, S, rng, 900, 0.09);

  // Chevron arch: wedges marched around the doorway opening, alternating
  // hazard yellow and slag black, so the mouth reads as "do not walk in".
  const cx = 128, top = 104;
  const chevAt = (px: number, py: number, a: number, k: number): void => {
    g.save();
    g.translate(px, py); g.rotate(a);
    g.fillStyle = k % 2 ? '#c8901f' : '#171009';
    g.beginPath();
    g.moveTo(-17, -26); g.lineTo(0, -26); g.lineTo(17, 0); g.lineTo(0, 26); g.lineTo(-17, 26); g.lineTo(0, 0);
    g.closePath(); g.fill();
    g.restore();
  };
  let k = 0;
  for (let i = 0; i <= 22; i++, k++) {
    const a = Math.PI + (Math.PI * i) / 22;
    chevAt(cx + Math.cos(a) * 84, top + Math.sin(a) * 84, a + Math.PI / 2, k);
  }
  for (let y = top; y < 244; y += 30, k++) {
    chevAt(cx - 84, y, 0, k);
    chevAt(cx + 84, y, Math.PI, k + 1);
  }

  // the dark mouth itself
  g.fillStyle = '#050403';
  g.beginPath();
  g.moveTo(cx - 62, 248); g.lineTo(cx - 62, top);
  g.arc(cx, top, 62, Math.PI, 0);
  g.lineTo(cx + 62, 248);
  g.closePath(); g.fill();
  // a faint ember throat far inside
  const throat = g.createRadialGradient(cx, 168, 4, cx, 168, 74);
  throat.addColorStop(0, 'rgba(196,70,10,0.5)');
  throat.addColorStop(0.5, 'rgba(120,34,4,0.16)');
  throat.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = throat;
  g.beginPath();
  g.moveTo(cx - 62, 248); g.lineTo(cx - 62, top);
  g.arc(cx, top, 62, Math.PI, 0);
  g.lineTo(cx + 62, 248);
  g.closePath(); g.fill();
  // inner jamb bevel
  g.strokeStyle = '#6d5b44';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(cx - 62, 248); g.lineTo(cx - 62, top);
  g.arc(cx, top, 62, Math.PI, 0);
  g.lineTo(cx + 62, 248);
  g.stroke();

  // keystone lamp above the arch
  g.fillStyle = '#1a1410';
  g.fillRect(cx - 26, 14, 52, 26);
  const lamp = g.createRadialGradient(cx, 27, 2, cx, 27, 30);
  lamp.addColorStop(0, '#ffe9a6');
  lamp.addColorStop(0.35, 'rgba(255,150,32,0.7)');
  lamp.addColorStop(1, 'rgba(255,120,20,0)');
  g.fillStyle = lamp;
  g.fillRect(cx - 34, 2, 68, 56);
  for (const bx of [cx - 34, cx + 34] as const) rivet(g, bx, 27, 5, '#9a8058', '#0f0b08');

  // scuffed threshold stripes and bolt rows down the jambs
  chevronBand(g, S, 244, 12, 32, '#c8901f', '#171009');
  for (let y = 116; y < 240; y += 34) {
    rivet(g, 16, y, 5, '#8c7350', '#100c08');
    rivet(g, S - 16, y, 5, '#8c7350', '#100c08');
  }
  speckle(g, S, rng, 60, 'rgba(14,10,7,0.5)', 1, 5);
  return c;
}

// ---------------------------------------------------------------- 18. tooth gate

function heroToothGate(): HTMLCanvasElement {
  const S = 512;
  const { c, g } = canvas(S);
  const rng = heroSeed('gullet-tooth-gate');
  // wet mucosa wall
  const flesh = g.createRadialGradient(256, 256, 40, 256, 256, 380);
  flesh.addColorStop(0, '#7d2c30');
  flesh.addColorStop(0.45, '#63232a');
  flesh.addColorStop(1, '#33121a');
  g.fillStyle = flesh;
  g.fillRect(0, 0, S, S);
  // capillary veins fanning toward the gap
  for (let i = 0; i < 90; i++) {
    const y = rng() * S;
    const fromLeft = rng() < 0.5;
    let x = fromLeft ? 0 : S, yy = y;
    g.strokeStyle = `rgba(${140 + rng() * 60 | 0},${34 + rng() * 30 | 0},${44 + rng() * 26 | 0},${0.16 + rng() * 0.3})`;
    g.lineWidth = 1 + rng() * 3.5;
    g.beginPath(); g.moveTo(x, yy);
    for (let s = 0; s < 8; s++) {
      x += (fromLeft ? 1 : -1) * (14 + rng() * 22);
      yy += (rng() - 0.5) * 26;
      g.lineTo(x, yy);
    }
    g.stroke();
  }
  // peristalsis folds running horizontally into the throat
  for (let i = 0; i < 16; i++) {
    const y = 14 + i * 32 + rng() * 8;
    g.strokeStyle = `rgba(28,8,12,${0.2 + rng() * 0.2})`;
    g.lineWidth = 6 + rng() * 8;
    g.beginPath();
    g.moveTo(0, y);
    g.quadraticCurveTo(256, y + (rng() - 0.5) * 40, S, y + (rng() - 0.5) * 20);
    g.stroke();
  }

  // the gap: a vertical slit throat, black and deep
  const gapTop = 24, gapBot = 488, half = 62;
  g.fillStyle = '#060305';
  g.beginPath();
  g.moveTo(256 - half, gapTop);
  g.quadraticCurveTo(256 - half - 22, 256, 256 - half, gapBot);
  g.lineTo(256 + half, gapBot);
  g.quadraticCurveTo(256 + half + 22, 256, 256 + half, gapTop);
  g.closePath(); g.fill();
  const deep = g.createLinearGradient(256 - half, 0, 256 + half, 0);
  deep.addColorStop(0, 'rgba(120,30,40,0.5)');
  deep.addColorStop(0.5, 'rgba(0,0,0,0)');
  deep.addColorStop(1, 'rgba(120,30,40,0.5)');
  g.fillStyle = deep;
  g.fillRect(256 - half - 24, gapTop, (half + 24) * 2, gapBot - gapTop);

  // gum ridges either side, then the tooth ridge biting inward
  for (const side of [-1, 1] as const) {
    g.fillStyle = '#8e3a3c';
    g.beginPath();
    g.moveTo(256 + side * (half + 6), gapTop);
    g.quadraticCurveTo(256 + side * (half + 34), 256, 256 + side * (half + 6), gapBot);
    g.lineTo(256 + side * (half + 52), gapBot);
    g.quadraticCurveTo(256 + side * (half + 80), 256, 256 + side * (half + 52), gapTop);
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(212,132,132,0.22)';
    g.fillRect(256 + side * (half + 10) - (side < 0 ? 10 : 0), gapTop, 10, gapBot - gapTop);
    // teeth: alternating long fangs and short molars, angled toward the gap
    for (let i = 0; i < 21; i++) {
      const y = gapTop + 10 + i * 22.5;
      const long = i % 3 === 0;
      const len = (long ? 62 : 34) + rng() * 12;
      const base = 256 + side * (half + 10);
      const w = long ? 15 : 11;
      const tip = base - side * len;
      const grd = g.createLinearGradient(base, y, tip, y);
      grd.addColorStop(0, '#b6a98c');
      grd.addColorStop(0.5, '#e9e2c8');
      grd.addColorStop(1, '#fffaea');
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(base, y - w);
      g.lineTo(base, y + w);
      g.lineTo(tip, y + (rng() - 0.5) * 8);
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(60,24,26,0.45)';
      g.lineWidth = 2;
      g.stroke();
      // gum line stain at the root
      g.fillStyle = 'rgba(92,26,32,0.55)';
      g.fillRect(base - (side > 0 ? 0 : 8), y - w, 8, w * 2);
    }
  }

  // drool strands bridging the gap
  for (let i = 0; i < 12; i++) {
    const y = 40 + rng() * 420;
    g.strokeStyle = `rgba(214,226,196,${0.2 + rng() * 0.35})`;
    g.lineWidth = 1 + rng() * 3;
    g.beginPath();
    g.moveTo(256 - half + 4, y);
    g.quadraticCurveTo(256, y + 20 + rng() * 40, 256 + half - 4, y + (rng() - 0.5) * 30);
    g.stroke();
  }
  // wet specular blooms on the mucosa
  for (let i = 0; i < 46; i++) {
    const x = rng() * S, y = rng() * S;
    if (Math.abs(x - 256) < 150) continue;
    const sh = g.createRadialGradient(x, y, 1, x, y, 8 + rng() * 22);
    sh.addColorStop(0, 'rgba(255,214,206,0.4)');
    sh.addColorStop(1, 'rgba(255,180,170,0)');
    g.fillStyle = sh;
    g.beginPath(); g.arc(x, y, 8 + rng() * 22, 0, Math.PI * 2); g.fill();
  }
  speckle(g, S, rng, 120, 'rgba(40,10,16,0.3)', 1, 5);
  noise(g, S, rng, 2200, 0.05);
  return c;
}

// ---------------------------------------------------------------- 19. bile pool

function heroBilePool(): HTMLCanvasElement {
  const S = 256;
  const { c, g } = canvas(S);
  const rng = heroSeed('gullet-bile-pool');
  // Clamped, not tiled: the pool fades to nothing before the edge so it can sit
  // anywhere on a floor without showing a rectangle.
  const pool = g.createRadialGradient(126, 132, 8, 128, 132, 122);
  pool.addColorStop(0, 'rgba(214,220,96,0.92)');
  pool.addColorStop(0.32, 'rgba(158,164,44,0.86)');
  pool.addColorStop(0.62, 'rgba(96,102,24,0.68)');
  pool.addColorStop(0.86, 'rgba(48,52,16,0.34)');
  pool.addColorStop(1, 'rgba(30,34,10,0)');
  g.save();
  g.translate(128, 132); g.scale(1, 0.78); g.translate(-128, -132);
  g.fillStyle = pool;
  g.beginPath(); g.arc(128, 132, 122, 0, Math.PI * 2); g.fill();
  g.restore();

  // ragged spill lobes reaching off the main oval
  for (let i = 0; i < 14; i++) {
    const a = rng() * Math.PI * 2;
    const d = 74 + rng() * 34;
    const x = 128 + Math.cos(a) * d, y = 132 + Math.sin(a) * d * 0.78;
    g.fillStyle = `rgba(${120 + rng() * 70 | 0},${128 + rng() * 60 | 0},${28 + rng() * 26 | 0},${0.3 + rng() * 0.4})`;
    g.beginPath(); g.ellipse(x, y, 10 + rng() * 26, 6 + rng() * 14, a, 0, Math.PI * 2); g.fill();
  }
  // thicker skin at the rim
  g.strokeStyle = 'rgba(66,72,18,0.5)';
  g.lineWidth = 6;
  g.save();
  g.translate(128, 132); g.scale(1, 0.78); g.translate(-128, -132);
  g.beginPath(); g.arc(128, 132, 104, 0, Math.PI * 2); g.stroke();
  g.restore();

  // bubbles: domes with a rim, a shadow and a specular pip
  for (let i = 0; i < 40; i++) {
    const a = rng() * Math.PI * 2, d = rng() * 96;
    const x = 128 + Math.cos(a) * d, y = 132 + Math.sin(a) * d * 0.78;
    const r = 3 + rng() * 15;
    g.fillStyle = 'rgba(36,40,10,0.4)';
    g.beginPath(); g.ellipse(x + 1.5, y + 2, r, r * 0.8, 0, 0, Math.PI * 2); g.fill();
    const dome = g.createRadialGradient(x - r * 0.3, y - r * 0.4, 1, x, y, r);
    dome.addColorStop(0, 'rgba(238,242,178,0.85)');
    dome.addColorStop(0.6, 'rgba(176,184,58,0.5)');
    dome.addColorStop(1, 'rgba(120,128,30,0.22)');
    g.fillStyle = dome;
    g.beginPath(); g.ellipse(x, y, r, r * 0.82, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(226,232,150,0.45)';
    g.lineWidth = 1.2;
    g.stroke();
    g.fillStyle = 'rgba(255,255,224,0.7)';
    g.beginPath(); g.arc(x - r * 0.32, y - r * 0.38, Math.max(0.8, r * 0.18), 0, Math.PI * 2); g.fill();
  }
  // froth ring where the bile has been churning
  for (let i = 0; i < 70; i++) {
    const a = rng() * Math.PI * 2, d = 52 + rng() * 44;
    g.fillStyle = `rgba(232,238,182,${0.12 + rng() * 0.3})`;
    g.beginPath(); g.arc(128 + Math.cos(a) * d, 132 + Math.sin(a) * d * 0.78, 0.8 + rng() * 2.4, 0, Math.PI * 2); g.fill();
  }
  // sheen streak, as if the pool is catching a light overhead
  const sheen = g.createLinearGradient(70, 80, 190, 176);
  sheen.addColorStop(0, 'rgba(255,255,214,0)');
  sheen.addColorStop(0.5, 'rgba(255,255,214,0.22)');
  sheen.addColorStop(1, 'rgba(255,255,214,0)');
  g.fillStyle = sheen;
  g.save();
  g.translate(128, 132); g.scale(1, 0.78); g.translate(-128, -132);
  g.beginPath(); g.arc(128, 132, 112, 0, Math.PI * 2); g.fill();
  g.restore();
  return c;
}

// ---------------------------------------------------------------- 20. candle crypt

function heroCandleCrypt(): HTMLCanvasElement {
  const S = 512;
  const { c, g } = canvas(S);
  const rng = heroSeed('catacombs-candle-crypt');
  // soot-blackened chapel stone
  g.fillStyle = '#17140f';
  g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 34) {
    for (let x = (y / 34) % 2 ? -26 : 0; x < S; x += 74) {
      const v = 34 + rng() * 26 | 0;
      g.fillStyle = `rgb(${v + 12},${v + 6},${v})`;
      g.fillRect(x + 2, y + 2, 70, 30);
      g.fillStyle = 'rgba(0,0,0,0.4)';
      g.fillRect(x + 2, y + 29, 70, 3);
    }
  }

  // Four deep niches, each a black box with a bone pile in it. Depth comes from
  // a hard inner shadow plus a lit lip, not from perspective.
  const skull = (x: number, y: number, r: number, tilt: number, lit: number): void => {
    g.save();
    g.translate(x, y); g.rotate(tilt);
    const v = 120 + lit * 90;
    g.fillStyle = `rgb(${v + 40 | 0},${v + 26 | 0},${v | 0})`;
    g.beginPath(); g.ellipse(0, 0, r, r * 1.06, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(8,6,4,0.94)';
    g.beginPath(); g.ellipse(-r * 0.36, -r * 0.06, r * 0.28, r * 0.35, 0.12, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(r * 0.36, -r * 0.06, r * 0.28, r * 0.35, -0.12, 0, Math.PI * 2); g.fill();
    g.beginPath();
    g.moveTo(0, r * 0.2); g.lineTo(-r * 0.16, r * 0.46); g.lineTo(r * 0.16, r * 0.46);
    g.closePath(); g.fill();
    g.fillStyle = `rgba(${v + 20 | 0},${v + 8 | 0},${v - 16 | 0},1)`;
    g.fillRect(-r * 0.54, r * 0.56, r * 1.08, r * 0.42);
    g.fillStyle = 'rgba(10,8,6,0.8)';
    for (let k = -2; k <= 2; k++) g.fillRect(k * r * 0.23 - 1, r * 0.56, 2.4, r * 0.42);
    g.restore();
  };

  for (let n = 0; n < 4; n++) {
    const nx = 18 + n * 122, ny = 66, nw = 100, nh = 296;
    // recess
    g.fillStyle = '#050403';
    g.fillRect(nx, ny, nw, nh);
    g.beginPath(); g.arc(nx + nw / 2, ny, nw / 2, Math.PI, 0); g.fill();
    // inner falloff so the back of the niche disappears
    const inner = g.createLinearGradient(0, ny, 0, ny + nh);
    inner.addColorStop(0, 'rgba(0,0,0,0.95)');
    inner.addColorStop(0.5, 'rgba(0,0,0,0.55)');
    inner.addColorStop(1, 'rgba(0,0,0,0.9)');
    // skull stack, denser and darker toward the back of the box
    for (let row = 0; row < 6; row++) {
      const by = ny + 44 + row * 46;
      const lit = 0.25 + row * 0.13;
      const offs = row % 2 ? 12 : 0;
      for (let k = 0; k < 3; k++) {
        skull(nx + 22 + offs + k * 30, by, 15 + rng() * 3, (rng() - 0.5) * 0.5, lit * (0.7 + rng() * 0.5));
      }
      // femur ends wedged between the courses
      for (let k = 0; k < 5; k++) {
        const bx = nx + 12 + k * 20;
        g.fillStyle = `rgba(${168 + lit * 50 | 0},${158 + lit * 44 | 0},${126 + lit * 36 | 0},1)`;
        g.beginPath(); g.arc(bx, by + 24, 7, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(16,12,8,0.6)';
        g.beginPath(); g.arc(bx, by + 24, 2.6, 0, Math.PI * 2); g.fill();
      }
    }
    g.fillStyle = inner;
    g.fillRect(nx, ny, nw, nh);
    // arch surround, lit lip on the left of each niche
    g.strokeStyle = '#6d6353';
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(nx, ny + nh); g.lineTo(nx, ny);
    g.arc(nx + nw / 2, ny, nw / 2, Math.PI, 0);
    g.lineTo(nx + nw, ny + nh);
    g.stroke();
    g.strokeStyle = 'rgba(216,204,176,0.3)';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(nx + 5, ny + nh); g.lineTo(nx + 5, ny + 6); g.stroke();

    // ledge with soot candles below the niche
    g.fillStyle = '#4b4438';
    g.fillRect(nx - 8, ny + nh, nw + 16, 16);
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(nx - 8, ny + nh + 13, nw + 16, 4);
    const soot = g.createLinearGradient(0, ny + nh, 0, ny - 40);
    soot.addColorStop(0, 'rgba(8,7,6,0.8)');
    soot.addColorStop(1, 'rgba(8,7,6,0)');
    g.fillStyle = soot;
    g.fillRect(nx - 4, 0, nw + 8, ny + nh);
    for (let k = 0; k < 4; k++) {
      const cx2 = nx + 6 + k * 26;
      const ch = 20 + rng() * 34;
      g.fillStyle = '#ded2a8';
      g.fillRect(cx2, ny + nh - ch, 11, ch);
      // wax runs down the ledge
      g.fillStyle = 'rgba(228,216,178,0.75)';
      for (let d = 0; d < 3; d++) g.fillRect(cx2 + 1 + d * 4, ny + nh, 3, 4 + rng() * 14);
      const fl = g.createRadialGradient(cx2 + 5, ny + nh - ch - 6, 1, cx2 + 5, ny + nh - ch - 6, 26);
      fl.addColorStop(0, 'rgba(255,236,178,0.95)');
      fl.addColorStop(0.28, 'rgba(255,178,66,0.45)');
      fl.addColorStop(1, 'rgba(255,140,30,0)');
      g.fillStyle = fl;
      g.fillRect(cx2 - 22, ny + nh - ch - 34, 56, 56);
      g.fillStyle = '#fff2c6';
      g.beginPath(); g.ellipse(cx2 + 5, ny + nh - ch - 7, 3, 6, 0, 0, Math.PI * 2); g.fill();
    }
  }

  // burial glyphs cut into the band under the ledges
  g.fillStyle = 'rgba(206,196,166,0.5)';
  for (let x = 14; x < S - 10; x += 26) {
    g.fillRect(x, 404, 5, 12 + (x % 4) * 6);
    if (x % 78 === 14) { g.fillRect(x - 7, 430, 20, 5); g.fillRect(x + 1, 430, 5, 14); }
  }
  // ash drift along the floor line
  g.fillStyle = 'rgba(190,182,158,0.14)';
  g.fillRect(0, 470, S, 42);
  speckle(g, S, rng, 220, 'rgba(214,204,174,0.14)', 1, 4);
  speckle(g, S, rng, 90, 'rgba(6,5,4,0.5)', 2, 8);
  noise(g, S, rng, 3000, 0.08);
  return c;
}

// ---------------------------------------------------------------- 21. femur wheel

function heroFemurWheel(): HTMLCanvasElement {
  const S = 256;
  const { c, g } = canvas(S);
  const rng = heroSeed('catacombs-femur-wheel');
  // ceiling rose: dark recess the wheel is pinned into
  const back = g.createRadialGradient(128, 128, 10, 128, 128, 126);
  back.addColorStop(0, '#241f18');
  back.addColorStop(0.7, '#120f0b');
  back.addColorStop(1, 'rgba(8,6,5,0)');
  g.fillStyle = back;
  g.beginPath(); g.arc(128, 128, 126, 0, Math.PI * 2); g.fill();

  // sixteen femurs radiating out, knuckle ends outward
  const femur = (a: number, r0: number, r1: number, w: number, tone: number): void => {
    g.save();
    g.translate(128, 128); g.rotate(a);
    const shaft = g.createLinearGradient(0, -w, 0, w);
    shaft.addColorStop(0, `rgb(${210 + tone | 0},${200 + tone | 0},${168 + tone | 0})`);
    shaft.addColorStop(0.5, `rgb(${180 + tone | 0},${170 + tone | 0},${138 + tone | 0})`);
    shaft.addColorStop(1, `rgb(${120 + tone | 0},${112 + tone | 0},${88 + tone | 0})`);
    g.fillStyle = shaft;
    g.beginPath();
    g.moveTo(r0, -w * 0.62); g.lineTo(r1, -w);
    g.lineTo(r1, w); g.lineTo(r0, w * 0.62);
    g.closePath(); g.fill();
    // condyle knuckles at each end
    for (const [rr, k] of [[r0, 0.72], [r1, 1.05]] as const) {
      g.fillStyle = `rgb(${216 + tone | 0},${206 + tone | 0},${172 + tone | 0})`;
      g.beginPath(); g.arc(rr, -w * k * 0.6, w * k * 0.7, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(rr, w * k * 0.6, w * k * 0.7, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(40,32,22,0.35)';
      g.beginPath(); g.arc(rr, 0, w * k * 0.3, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = 'rgba(36,28,20,0.4)';
    g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(r0 + 6, 0); g.lineTo(r1 - 6, 0); g.stroke();
    g.restore();
  };
  for (let i = 0; i < 16; i++) femur((Math.PI * 2 * i) / 16, 34, 112, 9 + rng() * 2, rng() * 24 - 12);
  // shorter ribs filling the gaps between spokes
  for (let i = 0; i < 16; i++) {
    const a = (Math.PI * 2 * (i + 0.5)) / 16;
    g.save();
    g.translate(128, 128); g.rotate(a);
    g.strokeStyle = 'rgba(198,188,156,0.75)';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(44, 0);
    g.quadraticCurveTo(78, -16, 104, -4);
    g.stroke();
    g.beginPath();
    g.moveTo(44, 0);
    g.quadraticCurveTo(78, 16, 104, 4);
    g.stroke();
    g.restore();
  }
  // vertebra ring binding the spoke ends
  for (let i = 0; i < 24; i++) {
    const a = (Math.PI * 2 * i) / 24;
    const x = 128 + Math.cos(a) * 116, y = 128 + Math.sin(a) * 116;
    g.fillStyle = '#c9bd9a';
    g.beginPath(); g.arc(x, y, 8, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(30,24,16,0.6)';
    g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(214,204,172,0.6)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x, y); g.lineTo(128 + Math.cos(a) * 126, 128 + Math.sin(a) * 126);
    g.stroke();
  }
  // hub: a single skull staring straight down
  g.fillStyle = '#0a0806';
  g.beginPath(); g.arc(128, 128, 38, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ddd2ac';
  g.beginPath(); g.ellipse(128, 124, 30, 32, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(10,8,6,0.95)';
  g.beginPath(); g.ellipse(117, 120, 8.5, 11, 0.12, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(139, 120, 8.5, 11, -0.12, 0, Math.PI * 2); g.fill();
  g.beginPath();
  g.moveTo(128, 130); g.lineTo(123, 143); g.lineTo(133, 143);
  g.closePath(); g.fill();
  g.fillStyle = '#c9bd9a';
  g.fillRect(112, 148, 32, 13);
  g.fillStyle = 'rgba(10,8,6,0.85)';
  for (let k = 0; k < 5; k++) g.fillRect(114 + k * 7, 148, 2.4, 13);
  g.strokeStyle = 'rgba(190,178,146,0.7)';
  g.lineWidth = 3;
  g.beginPath(); g.arc(128, 128, 40, 0, Math.PI * 2); g.stroke();
  speckle(g, S, rng, 90, 'rgba(24,18,12,0.35)', 1, 4);
  noise(g, S, rng, 900, 0.07);
  return c;
}

// ---------------------------------------------------------------- 22. rust sun

function heroRustSun(): HTMLCanvasElement {
  const S = 512;
  const { c, g } = canvas(S);
  const rng = heroSeed('pit-rust-sun');
  // sick ochre haze, thickest at the horizon
  const sky = g.createLinearGradient(0, 0, 0, S);
  sky.addColorStop(0, '#4a3a1e');
  sky.addColorStop(0.42, '#7d6026');
  sky.addColorStop(0.72, '#b08a35');
  sky.addColorStop(1, '#6b5220');
  g.fillStyle = sky;
  g.fillRect(0, 0, S, S);
  // dust banding
  for (let i = 0; i < 30; i++) {
    const y = rng() * S;
    g.fillStyle = `rgba(${180 + rng() * 50 | 0},${150 + rng() * 40 | 0},${80 + rng() * 40 | 0},${0.04 + rng() * 0.09})`;
    g.fillRect(0, y, S, 6 + rng() * 40);
  }

  // the disc: corona, then a flat rust plate of a sun
  const corona = g.createRadialGradient(252, 240, 60, 252, 240, 250);
  corona.addColorStop(0, 'rgba(255,196,86,0.5)');
  corona.addColorStop(0.35, 'rgba(214,136,40,0.26)');
  corona.addColorStop(1, 'rgba(120,70,20,0)');
  g.fillStyle = corona;
  g.fillRect(0, 0, S, S);
  const disc = g.createRadialGradient(238, 226, 20, 252, 240, 152);
  disc.addColorStop(0, '#ffe6a4');
  disc.addColorStop(0.28, '#e8a03a');
  disc.addColorStop(0.62, '#a85c1c');
  disc.addColorStop(0.88, '#6d3410');
  disc.addColorStop(1, '#4a2409');
  g.fillStyle = disc;
  g.beginPath(); g.arc(252, 240, 152, 0, Math.PI * 2); g.fill();
  // concentric rust rings, like a corroded plate rather than a star
  g.save();
  g.beginPath(); g.arc(252, 240, 152, 0, Math.PI * 2); g.clip();
  for (let r = 18; r < 160; r += 9 + rng() * 8) {
    g.strokeStyle = `rgba(${90 + rng() * 70 | 0},${44 + rng() * 40 | 0},14,${0.1 + rng() * 0.3})`;
    g.lineWidth = 1 + rng() * 5;
    g.beginPath(); g.arc(252 + (rng() - 0.5) * 8, 240 + (rng() - 0.5) * 8, r, 0, Math.PI * 2); g.stroke();
  }
  // corrosion blooms eating into the disc
  for (let i = 0; i < 60; i++) {
    const a = rng() * Math.PI * 2, d = rng() * 150;
    g.fillStyle = `rgba(${118 + rng() * 60 | 0},${52 + rng() * 40 | 0},${14 + rng() * 20 | 0},${0.14 + rng() * 0.4})`;
    g.beginPath();
    g.ellipse(252 + Math.cos(a) * d, 240 + Math.sin(a) * d, 5 + rng() * 26, 4 + rng() * 18, rng() * 3, 0, Math.PI * 2);
    g.fill();
  }
  // pitting
  speckle(g, S, rng, 200, 'rgba(52,24,8,0.4)', 1, 5);
  g.restore();
  g.strokeStyle = 'rgba(52,26,8,0.6)';
  g.lineWidth = 7;
  g.beginPath(); g.arc(252, 240, 152, 0, Math.PI * 2); g.stroke();

  // gantry bars in silhouette across the disc
  g.fillStyle = '#1b1610';
  for (const bx of [46, 168, 300, 434] as const) {
    g.fillRect(bx, 0, 26, S);
    g.fillStyle = 'rgba(120,92,44,0.22)';
    g.fillRect(bx, 0, 5, S);
    g.fillStyle = '#1b1610';
  }
  for (const by of [92, 300] as const) {
    g.fillRect(0, by, S, 22);
    g.fillStyle = 'rgba(120,92,44,0.22)';
    g.fillRect(0, by, S, 4);
    g.fillStyle = '#1b1610';
  }
  // cross-bracing between the uprights
  g.strokeStyle = '#1b1610';
  g.lineWidth = 9;
  for (const [x0, x1] of [[72, 168], [194, 300], [326, 434]] as const) {
    for (const [y0, y1] of [[114, 300], [300, 470], [0, 92]] as const) {
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      g.beginPath(); g.moveTo(x1, y0); g.lineTo(x0, y1); g.stroke();
    }
  }
  // rust weeping down the bars
  for (let i = 0; i < 44; i++) {
    const bx = [46, 168, 300, 434][rng() * 4 | 0] + rng() * 26;
    const y = rng() * S;
    g.fillStyle = `rgba(${140 + rng() * 60 | 0},${64 + rng() * 40 | 0},18,${0.16 + rng() * 0.3})`;
    g.fillRect(bx, y, 2 + rng() * 4, 20 + rng() * 90);
  }
  // rivet rows on the crossbeams
  for (let x = 12; x < S; x += 30) {
    rivet(g, x, 103, 4, '#8a6c38', '#0e0b07');
    rivet(g, x, 311, 4, '#8a6c38', '#0e0b07');
  }
  // grit blowing across the whole plate
  speckle(g, S, rng, 150, 'rgba(30,22,10,0.28)', 1, 4);
  noise(g, S, rng, 2600, 0.07);
  return c;
}

// ---------------------------------------------------------------- 23. hook crown

function heroHookCrown(): HTMLCanvasElement {
  const S = 256;
  const { c, g } = canvas(S);
  const rng = heroSeed('pit-hook-crown');
  // Silhouette first: a crane hook hung dead centre, big enough to read as a
  // crown when a player looks up at it.
  const iron = (w: number, col: string): void => {
    g.strokeStyle = col;
    g.lineWidth = w;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    // shank
    g.beginPath(); g.moveTo(128, 62); g.lineTo(128, 138); g.stroke();
    // the hook body: a big open C swinging left then curling back up right
    g.beginPath();
    g.moveTo(128, 138);
    g.bezierCurveTo(128, 206, 74, 226, 56, 186);
    g.bezierCurveTo(42, 152, 76, 132, 96, 158);
    g.stroke();
  };
  iron(40, '#120e09');
  iron(30, '#6b4c22');
  iron(20, '#8f6a30');
  iron(9, 'rgba(212,168,96,0.55)');
  g.lineCap = 'butt';
  g.lineJoin = 'miter';

  // hook point, sharpened
  g.fillStyle = '#c39a4e';
  g.beginPath();
  g.moveTo(96, 158); g.lineTo(112, 146); g.lineTo(104, 178);
  g.closePath(); g.fill();
  g.strokeStyle = '#3a2a12';
  g.lineWidth = 2;
  g.stroke();
  // safety latch across the throat
  g.strokeStyle = '#4a3a1c';
  g.lineWidth = 6;
  g.beginPath(); g.moveTo(126, 148); g.lineTo(86, 194); g.stroke();

  // sheave block and trunnion above the shank
  g.fillStyle = '#241c12';
  g.beginPath();
  g.moveTo(88, 18); g.lineTo(168, 18); g.lineTo(158, 74); g.lineTo(98, 74);
  g.closePath(); g.fill();
  g.strokeStyle = '#8f6a30';
  g.lineWidth = 5;
  g.stroke();
  g.fillStyle = '#0b0805';
  g.beginPath(); g.arc(128, 44, 20, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#a8813c';
  g.lineWidth = 4;
  g.beginPath(); g.arc(128, 44, 20, 0, Math.PI * 2); g.stroke();
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI * 2 * i) / 10;
    g.strokeStyle = 'rgba(168,129,60,0.5)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(128 + Math.cos(a) * 6, 44 + Math.sin(a) * 6);
    g.lineTo(128 + Math.cos(a) * 18, 44 + Math.sin(a) * 18);
    g.stroke();
  }
  for (const bx of [98, 158] as const) rivet(g, bx, 30, 5, '#c0a066', '#0d0a06');

  // chain climbing out of frame — the crown's points
  let cy2 = 18;
  for (let i = 0; i < 5; i++) {
    g.strokeStyle = i % 2 ? '#7a5a28' : '#96703a';
    g.lineWidth = 7;
    g.beginPath();
    g.ellipse(128, cy2 - 6, i % 2 ? 9 : 14, 16, i % 2 ? Math.PI / 2 : 0, 0, Math.PI * 2);
    g.stroke();
    cy2 -= 22;
  }

  // rust bleeding down the iron and pooling under the point
  for (let i = 0; i < 60; i++) {
    const x = 44 + rng() * 150, y = 30 + rng() * 190;
    g.fillStyle = `rgba(${150 + rng() * 70 | 0},${70 + rng() * 46 | 0},${18 + rng() * 18 | 0},${0.1 + rng() * 0.34})`;
    g.fillRect(x, y, 2 + rng() * 5, 8 + rng() * 40);
  }
  for (let i = 0; i < 40; i++) {
    const a = rng() * Math.PI * 2, d = rng() * 90;
    g.fillStyle = `rgba(${120 + rng() * 60 | 0},${56 + rng() * 34 | 0},14,${0.14 + rng() * 0.3})`;
    g.beginPath(); g.ellipse(110 + Math.cos(a) * d, 150 + Math.sin(a) * d, 3 + rng() * 12, 2 + rng() * 8, rng() * 3, 0, Math.PI * 2); g.fill();
  }
  // load-rating stencil on the block
  g.fillStyle = '#c8a340';
  segDigit(g, 4, 176, 30, 16, 30, 4);
  segDigit(g, 0, 196, 30, 16, 30, 4);
  g.fillRect(176, 66, 36, 4);
  speckle(g, S, rng, 70, 'rgba(20,14,8,0.4)', 1, 5);
  return c;
}

// ---------------------------------------------------------------- 24. lattice totem

function heroLatticeTotem(): HTMLCanvasElement {
  const S = 512;
  const { c, g } = canvas(S);
  const rng = heroSeed('spire-lattice-totem');
  // composite shaft wall
  const wall = g.createLinearGradient(0, 0, S, S);
  wall.addColorStop(0, '#20262c');
  wall.addColorStop(0.5, '#161b21');
  wall.addColorStop(1, '#0e1216');
  g.fillStyle = wall;
  g.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += 64) {
    g.fillStyle = 'rgba(140,160,178,0.05)';
    g.fillRect(x, 0, 2, S);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(x + 62, 0, 2, S);
  }
  for (let y = 0; y < S; y += 128) {
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.fillRect(0, y, S, 5);
    g.fillStyle = 'rgba(150,172,190,0.07)';
    g.fillRect(0, y + 5, S, 2);
  }

  // Copper traces climbing the wall toward the mast, like a circuit routed by
  // an electrician with a straightedge: right-angle runs with via pads.
  const via = (x: number, y: number): void => {
    g.fillStyle = '#c07a3c';
    g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0e1216';
    g.beginPath(); g.arc(x, y, 2.4, 0, Math.PI * 2); g.fill();
  };
  for (let i = 0; i < 22; i++) {
    let x = rng() < 0.5 ? 10 + rng() * 130 : 372 + rng() * 130;
    let y = 20 + rng() * 470;
    g.strokeStyle = `rgba(192,122,60,${0.35 + rng() * 0.45})`;
    g.lineWidth = 2 + rng() * 3;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 5; s++) {
      if (s % 2 === 0) x += (x < 256 ? 1 : -1) * (20 + rng() * 60);
      else y -= 24 + rng() * 70;
      g.lineTo(x, y);
    }
    g.stroke();
    via(x, y);
  }

  // the totem: a vertical mast of stacked lattice bays
  const mx = 256, top = 26, bot = 470, hw = 62;
  g.fillStyle = '#0a0d11';
  g.fillRect(mx - hw - 10, top - 10, (hw + 10) * 2, bot - top + 26);
  // uprights
  for (const ux of [mx - hw, mx - 22, mx + 22, mx + hw] as const) {
    const leg = g.createLinearGradient(ux - 8, 0, ux + 8, 0);
    leg.addColorStop(0, '#4d5964');
    leg.addColorStop(0.4, '#87949f');
    leg.addColorStop(1, '#2b333a');
    g.fillStyle = leg;
    g.fillRect(ux - 8, top, 16, bot - top);
  }
  // bay braces and platform rings
  for (let y = top; y < bot; y += 56) {
    g.strokeStyle = '#6c7883';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(mx - hw, y); g.lineTo(mx + hw, y + 56);
    g.moveTo(mx + hw, y); g.lineTo(mx - hw, y + 56);
    g.stroke();
    g.fillStyle = '#39424a';
    g.fillRect(mx - hw - 14, y, (hw + 14) * 2, 9);
    g.fillStyle = 'rgba(176,196,212,0.25)';
    g.fillRect(mx - hw - 14, y, (hw + 14) * 2, 2);
    // copper collar every other bay
    if (((y - top) / 56) % 2 === 0) {
      g.fillStyle = '#c07a3c';
      g.fillRect(mx - hw - 14, y + 9, (hw + 14) * 2, 3);
      via(mx - hw - 8, y + 4);
      via(mx + hw + 8, y + 4);
    }
    for (let k = -1; k <= 1; k += 2) rivet(g, mx + k * (hw + 4), y + 4, 4, '#c2d0da', '#0b0e11');
  }
  // antenna elements sprouting off the mast
  for (let i = 0; i < 9; i++) {
    const y = top + 34 + i * 48;
    const side = i % 2 ? 1 : -1;
    g.strokeStyle = '#9aa7b2';
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(mx + side * hw, y); g.lineTo(mx + side * (hw + 60 + (i % 3) * 26), y - 14); g.stroke();
    g.fillStyle = '#c07a3c';
    g.beginPath(); g.arc(mx + side * (hw + 60 + (i % 3) * 26), y - 14, 6, 0, Math.PI * 2); g.fill();
    // dipole crossbars
    g.strokeStyle = 'rgba(154,167,178,0.8)';
    g.lineWidth = 3;
    for (let k = 1; k <= 3; k++) {
      const px = mx + side * (hw + 14 * k), py = y - 3.3 * k;
      g.beginPath(); g.moveTo(px, py - 12); g.lineTo(px, py + 12); g.stroke();
    }
  }
  // status lamps down the spine
  for (let i = 0; i < 8; i++) {
    const y = top + 40 + i * 56;
    const on = i % 3 !== 1;
    const lamp = g.createRadialGradient(mx, y, 1, mx, y, 16);
    lamp.addColorStop(0, on ? 'rgba(224,244,255,0.95)' : 'rgba(190,86,42,0.8)');
    lamp.addColorStop(0.4, on ? 'rgba(120,186,238,0.4)' : 'rgba(150,60,26,0.3)');
    lamp.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = lamp;
    g.fillRect(mx - 18, y - 18, 36, 36);
  }
  // mast head beacon
  g.fillStyle = '#2b333a';
  g.beginPath();
  g.moveTo(mx - 26, top); g.lineTo(mx, top - 26); g.lineTo(mx + 26, top);
  g.closePath(); g.fill();
  const beacon = g.createRadialGradient(mx, top - 18, 2, mx, top - 18, 40);
  beacon.addColorStop(0, 'rgba(255,255,255,0.95)');
  beacon.addColorStop(0.3, 'rgba(140,200,248,0.45)');
  beacon.addColorStop(1, 'rgba(80,150,220,0)');
  g.fillStyle = beacon;
  g.fillRect(mx - 42, top - 58, 84, 84);

  // floor numerals stencilled either side of the base — which level this is
  g.fillStyle = '#c9d6e0';
  segDigit(g, 4, 60, 396, 40, 74, 9);
  segDigit(g, 7, 112, 396, 40, 74, 9);
  g.fillStyle = '#c07a3c';
  g.fillRect(60, 484, 92, 6);
  g.fillStyle = 'rgba(201,214,224,0.7)';
  segDigit(g, 4, 372, 410, 30, 56, 7);
  segDigit(g, 8, 410, 410, 30, 56, 7);
  g.fillStyle = 'rgba(192,122,60,0.7)';
  g.fillRect(372, 476, 68, 5);
  // elevation caret above the lower numeral pair
  g.strokeStyle = '#c07a3c';
  g.lineWidth = 5;
  g.beginPath(); g.moveTo(384, 396); g.lineTo(404, 374); g.lineTo(424, 396); g.stroke();

  speckle(g, S, rng, 90, 'rgba(200,220,236,0.07)', 1, 3);
  noise(g, S, rng, 2200, 0.05);
  return c;
}

// ---------------------------------------------------------------- 25. elevation stela

function heroElevationStela(): HTMLCanvasElement {
  const S = 256;
  const { c, g } = canvas(S);
  const rng = heroSeed('spire-elevation-stela');
  // brushed landing plaque, tall and narrow
  const px = 54, pw = 148;
  g.fillStyle = '#0c1014';
  g.fillRect(px - 10, 8, pw + 20, 240);
  const plate = g.createLinearGradient(px, 0, px + pw, 0);
  plate.addColorStop(0, '#3b454e');
  plate.addColorStop(0.35, '#69757f');
  plate.addColorStop(0.7, '#4b565f');
  plate.addColorStop(1, '#242c33');
  g.fillStyle = plate;
  g.fillRect(px, 14, pw, 228);
  // brush grain
  for (let i = 0; i < 130; i++) {
    g.fillStyle = `rgba(${rng() < 0.5 ? '210,226,238' : '10,14,18'},${0.03 + rng() * 0.08})`;
    g.fillRect(px + 2, 16 + rng() * 224, pw - 4, 1);
  }
  g.strokeStyle = '#c07a3c';
  g.lineWidth = 4;
  g.strokeRect(px + 6, 20, pw - 12, 216);
  for (const cy2 of [26, 230] as const) {
    rivet(g, px + 16, cy2, 5, '#cfdae2', '#0a0d10');
    rivet(g, px + pw - 16, cy2, 5, '#cfdae2', '#0a0d10');
  }

  // Stacked elevation marks: each landing above this one, most recent at the
  // top, with the current level highlighted in copper.
  const marks: readonly [number, number, boolean][] = [
    [6, 3, false], [5, 8, false], [4, 8, true], [3, 6, false], [2, 4, false], [1, 2, false],
  ];
  marks.forEach(([hundreds, tens, here], i) => {
    const y = 34 + i * 34;
    if (here) {
      g.fillStyle = 'rgba(192,122,60,0.22)';
      g.fillRect(px + 10, y - 4, pw - 20, 30);
      g.fillStyle = '#c07a3c';
      g.beginPath();
      g.moveTo(px + 14, y + 4); g.lineTo(px + 26, y + 11); g.lineTo(px + 14, y + 18);
      g.closePath(); g.fill();
    }
    g.fillStyle = here ? '#f0d9b8' : 'rgba(206,220,230,0.72)';
    segDigit(g, hundreds, px + 34, y, 15, 24, 3.5);
    segDigit(g, tens, px + 54, y, 15, 24, 3.5);
    segDigit(g, 0, px + 74, y, 15, 24, 3.5);
    // tick ladder to the right of each reading
    g.fillStyle = here ? '#c07a3c' : 'rgba(150,170,186,0.5)';
    g.fillRect(px + 98, y + 10, 34, 3);
    for (let k = 0; k < 4; k++) g.fillRect(px + 100 + k * 9, y + 4, 2, 9);
    g.fillStyle = 'rgba(10,14,18,0.5)';
    g.fillRect(px + 12, y + 27, pw - 24, 2);
  });

  // "elevation" rule down the left edge: a scale bar with major/minor ticks
  g.fillStyle = 'rgba(201,214,224,0.55)';
  g.fillRect(px + 2, 20, 3, 216);
  for (let y = 20; y <= 236; y += 8) {
    const major = (y - 20) % 32 === 0;
    g.fillRect(px + 2, y, major ? 12 : 7, major ? 3 : 2);
  }
  // copper header band and shaft-side arrow
  g.fillStyle = '#c07a3c';
  g.fillRect(px + 6, 14, pw - 12, 6);
  g.fillRect(px + 6, 236, pw - 12, 6);
  g.strokeStyle = 'rgba(192,122,60,0.85)';
  g.lineWidth = 5;
  g.beginPath(); g.moveTo(214, 210); g.lineTo(214, 60); g.stroke();
  g.beginPath(); g.moveTo(202, 74); g.lineTo(214, 54); g.lineTo(226, 74); g.stroke();
  // scuffs from decades of shoulders brushing past
  for (let i = 0; i < 22; i++) {
    g.strokeStyle = `rgba(214,230,242,${0.04 + rng() * 0.12})`;
    g.lineWidth = 1 + rng() * 2;
    const x = px + rng() * pw, y = 18 + rng() * 220;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + rng() * 18 - 9, y + rng() * 4 - 2); g.stroke();
  }
  return c;
}

// ---------------------------------------------------------------- 26. plague seal

function heroPlagueSeal(): HTMLCanvasElement {
  const S = 512;
  const { c, g } = canvas(S);
  const rng = heroSeed('ward-plague-seal');
  // cracked institutional tile
  g.fillStyle = '#1d2420';
  g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 64) {
    for (let x = 0; x < S; x += 64) {
      const v = 118 + rng() * 34;
      g.fillStyle = `rgb(${v * 0.86 | 0},${v | 0},${v * 0.9 | 0})`;
      g.fillRect(x + 3, y + 3, 58, 58);
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(x + 3, y + 3, 58, 3);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(x + 3, y + 58, 58, 3);
      // some tiles are missing entirely
      if (rng() < 0.08) {
        g.fillStyle = '#0f1512';
        g.fillRect(x + 3, y + 3, 58, 58);
      }
    }
  }
  // grime creeping out of the grout
  for (let i = 0; i < 60; i++) {
    const x = (rng() * 8 | 0) * 64, y = rng() * S;
    g.fillStyle = `rgba(${40 + rng() * 40 | 0},${52 + rng() * 40 | 0},${34 + rng() * 30 | 0},${0.12 + rng() * 0.3})`;
    g.fillRect(x, y, 64, 3 + rng() * 20);
  }
  // structural cracks running across the tile field
  for (let i = 0; i < 9; i++) {
    let x = rng() * S, y = rng() * S;
    g.strokeStyle = `rgba(14,20,16,${0.4 + rng() * 0.4})`;
    g.lineWidth = 1 + rng() * 4;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 12; s++) {
      x += (rng() - 0.5) * 90; y += (rng() - 0.5) * 90;
      g.lineTo(x, y);
    }
    g.stroke();
  }

  // The seal: a stamped disc over the entry, big enough to stop you walking in.
  const cx = 256, cy = 246;
  g.fillStyle = 'rgba(12,18,14,0.55)';
  g.beginPath(); g.arc(cx, cy, 198, 0, Math.PI * 2); g.fill();
  for (const [r, w, col] of [[196, 12, '#d8c23a'], [176, 5, '#1b2119'], [166, 3, '#d8c23a']] as const) {
    g.strokeStyle = col;
    g.lineWidth = w;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  }
  // hazard band between the rings
  g.save();
  g.beginPath(); g.arc(cx, cy, 196, 0, Math.PI * 2);
  g.arc(cx, cy, 176, 0, Math.PI * 2, true);
  g.clip('evenodd');
  for (let i = 0; i < 44; i++) {
    const a0 = (Math.PI * 2 * i) / 44, a1 = (Math.PI * 2 * (i + 1)) / 44;
    g.fillStyle = i % 2 ? '#d8c23a' : '#171d15';
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, 200, a0, a1);
    g.closePath(); g.fill();
  }
  g.restore();

  // biohazard trefoil at the heart of the seal
  g.save();
  g.translate(cx, cy);
  for (let i = 0; i < 3; i++) {
    g.save();
    g.rotate((Math.PI * 2 * i) / 3);
    g.fillStyle = '#d8c23a';
    g.beginPath(); g.arc(0, -96, 46, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#101610';
    g.beginPath(); g.arc(0, -96, 26, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#d8c23a';
    g.beginPath();
    g.moveTo(-22, -52); g.lineTo(22, -52); g.lineTo(14, -18); g.lineTo(-14, -18);
    g.closePath(); g.fill();
    g.restore();
  }
  g.fillStyle = '#101610';
  g.beginPath(); g.arc(0, 0, 34, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#d8c23a';
  g.beginPath(); g.arc(0, 0, 22, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#101610';
  g.beginPath(); g.arc(0, 0, 11, 0, Math.PI * 2); g.fill();
  g.restore();

  // quarantine legend arcing under the seal, as stencil ticks
  g.fillStyle = 'rgba(216,194,58,0.8)';
  for (let i = 0; i < 30; i++) {
    const a = Math.PI * (0.16 + (i / 29) * 0.68);
    const x = cx + Math.cos(a) * 148, y = cy + Math.sin(a) * 148;
    g.save(); g.translate(x, y); g.rotate(a - Math.PI / 2);
    g.fillRect(-3, -9, 6, 18 - (i % 3) * 5);
    g.restore();
  }

  // planks barred across the doorway in an X, nailed at the crossings
  const plank = (x0: number, y0: number, x1: number, y1: number): void => {
    const a = Math.atan2(y1 - y0, x1 - x0), len = Math.hypot(x1 - x0, y1 - y0);
    g.save();
    g.translate(x0, y0); g.rotate(a);
    const wood = g.createLinearGradient(0, -30, 0, 30);
    wood.addColorStop(0, '#6b5638');
    wood.addColorStop(0.4, '#42341f');
    wood.addColorStop(1, '#241b10');
    g.fillStyle = wood;
    g.fillRect(0, -30, len, 60);
    g.strokeStyle = 'rgba(12,8,4,0.8)';
    g.lineWidth = 4;
    g.strokeRect(0, -30, len, 60);
    for (let i = 0; i < 22; i++) {
      g.strokeStyle = `rgba(${rng() < 0.5 ? '150,124,86' : '20,14,8'},${0.1 + rng() * 0.25})`;
      g.lineWidth = 1 + rng() * 2;
      const gy = -26 + rng() * 52;
      g.beginPath(); g.moveTo(rng() * len * 0.3, gy); g.lineTo(len * (0.4 + rng() * 0.6), gy + (rng() - 0.5) * 6); g.stroke();
    }
    for (const t of [0.08, 0.5, 0.92] as const) {
      rivet(g, len * t - 10, -12, 5, '#b9c4cc', '#0b0d0a');
      rivet(g, len * t + 10, 12, 5, '#b9c4cc', '#0b0d0a');
    }
    g.restore();
  };
  plank(-20, 60, 532, 452);
  plank(-20, 452, 532, 60);
  // stencilled warning strip across the middle plank
  g.save();
  g.translate(256, 256); g.rotate(0.63);
  g.fillStyle = 'rgba(216,194,58,0.9)';
  for (let x = -190; x < 190; x += 30) {
    g.beginPath();
    g.moveTo(x, -20); g.lineTo(x + 14, -20); g.lineTo(x + 2, 20); g.lineTo(x - 12, 20);
    g.closePath(); g.fill();
  }
  g.restore();
  // splatter and mildew over everything
  speckle(g, S, rng, 120, 'rgba(30,44,26,0.35)', 2, 9);
  speckle(g, S, rng, 60, 'rgba(96,32,26,0.3)', 1, 6);
  noise(g, S, rng, 3000, 0.07);
  return c;
}

// ---------------------------------------------------------------- 27. key rack

function heroKeyRack(): HTMLCanvasElement {
  const S = 256;
  const { c, g } = canvas(S);
  const rng = heroSeed('ward-key-rack');
  // nurse-station tile behind the board
  for (let y = 0; y < S; y += 32) {
    for (let x = 0; x < S; x += 32) {
      const v = 108 + rng() * 30;
      g.fillStyle = `rgb(${v * 0.85 | 0},${v | 0},${v * 0.9 | 0})`;
      g.fillRect(x + 2, y + 2, 28, 28);
    }
  }
  g.fillStyle = 'rgba(20,28,22,0.4)';
  g.fillRect(0, 0, S, S);
  // the board itself
  g.fillStyle = '#2a2119';
  g.fillRect(20, 26, 216, 206);
  g.strokeStyle = '#5d4c34';
  g.lineWidth = 5;
  g.strokeRect(20, 26, 216, 206);
  for (const [bx, by] of [[30, 36], [226, 36], [30, 222], [226, 222]] as const) rivet(g, bx, by, 5, '#a8b4bc', '#0d100c');
  // rails the keys hang from
  for (const ry of [72, 134, 196] as const) {
    g.fillStyle = '#8d7a55';
    g.fillRect(30, ry, 196, 7);
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(30, ry + 6, 196, 3);
  }

  // Cell keys: each bow carries a different ward sigil so a player can tell
  // them apart at a glance, and every bit pattern is unique.
  const key = (x: number, y: number, bow: number, bits: number, tone: string): void => {
    g.save();
    g.translate(x, y);
    // hook
    g.strokeStyle = '#c3ccd2';
    g.lineWidth = 3;
    g.beginPath(); g.arc(0, -6, 5, Math.PI * 0.15, Math.PI * 0.95); g.stroke();
    // bow
    g.strokeStyle = tone;
    g.lineWidth = 5;
    g.beginPath(); g.arc(0, 8, 11, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.beginPath(); g.arc(0, 8, 8, 0, Math.PI * 2); g.fill();
    // the sigil inside the bow
    g.fillStyle = tone;
    g.strokeStyle = tone;
    g.lineWidth = 2;
    if (bow === 0) { g.fillRect(-4, 4, 8, 8); }
    else if (bow === 1) { g.beginPath(); g.arc(0, 8, 4, 0, Math.PI * 2); g.fill(); }
    else if (bow === 2) { g.beginPath(); g.moveTo(0, 2); g.lineTo(5, 12); g.lineTo(-5, 12); g.closePath(); g.fill(); }
    else if (bow === 3) { g.fillRect(-5, 7, 10, 3); g.fillRect(-1.5, 3, 3, 11); }
    else { starPath(g, 0, 8, 6, 5, 2); g.stroke(); }
    // shank and ward bits
    g.strokeStyle = tone;
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(0, 19); g.lineTo(0, 54); g.stroke();
    g.fillStyle = tone;
    for (let b = 0; b < 4; b++) {
      if (bits & (1 << b)) g.fillRect(2, 34 + b * 5, 8 - (b % 2) * 3, 4);
    }
    g.fillRect(-8, 50, 8, 5);
    // paper tag tied to the bow
    g.save();
    g.rotate(0.18);
    g.fillStyle = 'rgba(214,206,176,0.9)';
    g.fillRect(9, 14, 20, 13);
    g.fillStyle = 'rgba(40,34,24,0.8)';
    g.fillRect(11, 17, 16, 2);
    g.fillRect(11, 21, 11, 2);
    g.restore();
    g.restore();
  };
  const tones = ['#cfd8de', '#c9b26a', '#a9b6be', '#d8c23a', '#9fa9b0'] as const;
  let bits = 3;
  for (let row = 0; row < 3; row++) {
    for (let k = 0; k < 6; k++) {
      bits = (bits * 5 + 3) % 16;
      key(44 + k * 34, 76 + row * 62, (row * 6 + k) % 5, bits || 9, tones[(row + k) % 5]);
    }
  }
  // a few empty hooks where keys are signed out
  g.strokeStyle = '#8f9aa2';
  g.lineWidth = 3;
  for (const [hx, hy] of [[112, 138], [180, 200], [78, 76]] as const) {
    g.clearRect(hx - 18, hy - 4, 36, 62);
    g.beginPath(); g.arc(hx, hy - 6, 5, Math.PI * 0.15, Math.PI * 0.95); g.stroke();
  }
  // grime and a chipped corner
  speckle(g, S, rng, 70, 'rgba(24,34,24,0.3)', 1, 5);
  noise(g, S, rng, 900, 0.06);
  return c;
}

// ---------------------------------------------------------------- 28. seventh seal

function heroSeventhSeal(): HTMLCanvasElement {
  const S = 512;
  const { c, g } = canvas(S);
  const rng = heroSeed('sanctum-seventh-seal');
  // void floor: the inlay is the only thing in the frame
  g.fillStyle = '#05040a';
  g.fillRect(0, 0, S, S);
  const bloom = g.createRadialGradient(256, 256, 20, 256, 256, 260);
  bloom.addColorStop(0, 'rgba(226,190,110,0.26)');
  bloom.addColorStop(0.55, 'rgba(140,106,42,0.1)');
  bloom.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = bloom;
  g.fillRect(0, 0, S, S);

  // outer band of gold, with seven nodes marking the star points
  for (const [r, w] of [[240, 10], [222, 3], [190, 5]] as const) {
    g.strokeStyle = 'rgba(217,180,92,0.85)';
    g.lineWidth = w;
    g.beginPath(); g.arc(256, 256, r, 0, Math.PI * 2); g.stroke();
  }
  // inscription ticks between the rings
  g.fillStyle = 'rgba(217,180,92,0.5)';
  for (let i = 0; i < 98; i++) {
    const a = (Math.PI * 2 * i) / 98;
    g.save();
    g.translate(256 + Math.cos(a) * 231, 256 + Math.sin(a) * 231);
    g.rotate(a);
    g.fillRect(-6, -2, 12, i % 7 === 0 ? 5 : 3);
    g.restore();
  }

  // the heptagram itself, drawn heavy then re-lit
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(20,14,6,0.9)';
  g.lineWidth = 22;
  starPath(g, 256, 256, 186, 7, 3);
  g.stroke();
  const gold = g.createLinearGradient(70, 70, 442, 442);
  gold.addColorStop(0, '#f6e2ab');
  gold.addColorStop(0.35, '#d9b45c');
  gold.addColorStop(0.6, '#9a7830');
  gold.addColorStop(1, '#f0d189');
  g.strokeStyle = gold;
  g.lineWidth = 13;
  starPath(g, 256, 256, 186, 7, 3);
  g.stroke();
  g.strokeStyle = 'rgba(255,246,214,0.55)';
  g.lineWidth = 3;
  starPath(g, 256, 256, 186, 7, 3);
  g.stroke();
  // a second, counter-wound star inside it
  g.strokeStyle = 'rgba(217,180,92,0.4)';
  g.lineWidth = 5;
  starPath(g, 256, 256, 128, 7, 2);
  g.stroke();

  // seven node discs on the outer points, each numbered by pip count
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (Math.PI * 2 * i) / 7;
    const x = 256 + Math.cos(a) * 186, y = 256 + Math.sin(a) * 186;
    g.fillStyle = '#0a0810';
    g.beginPath(); g.arc(x, y, 27, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#f0d189';
    g.lineWidth = 5;
    g.beginPath(); g.arc(x, y, 27, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#f6e2ab';
    for (let k = 0; k <= i; k++) {
      const pa = (Math.PI * 2 * k) / (i + 1) - Math.PI / 2;
      g.beginPath(); g.arc(x + Math.cos(pa) * (i ? 13 : 0), y + Math.sin(pa) * (i ? 13 : 0), 4, 0, Math.PI * 2); g.fill();
    }
  }

  // centre medallion: the gun laid across a seven
  g.fillStyle = '#08060e';
  g.beginPath(); g.arc(256, 256, 96, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#d9b45c';
  g.lineWidth = 7;
  g.beginPath(); g.arc(256, 256, 96, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = 'rgba(240,209,137,0.4)';
  g.lineWidth = 2;
  g.beginPath(); g.arc(256, 256, 84, 0, Math.PI * 2); g.stroke();
  // the seven, cut deep
  g.fillStyle = 'rgba(20,14,6,0.9)';
  segDigit(g, 7, 226, 204, 62, 104, 13);
  g.fillStyle = '#f0d189';
  segDigit(g, 7, 222, 200, 62, 104, 13);
  // the gun across it
  g.save();
  g.translate(256, 272); g.rotate(-0.3);
  g.fillStyle = 'rgba(8,6,12,0.75)';
  g.fillRect(-62, -8, 96, 24);
  g.fillStyle = '#f6e2ab';
  g.fillRect(-58, -10, 82, 19);      // receiver
  g.fillRect(24, -6, 48, 11);        // barrel
  g.fillStyle = '#c49e4e';
  g.fillRect(66, -9, 10, 17);        // muzzle
  g.fillRect(-20, 9, 30, 10);        // magazine
  g.fillStyle = '#f6e2ab';
  g.beginPath();
  g.moveTo(-56, 9); g.lineTo(-36, 9); g.lineTo(-26, 48); g.lineTo(-48, 48);
  g.closePath(); g.fill();            // grip
  g.strokeStyle = '#f6e2ab';
  g.lineWidth = 5;
  g.beginPath(); g.arc(-26, 12, 14, 0, Math.PI); g.stroke();
  g.fillStyle = 'rgba(255,248,222,0.65)';
  g.fillRect(-58, -10, 82, 3);
  g.restore();
  g.lineJoin = 'miter';

  // gold dust settling on the void
  speckle(g, S, rng, 160, 'rgba(232,206,142,0.18)', 1, 3);
  noise(g, S, rng, 1600, 0.04);
  return c;
}

// ---------------------------------------------------------------- 29. apse glow

function heroApseGlow(): HTMLCanvasElement {
  const S = 256;
  const { c, g } = canvas(S);
  const rng = heroSeed('sanctum-apse-glow');
  g.fillStyle = '#05040a';
  g.fillRect(0, 0, S, S);
  // Pointed arch of light: the wall behind the altar is a hole, not a surface.
  const archPath = (inset: number): void => {
    g.beginPath();
    g.moveTo(56 + inset, 250);
    g.lineTo(56 + inset, 122);
    g.quadraticCurveTo(56 + inset, 40 + inset, 128, 22 + inset);
    g.quadraticCurveTo(200 - inset, 40 + inset, 200 - inset, 122);
    g.lineTo(200 - inset, 250);
    g.closePath();
  };
  // outer haze spilling past the arch mouth
  const haze = g.createRadialGradient(128, 150, 20, 128, 150, 170);
  haze.addColorStop(0, 'rgba(240,209,137,0.42)');
  haze.addColorStop(0.5, 'rgba(160,120,48,0.14)');
  haze.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = haze;
  g.fillRect(0, 0, S, S);
  // the void inside the arch, glowing from deep back
  g.save();
  archPath(0);
  g.clip();
  const inside = g.createRadialGradient(128, 196, 6, 128, 176, 168);
  inside.addColorStop(0, '#fff4d2');
  inside.addColorStop(0.22, '#f0d189');
  inside.addColorStop(0.5, '#a8792c');
  inside.addColorStop(0.78, '#4a3210');
  inside.addColorStop(1, '#0b0806');
  g.fillStyle = inside;
  g.fillRect(0, 0, S, S);
  // rays fanning out of the light
  for (let i = 0; i < 26; i++) {
    const a = -Math.PI / 2 + (i - 13) * 0.115;
    g.strokeStyle = `rgba(255,238,190,${0.05 + (i % 3 === 0 ? 0.16 : 0.06)})`;
    g.lineWidth = i % 3 === 0 ? 8 : 3;
    g.beginPath();
    g.moveTo(128, 196);
    g.lineTo(128 + Math.cos(a) * 260, 196 + Math.sin(a) * 260);
    g.stroke();
  }
  // recessed arch orders stepping back into the glow
  for (let k = 1; k <= 4; k++) {
    g.strokeStyle = `rgba(20,14,8,${0.16 + k * 0.06})`;
    g.lineWidth = 5;
    archPath(k * 11);
    g.stroke();
  }
  // motes rising in the light
  for (let i = 0; i < 70; i++) {
    const x = 64 + rng() * 128, y = 30 + rng() * 216;
    g.fillStyle = `rgba(255,246,214,${0.12 + rng() * 0.45})`;
    g.beginPath(); g.arc(x, y, 0.7 + rng() * 2.4, 0, Math.PI * 2); g.fill();
  }
  g.restore();
  // gold arch surround, doubled
  g.strokeStyle = '#d9b45c';
  g.lineWidth = 9;
  archPath(0);
  g.stroke();
  g.strokeStyle = 'rgba(255,244,206,0.5)';
  g.lineWidth = 3;
  archPath(6);
  g.stroke();
  // keystone heptagram over the arch head
  g.strokeStyle = '#f0d189';
  g.lineWidth = 3;
  starPath(g, 128, 30, 17, 7, 3);
  g.stroke();
  // impost blocks where the arch springs from the wall
  for (const bx of [46, 190] as const) {
    g.fillStyle = '#1a1420';
    g.fillRect(bx, 116, 20, 14);
    g.strokeStyle = '#c49e4e';
    g.lineWidth = 3;
    g.strokeRect(bx, 116, 20, 14);
  }
  speckle(g, S, rng, 40, 'rgba(232,206,142,0.2)', 0.8, 2);
  return c;
}

// ---------------------------------------------------------------- hero registry

export interface CampaignHeroDecal {
  id: string;
  tex: THREE.Texture;
  map: CampaignArtId;
  hint: string;
}

// Canvas-free description of the hero set, so tests (and tooling) can read the
// roster without a DOM.
export const CAMPAIGN_HERO_MARKERS: { id: string; map: CampaignArtId; hint: string; size: number }[] = [
  { id: 'furnace-mouth', map: 'foundry', hint: 'arena-back-wall', size: 512 },
  { id: 'pour-crucible', map: 'foundry', hint: 'side-alcove', size: 256 },
  { id: 'sphincter-maw', map: 'gullet', hint: 'arena-back-wall', size: 512 },
  { id: 'uvula-idol', map: 'gullet', hint: 'ceiling-boss', size: 256 },
  { id: 'ossuary-faces', map: 'catacombs', hint: 'arena-back-wall', size: 512 },
  { id: 'burial-saint', map: 'catacombs', hint: 'chapel-niche', size: 256 },
  { id: 'demonic-idol', map: 'pit', hint: 'pit-floor-idol', size: 512 },
  { id: 'crane-god', map: 'pit', hint: 'sky-gantry', size: 256 },
  { id: 'dish-eye', map: 'spire', hint: 'roof-antenna', size: 512 },
  { id: 'visor-mask', map: 'spire', hint: 'elevator-door', size: 256 },
  { id: 'quarantine-mural', map: 'ward', hint: 'arena-back-wall', size: 512 },
  { id: 'isolation-cot', map: 'ward', hint: 'cell-wall', size: 256 },
  { id: 'gun-reliquary', map: 'sanctum', hint: 'apse-altar', size: 512 },
  { id: 'demon-head', map: 'sanctum', hint: 'nave-tympanum', size: 512 },
  { id: 'nave-rose', map: 'sanctum', hint: 'rose-window', size: 256 },
  { id: 'slag-titan', map: 'foundry', hint: 'foundry-far-wall', size: 512 },
  { id: 'hazard-gate', map: 'foundry', hint: 'foundry-door-frame', size: 256 },
  { id: 'tooth-gate', map: 'gullet', hint: 'gullet-corridor-end', size: 512 },
  { id: 'bile-pool', map: 'gullet', hint: 'floor-decal', size: 256 },
  { id: 'candle-crypt', map: 'catacombs', hint: 'side-chapel', size: 512 },
  { id: 'femur-wheel', map: 'catacombs', hint: 'ceiling-rose', size: 256 },
  { id: 'rust-sun', map: 'pit', hint: 'sky-disc', size: 512 },
  { id: 'hook-crown', map: 'pit', hint: 'crane-hook', size: 256 },
  { id: 'lattice-totem', map: 'spire', hint: 'shaft-wall', size: 512 },
  { id: 'elevation-stela', map: 'spire', hint: 'landing-plaque', size: 256 },
  { id: 'plague-seal', map: 'ward', hint: 'ward-entry', size: 512 },
  { id: 'key-rack', map: 'ward', hint: 'nurse-station', size: 256 },
  { id: 'seventh-seal', map: 'sanctum', hint: 'floor-inlay', size: 512 },
  { id: 'apse-glow', map: 'sanctum', hint: 'apse-back', size: 256 },
];

const HERO_PAINTERS: Record<string, () => HTMLCanvasElement> = {
  'furnace-mouth': heroFurnaceMouth,
  'pour-crucible': heroPourCrucible,
  'sphincter-maw': heroSphincterMaw,
  'uvula-idol': heroUvulaIdol,
  'ossuary-faces': heroOssuaryFaces,
  'burial-saint': heroBurialSaint,
  'demonic-idol': heroDemonicIdol,
  'crane-god': heroCraneGod,
  'dish-eye': heroDishEye,
  'visor-mask': heroVisorMask,
  'quarantine-mural': heroQuarantineMural,
  'isolation-cot': heroIsolationCot,
  'gun-reliquary': heroGunReliquary,
  'demon-head': heroDemonHead,
  'nave-rose': heroNaveRose,
  'slag-titan': heroSlagTitan,
  'hazard-gate': heroHazardGate,
  'tooth-gate': heroToothGate,
  'bile-pool': heroBilePool,
  'candle-crypt': heroCandleCrypt,
  'femur-wheel': heroFemurWheel,
  'rust-sun': heroRustSun,
  'hook-crown': heroHookCrown,
  'lattice-totem': heroLatticeTotem,
  'elevation-stela': heroElevationStela,
  'plague-seal': heroPlagueSeal,
  'key-rack': heroKeyRack,
  'seventh-seal': heroSeventhSeal,
  'apse-glow': heroApseGlow,
};

let heroCache: CampaignHeroDecal[] | null = null;

export function getCampaignHeroDecals(): CampaignHeroDecal[] {
  if (heroCache) return heroCache;
  heroCache = CAMPAIGN_HERO_MARKERS.map(m => ({
    id: m.id,
    tex: toHero(HERO_PAINTERS[m.id]()),
    map: m.map,
    hint: m.hint,
  }));
  return heroCache;
}

/**
 * Sibling table a pack author can fill without putting `heroDecals` on the
 * tiling lib. Prefer `lib.heroDecals` when that array is non-empty.
 */
export const CAMPAIGN_HERO_DECALS: Partial<Record<CampaignArtId, CampaignHeroDecal[]>> = {};

export function resolveHeroDecals(
  id: CampaignArtId,
  lib?: CampaignTextureLib | null,
): CampaignHeroDecal[] {
  const fromLib = lib?.heroDecals;
  if (fromLib && fromLib.length) {
    return fromLib.filter(h => !h.map || h.map === id);
  }
  const fromSibling = CAMPAIGN_HERO_DECALS[id];
  if (fromSibling && fromSibling.length) return fromSibling;
  if (fromLib) return fromLib;
  if (fromSibling) return fromSibling;
  return getCampaignHeroDecals().filter(h => h.map === id);
}
