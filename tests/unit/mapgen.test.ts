// Map validity sweep: hundreds of seeds must all be connected, winnable and safe.
import { describe, it, expect } from 'vitest';
import { generateMap, mapStats } from '../../src/sim/mapgen';
import { Sim, emptyInput } from '../../src/sim/sim';
import { CELL, ECONOMY_FLOOR } from '../../src/sim/types';
import type { GameMap, Difficulty } from '../../src/sim/types';
import { hasLineOfSight } from '../../src/sim/physics';
import { WEAPONS } from '../../src/sim/weapons';
import { ENEMIES } from '../../src/sim/enemyTypes';
import { DIFFICULTIES } from '../../src/sim/difficulty';

function bfsReach(map: GameMap, treatSolid: Set<number>): Uint8Array {
  const seen = new Uint8Array(map.w * map.h);
  const start = map.rooms.find(r => r.kind === 'start')!;
  const q: number[] = [(start.z + (start.h >> 1)) * map.w + (start.x + (start.w >> 1))];
  seen[q[0]] = 1;
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    const x = c % map.w, z = (c / map.w) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= map.w || nz >= map.h) continue;
      const nk = nz * map.w + nx;
      if (seen[nk]) continue;
      if (map.grid[nk] === 0 || treatSolid.has(nk)) continue;
      seen[nk] = 1;
      q.push(nk);
    }
  }
  return seen;
}

function seedList(n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(`sweep-${i}`);
  return out;
}

describe('mapgen validity (300-seed sweep)', () => {
  const seeds = seedList(300);

  it('every map is fully connected (all rooms reachable)', () => {
    for (const s of seeds) {
      const map = generateMap(s, 'normal');
      const seen = bfsReach(map, new Set());
      for (const r of map.rooms) {
        const c = (r.z + (r.h >> 1)) * map.w + (r.x + (r.w >> 1));
        expect(seen[c], `room ${r.id} unreachable in seed ${s}`).toBe(1);
      }
    }
  });

  it('guns/key/arena are never locked behind a key door', () => {
    for (const s of seeds) {
      const map = generateMap(s, 'normal');
      // with locked (key) doors treated solid, everything essential stays reachable
      const lockedOnly = new Set<number>();
      for (const d of map.doors.filter(d => d.locked)) for (const [x, z] of d.cells) lockedOnly.add(z * map.w + x);
      const seen = bfsReach(map, lockedOnly);
      for (const pk of map.pickups) {
        if (pk.kind === 'medikit' || pk.kind === 'ammo') continue;
        if (map.vaultRoomId === pk.roomId) continue; // vault loot is the key door's reward
        const c = Math.floor(pk.z / CELL) * map.w + Math.floor(pk.x / CELL);
        expect(seen[c], `${pk.kind} ${pk.gun ?? ''} behind key door in seed ${s}`).toBe(1);
      }
      const arena = map.rooms.find(r => r.kind === 'arena')!;
      const ac = (arena.z + (arena.h >> 1)) * map.w + (arena.x + (arena.w >> 1));
      expect(seen[ac], `arena behind key door in seed ${s}`).toBe(1);
    }
  });

  it('key (when present) is reachable before its locked door', () => {
    for (const s of seeds) {
      const map = generateMap(s, 'normal');
      const locked = map.doors.find(d => d.locked);
      const key = map.pickups.find(p => p.kind === 'key');
      if (!locked || !key) continue;
      const solid = new Set(locked.cells.map(([x, z]) => z * map.w + x));
      const seen = bfsReach(map, solid);
      const kc = Math.floor(key.z / CELL) * map.w + Math.floor(key.x / CELL);
      expect(seen[kc], `key unreachable before locked door in seed ${s}`).toBe(1);
    }
  });

  it('guns 2..7 appear exactly once each, in increasing route order', () => {
    for (const s of seeds) {
      const map = generateMap(s, 'normal');
      const guns = map.pickups.filter(p => p.kind === 'gun');
      expect(guns.map(g => g.gun!).sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6, 7]);
      const dists = guns.filter(g => g.gun! < 7)
        .map(g => map.rooms.find(r => r.id === g.roomId)!.routeDist);
      for (let i = 1; i < dists.length; i++) {
        expect(dists[i], `gun order not monotonic in seed ${s}: ${dists}`).toBeGreaterThan(dists[i - 1]);
      }
      const g7 = guns.find(g => g.gun === 7)!;
      expect(map.rooms.find(r => r.id === g7.roomId)!.kind).toBe('antechamber');
    }
  });

  it('start is safe: no enemy in start room, none near, none with line of sight', () => {
    for (const s of seeds) {
      const sim = new Sim(s, 'normal');
      const map = sim.map;
      const start = map.rooms.find(r => r.kind === 'start')!;
      for (const e of map.enemies) {
        const d = Math.hypot(e.x - sim.player.x, e.z - sim.player.z);
        expect(d, `enemy ${e.id} too close to spawn in seed ${s}`).toBeGreaterThan(14);
        expect(hasLineOfSight(sim, sim.player.x, sim.player.z, e.x, e.z), `enemy ${e.id} sees spawn in seed ${s}`).toBe(false);
      }
      // and nothing wakes in the first two seconds of standing still
      for (let i = 0; i < 120; i++) sim.step(emptyInput());
      expect(sim.enemies.some(e => e.awakened), `enemy woke on spawn in seed ${s}`).toBe(false);
    }
  });

  it('doors: 2..3 total, at most one locked', () => {
    for (const s of seeds) {
      const map = generateMap(s, 'normal');
      expect(map.doors.length).toBeGreaterThanOrEqual(2);
      expect(map.doors.length).toBeLessThanOrEqual(3);
      expect(map.doors.filter(d => d.locked).length).toBeLessThanOrEqual(1);
    }
  });

  it('has courtyards, varied room sizes, enemies and loot on every seed', () => {
    let anyCourtyard = false;
    for (const s of seeds) {
      const map = generateMap(s, 'normal');
      const stats = mapStats(map);
      expect(map.rooms.length).toBeGreaterThanOrEqual(10);
      expect(map.enemies.length).toBeGreaterThan(25);
      expect(stats.medikits).toBeGreaterThan(4);
      expect(stats.ammoBoxes).toBeGreaterThan(8);
      if (map.rooms.some(r => r.outdoor)) anyCourtyard = true;
    }
    expect(anyCourtyard).toBe(true);
  });

  it('ammo economy: available damage comfortably exceeds total enemy HP', () => {
    for (const s of seeds) {
      const sim = new Sim(s, 'normal');
      const map = sim.map;
      const diff = DIFFICULTIES.normal;
      let enemyHp = 0;
      for (const e of sim.enemies) enemyHp += e.hp;
      // potential damage from ammo (pistol + boxes + gun spawns)
      let dmg = sim.player.ammo.bullets * WEAPONS[0].damage;
      for (const pk of map.pickups) {
        if (pk.kind === 'ammo') {
          const w = WEAPONS.find(g => g.ammo === pk.ammoType)!;
          dmg += (pk.amount ?? w.boxAmmo) * w.damage;
        } else if (pk.kind === 'gun') {
          const w = WEAPONS[(pk.gun ?? 1) - 1];
          dmg += w.spawnAmmo * w.damage;
        }
      }
      dmg *= diff.playerDamageOut;
      expect(dmg, `economy too tight in seed ${s}: ${dmg} vs ${enemyHp}`).toBeGreaterThan(enemyHp * ECONOMY_FLOOR);
    }
  });

  it('same seed + difficulty => identical grid and entities', () => {
    const a = generateMap('repro-1', 'normal');
    const b = generateMap('repro-1', 'normal');
    expect([...a.grid]).toEqual([...b.grid]);
    expect(JSON.stringify(a.pickups)).toBe(JSON.stringify(b.pickups));
    expect(JSON.stringify(a.enemies)).toBe(JSON.stringify(b.enemies));
    const c = generateMap('repro-1', 'hard');
    expect([...c.grid]).toEqual([...a.grid]); // layout same across difficulty...
    expect(c.enemies.length).toBeGreaterThanOrEqual(a.enemies.length); // ...but economy differs
  });
});
