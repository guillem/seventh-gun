// Campaign JSON DSL → MapBlueprint → GameMap. Pure; no DOM.
import {
  compileBlueprint, expandDoorCells, validateBlueprint,
  type MapBlueprint, type BlueprintCorridor, type BlueprintDoor,
  type BlueprintEnemy, type BlueprintPickup, type BlueprintRoom,
} from '../sim/blueprint';
import { placeCosmetics } from '../sim/cosmetics';
import { makeRng } from '../sim/rng';
import { CELL, GRID_W, GRID_H, cellToWorld } from '../sim/types';
import type {
  AmmoType, Difficulty, EnemyType, GameMap, PlayerLoadout, Room, SealBreak, Theme,
} from '../sim/types';
import { ENEMIES } from '../sim/enemyTypes';
import { WEAPONS, weapon } from '../sim/weapons';

export interface CampaignRoomDsl {
  id: string;
  x: number; z: number; w: number; h: number;
  kind: Room['kind'];
  theme?: Theme;
  outdoor?: boolean;
}

export interface CampaignLinkDsl {
  from: string;
  to: string;
  len?: number;
}

export interface CampaignDoorDsl {
  room: string;
  locked?: boolean;
}

export interface CampaignGunDsl {
  gun: number;
  room: string;
  x?: number;
  z?: number;
}

export interface CampaignPickupDsl {
  kind: 'medikit' | 'ammo' | 'key';
  room: string;
  ammoType?: AmmoType;
  amount?: number;
  n?: number;
  x?: number;
  z?: number;
}

export interface CampaignEnemyDsl {
  type: EnemyType;
  room: string;
  n?: number;
  x?: number;
  z?: number;
  yaw?: number;
}

export interface CampaignDsl {
  id: string;
  title: string;
  subtitle?: string;
  themeDefault: Theme;
  cosmeticSeed: number;
  sealBreak: SealBreak;
  sealBreakMessage?: string;
  intermission?: string | string[];
  victoryTitle?: string;
  victoryBody?: string;
  incomingGuns: number[];
  incomingAmmo?: Partial<Record<AmmoType, number>>;
  rooms: CampaignRoomDsl[];
  links: CampaignLinkDsl[];
  doors?: CampaignDoorDsl[];
  guns?: CampaignGunDsl[];
  pickups?: CampaignPickupDsl[];
  enemies: CampaignEnemyDsl[];
  playerStart?: { x: number; z: number; yaw: number };
}

const EMPTY_AMMO: Record<AmmoType, number> = {
  bullets: 0, shells: 0, nails: 0, grenades: 0, cores: 0, void: 0,
};

function cellKey(x: number, z: number): number {
  return z * GRID_W + x;
}

function inGrid(x: number, z: number): boolean {
  return x >= 0 && z >= 0 && x < GRID_W && z < GRID_H;
}

function carveRect(grid: Uint8Array, r: { x: number; z: number; w: number; h: number }): void {
  for (let z = r.z; z < r.z + r.h; z++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      if (inGrid(x, z)) grid[cellKey(x, z)] = 1;
    }
  }
}

function interiorCells(r: { x: number; z: number; w: number; h: number }): [number, number][] {
  const inset = r.w >= 5 && r.h >= 5 ? 1 : 0;
  const cells: [number, number][] = [];
  for (let z = r.z + inset; z < r.z + r.h - inset; z++) {
    for (let x = r.x + inset; x < r.x + r.w - inset; x++) {
      if (inGrid(x, z)) cells.push([x, z]);
    }
  }
  if (cells.length === 0) {
    const cx = r.x + (r.w >> 1), cz = r.z + (r.h >> 1);
    if (inGrid(cx, cz)) cells.push([cx, cz]);
  }
  return cells;
}

function roomCenterCell(r: { x: number; z: number; w: number; h: number }): [number, number] {
  return [r.x + (r.w >> 1), r.z + (r.h >> 1)];
}

function overlap1d(a0: number, a1: number, b0: number, b1: number): number {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

function corridorsBetween(
  a: { x: number; z: number; w: number; h: number },
  b: { x: number; z: number; w: number; h: number },
): BlueprintCorridor[] {
  const aX1 = a.x + a.w, aZ1 = a.z + a.h;
  const bX1 = b.x + b.w, bZ1 = b.z + b.h;
  const ovZ = overlap1d(a.z, aZ1, b.z, bZ1);
  const ovX = overlap1d(a.x, aX1, b.x, bX1);

  if (ovZ >= 3 && (aX1 <= b.x || bX1 <= a.x)) {
    const left = aX1 <= b.x ? a : b;
    const right = left === a ? b : a;
    const z0 = Math.max(a.z, b.z);
    const zSpan = Math.min(aZ1, bZ1) - z0;
    const zMouth = z0 + Math.floor(zSpan / 2) - 1;
    const z = Math.max(z0, Math.min(zMouth, Math.min(aZ1, bZ1) - 3));
    return [{ x: left.x + left.w - 1, z, w: right.x - (left.x + left.w) + 2, h: 3 }];
  }
  if (ovX >= 3 && (aZ1 <= b.z || bZ1 <= a.z)) {
    const top = aZ1 <= b.z ? a : b;
    const bot = top === a ? b : a;
    const x0 = Math.max(a.x, b.x);
    const xSpan = Math.min(aX1, bX1) - x0;
    const xMouth = x0 + Math.floor(xSpan / 2) - 1;
    const x = Math.max(x0, Math.min(xMouth, Math.min(aX1, bX1) - 3));
    return [{ x, z: top.z + top.h - 1, w: 3, h: bot.z - (top.z + top.h) + 2 }];
  }

  const [ax, az] = roomCenterCell(a);
  const [bx, bz] = roomCenterCell(b);
  return [
    { x: Math.min(ax, bx) - 1, z: az - 1, w: Math.abs(ax - bx) + 3, h: 3 },
    { x: bx - 1, z: Math.min(az, bz) - 1, w: 3, h: Math.abs(az - bz) + 3 },
  ];
}

function findDoorOnRoom(
  r: { x: number; z: number; w: number; h: number },
  grid: Uint8Array,
  preferToward?: { x: number; z: number; w: number; h: number },
): { cx: number; cz: number; axis: 'x' | 'z' } | null {
  const cands: { cx: number; cz: number; axis: 'x' | 'z' }[] = [];
  const tryEdge = (cx: number, cz: number, axis: 'x' | 'z') => {
    const cells = expandDoorCells(cx, cz, axis);
    if (!cells.every(([x, z]) => inGrid(x, z) && grid[cellKey(x, z)] === 1)) return;
    const beyondX = axis === 'x' ? cx + (cx < r.x ? -1 : 1) : cx;
    const beyondZ = axis === 'z' ? cz + (cz < r.z ? -1 : 1) : cz;
    if (!inGrid(beyondX, beyondZ) || grid[cellKey(beyondX, beyondZ)] !== 1) return;
    cands.push({ cx, cz, axis });
  };
  // west / east: slide the 3-wide span along z
  for (let cz = r.z; cz < r.z + r.h; cz++) {
    tryEdge(r.x - 1, cz, 'x');
    tryEdge(r.x + r.w, cz, 'x');
  }
  // north / south: slide along x
  for (let cx = r.x; cx < r.x + r.w; cx++) {
    tryEdge(cx, r.z - 1, 'z');
    tryEdge(cx, r.z + r.h, 'z');
  }
  if (!cands.length) return null;
  if (preferToward) {
    const [tx, tz] = roomCenterCell(preferToward);
    cands.sort((a, b) => Math.hypot(a.cx - tx, a.cz - tz) - Math.hypot(b.cx - tx, b.cz - tz));
  }
  return cands[0];
}

function occupiedKey(x: number, z: number): string {
  return `${x},${z}`;
}

function spreadCells(
  room: { x: number; z: number; w: number; h: number },
  n: number,
  occupied: Set<string>,
  avoidWorld?: { x: number; z: number },
): [number, number][] {
  let cells = interiorCells(room).filter(([x, z]) => !occupied.has(occupiedKey(x, z)));
  if (avoidWorld && cells.length > n) {
    const far = cells.filter(([x, z]) => {
      const d = Math.hypot(cellToWorld(x) - avoidWorld.x, cellToWorld(z) - avoidWorld.z);
      return d >= 16;
    });
    if (far.length >= n) cells = far;
  }
  cells.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  if (cells.length === 0) return [];
  const out: [number, number][] = [];
  const take = Math.min(n, cells.length);
  for (let i = 0; i < take; i++) {
    const idx = Math.floor(((i + 0.5) * cells.length) / take);
    const cell = cells[Math.min(idx, cells.length - 1)];
    if (out.some(([x, z]) => x === cell[0] && z === cell[1])) {
      const fallback = cells.find(c => !out.some(([x, z]) => x === c[0] && z === c[1]));
      if (fallback) out.push(fallback);
    } else {
      out.push(cell);
    }
  }
  return out;
}

export function emptyAmmo(): Record<AmmoType, number> {
  return { ...EMPTY_AMMO };
}

export function referenceLoadout(dsl: CampaignDsl): PlayerLoadout {
  const owned = [false, false, false, false, false, false, false, false];
  for (const g of dsl.incomingGuns) {
    if (g >= 1 && g <= 7) owned[g] = true;
  }
  const ammo = emptyAmmo();
  if (dsl.incomingAmmo) {
    for (const t of Object.keys(EMPTY_AMMO) as AmmoType[]) {
      const v = dsl.incomingAmmo[t];
      if (typeof v === 'number' && Number.isFinite(v)) ammo[t] = Math.max(0, v);
    }
  } else {
    for (const g of dsl.incomingGuns) {
      if (g < 1 || g > 7) continue;
      const w = weapon(g);
      ammo[w.ammo] += w.spawnAmmo;
    }
  }
  const gun = dsl.incomingGuns[dsl.incomingGuns.length - 1] ?? 1;
  return { owned, ammo, gun };
}

export function snapshotLoadout(p: {
  owned: boolean[];
  ammo: Record<AmmoType, number>;
  gun: number;
}): PlayerLoadout {
  return { owned: p.owned.slice(), ammo: { ...p.ammo }, gun: p.gun };
}

export function intermissionLines(dsl: CampaignDsl): string[] {
  if (!dsl.intermission) return [];
  if (Array.isArray(dsl.intermission)) return dsl.intermission.filter(Boolean);
  return dsl.intermission.split(/\n+/).map(s => s.trim()).filter(Boolean);
}

export function campaignEconomy(dsl: CampaignDsl, map: GameMap): {
  damage: number; enemyHp: number; ratio: number;
} {
  const guns = new Set(dsl.incomingGuns.filter(g => g >= 1 && g <= 7));
  for (const p of map.pickups) {
    if (p.kind === 'gun' && p.gun && p.gun >= 1 && p.gun <= 7) guns.add(p.gun);
  }
  if (dsl.sealBreak.type === 'key') guns.delete(7);

  const ammo = { ...referenceLoadout(dsl).ammo };
  for (const p of map.pickups) {
    if (p.kind === 'ammo' && p.ammoType) {
      const w = WEAPONS.find(g => g.ammo === p.ammoType);
      ammo[p.ammoType] += p.amount ?? w?.boxAmmo ?? 0;
    } else if (p.kind === 'gun' && p.gun) {
      const w = weapon(p.gun);
      ammo[w.ammo] += w.spawnAmmo;
    }
  }

  const best: Partial<Record<AmmoType, number>> = {};
  for (const g of guns) {
    const w = weapon(g);
    const pot = w.damage * w.pellets;
    best[w.ammo] = Math.max(best[w.ammo] ?? 0, pot);
  }
  let damage = 0;
  for (const t of Object.keys(EMPTY_AMMO) as AmmoType[]) {
    damage += ammo[t] * (best[t] ?? 0);
  }
  let enemyHp = 0;
  for (const e of map.enemies) enemyHp += ENEMIES[e.type].hp;
  return { damage, enemyHp, ratio: enemyHp > 0 ? damage / enemyHp : Infinity };
}

export const ECONOMY_FLOOR = 2.2;

export function compileDsl(dsl: CampaignDsl, opts?: { difficulty?: Difficulty; seed?: string }): {
  blueprint: MapBlueprint;
  map: GameMap;
  warnings: string[];
} {
  const idToNum = new Map<string, number>();
  const roomsDsl = dsl.rooms;
  roomsDsl.forEach((r, i) => idToNum.set(r.id, i));

  const missing = (name: string, where: string) => {
    if (!idToNum.has(name)) throw new Error(`${dsl.id}: unknown room '${name}' in ${where}`);
  };

  const rooms: BlueprintRoom[] = roomsDsl.map((r, i) => ({
    id: i,
    x: r.x, z: r.z, w: r.w, h: r.h,
    theme: r.theme ?? dsl.themeDefault,
    kind: r.kind,
    outdoor: !!r.outdoor,
  }));
  const byName = new Map(roomsDsl.map((r, i) => [r.id, rooms[i]]));

  const corridors: BlueprintCorridor[] = [];
  for (const link of dsl.links) {
    missing(link.from, 'link.from');
    missing(link.to, 'link.to');
    corridors.push(...corridorsBetween(byName.get(link.from)!, byName.get(link.to)!));
  }

  const grid = new Uint8Array(GRID_W * GRID_H);
  for (const r of rooms) carveRect(grid, r);
  for (const c of corridors) carveRect(grid, c);

  const startRoom = roomsDsl.find(r => r.kind === 'start');
  const doors: BlueprintDoor[] = [];
  const usedDoor = new Set<string>();
  for (const d of dsl.doors ?? []) {
    missing(d.room, 'door.room');
    const room = byName.get(d.room)!;
    const prefer = startRoom && d.room !== startRoom.id ? byName.get(startRoom.id) : undefined;
    const found = findDoorOnRoom(room, grid, prefer);
    if (!found) throw new Error(`${dsl.id}: no corridor mouth for door on '${d.room}'`);
    const k = `${found.cx},${found.cz},${found.axis}`;
    if (usedDoor.has(k)) continue;
    usedDoor.add(k);
    doors.push({ cx: found.cx, cz: found.cz, axis: found.axis, locked: !!d.locked });
  }

  const occupied = new Set<string>();
  const pickups: BlueprintPickup[] = [];
  const startBp = startRoom ? byName.get(startRoom.id)! : rooms[0];
  const startWorld = startBp
    ? { x: cellToWorld(startBp.x + startBp.w / 2 - 0.5), z: cellToWorld(startBp.z + startBp.h / 2 - 0.5) }
    : { x: 0, z: 0 };

  const claim = (x: number, z: number, roomId: number, spec: Omit<BlueprintPickup, 'x' | 'z' | 'roomId'>) => {
    occupied.add(occupiedKey(x, z));
    pickups.push({ ...spec, x, z, roomId });
  };

  const placeInRoom = (
    roomName: string,
    n: number,
    explicit: { x?: number; z?: number },
    where: string,
  ): { cells: [number, number][]; roomId: number } => {
    missing(roomName, where);
    const room = byName.get(roomName)!;
    const roomId = room.id;
    const cells: [number, number][] = [];
    if (explicit.x !== undefined && explicit.z !== undefined) {
      cells.push([explicit.x, explicit.z]);
      if (n > 1) {
        cells.push(...spreadCells(room, n - 1, new Set([
          ...occupied, occupiedKey(explicit.x, explicit.z),
        ]), startWorld));
      }
    } else {
      cells.push(...spreadCells(room, n, occupied, startWorld));
    }
    if (cells.length < n) {
      const extra = interiorCells(room).filter(([x, z]) =>
        !cells.some(c => c[0] === x && c[1] === z) && !occupied.has(occupiedKey(x, z)));
      while (cells.length < n && extra.length) cells.push(extra.pop()!);
    }
    if (cells.length === 0) {
      const [cx, cz] = roomCenterCell(room);
      cells.push([cx, cz]);
    }
    return { cells, roomId };
  };

  for (const g of dsl.guns ?? []) {
    const { cells, roomId } = placeInRoom(g.room, 1, g, 'guns');
    const [x, z] = cells[0];
    claim(x, z, roomId, { kind: 'gun', gun: g.gun });
  }

  for (const p of dsl.pickups ?? []) {
    const n = Math.max(1, p.n ?? 1);
    const { cells, roomId } = placeInRoom(p.room, n, p, 'pickups');
    for (let i = 0; i < cells.length; i++) {
      const [x, z] = cells[i];
      claim(x, z, roomId, {
        kind: p.kind,
        ammoType: p.ammoType,
        amount: p.amount,
      });
    }
  }

  const enemies: BlueprintEnemy[] = [];
  const firstLink = dsl.links.find(l => l.from === startRoom?.id || l.to === startRoom?.id);
  const lookTarget = firstLink
    ? byName.get(firstLink.from === startRoom?.id ? firstLink.to : firstLink.from)
    : undefined;
  const startYaw = dsl.playerStart?.yaw ?? (lookTarget && startBp
    ? Math.atan2(-(lookTarget.x + lookTarget.w / 2 - (startBp.x + startBp.w / 2)) * CELL,
      -(lookTarget.z + lookTarget.h / 2 - (startBp.z + startBp.h / 2)) * CELL)
    : Math.PI / 2);

  for (const e of dsl.enemies) {
    const n = Math.max(1, e.n ?? 1);
    const { cells, roomId } = placeInRoom(e.room, n, e, 'enemies');
    const room = byName.get(e.room)!;
    const [rcx, rcz] = roomCenterCell(room);
    for (const [x, z] of cells) {
      occupied.add(occupiedKey(x, z));
      const yaw = e.yaw ?? Math.atan2(rcx - x, rcz - z);
      enemies.push({ type: e.type, x, z, yaw, roomId });
    }
  }

  const playerStart = dsl.playerStart ?? (startBp
    ? { x: startBp.x + (startBp.w >> 1), z: startBp.z + (startBp.h >> 1), yaw: startYaw }
    : undefined);

  const blueprint: MapBlueprint = {
    codec: 1,
    title: dsl.title,
    cosmeticSeed: dsl.cosmeticSeed,
    sealBreak: dsl.sealBreak,
    sealBreakMessage: dsl.sealBreakMessage,
    rooms,
    corridors,
    doors,
    playerStart,
    pickups,
    enemies,
  };

  const seed = opts?.seed ?? `campaign:${dsl.id}`;
  const map = compileBlueprint(blueprint, {
    seed,
    difficulty: opts?.difficulty ?? 'normal',
  });

  // Bake cosmetics into the shipped blueprint (compiler skips regen when present).
  const cosmetics = (blueprint.lights && blueprint.lights.length) || (blueprint.decors && blueprint.decors.length)
    ? { lights: blueprint.lights ?? map.lights, decors: blueprint.decors ?? map.decors }
    : placeCosmetics(map.grid, map.rooms, makeRng(`cos|${dsl.cosmeticSeed >>> 0}`));
  blueprint.lights = cosmetics.lights;
  blueprint.decors = cosmetics.decors;
  map.lights = cosmetics.lights;
  map.decors = cosmetics.decors;

  const warnings: string[] = [];
  const eco = campaignEconomy(dsl, map);
  if (eco.ratio < ECONOMY_FLOOR) {
    warnings.push(
      `${dsl.id}: economy ${eco.ratio.toFixed(2)}× < ${ECONOMY_FLOOR}× (${eco.damage} dmg vs ${eco.enemyHp} hp)`,
    );
  }
  const leftover = validateBlueprint(blueprint);
  if (leftover.length) warnings.push(...leftover.map(e => `${dsl.id}: ${e}`));

  return { blueprint, map, warnings };
}
