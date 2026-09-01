// Compact binary codec for MapBlueprint. Pure; no DOM, no zlib import.
import {
  ENEMY_TYPES, PICKUP_KINDS, ROOM_KINDS, THEMES,
  type BlueprintCorridor, type BlueprintDoor, type BlueprintEnemy,
  type BlueprintPickup, type BlueprintRoom, type MapBlueprint,
} from './blueprint';
import { AMMO_TYPES } from './weapons';
import type { Decor, DecorKind, RoomLight, SealBreak, Theme } from './types';

export const MAP_CODE_PREFIX = 'SGMAP.v1.';
const MAGIC = [0x53, 0x47, 0x4d, 0x31]; // SGM1
const FLAG_LIGHTS = 1 << 0;
const FLAG_COMPRESSED = 1 << 1;
const FLAG_TITLE = 1 << 2;
const FLAG_SEAL_MSG = 1 << 3;
const FLAG_PLAYER_START = 1 << 4;
const FLAG_EXPLICIT_SEAL = 1 << 5;

const DECOR_KINDS: DecorKind[] = ['rune', 'skull', 'tendrils', 'pentagram', 'lamp'];
const COMPRESS_AFTER = 1200;

export interface CodecHooks {
  deflate?: (data: Uint8Array) => Uint8Array;
  inflate?: (data: Uint8Array) => Uint8Array;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64_REV: Record<string, number> = {};
for (let i = 0; i < B64.length; i++) B64_REV[B64[i]] = i;
B64_REV['+'] = 62;
B64_REV['/'] = 63;

export function bytesToBase64Url(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = bytes[i] << 16;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
  } else if (rem === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63];
  }
  return out;
}

export function base64UrlToBytes(s: string): Uint8Array {
  const clean = s.replace(/=+$/, '');
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64_REV[clean[i]];
    const b = B64_REV[clean[i + 1]];
    if (a === undefined || b === undefined) throw new Error('invalid base64url');
    const c = clean[i + 2] !== undefined ? B64_REV[clean[i + 2]] : 0;
    const d = clean[i + 3] !== undefined ? B64_REV[clean[i + 3]] : 0;
    const n = (a << 18) | (b << 12) | ((c ?? 0) << 6) | (d ?? 0);
    out.push((n >> 16) & 255);
    if (clean[i + 2] !== undefined) out.push((n >> 8) & 255);
    if (clean[i + 3] !== undefined) out.push(n & 255);
  }
  return new Uint8Array(out);
}

class Writer {
  private buf: Uint8Array;
  private view: DataView;
  private i = 0;
  constructor(cap = 2048) {
    this.buf = new Uint8Array(cap);
    this.view = new DataView(this.buf.buffer);
  }
  private grow(n: number) {
    if (this.i + n <= this.buf.length) return;
    const next = new Uint8Array(Math.max(this.buf.length * 2, this.i + n));
    next.set(this.buf);
    this.buf = next;
    this.view = new DataView(this.buf.buffer);
  }
  u8(n: number) { this.grow(1); this.buf[this.i++] = n & 255; }
  u16(n: number) { this.grow(2); this.view.setUint16(this.i, n, true); this.i += 2; }
  u32(n: number) { this.grow(4); this.view.setUint32(this.i, n, true); this.i += 4; }
  f32(n: number) { this.grow(4); this.view.setFloat32(this.i, n, true); this.i += 4; }
  bytes(b: Uint8Array) { this.grow(b.length); this.buf.set(b, this.i); this.i += b.length; }
  str(s: string) {
    const enc = new TextEncoder().encode(s.slice(0, 255));
    this.u8(enc.length);
    this.bytes(enc);
  }
  finish(): Uint8Array { return this.buf.subarray(0, this.i); }
}

class Reader {
  private view: DataView;
  i = 0;
  constructor(private buf: Uint8Array) {
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  u8(): number {
    if (this.i >= this.buf.length) throw new Error('unexpected end of map payload');
    return this.buf[this.i++];
  }
  u16(): number {
    const n = this.view.getUint16(this.i, true); this.i += 2; return n;
  }
  u32(): number {
    const n = this.view.getUint32(this.i, true); this.i += 4; return n;
  }
  f32(): number {
    const n = this.view.getFloat32(this.i, true); this.i += 4; return n;
  }
  str(): string {
    const len = this.u8();
    const slice = this.buf.subarray(this.i, this.i + len);
    this.i += len;
    return new TextDecoder().decode(slice);
  }
}

function idx<T>(arr: readonly T[], v: T, label: string): number {
  const i = arr.indexOf(v);
  if (i < 0) throw new Error(`unknown ${label}: ${String(v)}`);
  return i;
}

export function packBlueprint(bp: MapBlueprint): { flags: number; body: Uint8Array } {
  let flags = 0;
  const hasLights = !!(bp.lights && bp.lights.length) || !!(bp.decors && bp.decors.length);
  if (hasLights) flags |= FLAG_LIGHTS;
  if (bp.title) flags |= FLAG_TITLE;
  if (bp.sealBreakMessage) flags |= FLAG_SEAL_MSG;
  if (bp.playerStart) flags |= FLAG_PLAYER_START;
  if (bp.seal && bp.seal.cells.length) flags |= FLAG_EXPLICIT_SEAL;

  const w = new Writer();
  w.u32(bp.cosmeticSeed >>> 0);
  if (bp.sealBreak.type === 'key') w.u8(0);
  else w.u8(bp.sealBreak.gun & 7);
  if (flags & FLAG_TITLE) w.str(bp.title ?? '');
  if (flags & FLAG_SEAL_MSG) w.str(bp.sealBreakMessage ?? '');

  w.u8(bp.rooms.length);
  for (const r of bp.rooms) {
    w.u8(r.id); w.u8(r.x); w.u8(r.z); w.u8(r.w); w.u8(r.h);
    w.u8(idx(THEMES, r.theme, 'theme'));
    w.u8(idx(ROOM_KINDS, r.kind, 'kind'));
    w.u8(r.outdoor ? 1 : 0);
  }

  w.u8(bp.corridors.length);
  for (const c of bp.corridors) { w.u8(c.x); w.u8(c.z); w.u8(c.w); w.u8(c.h); }

  w.u8(bp.doors.length);
  for (const d of bp.doors) {
    w.u8(d.cx); w.u8(d.cz); w.u8(d.axis === 'z' ? 1 : 0); w.u8(d.locked ? 1 : 0);
  }

  if (flags & FLAG_EXPLICIT_SEAL) {
    const cells = bp.seal!.cells;
    w.u8(cells.length);
    for (const [x, z] of cells) { w.u8(x); w.u8(z); }
    w.u8(bp.seal!.axis === 'z' ? 1 : 0);
  }

  if (flags & FLAG_PLAYER_START) {
    const p = bp.playerStart!;
    w.u8(p.x); w.u8(p.z); w.f32(p.yaw);
  }

  w.u16(bp.pickups.length);
  for (const p of bp.pickups) {
    w.u8(idx(PICKUP_KINDS, p.kind, 'pickup'));
    w.u8(p.x); w.u8(p.z); w.u8(p.roomId);
    if (p.kind === 'gun') w.u8(p.gun ?? 0);
    else if (p.kind === 'ammo') w.u8(idx(AMMO_TYPES, p.ammoType ?? 'bullets', 'ammo'));
    else w.u8(0);
    w.u8(p.amount ?? 0);
  }

  w.u16(bp.enemies.length);
  for (const e of bp.enemies) {
    w.u8(idx(ENEMY_TYPES, e.type, 'enemy'));
    w.u8(e.x); w.u8(e.z); w.u8(e.roomId);
    w.f32(e.yaw);
  }

  if (flags & FLAG_LIGHTS) {
    const lights = bp.lights ?? [];
    const decors = bp.decors ?? [];
    w.u16(lights.length);
    for (const l of lights) {
      w.f32(l.x); w.f32(l.z); w.f32(l.y);
      w.f32(l.color[0]); w.f32(l.color[1]); w.f32(l.color[2]);
      w.f32(l.intensity); w.f32(l.radius); w.u8(l.roomId);
    }
    w.u16(decors.length);
    for (const d of decors) {
      w.f32(d.x); w.f32(d.y); w.f32(d.z); w.f32(d.facing);
      w.u8(idx(DECOR_KINDS, d.kind, 'decor'));
      w.u8(idx(THEMES, d.theme, 'theme'));
    }
  }

  return { flags, body: w.finish() };
}

export function unpackBlueprint(flags: number, body: Uint8Array): MapBlueprint {
  const r = new Reader(body);
  const cosmeticSeed = r.u32();
  const sbTag = r.u8();
  const sealBreak: SealBreak = sbTag === 0 ? { type: 'key' } : { type: 'gun', gun: sbTag };
  const title = flags & FLAG_TITLE ? r.str() : undefined;
  const sealBreakMessage = flags & FLAG_SEAL_MSG ? r.str() : undefined;

  const roomCount = r.u8();
  const rooms: BlueprintRoom[] = [];
  for (let i = 0; i < roomCount; i++) {
    rooms.push({
      id: r.u8(), x: r.u8(), z: r.u8(), w: r.u8(), h: r.u8(),
      theme: THEMES[r.u8()] ?? 'industrial',
      kind: ROOM_KINDS[r.u8()] ?? 'spine',
      outdoor: r.u8() !== 0,
    });
  }

  const corrCount = r.u8();
  const corridors: BlueprintCorridor[] = [];
  for (let i = 0; i < corrCount; i++) {
    corridors.push({ x: r.u8(), z: r.u8(), w: r.u8(), h: r.u8() });
  }

  const doorCount = r.u8();
  const doors: BlueprintDoor[] = [];
  for (let i = 0; i < doorCount; i++) {
    doors.push({ cx: r.u8(), cz: r.u8(), axis: r.u8() ? 'z' : 'x', locked: r.u8() !== 0 });
  }

  let seal: MapBlueprint['seal'];
  if (flags & FLAG_EXPLICIT_SEAL) {
    const n = r.u8();
    const cells: [number, number][] = [];
    for (let i = 0; i < n; i++) cells.push([r.u8(), r.u8()]);
    seal = { cells, axis: r.u8() ? 'z' : 'x' };
  }

  let playerStart: MapBlueprint['playerStart'];
  if (flags & FLAG_PLAYER_START) {
    playerStart = { x: r.u8(), z: r.u8(), yaw: r.f32() };
  }

  const pickupCount = r.u16();
  const pickups: BlueprintPickup[] = [];
  for (let i = 0; i < pickupCount; i++) {
    const kind = PICKUP_KINDS[r.u8()] ?? 'medikit';
    const x = r.u8(), z = r.u8(), roomId = r.u8();
    const extra = r.u8();
    const amount = r.u8();
    const p: BlueprintPickup = { kind, x, z, roomId };
    if (kind === 'gun') p.gun = extra;
    if (kind === 'ammo') p.ammoType = AMMO_TYPES[extra] ?? 'bullets';
    if (amount) p.amount = amount;
    pickups.push(p);
  }

  const enemyCount = r.u16();
  const enemies: BlueprintEnemy[] = [];
  for (let i = 0; i < enemyCount; i++) {
    enemies.push({
      type: ENEMY_TYPES[r.u8()] ?? 'husk',
      x: r.u8(), z: r.u8(), roomId: r.u8(), yaw: r.f32(),
    });
  }

  let lights: RoomLight[] | undefined;
  let decors: Decor[] | undefined;
  if (flags & FLAG_LIGHTS) {
    const ln = r.u16();
    lights = [];
    for (let i = 0; i < ln; i++) {
      lights.push({
        x: r.f32(), z: r.f32(), y: r.f32(),
        color: [r.f32(), r.f32(), r.f32()],
        intensity: r.f32(), radius: r.f32(), roomId: r.u8(),
      });
    }
    const dn = r.u16();
    decors = [];
    for (let i = 0; i < dn; i++) {
      decors.push({
        x: r.f32(), y: r.f32(), z: r.f32(), facing: r.f32(),
        kind: DECOR_KINDS[r.u8()] ?? 'rune',
        theme: (THEMES[r.u8()] ?? 'industrial') as Theme,
      });
    }
  }

  const bp: MapBlueprint = {
    codec: 1,
    cosmeticSeed,
    sealBreak,
    rooms, corridors, doors, pickups, enemies,
  };
  if (title) bp.title = title;
  if (sealBreakMessage) bp.sealBreakMessage = sealBreakMessage;
  if (seal) bp.seal = seal;
  if (playerStart) bp.playerStart = playerStart;
  if (lights) bp.lights = lights;
  if (decors) bp.decors = decors;
  return bp;
}

export function wrapEncoded(flags: number, body: Uint8Array): string {
  const out = new Uint8Array(6 + body.length);
  out[0] = MAGIC[0]; out[1] = MAGIC[1]; out[2] = MAGIC[2]; out[3] = MAGIC[3];
  out[4] = flags & 255;
  out[5] = (flags >> 8) & 255;
  out.set(body, 6);
  return MAP_CODE_PREFIX + bytesToBase64Url(out);
}

export function unwrapEncoded(code: string): { flags: number; body: Uint8Array } {
  const raw = code.startsWith(MAP_CODE_PREFIX) ? code.slice(MAP_CODE_PREFIX.length) : code;
  const bytes = base64UrlToBytes(raw);
  if (bytes.length < 6 || bytes[0] !== MAGIC[0] || bytes[1] !== MAGIC[1] || bytes[2] !== MAGIC[2] || bytes[3] !== MAGIC[3]) {
    throw new Error('not an SGMAP.v1 payload');
  }
  const flags = bytes[4] | (bytes[5] << 8);
  return { flags, body: bytes.subarray(6) };
}

export function encodeBlueprint(bp: MapBlueprint, hooks: CodecHooks = {}): string {
  const { flags, body } = packBlueprint(bp);
  let outFlags = flags;
  let outBody = body;
  if (body.length > COMPRESS_AFTER && hooks.deflate) {
    outBody = hooks.deflate(body);
    outFlags |= FLAG_COMPRESSED;
  }
  return wrapEncoded(outFlags, outBody);
}

export function decodeBlueprint(code: string, hooks: CodecHooks = {}): MapBlueprint {
  const { flags, body } = unwrapEncoded(code);
  let raw = body;
  if (flags & FLAG_COMPRESSED) {
    if (!hooks.inflate) throw new Error('compressed map requires inflate');
    raw = hooks.inflate(body);
  }
  return unpackBlueprint(flags, raw);
}

export function isCompressedCode(code: string): boolean {
  try {
    return (unwrapEncoded(code).flags & FLAG_COMPRESSED) !== 0;
  } catch {
    return false;
  }
}

export { FLAG_COMPRESSED, FLAG_LIGHTS, COMPRESS_AFTER };
