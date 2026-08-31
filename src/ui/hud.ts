// HUD: crosshair, bottom graphic panel (health / ammo / 7 slots), minimap,
// damage overlays with direction hint, message toasts. Canvas 2D overlay.
import type { Sim } from '../sim/sim';
import { WEAPONS, weapon } from '../sim/weapons';
import { CELL } from '../sim/types';

const EPITAPHS = [
  'The maze keeps your boots.',
  'Should have packed the Seventh.',
  'Demons never knock twice.',
  'Your aim was honest. Your dodge was late.',
  'The runes spell your name now.',
  'Another skull for the wall.',
  'You fed the maze. The maze was grateful.',
  'Respawn is a myth here. Try again anyway.',
];

export class Hud {
  canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private msg: { text: string; time: number } | null = null;
  private bloodFlash = 0;
  private hurtDir: { angle: number; time: number } | null = null;
  private epitaph = '';
  private gunIcons: (HTMLCanvasElement | null)[] = [];
  private time = 0;
  private lowHealthPulse = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'hud';
    const g = this.canvas.getContext('2d');
    if (!g) throw new Error('no 2d context');
    this.g = g;
    for (let i = 0; i < 7; i++) this.gunIcons.push(drawGunIcon(i + 1));
    this.resize();
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  showMessage(text: string): void {
    this.msg = { text, time: 3.2 };
  }

  playerHurt(damage: number, fromAngle: number): void {
    this.bloodFlash = Math.min(1, this.bloodFlash + damage / 55);
    this.hurtDir = { angle: fromAngle, time: 1.1 };
  }

  died(): void {
    this.epitaph = EPITAPHS[Math.floor(Math.random() * EPITAPHS.length)];
    this.bloodFlash = 1;
  }

  update(dt: number): void {
    this.time += dt;
    if (this.msg) this.msg.time -= dt;
    this.bloodFlash = Math.max(0, this.bloodFlash - dt * 1.4);
    if (this.hurtDir) this.hurtDir.time -= dt;
    this.lowHealthPulse += dt;
  }

  draw(sim: Sim, opts: { fullMapOpen: boolean; paused: boolean }): void {
    const g = this.g;
    const W = window.innerWidth, H = window.innerHeight;
    g.clearRect(0, 0, W, H);
    if (sim.phase === 'dead' || sim.phase === 'won') return;
    const p = sim.player;

    // ---- crosshair (guns must leave this clear)
    if (!opts.fullMapOpen && sim.phase === 'playing') {
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.lineWidth = 2;
      const cx = W / 2, cy = H / 2;
      g.beginPath();
      g.moveTo(cx - 10, cy); g.lineTo(cx - 4, cy);
      g.moveTo(cx + 4, cy); g.lineTo(cx + 10, cy);
      g.moveTo(cx, cy - 10); g.lineTo(cx, cy - 4);
      g.moveTo(cx, cy + 4); g.lineTo(cx, cy + 10);
      g.stroke();
    }

    // ---- damage direction arc
    if (this.hurtDir && this.hurtDir.time > 0) {
      const a = this.hurtDir.angle;
      const k = Math.min(1, this.hurtDir.time);
      g.save();
      g.translate(W / 2, H / 2);
      g.rotate(-a);
      g.strokeStyle = `rgba(255,40,40,${0.7 * k})`;
      g.lineWidth = 10;
      g.beginPath();
      g.arc(0, 0, Math.min(W, H) * 0.28, -Math.PI / 2 - 0.45, -Math.PI / 2 + 0.45);
      g.stroke();
      g.restore();
    }

    // ---- blood flash + low health vignette
    if (this.bloodFlash > 0) {
      const grad = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.7);
      grad.addColorStop(0, `rgba(120,0,0,0)`);
      grad.addColorStop(1, `rgba(140,10,10,${0.75 * this.bloodFlash})`);
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
    }
    const hpFrac = p.hp / p.maxHp;
    if (hpFrac < 0.28 && sim.phase === 'playing') {
      const pulse = 0.25 + 0.2 * Math.sin(this.lowHealthPulse * 6);
      const grad = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.65);
      grad.addColorStop(0, 'rgba(120,0,0,0)');
      grad.addColorStop(1, `rgba(150,0,0,${pulse})`);
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
    }

    if (sim.phase === 'dying') {
      g.fillStyle = `rgba(60,0,0,${Math.min(0.85, sim.phaseTimer / 1.6)})`;
      g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(255,60,60,0.9)';
      g.font = `bold ${Math.min(64, W / 12)}px monospace`;
      g.textAlign = 'center';
      g.fillText('YOU DIED', W / 2, H * 0.42);
      g.font = `italic ${Math.min(20, W / 40)}px monospace`;
      g.fillStyle = 'rgba(255,150,150,0.8)';
      g.fillText(this.epitaph, W / 2, H * 0.42 + 40);
      return;
    }

    // ---- seed + run info (top-left)
    g.textAlign = 'left';
    g.font = '12px monospace';
    g.fillStyle = 'rgba(180,180,190,0.75)';
    g.fillText(`SEED ${sim.map.seed}`, 12, 22);
    g.fillText(`KILLS ${sim.killCount}`, 12, 38);

    // ---- arena counter
    if (sim.arenaEntered) {
      const left = sim.arenaEnemiesRemaining();
      g.textAlign = 'center';
      g.font = 'bold 22px monospace';
      g.fillStyle = left > 0 ? 'rgba(255,80,60,0.95)' : 'rgba(120,255,140,0.95)';
      g.fillText(left > 0 ? `DEMONS REMAINING: ${left}` : 'THE AREA IS SILENT', W / 2, 34);
    }

    // ---- message toast
    if (this.msg && this.msg.time > 0) {
      const k = Math.min(1, this.msg.time / 0.5);
      g.textAlign = 'center';
      g.font = `bold ${Math.min(22, W / 34)}px monospace`;
      g.fillStyle = `rgba(255,220,150,${k})`;
      g.fillText(this.msg.text, W / 2, H * 0.68);
    }

    // ---- bottom panel
    const panelH = Math.max(64, Math.min(96, H * 0.11));
    const panelY = H - panelH;
    const panelW = Math.min(W - 16, 860);
    const panelX = (W - panelW) / 2;
    // metal slab
    const pg = g.createLinearGradient(0, panelY, 0, H);
    pg.addColorStop(0, '#3b3f37');
    pg.addColorStop(0.08, '#2c302a');
    pg.addColorStop(1, '#191c17');
    g.fillStyle = pg;
    roundRect(g, panelX, panelY, panelW, panelH, 8);
    g.fill();
    g.strokeStyle = '#565b50';
    g.lineWidth = 2;
    roundRect(g, panelX, panelY, panelW, panelH, 8);
    g.stroke();
    // rivets
    g.fillStyle = '#6a7062';
    for (const rx of [panelX + 10, panelX + panelW - 10]) {
      for (const ry of [panelY + 10, panelY + panelH - 10]) {
        g.beginPath(); g.arc(rx, ry, 3, 0, Math.PI * 2); g.fill();
      }
    }

    const w = weapon(p.gun);

    // health (left)
    const healthFrac = Math.max(0, p.hp / p.maxHp);
    const barW = panelW * 0.2;
    g.font = 'bold 13px monospace';
    g.fillStyle = '#9aa08e';
    g.textAlign = 'left';
    g.fillText('HEALTH', panelX + 22, panelY + 22);
    g.font = `bold ${Math.round(panelH * 0.42)}px monospace`;
    const hpf = p.hp > 50 ? '#e8e4c8' : p.hp > 25 ? '#ffb43a' : '#ff4a3a';
    g.fillStyle = hpf;
    g.fillText(String(Math.max(0, Math.ceil(p.hp))), panelX + 20, panelY + panelH - 16);
    const barX = panelX + 22 + panelW * 0.09;
    g.fillStyle = '#11130f';
    g.fillRect(barX, panelY + panelH - 34, barW, 12);
    g.fillStyle = hpf;
    g.fillRect(barX, panelY + panelH - 34, barW * healthFrac, 12);
    g.strokeStyle = '#565b50';
    g.strokeRect(barX, panelY + panelH - 34, barW, 12);

    // ammo (right)
    g.textAlign = 'right';
    g.font = 'bold 13px monospace';
    g.fillStyle = '#9aa08e';
    g.fillText(w.ammo.toUpperCase(), panelX + panelW - 22, panelY + 22);
    g.font = `bold ${Math.round(panelH * 0.42)}px monospace`;
    g.fillStyle = p.ammo[w.ammo] === 0 ? '#ff4a3a' : '#ffe9a0';
    g.fillText(String(p.ammo[w.ammo]), panelX + panelW - 20, panelY + panelH - 16);

    // 7 slots (center)
    const slotsW = panelW * 0.42;
    const slotX0 = panelX + panelW / 2 - slotsW / 2;
    const slotSize = Math.min(44, (slotsW - 6 * 6) / 7);
    for (let i = 1; i <= 7; i++) {
      const owned = p.owned[i];
      const sel = p.gun === i;
      const x = slotX0 + (i - 1) * (slotSize + 6);
      const y = panelY + panelH / 2 - slotSize / 2;
      g.fillStyle = sel ? 'rgba(255,200,80,0.22)' : owned ? 'rgba(30,34,28,0.9)' : 'rgba(14,16,12,0.75)';
      roundRect(g, x, y, slotSize, slotSize, 5);
      g.fill();
      g.strokeStyle = sel ? '#ffc850' : owned ? '#6a7062' : '#3a3e36';
      g.lineWidth = sel ? 2.5 : 1.5;
      roundRect(g, x, y, slotSize, slotSize, 5);
      g.stroke();
      if (owned && this.gunIcons[i - 1]) {
        g.drawImage(this.gunIcons[i - 1]!, x + 3, y + 3, slotSize - 6, slotSize - 6);
      } else if (!owned) {
        g.fillStyle = 'rgba(120,124,110,0.5)';
        g.font = `bold ${Math.round(slotSize * 0.5)}px monospace`;
        g.textAlign = 'center';
        g.fillText(String(i), x + slotSize / 2, y + slotSize * 0.66);
      }
      // ammo pips
      if (owned) {
        const has = p.ammo[WEAPONS[i - 1].ammo] > 0;
        g.fillStyle = has ? '#8aff6a' : '#5a2a24';
        g.fillRect(x + slotSize / 2 - 3, y + slotSize - 3.5, 6, 2.5);
      }
    }
  }

  drawMinimap(sim: Sim, size: number, full: boolean): void {
    // shared renderer for corner minimap and the full map overlay
    const g = full ? this.mapCtx! : this.miniCtx!;
    if (!g) return;
    const W = full ? this.mapCanvas!.width : this.miniCanvas!.width;
    const H = full ? this.mapCanvas!.height : this.miniCanvas!.height;
    const dpr = Math.min(window.devicePixelRatio, 2);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = W / dpr, h = H / dpr;
    g.clearRect(0, 0, w, h);
    g.fillStyle = full ? 'rgba(8,9,7,0.92)' : 'rgba(8,9,7,0.62)';
    g.fillRect(0, 0, w, h);
    const map = sim.map;
    const span = full ? map.w : 22; // minimap shows a 22-cell window
    const scale = w / span;
    let ox: number, oz: number;
    const pcx = sim.player.x / CELL, pcz = sim.player.z / CELL;
    if (full) {
      // fit whole map with margin
      ox = (w - map.w * scale) / 2;
      oz = (h - map.h * scale) / 2;
    } else {
      ox = w / 2 - pcx * scale;
      oz = h / 2 - pcz * scale;
    }
    // explored cells only
    for (let z = 0; z < map.h; z++) {
      for (let x = 0; x < map.w; x++) {
        if (!sim.explored[z * map.w + x]) continue;
        if (map.grid[z * map.w + x] === 1) {
          g.fillStyle = 'rgba(120,190,120,0.55)';
          g.fillRect(ox + x * scale, oz + z * scale, Math.ceil(scale), Math.ceil(scale));
        }
      }
    }
    // doors (explored only)
    for (const d of map.doors) {
      if (!sim.explored[d.cells[0][1] * map.w + d.cells[0][0]]) continue;
      g.fillStyle = d.locked ? '#ffb43a' : '#7ac8ff';
      g.fillRect(ox + d.cx * scale - scale * 0.2, oz + d.cz * scale - scale * 0.2, scale * 1.4, scale * 1.4);
    }
    // seal
    if (sim.sealIntact && map.seal.cells[0]) {
      const [sx, sz] = map.seal.cells[0];
      if (sim.explored[sz * map.w + sx]) {
        g.fillStyle = '#b44dff';
        g.fillRect(ox + sx * scale - scale * 0.2, oz + sz * scale - scale * 0.2, scale * 1.4, scale * 1.4);
      }
    }
    // gun pickups (explored room only)
    for (const pk of sim.pickups) {
      if (pk.taken || (pk.kind !== 'gun' && pk.kind !== 'key')) continue;
      const cx = Math.floor(pk.x / CELL), cz = Math.floor(pk.z / CELL);
      if (!sim.explored[cz * map.w + cx]) continue;
      g.fillStyle = pk.kind === 'key' ? '#ffd23a' : pk.gun === 7 ? '#ff5050' : '#ffffff';
      g.beginPath();
      g.arc(ox + (pk.x / CELL + 0.5) * scale, oz + (pk.z / CELL + 0.5) * scale, Math.max(2.5, scale * 0.45), 0, Math.PI * 2);
      g.fill();
    }
    // player arrow
    const px = ox + (sim.player.x / CELL + 0.5) * scale;
    const pz = oz + (sim.player.z / CELL + 0.5) * scale;
    g.save();
    g.translate(px, pz);
    g.rotate(-sim.player.yaw);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, -Math.max(4, scale * 0.7));
    g.lineTo(Math.max(3, scale * 0.45), Math.max(3, scale * 0.55));
    g.lineTo(-Math.max(3, scale * 0.45), Math.max(3, scale * 0.55));
    g.closePath();
    g.fill();
    g.restore();
    if (full) {
      g.fillStyle = 'rgba(200,200,210,0.8)';
      g.font = 'bold 16px monospace';
      g.textAlign = 'left';
      g.fillText(`SEED ${map.seed}   KILLS ${sim.killCount}   EXPLORED ${exploredPct(sim)}%`, 16, 28);
      g.font = '13px monospace';
      g.fillStyle = 'rgba(160,160,170,0.7)';
      g.fillText('white = gun  ·  red = the Seventh  ·  gold = key/door  ·  purple = seal', 16, 50);
    }
    void size;
  }

  private miniCanvas: HTMLCanvasElement | null = null;
  private miniCtx: CanvasRenderingContext2D | null = null;
  private mapCanvas: HTMLCanvasElement | null = null;
  private mapCtx: CanvasRenderingContext2D | null = null;

  attachMinimap(c: HTMLCanvasElement): void {
    this.miniCanvas = c;
    this.miniCtx = c.getContext('2d');
  }

  attachMap(c: HTMLCanvasElement): void {
    this.mapCanvas = c;
    this.mapCtx = c.getContext('2d');
  }
}

export function exploredPct(sim: Sim): number {
  let explored = 0, walkable = 0;
  for (let i = 0; i < sim.explored.length; i++) {
    if (sim.map.grid[i] === 1) {
      walkable++;
      if (sim.explored[i]) explored++;
    }
  }
  return walkable ? Math.round((explored / walkable) * 100) : 0;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Tiny 2D silhouettes for the HUD slot strip (side profile is fine here). */
function drawGunIcon(id: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 48;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#e8e4c8';
  g.fillStyle = '#e8e4c8';
  g.lineWidth = 2.5;
  g.lineCap = 'round';
  g.translate(24, 24);
  switch (id) {
    case 1: // pistol
      g.fillRect(-10, -6, 20, 6);
      g.fillRect(-4, 0, 8, 12);
      break;
    case 2: // shotgun
      g.fillRect(-20, -6, 38, 4);
      g.fillRect(-20, -2, 38, 2);
      g.fillStyle = '#a06a3a';
      g.fillRect(8, -2, 12, 5);
      g.fillStyle = '#e8e4c8';
      break;
    case 3: // chaingun
      for (let i = -1; i <= 1; i++) {
        g.fillRect(-18, -5 + i * 4, 30, 2);
      }
      g.fillRect(10, -8, 8, 16);
      break;
    case 4: // spiker
      g.fillRect(-14, -5, 26, 8);
      g.beginPath(); g.moveTo(12, -6); g.lineTo(20, 0); g.lineTo(12, 6); g.fill();
      g.fillRect(-6, 3, 5, 10);
      break;
    case 5: // bile launcher
      g.fillRect(-16, -7, 32, 10);
      g.beginPath(); g.arc(16, -2, 6, 0, Math.PI * 2); g.stroke();
      g.fillRect(-4, 3, 6, 9);
      break;
    case 6: // sunlance
      g.fillRect(-20, -3, 40, 5);
      for (let i = 0; i < 3; i++) {
        g.beginPath(); g.arc(-8 + i * 8, -1, 4, 0, Math.PI * 2); g.stroke();
      }
      g.fillRect(-2, 2, 5, 8);
      break;
    case 7: // the seventh
      g.fillRect(-16, -8, 24, 14);
      g.beginPath(); g.arc(12, -1, 7, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(12, -1, 3, 0, Math.PI * 2); g.fill();
      g.fillRect(-10, 6, 6, 8);
      break;
  }
  return c;
}
