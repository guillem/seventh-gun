import { describe, it, expect } from 'vitest';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { compileBlueprint, stripCosmetics, validateBlueprint } from '../../src/sim/blueprint';
import {
  encodeBlueprint, decodeBlueprint, packBlueprint, isCompressedCode,
} from '../../src/sim/mapcodec';
import type { GameMap } from '../../src/sim/types';
import {
  tinyGunSealBlueprint, crowdedBlueprint, mazeSizedBlueprint,
} from '../helpers/authoredMaps';
import type { RoomLight } from '../../src/sim/types';

const zlibHooks = {
  deflate: (u: Uint8Array) => deflateRawSync(u),
  inflate: (u: Uint8Array) => new Uint8Array(inflateRawSync(u)),
};

function expectSamePlayable(a: GameMap, b: GameMap) {
  expect(Buffer.from(a.grid)).toEqual(Buffer.from(b.grid));
  expect(a.rooms.map(r => ({ id: r.id, x: r.x, z: r.z, w: r.w, h: r.h, kind: r.kind, theme: r.theme, outdoor: r.outdoor, routeDist: r.routeDist }))).toEqual(
    b.rooms.map(r => ({ id: r.id, x: r.x, z: r.z, w: r.w, h: r.h, kind: r.kind, theme: r.theme, outdoor: r.outdoor, routeDist: r.routeDist })),
  );
  expect(a.doors.map(d => ({ cx: d.cx, cz: d.cz, axis: d.axis, locked: d.locked, cells: d.cells }))).toEqual(
    b.doors.map(d => ({ cx: d.cx, cz: d.cz, axis: d.axis, locked: d.locked, cells: d.cells })),
  );
  expect(a.seal).toEqual(b.seal);
  expect(a.sealBreak).toEqual(b.sealBreak);
  expect(a.pickups.map(p => ({ kind: p.kind, gun: p.gun, ammoType: p.ammoType, amount: p.amount, x: p.x, z: p.z, roomId: p.roomId }))).toEqual(
    b.pickups.map(p => ({ kind: p.kind, gun: p.gun, ammoType: p.ammoType, amount: p.amount, x: p.x, z: p.z, roomId: p.roomId })),
  );
  expect(a.enemies.length).toBe(b.enemies.length);
  for (let i = 0; i < a.enemies.length; i++) {
    expect(a.enemies[i].type).toBe(b.enemies[i].type);
    expect(a.enemies[i].x).toBe(b.enemies[i].x);
    expect(a.enemies[i].z).toBe(b.enemies[i].z);
    expect(a.enemies[i].roomId).toBe(b.enemies[i].roomId);
    expect(a.enemies[i].yaw).toBeCloseTo(b.enemies[i].yaw, 4);
  }
  expect(a.playerStart.x).toBe(b.playerStart.x);
  expect(a.playerStart.z).toBe(b.playerStart.z);
  expect(a.playerStart.yaw).toBeCloseTo(b.playerStart.yaw, 5);
}

describe('mapcodec', () => {
  it('round-trips a tiny blueprint through encode/decode/compile', () => {
    const bp = tinyGunSealBlueprint();
    const code = encodeBlueprint(stripCosmetics(bp), zlibHooks);
    expect(code.startsWith('SGMAP.v1.')).toBe(true);
    const back = decodeBlueprint(code, zlibHooks);
    expect(back.lights).toBeUndefined();
    expect(back.decors).toBeUndefined();
    expectSamePlayable(compileBlueprint(bp), compileBlueprint(back));
  });

  it('round-trips a map with 60+ enemies', () => {
    const bp = crowdedBlueprint();
    expect(bp.enemies.length).toBeGreaterThan(60);
    const code = encodeBlueprint(stripCosmetics(bp), zlibHooks);
    const back = decodeBlueprint(code, zlibHooks);
    expect(back.enemies.length).toBe(bp.enemies.length);
    expectSamePlayable(compileBlueprint(bp), compileBlueprint(back));
  });

  it('maze-sized blueprint without cosmetics stays ≲ 2 KB in the URL payload', () => {
    const bp = mazeSizedBlueprint();
    expect(validateBlueprint(bp)).toEqual([]);
    const code = encodeBlueprint(stripCosmetics(bp), zlibHooks);
    const payload = code.slice('SGMAP.v1.'.length);
    expect(payload.length, `payload ${payload.length}`).toBeLessThanOrEqual(2048);
    expectSamePlayable(compileBlueprint(bp), compileBlueprint(decodeBlueprint(code, zlibHooks)));
  });

  it('compresses large bodies when a deflate hook is provided', () => {
    const lights: RoomLight[] = [];
    for (let i = 0; i < 40; i++) {
      lights.push({
        x: i + 0.25, z: i + 0.5, y: 3.9,
        color: [0.5, 0.6, 0.7], intensity: 1.2, radius: 8, roomId: 0,
      });
    }
    const bp = { ...tinyGunSealBlueprint(), lights, decors: [] };
    const packed = packBlueprint(bp);
    expect(packed.body.length).toBeGreaterThan(200);
    const many = {
      ...bp,
      enemies: Array.from({ length: 80 }, (_, i) => ({
        type: 'husk' as const, x: 52, z: 22, yaw: i * 0.05, roomId: 3,
      })),
    };
    const { body } = packBlueprint(many);
    expect(body.length).toBeGreaterThan(1200);
    const code = encodeBlueprint(many, zlibHooks);
    expect(isCompressedCode(code)).toBe(true);
    const back = decodeBlueprint(code, zlibHooks);
    expect(back.enemies.length).toBe(80);
    expect(back.lights?.length).toBe(40);
  });

  it('ships uncompressed when no deflate hook is provided', () => {
    const many = {
      ...tinyGunSealBlueprint(),
      enemies: Array.from({ length: 80 }, (_, i) => ({
        type: 'husk' as const, x: 52, z: 22, yaw: i * 0.05, roomId: 3,
      })),
    };
    const code = encodeBlueprint(many);
    expect(isCompressedCode(code)).toBe(false);
    expect(decodeBlueprint(code).enemies.length).toBe(80);
  });
});

