// HUD: crosshair, compact instrument panel (health / ammo / 7 slots), minimap,
// damage overlays with direction hint, message toasts. Canvas 2D overlay.
import type { WorldView } from '../sim/view';
import { WEAPONS, weapon } from '../sim/weapons';
import { CELL } from '../sim/types';
import { POWERUP_DEFS, wardActive } from '../sim/powerups';

export interface ArenaRosterRow {
  id: number;
  name: string;
  colorIndex: number;
  frags: number;
  deaths: number;
  alive: boolean;
}

export function sortArenaRoster(rows: ArenaRosterRow[]): ArenaRosterRow[] {
  return rows.slice().sort((a, b) => b.frags - a.frags || a.deaths - b.deaths || a.id - b.id);
}
export const HUD_HEALTH_SLOT_GAP = 10;

export interface HudPanelLayout {
  barX: number;
  barW: number;
  slotX0: number;
  slotsW: number;
  slotSize: number;
}

/** Health bar + 7-slot strip. Bar must stop before slot 1 at every panel width. */
export function hudPanelLayout(panelW: number, panelX = 0): HudPanelLayout {
  const slotsW = panelW * 0.42;
  const slotX0 = panelX + panelW / 2 - slotsW / 2;
  const slotSize = Math.min(44, (slotsW - 6 * 6) / 7);
  const barX = panelX + 22 + panelW * 0.09;
  const barW = Math.max(0, slotX0 - barX - HUD_HEALTH_SLOT_GAP);
  return { barX, barW, slotX0, slotsW, slotSize };
}

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

  died(opts?: { epitaph?: string }): void {
    this.epitaph = opts?.epitaph !== undefined
      ? opts.epitaph
      : EPITAPHS[Math.floor(Math.random() * EPITAPHS.length)];
    this.bloodFlash = 1;
  }

  update(dt: number): void {
    this.time += dt;
    if (this.msg) this.msg.time -= dt;
    this.bloodFlash = Math.max(0, this.bloodFlash - dt * 1.4);
    if (this.hurtDir) this.hurtDir.time -= dt;
    this.lowHealthPulse += dt;
  }

  /** Wipe the overlay so title / map-log / campaign never leak HEALTH etc. */
  clear(): void {
    const W = window.innerWidth, H = window.innerHeight;
    this.g.clearRect(0, 0, W, H);
    if (this.miniCtx && this.miniCanvas) {
      this.miniCtx.setTransform(1, 0, 0, 1, 0, 0);
      this.miniCtx.clearRect(0, 0, this.miniCanvas.width, this.miniCanvas.height);
    }
  }

  draw(sim: WorldView, opts: { fullMapOpen: boolean; paused: boolean }): void {
    const g = this.g;
    const W = window.innerWidth, H = window.innerHeight;
    g.clearRect(0, 0, W, H);
    if (sim.phase === 'dead' || sim.phase === 'won') return;
    const p = sim.player;

    // ---- crosshair (guns must leave this clear)
    if (!opts.fullMapOpen && sim.phase === 'playing') {
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.lineWidth = 1.25;
      const cx = W / 2, cy = H / 2;
      g.beginPath();
      g.moveTo(cx - 8, cy); g.lineTo(cx - 3, cy);
      g.moveTo(cx + 3, cy); g.lineTo(cx + 8, cy);
      g.moveTo(cx, cy - 8); g.lineTo(cx, cy - 3);
      g.moveTo(cx, cy + 3); g.lineTo(cx, cy + 8);
      g.stroke();

      this.drawPowerupHud(sim, g, W, H, cx, cy);
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
      g.font = `600 ${Math.min(64, W / 12)}px -apple-system, BlinkMacSystemFont, sans-serif`;
      g.textAlign = 'center';
      g.fillText('YOU DIED', W / 2, H * 0.42);
      if (this.epitaph) {
        g.font = `400 ${Math.min(20, W / 40)}px -apple-system, BlinkMacSystemFont, sans-serif`;
        g.fillStyle = 'rgba(255,150,150,0.8)';
        g.fillText(this.epitaph, W / 2, H * 0.42 + 40);
      }
      return;
    }

    // ---- seed + run info (top-left)
    g.textAlign = 'left';
    g.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
    g.fillStyle = 'rgba(6,15,21,0.62)';
    g.fillRect(6, 8, Math.min(250, g.measureText(`SEED ${sim.map.seed}`).width + 16), 36);
    g.fillStyle = 'rgba(210,223,229,0.8)';
    g.fillText(`SEED ${sim.map.seed}`, 12, 22);
    g.fillText(`KILLS ${sim.killCount}`, 12, 38);

    // ---- arena counter
    if (sim.networkArena) {
      g.textAlign = 'center';
      g.font = '600 17px -apple-system, BlinkMacSystemFont, sans-serif';
      g.fillStyle = 'rgba(184,220,236,0.95)';
      g.fillText('ARENA // DEATHMATCH', W / 2, 34);
    } else if (sim.arenaEntered) {
      const left = sim.arenaEnemiesRemaining();
      g.textAlign = 'center';
      g.font = '600 17px -apple-system, BlinkMacSystemFont, sans-serif';
      g.fillStyle = left > 0 ? 'rgba(230,168,141,0.95)' : 'rgba(173,218,183,0.95)';
      g.fillText(left > 0 ? `DEMONS REMAINING: ${left}` : 'THE AREA IS SILENT', W / 2, 34);
    }

    // ---- message toast
    if (this.msg && this.msg.time > 0) {
      const k = Math.min(1, this.msg.time / 0.5);
      g.textAlign = 'center';
      g.font = `500 ${Math.min(18, W / 30)}px -apple-system, BlinkMacSystemFont, sans-serif`;
      const msgWidth = Math.min(W - 28, g.measureText(this.msg.text).width + 28);
      g.fillStyle = `rgba(6,15,21,${k * 0.66})`;
      roundRect(g, (W - msgWidth) / 2, H * 0.68 - 23, msgWidth, 34, 2);
      g.fill();
      g.fillStyle = `rgba(236,225,205,${k})`;
      g.fillText(this.msg.text, W / 2, H * 0.68);
    }

    // ---- bottom panel
    const panelH = Math.max(64, Math.min(78, H * 0.095));
    const panelY = H - panelH - 16;
    const panelW = Math.min(W - 24, 820);
    const panelX = (W - panelW) / 2;
    // A translucent instrument strip keeps the view open around the weapon.
    const pg = g.createLinearGradient(0, panelY, 0, panelY + panelH);
    pg.addColorStop(0, 'rgba(12, 23, 30, 0.73)');
    pg.addColorStop(1, 'rgba(5, 13, 18, 0.89)');
    g.fillStyle = pg;
    roundRect(g, panelX, panelY, panelW, panelH, 3);
    g.fill();
    g.strokeStyle = 'rgba(162, 189, 200, 0.3)';
    g.lineWidth = 1;
    roundRect(g, panelX, panelY, panelW, panelH, 3);
    g.stroke();
    const w = weapon(p.gun);

    // health (left)
    const healthFrac = Math.max(0, p.hp / p.maxHp);
    const { barW, barX, slotX0, slotSize } = hudPanelLayout(panelW, panelX);
    const barY = panelY + panelH - (W < 540 ? 8 : 25);
    g.font = '500 9px -apple-system, BlinkMacSystemFont, sans-serif';
    g.fillStyle = '#a5b8c2';
    g.textAlign = 'left';
    g.fillText('HEALTH', panelX + 18, panelY + 19);
    g.font = `500 ${Math.round(panelH * 0.4)}px -apple-system, BlinkMacSystemFont, sans-serif`;
    const hpf = p.hp > 50 ? '#e4edef' : p.hp > 25 ? '#dfb87f' : '#ed8474';
    g.fillStyle = hpf;
    g.fillText(String(Math.max(0, Math.ceil(p.hp))), panelX + 16, panelY + panelH - 15);
    g.fillStyle = 'rgba(141,170,184,0.2)';
    g.fillRect(barX, barY, barW, 3);
    g.fillStyle = hpf;
    g.fillRect(barX, barY, barW * healthFrac, 3);

    // ammo (right)
    g.textAlign = 'right';
    g.font = '500 9px -apple-system, BlinkMacSystemFont, sans-serif';
    g.fillStyle = '#a5b8c2';
    g.fillText(w.ammo.toUpperCase(), panelX + panelW - 18, panelY + 19);
    g.font = `500 ${Math.round(panelH * 0.4)}px -apple-system, BlinkMacSystemFont, sans-serif`;
    g.fillStyle = p.ammo[w.ammo] === 0 ? '#ed8474' : '#e4cfb2';
    g.fillText(String(p.ammo[w.ammo]), panelX + panelW - 16, panelY + panelH - 15);

    // 7 slots (center)
    for (let i = 1; i <= 7; i++) {
      const owned = p.owned[i];
      const sel = p.gun === i;
      const x = slotX0 + (i - 1) * (slotSize + 6);
      const y = panelY + panelH / 2 - slotSize / 2;
      g.fillStyle = sel ? 'rgba(206,171,129,0.15)' : owned ? 'rgba(101,131,145,0.1)' : 'rgba(12,23,30,0.12)';
      roundRect(g, x, y, slotSize, slotSize, 2);
      g.fill();
      g.strokeStyle = sel ? '#cdb089' : owned ? '#69808b77' : '#647b872e';
      g.lineWidth = 1;
      roundRect(g, x, y, slotSize, slotSize, 2);
      g.stroke();
      if (owned && this.gunIcons[i - 1]) {
        g.drawImage(this.gunIcons[i - 1]!, x + 3, y + 3, slotSize - 6, slotSize - 6);
      } else if (!owned) {
        g.fillStyle = 'rgba(154,179,192,0.45)';
        g.font = `400 ${Math.round(slotSize * 0.4)}px -apple-system, BlinkMacSystemFont, sans-serif`;
        g.textAlign = 'center';
        g.fillText(String(i), x + slotSize / 2, y + slotSize * 0.66);
      }
      // ammo pips
      if (owned) {
        const has = p.ammo[WEAPONS[i - 1].ammo] > 0;
        g.fillStyle = has ? '#9dc8b5' : '#ad6d61';
        g.fillRect(x + slotSize / 2 - 3, y + slotSize - 3.5, 6, 2.5);
      }
    }
  }

  drawMinimap(sim: WorldView, size: number, full: boolean): void {
    // shared renderer for corner minimap and the full map overlay
    const g = full ? this.mapCtx! : this.miniCtx!;
    if (!g) return;
    const W = full ? this.mapCanvas!.width : this.miniCanvas!.width;
    const H = full ? this.mapCanvas!.height : this.miniCanvas!.height;
    const dpr = Math.min(window.devicePixelRatio, 2);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = W / dpr, h = H / dpr;
    g.clearRect(0, 0, w, h);
    g.fillStyle = full ? 'rgba(6,15,21,0.94)' : 'rgba(6,15,21,0.7)';
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
          g.fillStyle = 'rgba(125,170,186,0.48)';
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
      const sb = sim.map.sealBreak;
      const objectiveGun = sb.type === 'gun' ? sb.gun : null;
      g.fillStyle = pk.kind === 'key' ? '#ffd23a' : (objectiveGun !== null && pk.gun === objectiveGun) ? '#ff5050' : '#ffffff';
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
      g.font = '500 14px -apple-system, BlinkMacSystemFont, sans-serif';
      g.textAlign = 'left';
      g.fillText(`SEED ${map.seed}   KILLS ${sim.killCount}   EXPLORED ${exploredPct(sim)}%`, 16, 28);
      g.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
      g.fillStyle = 'rgba(160,160,170,0.7)';
      const sb = sim.map.sealBreak;
      const legend = sb.type === 'gun'
        ? `white = gun  ·  red = gun ${sb.gun} (unseals)  ·  gold = key/door  ·  purple = seal`
        : 'white = gun  ·  gold = key (unseals) / door  ·  purple = seal';
      g.fillText(legend, 16, 50);
    }
    void size;
  }

  private drawPowerupHud(
    sim: WorldView, g: CanvasRenderingContext2D, W: number, H: number, cx: number, cy: number,
  ): void {
    const pu = sim.powerups;
    const tracks: { kind: 'ward' | 'wrath' | 'sevenfold'; t: number; dur: number }[] = [];
    if (wardActive(pu)) tracks.push({ kind: 'ward', t: pu.wardT, dur: POWERUP_DEFS.ward.duration });
    if (pu.damageKind && pu.damageT > 0) {
      tracks.push({ kind: pu.damageKind, t: pu.damageT, dur: POWERUP_DEFS[pu.damageKind].duration });
    }
    if (!tracks.length) return;

    for (const tr of tracks) {
      const def = POWERUP_DEFS[tr.kind];
      const [r, gch, b] = hexRgb(def.hex);
      const warn = tr.t <= 3;
      const pulse = warn ? 0.55 + 0.45 * Math.abs(Math.sin(this.time * 10)) : 1;
      const alpha = (tr.kind === 'ward' ? 0.38 : 0.32) * pulse;
      const grad = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.22, W / 2, H / 2, Math.max(W, H) * 0.72);
      grad.addColorStop(0, `rgba(${r},${gch},${b},0)`);
      grad.addColorStop(1, `rgba(${r},${gch},${b},${alpha})`);
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
    }

    tracks.forEach((tr, i) => {
      const def = POWERUP_DEFS[tr.kind];
      const [r, gch, b] = hexRgb(def.hex);
      const warn = tr.t <= 3;
      const pulse = warn ? 0.5 + 0.5 * Math.abs(Math.sin(this.time * 10)) : 0.9;
      const radius = 16 + i * 6;
      g.beginPath();
      g.strokeStyle = `rgba(${r},${gch},${b},${pulse})`;
      g.lineWidth = 2.5;
      g.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + (tr.t / tr.dur) * Math.PI * 2);
      g.stroke();
    });

    g.textAlign = 'right';
    g.font = '500 12px -apple-system, BlinkMacSystemFont, sans-serif';
    tracks.forEach((tr, i) => {
      const def = POWERUP_DEFS[tr.kind];
      const [r, gch, b] = hexRgb(def.hex);
      const warn = tr.t <= 3;
      const pulse = warn ? 0.55 + 0.45 * Math.abs(Math.sin(this.time * 10)) : 1;
      g.fillStyle = `rgba(${r},${gch},${b},${pulse})`;
      g.fillText(`${def.label} ${Math.ceil(tr.t)}`, W - 14, 22 + i * 18);
    });
  }

  private miniCanvas: HTMLCanvasElement | null = null;
  private miniCtx: CanvasRenderingContext2D | null = null;
  private mapCanvas: HTMLCanvasElement | null = null;
  private mapCtx: CanvasRenderingContext2D | null = null;

  /** Top-left, below the always-on SEED/KILLS readout drawn in draw() —
   *  the panel used to start at y=12 and paint straight over that text.
   *  Stack instead of overlap: SEED/KILLS occupy roughly y=12..41, so the
   *  roster starts at y=46. */
  drawArenaRoster(rows: ArenaRosterRow[], localId: number, count: number, max = 10): void {
    const g = this.g;
    const sorted = sortArenaRoster(rows);
    const top = 46;
    g.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
    g.textAlign = 'left';
    g.fillStyle = 'rgba(6,15,21,0.68)';
    g.fillRect(12, top, 180, 18 + sorted.length * 16);
    g.fillStyle = '#a5b8c2';
    g.fillText(`${count}/${max}`, 20, top + 14);
    let y = top + 30;
    for (const r of sorted.slice(0, 10)) {
      g.fillStyle = r.id === localId ? '#e4cfb2' : '#dae5ea';
      g.fillText(r.name.slice(0, 12), 20, y);
      g.fillText(String(r.frags), 163, y);
      y += 16;
    }
  }

  drawArenaScoreboard(rows: ArenaRosterRow[], localId: number, rtt: number): void {
    const g = this.g;
    const W = window.innerWidth, H = window.innerHeight;
    const sorted = sortArenaRoster(rows);
    const pw = Math.min(420, W - 32), ph = 80 + sorted.length * 22;
    const x = (W - pw) / 2, y = (H - ph) / 2;
    g.fillStyle = 'rgba(6,15,21,0.94)';
    g.fillRect(x, y, pw, ph);
    g.strokeStyle = '#8aa9b44d';
    g.strokeRect(x, y, pw, ph);
    g.fillStyle = '#dae5ea';
    g.font = '600 15px -apple-system, BlinkMacSystemFont, sans-serif';
    g.textAlign = 'center';
    g.fillText('SCOREBOARD', x + pw / 2, y + 28);
    g.textAlign = 'left';
    g.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
    let rowY = y + 54;
    for (const r of sorted) {
      g.fillStyle = r.id === localId ? '#e4cfb2' : '#dae5ea';
      g.textAlign = 'left';
      g.fillText(r.name, x + 24, rowY);
      g.textAlign = 'right';
      g.fillText(`${r.frags} / ${r.deaths}`, x + pw - 24, rowY);
      rowY += 22;
    }
    g.fillStyle = '#a5b8c2';
    g.textAlign = 'right';
    g.fillText(`${Math.round(rtt)} ms`, x + pw - 16, y + 28);
  }

  attachMinimap(c: HTMLCanvasElement): void {
    this.miniCanvas = c;
    this.miniCtx = c.getContext('2d');
  }

  attachMap(c: HTMLCanvasElement): void {
    this.mapCanvas = c;
    this.mapCtx = c.getContext('2d');
  }
}

export function exploredPct(sim: WorldView): number {
  let explored = 0, walkable = 0;
  for (let i = 0; i < sim.explored.length; i++) {
    if (sim.map.grid[i] !== 1) continue;
    if (sim.secretCell[i]) continue;
    walkable++;
    if (sim.explored[i]) explored++;
  }
  return walkable ? Math.round((explored / walkable) * 100) : 0;
}

function hexRgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
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
