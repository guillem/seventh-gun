// Core sim data types. Pure data — no DOM, no Three.

export const CELL = 2;
export const GRID_W = 88;
export const GRID_H = 88;
export const WALL_H = 6;
export const CEIL_H = 4.2;
export const GEN_VERSION = 3;

export type Difficulty = 'easy' | 'normal' | 'hard';
export type Theme = 'industrial' | 'organic' | 'stone' | 'tech';
export type AmmoType = 'bullets' | 'shells' | 'nails' | 'grenades' | 'cores' | 'void';
export type EnemyType = 'husk' | 'crawler' | 'slab' | 'wisp' | 'hierophant';
export type ProjectileKind = 'nail' | 'grenade' | 'voidorb' | 'plasma' | 'spit' | 'fireball' | 'bolt' | 'orb';

export interface Room {
  id: number;
  x: number; z: number; w: number; h: number; // cell rect
  cx: number; cz: number;                     // center world coords
  theme: Theme;
  outdoor: boolean;
  kind: 'start' | 'spine' | 'spur' | 'arena' | 'antechamber' | 'vault';
  routeDist: number; // BFS cell distance from start room center
}

export interface RoomLight {
  x: number; z: number; y: number;
  color: [number, number, number];
  intensity: number;
  radius: number;
  roomId: number;
}

export type DecorKind = 'rune' | 'skull' | 'tendrils' | 'pentagram' | 'lamp';
export interface Decor {
  x: number; y: number; z: number;
  facing: number; // yaw the decal faces (towards walkable side)
  kind: DecorKind;
  theme: Theme;
}

export interface DoorDef {
  id: number;
  cx: number; cz: number; // center cell of 3-wide span
  axis: 'x' | 'z';        // corridor travel axis
  cells: [number, number][];
  locked: boolean;
  x: number; z: number;   // world center
}

export interface SealDef {
  cells: [number, number][];
  x: number; z: number;
  axis: 'x' | 'z';
}

export interface PickupDef {
  id: number;
  kind: 'medikit' | 'ammo' | 'gun' | 'key';
  gun?: number;
  ammoType?: AmmoType;
  amount?: number;
  x: number; z: number;
  roomId: number;
}

export interface EnemySpawn {
  id: number;
  type: EnemyType;
  x: number; z: number;
  roomId: number;
  yaw: number;
}

export interface GameMap {
  version: number;
  seed: string;
  difficulty: Difficulty;
  w: number; h: number;
  grid: Uint8Array; // 1 = floor
  rooms: Room[];
  doors: DoorDef[];
  seal: SealDef;
  decors: Decor[];
  pickups: PickupDef[];
  enemies: EnemySpawn[];
  lights: RoomLight[];
  playerStart: { x: number; z: number; yaw: number };
  startRoomId: number;
  arenaRoomId: number;
  antechamberId: number;
  vaultRoomId: number; // -1 if none
}

export type SimEvent =
  | { t: 'shot'; gun: number; x: number; z: number; yaw: number }
  | { t: 'dryfire'; gun: number }
  | { t: 'tracer'; x0: number; z0: number; x1: number; z1: number; kind: 'bullets' | 'rail' }
  | { t: 'beam'; x0: number; z0: number; x1: number; z1: number }
  | { t: 'spawnProjectile'; kind: ProjectileKind; x: number; y: number; z: number }
  | { t: 'explosion'; x: number; y: number; z: number; radius: number }
  | { t: 'hitEnemy'; x: number; y: number; z: number; killed: boolean; type: EnemyType }
  | { t: 'enemyShoot'; type: EnemyType; x: number; y: number; z: number }
  | { t: 'enemyAlert'; type: EnemyType; id: number; x: number; z: number }
  | { t: 'enemyPain'; type: EnemyType; id: number; x: number; z: number }
  | { t: 'enemyDeath'; type: EnemyType; id: number; x: number; z: number }
  | { t: 'playerHurt'; damage: number; fromAngle: number } // angle relative to view yaw
  | { t: 'playerDie' }
  | { t: 'pickup'; kind: PickupDef['kind']; label: string }
  | { t: 'doorDenied' }
  | { t: 'doorOpen'; id: number }
  | { t: 'sealBreak' }
  | { t: 'arenaEnter' }
  | { t: 'won' }
  | { t: 'message'; text: string };

export function cellToWorld(c: number): number {
  return (c + 0.5) * CELL;
}

export function worldToCell(x: number): number {
  return Math.floor(x / CELL);
}
