import type { ArenaEvent, ArenaSnapshot } from '../sim/arena';
import type { SimInput } from '../sim/sim';

export const PROTOCOL_V = 1 as const;

export type ClientMessage =
  | { v: 1; t: 'join'; name: string }
  | { v: 1; t: 'input'; seq: number; inputs: SimInput[] }
  | { v: 1; t: 'ping'; at: number };

export type ServerMessage =
  | { v: 1; t: 'welcome'; id: number; seed: string; genVersion: number; gridHash: number; tick: number; snapshot: ArenaSnapshot }
  | { v: 1; t: 'snap'; snapshot: ArenaSnapshot }
  | { v: 1; t: 'events'; es: ArenaEvent[] }
  | { v: 1; t: 'full' }
  | { v: 1; t: 'kicked'; reason: 'idle' | 'mismatch' | 'protocol' }
  | { v: 1; t: 'pong'; at: number; serverTime: number };

const CLIENT_TS = new Set(['join', 'input', 'ping']);
const SERVER_TS = new Set(['welcome', 'snap', 'events', 'full', 'kicked', 'pong']);

export function isClientMessage(v: unknown): v is ClientMessage {
  if (!v || typeof v !== 'object') return false;
  const m = v as Record<string, unknown>;
  if (m.v !== 1) return false;
  if (typeof m.t !== 'string' || !CLIENT_TS.has(m.t)) return false;
  if (m.t === 'join') return typeof m.name === 'string';
  if (m.t === 'ping') return Number.isFinite(m.at);
  if (m.t === 'input') {
    if (!Number.isInteger(m.seq) || (m.seq as number) < 0 || !Array.isArray(m.inputs)) return false;
    if (m.inputs.length > 8) return false;
    return m.inputs.every(isInputFrame);
  }
  return false;
}

export function isServerMessage(v: unknown): v is ServerMessage {
  if (!v || typeof v !== 'object') return false;
  const m = v as Record<string, unknown>;
  if (m.v !== 1) return false;
  if (typeof m.t !== 'string' || !SERVER_TS.has(m.t)) return false;
  return true;
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
  if (v !== 1) return 'bad-v';
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
  if (v !== 1) return 'bad-v';
  if (isServerMessage(parsed)) return parsed;
  const t = (parsed as { t?: unknown }).t;
  if (typeof t === 'string' && !SERVER_TS.has(t)) return 'unknown';
  return 'invalid';
}
