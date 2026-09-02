// Authored map schema + compiler → GameMap. Pure; no DOM.
import { makeRng } from './rng';
import { placeCosmetics } from './cosmetics';
import {
  CELL, GRID_W, GRID_H, MAP_CODEC_VERSION, cellToWorld,
} from './types';
import type {
  AmmoType, Decor, Difficulty, DoorDef, EnemySpawn, EnemyType, GameMap,
  PickupDef, Room, RoomLight, SealBreak, SealDef, Theme,
} from './types';

export const THEMES: Theme[] = ['industrial', 'organic', 'stone', 'tech'];
export const ROOM_KINDS: Room['kind'][] = ['start', 'spine', 'spur', 'arena', 'antechamber', 'vault'];
export const ENEMY_TYPES: EnemyType[] = ['husk', 'crawler', 'slab', 'wisp', 'hierophant', 'fiend'];
export const PICKUP_KINDS: PickupDef['kind'][] = ['medikit', 'ammo', 'gun', 'key'];

export interface BlueprintRoom {
  id: number;
  x: number; z: number; w: number; h: number;
  theme: Theme;
  kind: Room['kind'];
  outdoor: boolean;
}

export interface BlueprintCorridor {
  x: number; z: number; w: number; h: number;
}

export interface BlueprintDoor {
  cx: number; cz: number;
  axis: 'x' | 'z';
  locked: boolean;
}

export interface BlueprintPickup {
  kind: PickupDef['kind'];
  gun?: number;
  ammoType?: AmmoType;
  amount?: number;
  x: number; z: number;
  roomId: number;
}

export interface BlueprintEnemy {
  type: EnemyType;
  x: number; z: number;
  yaw: number;
  roomId: number;
}

export interface MapBlueprint {
  codec: number;
  title?: string;
  cosmeticSeed: number;
  sealBreak: SealBreak;
  sealBreakMessage?: string;
  rooms: BlueprintRoom[];
  corridors: BlueprintCorridor[];
  doors: BlueprintDoor[];
  seal?: { cells: [number, number][]; axis: 'x' | 'z' };
  playerStart?: { x: number; z: number; yaw: number };
  pickups: BlueprintPickup[];
  enemies: BlueprintEnemy[];
  lights?: RoomLight[];
  decors?: Decor[];
}

export class BlueprintError extends Error {
  errors: string[];
  constructor(errors: string[]) {
    super(errors[0] ?? 'invalid blueprint');
    this.name = 'BlueprintError';
    this.errors = errors;
  }
}

export interface CompileOpts {
  seed?: string;
  difficulty?: Difficulty;
}

function cellKey(x: number, z: number): number {
  return z * GRID_W + x;
}

export function expandDoorCells(cx: number, cz: number, axis: 'x' | 'z'): [number, number][] {
  if (axis === 'x') return [[cx, cz - 1], [cx, cz], [cx, cz + 1]];
  return [[cx - 1, cz], [cx, cz], [cx + 1, cz]];
}

export function stripCosmetics(bp: MapBlueprint): MapBlueprint {
  const { lights: _l, decors: _d, ...rest } = bp;
  return { ...rest, lights: undefined, decors: undefined };
}

export function mapSeedFromTitle(title?: string): string {
  if (!title) return 'authored';
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return slug || 'authored';
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

function roomOrAdjacent(r: { x: number; z: number; w: number; h: number }, x: number, z: number): boolean {
  return x >= r.x - 1 && x < r.x + r.w + 1 && z >= r.z - 1 && z < r.z + r.h + 1;
}

function bfsReach(grid: Uint8Array, startX: number, startZ: number, solid: Set<number>): Uint8Array {
  const seen = new Uint8Array(GRID_W * GRID_H);
  if (!inGrid(startX, startZ)) return seen;
  const q: number[] = [cellKey(startX, startZ)];
  if (grid[q[0]] === 0 || solid.has(q[0])) return seen;
  seen[q[0]] = 1;
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    const x = c % GRID_W, z = (c / GRID_W) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, nz = z + dz;
      if (!inGrid(nx, nz)) continue;
      const nk = cellKey(nx, nz);
      if (seen[nk] || grid[nk] === 0 || solid.has(nk)) continue;
      seen[nk] = 1;
      q.push(nk);
    }
  }
  return seen;
}

function losBlocked(
  grid: Uint8Array,
  blocked: Set<number>,
  x0: number, z0: number, x1: number, z1: number,
): boolean {
  const dx = x1 - x0, dz = z1 - z0;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.001) return false;
  const dirX = dx / dist, dirZ = dz / dist;
  const solid = (cx: number, cz: number) =>
    !inGrid(cx, cz) || grid[cellKey(cx, cz)] === 0 || blocked.has(cellKey(cx, cz));
  let cx = Math.floor(x0 / CELL), cz = Math.floor(z0 / CELL);
  if (solid(cx, cz)) return true;
  const stepX = dirX > 0 ? 1 : -1;
  const stepZ = dirZ > 0 ? 1 : -1;
  const tDx = dirX !== 0 ? Math.abs(CELL / dirX) : Infinity;
  const tDz = dirZ !== 0 ? Math.abs(CELL / dirZ) : Infinity;
  let tMaxX = dirX !== 0
    ? (dirX > 0 ? (cx + 1) * CELL - x0 : x0 - cx * CELL) / Math.abs(dirX)
    : Infinity;
  let tMaxZ = dirZ !== 0
    ? (dirZ > 0 ? (cz + 1) * CELL - z0 : z0 - cz * CELL) / Math.abs(dirZ)
    : Infinity;
  for (let i = 0; i < 512; i++) {
    let t: number;
    if (tMaxX < tMaxZ) { t = tMaxX; tMaxX += tDx; cx += stepX; }
    else { t = tMaxZ; tMaxZ += tDz; cz += stepZ; }
    if (t > dist) return false;
    if (solid(cx, cz)) return true;
  }
  return false;
}

function inferSeal(arena: Room, grid: Uint8Array): SealDef {
  const cx = arena.x + (arena.w >> 1), cz = arena.z + (arena.h >> 1);
  const edges: { nx: number; nz: number; axis: 'x' | 'z'; cells: [number, number][] }[] = [
    { nx: cx, nz: arena.z - 1, axis: 'z', cells: [[cx - 1, arena.z - 1], [cx, arena.z - 1], [cx + 1, arena.z - 1]] },
    { nx: cx, nz: arena.z + arena.h, axis: 'z', cells: [[cx - 1, arena.z + arena.h], [cx, arena.z + arena.h], [cx + 1, arena.z + arena.h]] },
    { nx: arena.x - 1, nz: cz, axis: 'x', cells: [[arena.x - 1, cz - 1], [arena.x - 1, cz], [arena.x - 1, cz + 1]] },
    { nx: arena.x + arena.w, nz: cz, axis: 'x', cells: [[arena.x + arena.w, cz - 1], [arena.x + arena.w, cz], [arena.x + arena.w, cz + 1]] },
  ];
  for (const e of edges) {
    const floor = e.cells.filter(([x, z]) => inGrid(x, z) && grid[cellKey(x, z)] === 1);
    if (!floor.length) continue;
    return {
      cells: floor,
      x: cellToWorld(e.nx),
      z: cellToWorld(e.nz),
      axis: e.axis,
    };
  }
  throw new BlueprintError(['could not infer seal: no floor on any arena edge']);
}

function compileInner(bp: MapBlueprint, opts: CompileOpts = {}): { map: GameMap; errors: string[] } {
  const errors: string[] = [];
  const grid = new Uint8Array(GRID_W * GRID_H);
  for (const r of bp.rooms) carveRect(grid, r);
  for (const c of bp.corridors) carveRect(grid, c);

  const starts = bp.rooms.filter(r => r.kind === 'start');
  const arenas = bp.rooms.filter(r => r.kind === 'arena');
  const antes = bp.rooms.filter(r => r.kind === 'antechamber');
  if (starts.length < 1) errors.push('need at least one start room');
  if (arenas.length < 1) errors.push('need at least one arena room');
  if (antes.length < 1) errors.push('need at least one antechamber room');

  const rooms: Room[] = bp.rooms.map((r) => ({
    id: r.id,
    x: r.x, z: r.z, w: r.w, h: r.h,
    cx: (r.x + r.w / 2) * CELL,
    cz: (r.z + r.h / 2) * CELL,
    theme: r.theme,
    outdoor: r.outdoor,
    kind: r.kind,
    routeDist: 0,
  }));
  const roomById = new Map(rooms.map(r => [r.id, r]));

  for (const r of bp.rooms) {
    if (r.w < 1 || r.h < 1 || !inGrid(r.x, r.z) || !inGrid(r.x + r.w - 1, r.z + r.h - 1)) {
      errors.push(`room ${r.id} is out of bounds or empty`);
    }
  }

  const startRoom = rooms.find(r => r.kind === 'start');
  const arenaRoom = rooms.find(r => r.kind === 'arena');
  const anteRoom = rooms.find(r => r.kind === 'antechamber');
  const vaultRoom = rooms.find(r => r.kind === 'vault');

  if (startRoom) {
    const dist = new Int32Array(GRID_W * GRID_H).fill(-1);
    const sx = startRoom.x + (startRoom.w >> 1), sz = startRoom.z + (startRoom.h >> 1);
    const q = [cellKey(sx, sz)];
    dist[q[0]] = 0;
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi];
      const x = c % GRID_W, z = (c / GRID_W) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, nz = z + dz;
        if (!inGrid(nx, nz)) continue;
        const nk = cellKey(nx, nz);
        if (grid[nk] === 1 && dist[nk] === -1) { dist[nk] = dist[c] + 1; q.push(nk); }
      }
    }
    for (const r of rooms) {
      r.routeDist = dist[cellKey(r.x + (r.w >> 1), r.z + (r.h >> 1))];
    }
  }

  const doors: DoorDef[] = bp.doors.map((d, i) => {
    const cells = expandDoorCells(d.cx, d.cz, d.axis);
    return {
      id: i,
      cx: d.cx, cz: d.cz, axis: d.axis, cells, locked: d.locked,
      x: cellToWorld(d.cx), z: cellToWorld(d.cz),
    };
  });

  let seal: SealDef;
  if (bp.seal && bp.seal.cells.length) {
    const c0 = bp.seal.cells[0];
    seal = {
      cells: bp.seal.cells,
      x: cellToWorld(c0[0]), z: cellToWorld(c0[1]),
      axis: bp.seal.axis,
    };
  } else if (arenaRoom) {
    try {
      seal = inferSeal(arenaRoom, grid);
    } catch (e) {
      seal = { cells: [], x: 0, z: 0, axis: 'z' };
      if (e instanceof BlueprintError) errors.push(...e.errors);
      else errors.push('could not infer seal');
    }
  } else {
    seal = { cells: [], x: 0, z: 0, axis: 'z' };
  }

  const playerStart = bp.playerStart
    ? { x: cellToWorld(bp.playerStart.x), z: cellToWorld(bp.playerStart.z), yaw: bp.playerStart.yaw }
    : startRoom
      ? { x: startRoom.cx, z: startRoom.cz, yaw: Math.PI / 2 }
      : { x: cellToWorld(1), z: cellToWorld(1), yaw: Math.PI / 2 };

  const pickups: PickupDef[] = bp.pickups.map((p, i) => ({
    id: i,
    kind: p.kind,
    gun: p.gun,
    ammoType: p.ammoType,
    amount: p.amount,
    x: cellToWorld(p.x), z: cellToWorld(p.z),
    roomId: p.roomId,
  }));

  const enemies: EnemySpawn[] = bp.enemies.map((e, i) => ({
    id: i,
    type: e.type,
    x: cellToWorld(e.x), z: cellToWorld(e.z),
    yaw: e.yaw,
    roomId: e.roomId,
  }));

  const hasAuthoredCosmetics = (bp.lights && bp.lights.length > 0) || (bp.decors && bp.decors.length > 0);
  let lights: RoomLight[];
  let decors: Decor[];
  if (hasAuthoredCosmetics) {
    lights = bp.lights ?? [];
    decors = bp.decors ?? [];
  } else {
    const placed = placeCosmetics(grid, rooms, makeRng(`cos|${bp.cosmeticSeed >>> 0}`));
    lights = placed.lights;
    decors = placed.decors;
  }

  // --- validation ---
  const isFloor = (x: number, z: number) => inGrid(x, z) && grid[cellKey(x, z)] === 1;

  if (startRoom) {
    const openLocks = bfsReach(grid, startRoom.x + (startRoom.w >> 1), startRoom.z + (startRoom.h >> 1), new Set());
    for (const r of rooms) {
      const c = cellKey(r.x + (r.w >> 1), r.z + (r.h >> 1));
      if (!openLocks[c]) errors.push(`room ${r.id} (${r.kind}) is not reachable from start`);
    }

    const lockedSolid = new Set<number>();
    for (const d of doors) {
      if (d.locked) for (const [x, z] of d.cells) lockedSolid.add(cellKey(x, z));
    }
    const lockedReach = bfsReach(
      grid, startRoom.x + (startRoom.w >> 1), startRoom.z + (startRoom.h >> 1), lockedSolid,
    );
    if (arenaRoom) {
      const ac = cellKey(arenaRoom.x + (arenaRoom.w >> 1), arenaRoom.z + (arenaRoom.h >> 1));
      if (!lockedReach[ac]) errors.push('arena is behind a locked door');
    }
    for (const pk of pickups) {
      if (pk.kind !== 'gun' && pk.kind !== 'key') continue;
      const room = roomById.get(pk.roomId);
      if (room?.kind === 'vault') continue;
      const c = Math.floor(pk.z / CELL) * GRID_W + Math.floor(pk.x / CELL);
      if (!lockedReach[c]) errors.push(`${pk.kind}${pk.gun ? ' ' + pk.gun : ''} is behind a locked door`);
    }

    const sealSolid = new Set<number>(lockedSolid);
    for (const [x, z] of seal.cells) sealSolid.add(cellKey(x, z));
    const preSeal = bfsReach(
      grid, startRoom.x + (startRoom.w >> 1), startRoom.z + (startRoom.h >> 1), sealSolid,
    );
    if (bp.sealBreak.type === 'gun') {
      const gunId = bp.sealBreak.gun;
      const g = pickups.find(p => p.kind === 'gun' && p.gun === gunId);
      if (!g) errors.push(`seal-break gun ${gunId} is missing`);
      else {
        const room = roomById.get(g.roomId);
        if (room?.kind === 'arena') errors.push('seal-break gun must not be in the arena');
        const c = Math.floor(g.z / CELL) * GRID_W + Math.floor(g.x / CELL);
        if (!preSeal[c]) errors.push('seal-break gun is not reachable without traversing the seal');
      }
    } else {
      const key = pickups.find(p => p.kind === 'key');
      if (!key) errors.push('seal-break key is missing');
      else {
        const c = Math.floor(key.z / CELL) * GRID_W + Math.floor(key.x / CELL);
        if (!preSeal[c]) errors.push('key is not reachable without traversing the seal');
      }
      if (arenaRoom) {
        const afterKey = bfsReach(
          grid, startRoom.x + (startRoom.w >> 1), startRoom.z + (startRoom.h >> 1), new Set(),
        );
        const ac = cellKey(arenaRoom.x + (arenaRoom.w >> 1), arenaRoom.z + (arenaRoom.h >> 1));
        if (!afterKey[ac]) errors.push('arena is unreachable after the key is collected');
      }
    }
  }

  const checkEntityCell = (label: string, x: number, z: number, roomId: number) => {
    if (!isFloor(x, z)) errors.push(`${label} at ${x},${z} is not floor`);
    const room = roomById.get(roomId);
    if (!room) {
      errors.push(`${label} names missing room ${roomId}`);
      return;
    }
    if (!roomOrAdjacent(room, x, z)) {
      errors.push(`${label} room ${roomId} does not contain or neighbor ${x},${z}`);
    }
  };

  for (const p of bp.pickups) checkEntityCell(`${p.kind} pickup`, p.x, p.z, p.roomId);
  for (const e of bp.enemies) {
    if (!ENEMY_TYPES.includes(e.type)) errors.push(`unknown enemy type '${e.type}'`);
    checkEntityCell(`${e.type} enemy`, e.x, e.z, e.roomId);
  }

  if (bp.playerStart && !isFloor(bp.playerStart.x, bp.playerStart.z)) {
    errors.push('playerStart is not on floor');
  }

  const blocked = new Set<number>();
  for (const d of doors) for (const [x, z] of d.cells) blocked.add(cellKey(x, z));
  for (const [x, z] of seal.cells) blocked.add(cellKey(x, z));
  for (const e of enemies) {
    const d = Math.hypot(e.x - playerStart.x, e.z - playerStart.z);
    if (d < 16) errors.push(`enemy ${e.id} is within 16u of spawn (${d.toFixed(1)})`);
    if (!losBlocked(grid, blocked, playerStart.x, playerStart.z, e.x, e.z)) {
      errors.push(`enemy ${e.id} has line of sight to spawn`);
    }
  }

  const seed = opts.seed ?? mapSeedFromTitle(bp.title);
  const map: GameMap = {
    version: MAP_CODEC_VERSION,
    seed,
    difficulty: opts.difficulty ?? 'normal',
    w: GRID_W, h: GRID_H,
    grid, rooms, doors, seal,
    sealBreak: bp.sealBreak,
    sealBreakMessage: bp.sealBreakMessage,
    title: bp.title,
    decors, pickups, enemies, lights,
    playerStart,
    startRoomId: startRoom?.id ?? -1,
    arenaRoomId: arenaRoom?.id ?? -1,
    antechamberId: anteRoom?.id ?? -1,
    vaultRoomId: vaultRoom?.id ?? -1,
  };
  return { map, errors };
}

export function validateBlueprint(bp: MapBlueprint): string[] {
  return compileInner(bp).errors;
}

export function compileBlueprint(bp: MapBlueprint, opts: CompileOpts = {}): GameMap {
  const { map, errors } = compileInner(bp, opts);
  if (errors.length) throw new BlueprintError(errors);
  return map;
}
