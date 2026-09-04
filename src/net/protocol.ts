import type { ArenaEvent, ArenaSnapshot } from '../sim/arena';
import type { SimInput } from '../sim/sim';

export const PROTOCOL_V = 3 as const;
export const MAX_ARENA_MESSAGE_BYTES = 8192;
export const MAX_INPUTS_PER_BATCH = 32;

export type ClientMessage =
  | { v: typeof PROTOCOL_V; t: 'join'; name: string }
  | { v: typeof PROTOCOL_V; t: 'input'; spawnCount: number; seq: number; inputs: SimInput[] }
  | { v: typeof PROTOCOL_V; t: 'ping'; at: number };

export type ServerMessage =
  | { v: typeof PROTOCOL_V; t: 'welcome'; id: number; seed: string; genVersion: number; gridHash: number; tick: number; snapshot: ArenaSnapshot }
  | { v: typeof PROTOCOL_V; t: 'snap'; snapshot: ArenaSnapshot }
  | { v: typeof PROTOCOL_V; t: 'events'; es: ArenaEvent[] }
  | { v: typeof PROTOCOL_V; t: 'full' }
  | { v: typeof PROTOCOL_V; t: 'kicked'; reason: 'idle' | 'mismatch' | 'protocol' }
  | { v: typeof PROTOCOL_V; t: 'pong'; at: number; serverTime: number };

const CLIENT_TS = new Set(['join', 'input', 'ping']);
const SERVER_TS = new Set(['welcome', 'snap', 'events', 'full', 'kicked', 'pong']);

export function isClientMessage(v: unknown): v is ClientMessage {
  if (!v || typeof v !== 'object') return false;
  const m = v as Record<string, unknown>;
  if (m.v !== PROTOCOL_V) return false;
  if (typeof m.t !== 'string' || !CLIENT_TS.has(m.t)) return false;
  if (m.t === 'join') return typeof m.name === 'string';
  if (m.t === 'ping') return Number.isFinite(m.at);
  if (m.t === 'input') {
    if (!integer(m.spawnCount, 1) || !Number.isInteger(m.seq) || (m.seq as number) < 0 || !Array.isArray(m.inputs)) return false;
    if (m.inputs.length > MAX_INPUTS_PER_BATCH) return false;
    return m.inputs.every(isInputFrame);
  }
  return false;
}

export function isServerMessage(v: unknown): v is ServerMessage {
  if (!v || typeof v !== 'object') return false;
  const m = v as Record<string, unknown>;
  if (m.v !== PROTOCOL_V) return false;
  if (typeof m.t !== 'string' || !SERVER_TS.has(m.t)) return false;
  if (m.t === 'full') return true;
  if (m.t === 'kicked') return m.reason === 'idle' || m.reason === 'mismatch' || m.reason === 'protocol';
  if (m.t === 'pong') return finite(m.at) && finite(m.serverTime);
  if (m.t === 'welcome') {
    return integer(m.id, 0) && typeof m.seed === 'string' && m.seed.length > 0
      && integer(m.genVersion, 0) && integer(m.gridHash) && integer(m.tick, 0)
      && isSnapshot(m.snapshot)
      && (m.snapshot as ArenaSnapshot).tick === m.tick
      && (m.snapshot as ArenaSnapshot).players.some((p) => p.id === m.id);
  }
  if (m.t === 'snap') return isSnapshot(m.snapshot);
  if (m.t === 'events') return Array.isArray(m.es) && m.es.every(isArenaEvent);
  return false;
}

function finite(v: unknown): v is number { return typeof v === 'number' && Number.isFinite(v); }
function integer(v: unknown, min = Number.MIN_SAFE_INTEGER): v is number {
  return Number.isInteger(v) && (v as number) >= min;
}

function isSnapshot(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  return integer(s.tick, 0) && Array.isArray(s.players) && Array.isArray(s.projectiles) && Array.isArray(s.pickups)
    && s.players.every(isArenaPlayer) && s.projectiles.every(isProjectile) && s.pickups.every(isPickup);
}

function isArenaPlayer(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  const ammo = p.ammo as Record<string, unknown> | null;
  return integer(p.id, 0) && typeof p.name === 'string' && integer(p.colorIndex, 0)
    && finite(p.x) && finite(p.z) && finite(p.yaw) && finite(p.pitch) && finite(p.hp)
    && integer(p.gun, 1) && (p.gun as number) <= 7 && integer(p.ownedMask, 0) && typeof p.alive === 'boolean'
    && finite(p.protect) && integer(p.frags, 0) && integer(p.deaths, 0) && integer(p.spawnCount, 1) && integer(p.lastSeq, 0)
    && !!ammo && ['bullets', 'shells', 'nails', 'grenades', 'cores', 'void'].every((key) => finite(ammo[key]));
}

function isProjectile(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  return integer(p.id, 0) && typeof p.kind === 'string'
    && ['nail', 'grenade', 'voidorb', 'plasma', 'spit', 'fireball', 'bolt', 'orb'].includes(p.kind)
    && integer(p.ownerId, 0) && finite(p.x) && finite(p.y) && finite(p.z)
    && finite(p.vx) && finite(p.vy) && finite(p.vz) && finite(p.gravity)
    && finite(p.radius) && finite(p.age);
}

function isPickup(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  return integer(p.id, 0) && typeof p.taken === 'boolean';
}

function isArenaEvent(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const e = v as Record<string, unknown>;
  if (typeof e.t !== 'string') return false;
  const hasId = integer(e.id, 0);
  switch (e.t) {
    case 'playerJoin': return hasId && typeof e.name === 'string' && integer(e.colorIndex, 0);
    case 'playerLeave': case 'playerDie': case 'playerSpawn': case 'padRespawn': return hasId;
    case 'kick': return hasId && (e.reason === 'idle' || e.reason === 'mismatch' || e.reason === 'protocol');
    case 'shot': return hasId && integer(e.shotId, 1) && integer(e.spawnCount, 1) && integer(e.inputSeq, 0)
      && integer(e.gun, 1) && (e.gun as number) <= 7 && finite(e.x) && finite(e.z) && finite(e.yaw) && finite(e.pitch);
    case 'dryfire': return hasId && integer(e.gun, 1) && (e.gun as number) <= 7;
    case 'tracer': return hasId && e.kind === 'bullets' && finite(e.x0) && finite(e.y0) && finite(e.z0) && finite(e.x1) && finite(e.y1) && finite(e.z1);
    case 'beam': return hasId && finite(e.x0) && finite(e.y0) && finite(e.z0) && finite(e.x1) && finite(e.y1) && finite(e.z1);
    case 'spawnProjectile': return hasId && integer(e.projectileId, 1) && integer(e.ownerId, 0)
      && typeof e.kind === 'string' && finite(e.x) && finite(e.y) && finite(e.z)
      && finite(e.vx) && finite(e.vy) && finite(e.vz) && finite(e.gravity) && finite(e.radius) && finite(e.age);
    case 'despawnProjectile': return integer(e.projectileId, 1);
    case 'explosion': return hasId && finite(e.x) && finite(e.y) && finite(e.z) && finite(e.radius);
    case 'playerHurt': return hasId && finite(e.damage) && finite(e.fromAngle);
    case 'hitPlayer': return hasId && finite(e.x) && finite(e.y) && finite(e.z) && typeof e.killed === 'boolean';
    case 'frag': return integer(e.killerId, 0) && integer(e.victimId, 0) && typeof e.suicide === 'boolean';
    case 'pickup': return integer(e.playerId, 0) && integer(e.pickupId, 0) && typeof e.kind === 'string' && typeof e.label === 'string';
    default: return false;
  }
}

function isInputFrame(v: unknown): v is SimInput {
  if (!v || typeof v !== 'object') return false;
  const i = v as Record<string, unknown>;
  if (!Number.isFinite(i.moveX) || !Number.isFinite(i.moveZ)) return false;
  if (!Number.isFinite(i.yaw) || !Number.isFinite(i.pitch)) return false;
  if (typeof i.fire !== 'boolean') return false;
  if (i.switchGun != null) {
    if (!Number.isInteger(i.switchGun) || (i.switchGun as number) < 1 || (i.switchGun as number) > 7) {
      return false;
    }
  }
  if (i.use != null && typeof i.use !== 'boolean') return false;
  return true;
}

export function encode(msg: ClientMessage | ServerMessage): string {
  return JSON.stringify(msg);
}

export function decodeClient(text: string): ClientMessage | 'bad-v' | 'unknown' | 'invalid' {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return 'invalid'; }
  if (!parsed || typeof parsed !== 'object') return 'invalid';
  const v = (parsed as { v?: unknown }).v;
  if (v !== PROTOCOL_V) return 'bad-v';
  if (isClientMessage(parsed)) return parsed;
  const t = (parsed as { t?: unknown }).t;
  if (typeof t === 'string' && !CLIENT_TS.has(t)) return 'unknown';
  return 'invalid';
}

export function decodeServer(text: string): ServerMessage | 'bad-v' | 'unknown' | 'invalid' {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return 'invalid'; }
  if (!parsed || typeof parsed !== 'object') return 'invalid';
  const v = (parsed as { v?: unknown }).v;
  if (v !== PROTOCOL_V) return 'bad-v';
  if (isServerMessage(parsed)) return parsed;
  const t = (parsed as { t?: unknown }).t;
  if (typeof t === 'string' && !SERVER_TS.has(t)) return 'unknown';
  return 'invalid';
}
