// Pure editor document. Authors a MapBlueprint; no DOM, no localStorage.
import {
  compileBlueprint,
  expandDoorCells,
  stripCosmetics,
  validateBlueprint,
  type BlueprintCorridor,
  type BlueprintEnemy,
  type BlueprintPickup,
  type BlueprintRoom,
  type MapBlueprint,
} from '../sim/blueprint';
import { placeCosmetics } from '../sim/cosmetics';
import { makeRng } from '../sim/rng';
import { ENEMIES } from '../sim/enemyTypes';
import { WEAPONS } from '../sim/weapons';
import {
  CELL, GRID_H, GRID_W, cellToWorld,
  type AmmoType, type EnemyType, type Room, type SealBreak, type Theme,
} from '../sim/types';
import { encodeBlueprint, decodeBlueprint } from '../sim/mapcodec';

export const EDITOR_MIN_ROOM = 3;
export const ECONOMY_FLOOR = 2.2;

export function emptyBlueprint(): MapBlueprint {
  return {
    codec: 1,
    title: 'UNTITLED',
    cosmeticSeed: 1,
    sealBreak: { type: 'gun', gun: 2 },
    rooms: [],
    corridors: [],
    doors: [],
    pickups: [],
    enemies: [],
  };
}

export function cloneBlueprint(bp: MapBlueprint): MapBlueprint {
  return JSON.parse(JSON.stringify(bp)) as MapBlueprint;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function inGrid(x: number, z: number): boolean {
  return x >= 0 && z >= 0 && x < GRID_W && z < GRID_H;
}

function cellKey(x: number, z: number): number {
  return z * GRID_W + x;
}

function inRoom(r: { x: number; z: number; w: number; h: number }, x: number, z: number): boolean {
  return x >= r.x && x < r.x + r.w && z >= r.z && z < r.z + r.h;
}

function roomOrAdjacent(r: { x: number; z: number; w: number; h: number }, x: number, z: number): boolean {
  return x >= r.x - 1 && x < r.x + r.w + 1 && z >= r.z - 1 && z < r.z + r.h + 1;
}

function clampRect(r: { x: number; z: number; w: number; h: number }): { x: number; z: number; w: number; h: number } {
  const x = clamp(r.x, 0, GRID_W - 1);
  const z = clamp(r.z, 0, GRID_H - 1);
  const w = clamp(r.w, 1, GRID_W - x);
  const h = clamp(r.h, 1, GRID_H - z);
  return { x, z, w, h };
}

function sameRect(a: { x: number; z: number; w: number; h: number }, b: { x: number; z: number; w: number; h: number }): boolean {
  return a.x === b.x && a.z === b.z && a.w === b.w && a.h === b.h;
}

export function carveEditorGrid(bp: MapBlueprint): Uint8Array {
  const grid = new Uint8Array(GRID_W * GRID_H);
  const carve = (r: { x: number; z: number; w: number; h: number }) => {
    for (let z = r.z; z < r.z + r.h; z++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        if (inGrid(x, z)) grid[cellKey(x, z)] = 1;
      }
    }
  };
  for (const r of bp.rooms) carve(r);
  for (const c of bp.corridors) carve(c);
  return grid;
}

export function corridorLegsBetween(a: BlueprintRoom, b: BlueprintRoom): BlueprintCorridor[] {
  const ax = a.x + Math.floor(a.w / 2), az = a.z + Math.floor(a.h / 2);
  const bx = b.x + Math.floor(b.w / 2), bz = b.z + Math.floor(b.h / 2);
  const legs: BlueprintCorridor[] = [];
  if (ax !== bx) {
    legs.push(clampRect({ x: Math.min(ax, bx) - 1, z: az - 1, w: Math.abs(ax - bx) + 3, h: 3 }));
  }
  if (az !== bz) {
    legs.push(clampRect({ x: bx - 1, z: Math.min(az, bz) - 1, w: 3, h: Math.abs(az - bz) + 3 }));
  }
  return legs;
}

export function corridorRectFromCells(x0: number, z0: number, x1: number, z1: number): BlueprintCorridor {
  if (Math.abs(x1 - x0) >= Math.abs(z1 - z0)) {
    const midZ = clamp(Math.round((z0 + z1) / 2) - 1, 0, GRID_H - 3);
    return clampRect({ x: Math.min(x0, x1), z: midZ, w: Math.abs(x1 - x0) + 1, h: 3 });
  }
  const midX = clamp(Math.round((x0 + x1) / 2) - 1, 0, GRID_W - 3);
  return clampRect({ x: midX, z: Math.min(z0, z1), w: 3, h: Math.abs(z1 - z0) + 1 });
}

export function inferAxis(grid: Uint8Array, x: number, z: number): 'x' | 'z' {
  const floor = (cx: number, cz: number) => inGrid(cx, cz) && grid[cellKey(cx, cz)] === 1;
  const horiz = (floor(x, z - 1) ? 1 : 0) + (floor(x, z + 1) ? 1 : 0);
  const vert = (floor(x - 1, z) ? 1 : 0) + (floor(x + 1, z) ? 1 : 0);
  return horiz >= vert ? 'x' : 'z';
}

export function economyWarning(bp: MapBlueprint): string | null {
  let enemyHp = 0;
  for (const e of bp.enemies) enemyHp += ENEMIES[e.type]?.hp ?? 0;
  if (enemyHp <= 0) return null;
  let dmg = WEAPONS[0].spawnAmmo * WEAPONS[0].damage;
  for (const pk of bp.pickups) {
    if (pk.kind === 'ammo') {
      const w = WEAPONS.find(g => g.ammo === (pk.ammoType ?? 'bullets')) ?? WEAPONS[0];
      dmg += (pk.amount ?? w.boxAmmo) * w.damage;
    } else if (pk.kind === 'gun') {
      const w = WEAPONS[(pk.gun ?? 2) - 1] ?? WEAPONS[0];
      dmg += w.spawnAmmo * w.damage;
    }
  }
  if (dmg < enemyHp * ECONOMY_FLOOR) {
    return `economy ${dmg.toFixed(0)} dmg vs ${(enemyHp * ECONOMY_FLOOR).toFixed(0)} needed (2.2× HP)`;
  }
  return null;
}

export function validateEditor(bp: MapBlueprint): { errors: string[]; warnings: string[] } {
  const errors = validateBlueprint(bp);
  const warn = economyWarning(bp);
  return { errors, warnings: warn ? [warn] : [] };
}

export interface CosmeticDot {
  x: number;
  z: number;
  kind: 'light' | 'decor';
}

export function previewCosmeticDots(bp: MapBlueprint): CosmeticDot[] {
  if (!bp.rooms.length) return [];
  const grid = carveEditorGrid(bp);
  const rooms: Room[] = bp.rooms.map((r) => ({
    id: r.id, x: r.x, z: r.z, w: r.w, h: r.h,
    cx: (r.x + r.w / 2) * CELL, cz: (r.z + r.h / 2) * CELL,
    theme: r.theme, outdoor: r.outdoor, kind: r.kind, routeDist: 0,
  }));
  const placed = placeCosmetics(grid, rooms, makeRng(`cos|${bp.cosmeticSeed >>> 0}`));
  const dots: CosmeticDot[] = [];
  for (const l of placed.lights) {
    dots.push({ x: l.x / CELL, z: l.z / CELL, kind: 'light' });
  }
  for (const d of placed.decors) {
    dots.push({ x: d.x / CELL, z: d.z / CELL, kind: 'decor' });
  }
  return dots;
}

export class EditorDoc {
  bp: MapBlueprint;
  libraryId: string | null = null;

  constructor(bp?: MapBlueprint) {
    this.bp = bp ? cloneBlueprint(bp) : emptyBlueprint();
  }

  snapshot(): MapBlueprint {
    return cloneBlueprint(this.bp);
  }

  load(bp: MapBlueprint, libraryId: string | null = null): void {
    this.bp = cloneBlueprint(bp);
    if (!this.bp.rooms) this.bp.rooms = [];
    if (!this.bp.corridors) this.bp.corridors = [];
    if (!this.bp.doors) this.bp.doors = [];
    if (!this.bp.pickups) this.bp.pickups = [];
    if (!this.bp.enemies) this.bp.enemies = [];
    this.libraryId = libraryId;
  }

  reset(): void {
    this.bp = emptyBlueprint();
    this.libraryId = null;
  }

  setTitle(title: string): void {
    this.bp.title = title.slice(0, 40) || 'UNTITLED';
  }

  setCosmeticSeed(seed: number): void {
    this.bp.cosmeticSeed = seed >>> 0;
  }

  setSealBreak(sb: SealBreak): void {
    this.bp.sealBreak = sb.type === 'key' ? { type: 'key' } : { type: 'gun', gun: clamp(sb.gun, 1, 7) };
  }

  setSealBreakMessage(msg: string): void {
    const t = msg.trim().slice(0, 80);
    if (t) this.bp.sealBreakMessage = t;
    else delete this.bp.sealBreakMessage;
  }

  nextRoomId(): number {
    let max = -1;
    for (const r of this.bp.rooms) if (r.id > max) max = r.id;
    return max + 1;
  }

  roomAt(x: number, z: number): BlueprintRoom | null {
    let best: BlueprintRoom | null = null;
    for (const r of this.bp.rooms) {
      if (!inRoom(r, x, z)) continue;
      if (!best || r.w * r.h < best.w * best.h) best = r;
    }
    return best;
  }

  roomIdForCell(x: number, z: number): number | null {
    const inside = this.roomAt(x, z);
    if (inside) return inside.id;
    let best: BlueprintRoom | null = null;
    for (const r of this.bp.rooms) {
      if (!roomOrAdjacent(r, x, z)) continue;
      if (!best || r.w * r.h < best.w * best.h) best = r;
    }
    return best ? best.id : null;
  }

  stampRoom(opts: {
    x: number; z: number; w: number; h: number;
    kind?: Room['kind']; theme?: Theme; outdoor?: boolean;
  }): BlueprintRoom | null {
    const kind = opts.kind ?? 'spine';
    const theme = opts.theme ?? 'industrial';
    let { x, z, w, h } = opts;
    w = Math.max(EDITOR_MIN_ROOM, w);
    h = Math.max(EDITOR_MIN_ROOM, h);
    const rect = clampRect({ x, z, w, h });
    if (rect.w < EDITOR_MIN_ROOM || rect.h < EDITOR_MIN_ROOM) return null;
    if (kind === 'start' || kind === 'arena' || kind === 'antechamber') {
      for (const r of this.bp.rooms) {
        if (r.kind === kind) r.kind = 'spine';
      }
    }
    const room: BlueprintRoom = {
      id: this.nextRoomId(),
      x: rect.x, z: rect.z, w: rect.w, h: rect.h,
      theme, kind, outdoor: !!opts.outdoor,
    };
    this.bp.rooms.push(room);
    return room;
  }

  linkRooms(aId: number, bId: number): BlueprintCorridor[] {
    const a = this.bp.rooms.find(r => r.id === aId);
    const b = this.bp.rooms.find(r => r.id === bId);
    if (!a || !b || a.id === b.id) return [];
    const legs = corridorLegsBetween(a, b);
    const added: BlueprintCorridor[] = [];
    for (const leg of legs) {
      if (this.bp.corridors.some(c => sameRect(c, leg))) continue;
      this.bp.corridors.push(leg);
      added.push(leg);
    }
    return added;
  }

  stampCorridorRect(rect: { x: number; z: number; w: number; h: number }): BlueprintCorridor {
    const c = clampRect(rect);
    if (!this.bp.corridors.some(ex => sameRect(ex, c))) this.bp.corridors.push(c);
    return c;
  }

  applyCorridorClicks(x0: number, z0: number, x1: number, z1: number): BlueprintCorridor[] {
    const ra = this.roomAt(x0, z0);
    const rb = this.roomAt(x1, z1);
    if (ra && rb && ra.id !== rb.id) return this.linkRooms(ra.id, rb.id);
    return [this.stampCorridorRect(corridorRectFromCells(x0, z0, x1, z1))];
  }

  stampDoor(cx: number, cz: number, axis?: 'x' | 'z', locked = false): void {
    if (!inGrid(cx, cz)) return;
    const grid = carveEditorGrid(this.bp);
    const ax = axis ?? inferAxis(grid, cx, cz);
    if (this.bp.doors.some(d => d.cx === cx && d.cz === cz && d.axis === ax)) {
      this.bp.doors = this.bp.doors.filter(d => !(d.cx === cx && d.cz === cz && d.axis === ax));
      return;
    }
    this.bp.doors.push({ cx, cz, axis: ax, locked });
  }

  stampSeal(cx: number, cz: number, axis?: 'x' | 'z'): void {
    if (!inGrid(cx, cz)) return;
    const grid = carveEditorGrid(this.bp);
    const ax = axis ?? inferAxis(grid, cx, cz);
    this.bp.seal = { cells: expandDoorCells(cx, cz, ax), axis: ax };
  }

  clearSealOverride(): void {
    delete this.bp.seal;
  }

  stampPickup(p: Omit<BlueprintPickup, 'roomId'> & { roomId?: number }): boolean {
    const roomId = p.roomId ?? this.roomIdForCell(p.x, p.z);
    if (roomId === null) return false;
    if (!inGrid(p.x, p.z)) return false;
    if (p.kind === 'key') {
      this.bp.pickups = this.bp.pickups.filter(pk => pk.kind !== 'key');
    }
    if (p.kind === 'gun') {
      const gun = clamp(p.gun ?? 2, 2, 7);
      this.bp.pickups = this.bp.pickups.filter(pk => !(pk.kind === 'gun' && pk.gun === gun));
      this.bp.pickups.push({ kind: 'gun', gun, x: p.x, z: p.z, roomId });
      return true;
    }
    const next: BlueprintPickup = { kind: p.kind, x: p.x, z: p.z, roomId };
    if (p.kind === 'ammo') {
      next.ammoType = p.ammoType ?? 'bullets';
      if (p.amount) next.amount = p.amount;
    }
    this.bp.pickups.push(next);
    return true;
  }

  stampEnemy(type: EnemyType, x: number, z: number, yaw = 0): boolean {
    const roomId = this.roomIdForCell(x, z);
    if (roomId === null || !inGrid(x, z)) return false;
    this.bp.enemies.push({ type, x, z, yaw, roomId });
    return true;
  }

  setPlayerStart(x: number, z: number, yaw = Math.PI / 2): boolean {
    if (!inGrid(x, z)) return false;
    this.bp.playerStart = { x, z, yaw };
    return true;
  }

  eraseAt(x: number, z: number): string | null {
    if (!inGrid(x, z)) return null;
    const ei = this.bp.enemies.findIndex(e => e.x === x && e.z === z);
    if (ei >= 0) {
      this.bp.enemies.splice(ei, 1);
      return 'enemy';
    }
    const pi = this.bp.pickups.findIndex(p => p.x === x && p.z === z);
    if (pi >= 0) {
      this.bp.pickups.splice(pi, 1);
      return 'pickup';
    }
    if (this.bp.playerStart && this.bp.playerStart.x === x && this.bp.playerStart.z === z) {
      delete this.bp.playerStart;
      return 'start';
    }
    const di = this.bp.doors.findIndex((d) => {
      const cells = expandDoorCells(d.cx, d.cz, d.axis);
      return cells.some(([cx, cz]) => cx === x && cz === z) || (d.cx === x && d.cz === z);
    });
    if (di >= 0) {
      this.bp.doors.splice(di, 1);
      return 'door';
    }
    if (this.bp.seal?.cells.some(([cx, cz]) => cx === x && cz === z)) {
      this.clearSealOverride();
      return 'seal';
    }
    const room = this.roomAt(x, z);
    if (room) {
      const starts = this.bp.rooms.filter(r => r.kind === 'start');
      if (room.kind === 'start' && starts.length <= 1 && this.bp.rooms.length > 1) {
        return 'blocked-start';
      }
      this.bp.rooms = this.bp.rooms.filter(r => r.id !== room.id);
      this.bp.pickups = this.bp.pickups.filter(p => p.roomId !== room.id);
      this.bp.enemies = this.bp.enemies.filter(e => e.roomId !== room.id);
      return 'room';
    }
    const ci = this.bp.corridors.findIndex(c => inRoom(c, x, z));
    if (ci >= 0) {
      this.bp.corridors.splice(ci, 1);
      return 'corridor';
    }
    return null;
  }

  validate(): { errors: string[]; warnings: string[] } {
    return validateEditor(this.bp);
  }

  compile() {
    return compileBlueprint(this.bp);
  }

  encode(): string {
    return encodeBlueprint(stripCosmetics(this.bp));
  }

  static decode(code: string): MapBlueprint {
    return decodeBlueprint(code);
  }
}

export function worldCellCenter(x: number, z: number): { x: number; z: number } {
  return { x: cellToWorld(x), z: cellToWorld(z) };
}

export type { AmmoType, EnemyType, Theme, SealBreak, BlueprintEnemy, BlueprintPickup };
