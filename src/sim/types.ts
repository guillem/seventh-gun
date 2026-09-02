// Core sim data types. Pure data — no DOM, no Three.

export const CELL = 2;
export const GRID_W = 88;
export const GRID_H = 88;
export const WALL_H = 6;
export const CEIL_H = 4.2;
export const GEN_VERSION = 4;
export const MAP_CODEC_VERSION = 1;

/** Player capsule used for movement, projectile hits, and enemy body blocking. */
export const PLAYER_RADIUS = 0.55;
export const PLAYER_EYE = 1.7;
export const PLAYER_HEIGHT = 1.9;

/** Authored / campaign / maze ammo-vs-HP floor (damage ≥ this × total enemy HP). */
export const ECONOMY_FLOOR = 2.2;

/** Gunshot / death-cry events stay audible this long (not a single-frame blink). */
export const NOISE_TTL = 1.6;

export type Difficulty = 'easy' | 'normal' | 'hard';
export type Theme = 'industrial' | 'organic' | 'stone' | 'tech';
export type AmmoType = 'bullets' | 'shells' | 'nails' | 'grenades' | 'cores' | 'void';
export type EnemyType = 'husk' | 'crawler' | 'slab' | 'wisp' | 'hierophant' | 'fiend';
export type ProjectileKind = 'nail' | 'grenade' | 'voidorb' | 'plasma' | 'spit' | 'fireball' | 'bolt' | 'orb';
export type PowerupKind = 'ward' | 'wrath' | 'sevenfold';
export type SecretKind = 'plate-use' | 'plate-shoot' | 'remote-use' | 'remote-shoot';

/** Closed plate slides up in this many seconds. */
export const SECRET_PLATE_TIME = 0.7;

export type SealBreak =
  | { type: 'gun'; gun: number }
  | { type: 'key' };

export interface PlayerLoadout {
  owned: boolean[];
  ammo: Record<AmmoType, number>;
  gun: number;
}

export interface Room {
  id: number;
  x: number; z: number; w: number; h: number; // cell rect
  cx: number; cz: number;                     // center world coords
  theme: Theme;
  outdoor: boolean;
  kind: 'start' | 'spine' | 'spur' | 'arena' | 'antechamber' | 'vault' | 'secret';
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
  kind: 'medikit' | 'ammo' | 'gun' | 'key' | 'powerup';
  gun?: number;
  ammoType?: AmmoType;
  amount?: number;
  powerup?: PowerupKind;
  x: number; z: number;
  roomId: number;
}

export interface SecretDef {
  id: number;
  name?: string;
  kind: SecretKind;
  cx: number; cz: number;
  axis: 'x' | 'z';
  cells: [number, number][];
  x: number; z: number;
  roomId: number;
  trigger?: { x: number; z: number };
  hp: number;
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
  sealBreak: SealBreak;
  sealBreakMessage?: string;
  title?: string;
  decors: Decor[];
  pickups: PickupDef[];
  enemies: EnemySpawn[];
  lights: RoomLight[];
  secrets: SecretDef[];
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
  | { t: 'playerShielded'; fromAngle: number }
  | { t: 'playerDie' }
  | { t: 'pickup'; kind: PickupDef['kind']; label: string }
  | { t: 'doorDenied' }
  | { t: 'doorOpen'; id: number }
  | { t: 'secretFound'; id: number; name?: string }
  | { t: 'powerupStart'; kind: PowerupKind }
  | { t: 'powerupWarn'; kind: PowerupKind }
  | { t: 'powerupEnd'; kind: PowerupKind }
  | { t: 'sealBreak' }
  | { t: 'arenaEnter' }
  | { t: 'won' }
  | { t: 'message'; text: string };

export function cellToWorld(c: number): number {
  return (c + 0.5) * CELL;
}
