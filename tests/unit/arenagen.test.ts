import { describe, it, expect } from 'vitest';
import { generateArena, arenaGridHash } from '../../src/sim/arenagen';
import { CELL, PLAYER_RADIUS } from '../../src/sim/types';

function floodFillConnected(grid: Uint8Array, w: number, h: number): boolean {
  let start = -1;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === 1) {
      start = i;
      break;
    }
  }
  if (start < 0) return false;

  const seen = new Uint8Array(grid.length);
  const q: number[] = [start];
  seen[start] = 1;
  while (q.length) {
    const i = q.pop()!;
    const x = i % w;
    const z = (i / w) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
      const ni = nz * w + nx;
      if (grid[ni] !== 1 || seen[ni]) continue;
      seen[ni] = 1;
      q.push(ni);
    }
  }

  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === 1 && !seen[i]) return false;
  }
  return true;
}

function roomCycleCount(map: ReturnType<typeof generateArena>): number {
  const adj = new Map<number, Set<number>>();
  for (const r of map.rooms) adj.set(r.id, new Set());

  const roomAt = (x: number, z: number): number => {
    for (const r of map.rooms) {
      if (x >= r.x && x < r.x + r.w && z >= r.z && z < r.z + r.h) return r.id;
    }
    return -1;
  };

  const seen = new Uint8Array(map.w * map.h);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
  for (let i = 0; i < map.grid.length; i++) {
    if (map.grid[i] !== 1 || seen[i]) continue;
    const q: number[] = [i];
    seen[i] = 1;
    const roomsInComp = new Set<number>();
    while (q.length) {
      const ci = q.pop()!;
      const x = ci % map.w;
      const z = (ci / map.w) | 0;
      const rid = roomAt(x, z);
      if (rid >= 0) roomsInComp.add(rid);
      for (const [dx, dz] of dirs) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= map.w || nz >= map.h) continue;
        const ni = nz * map.w + nx;
        if (map.grid[ni] !== 1 || seen[ni]) continue;
        seen[ni] = 1;
        q.push(ni);
      }
    }
    const ids = [...roomsInComp];
    for (let a = 0; a < ids.length; a++) {
      for (let b = a + 1; b < ids.length; b++) {
        adj.get(ids[a]!)!.add(ids[b]!);
        adj.get(ids[b]!)!.add(ids[a]!);
      }
    }
  }

  let edges = 0;
  for (const [a, nbs] of adj) {
    for (const b of nbs) if (a < b) edges++;
  }
  return edges - map.rooms.length + 1;
}

function pickCellKey(x: number, z: number, w: number): number {
  const cx = Math.floor(x / CELL);
  const cz = Math.floor(z / CELL);
  return cz * w + cx;
}

describe('arenagen (Arena 96x96 generator)', () => {
  it('basic invariants + determinism', () => {
    const hashesBySeed = new Map<number, string>();
    const seenHashes: { hash: number; seed: string }[] = [];

    for (let i = 0; i < 100; i++) {
      const seed = `arena-${i}`;
      const map = generateArena(seed);

      expect(map.w).toBe(96);
      expect(map.h).toBe(96);
      expect(map.doors).toEqual([]);
      expect(map.enemies).toEqual([]);
      expect(map.secrets).toEqual([]);
      expect(map.seed).toBe(seed);

      // Border solid = no floor on outer rim.
      for (let x = 0; x < map.w; x++) {
        expect(map.grid[x], `top border floor in seed ${seed}`).toBe(0);
        expect(map.grid[(map.h - 1) * map.w + x], `bottom border floor in seed ${seed}`).toBe(0);
      }
      for (let z = 0; z < map.h; z++) {
        expect(map.grid[z * map.w], `left border floor in seed ${seed}`).toBe(0);
        expect(map.grid[z * map.w + (map.w - 1)], `right border floor in seed ${seed}`).toBe(0);
      }

      // Flood-fill connected.
      expect(floodFillConnected(map.grid, map.w, map.h), `grid not connected in ${seed}`).toBe(true);

      // Rooms / courtyards.
      expect(map.rooms.length).toBeGreaterThanOrEqual(13);
      const courtyards = map.rooms.filter((r) => r.outdoor).length;
      expect(courtyards, `courtyards in seed ${seed}`).toBeGreaterThanOrEqual(3);

      // Room graph has enough loops.
      const cycles = roomCycleCount(map);
      expect(cycles, `cycleCount ${cycles} in seed ${seed}`).toBeGreaterThanOrEqual(4);

      // Guns / loot.
      const guns = map.pickups.filter((p) => p.kind === 'gun');
      const gunCounts = new Map<number, number>();
      for (const g of guns) gunCounts.set(g.gun!, (gunCounts.get(g.gun!) ?? 0) + 1);
      expect([...gunCounts.keys()].sort((a, b) => a - b), `gun types in ${seed}`).toEqual([2, 3, 4, 5, 6, 7]);
      expect(gunCounts.get(2)).toBe(2);
      expect(gunCounts.get(3)).toBe(2);
      for (const g of [4, 5, 6, 7]) expect(gunCounts.get(g), `gun ${g} count in ${seed}`).toBe(1);

      expect(map.pickups.some((p) => p.kind === 'ammo'), `ammo missing in ${seed}`).toBe(true);
      expect(map.pickups.some((p) => p.kind === 'medikit'), `medikit missing in ${seed}`).toBe(true);

      // No duplicate pad cells.
      const used = new Set<number>();
      for (const pk of map.pickups) {
        const k = pickCellKey(pk.x, pk.z, map.w);
        expect(used.has(k), `duplicate pad cell in seed ${seed}`).toBe(false);
        used.add(k);
      }

      const hsh = arenaGridHash(map.grid, map.pickups);
      const prev = hashesBySeed.get(i);
      if (prev !== undefined) expect(prev, `hash changed across runs for ${seed}`).toBe(String(hsh));
      hashesBySeed.set(i, String(hsh));
      seenHashes.push({ hash: hsh, seed });
    }

    // Hash collisions check (< 2%).
    let collisions = 0;
    for (let i = 0; i < seenHashes.length; i++) {
      for (let j = i + 1; j < seenHashes.length; j++) {
        if (seenHashes[i]!.hash === seenHashes[j]!.hash) collisions++;
      }
    }
    const collisionRate = (collisions / (100 * 99 / 2)) * 100;
    expect(collisionRate, `hash collision rate ${collisionRate.toFixed(2)}%`).toBeLessThan(2);
  });

  it('same seed -> same grid hash; distinct seeds mostly differ', () => {
    const a = generateArena('arena-same-1');
    const b = generateArena('arena-same-1');
    expect(arenaGridHash(a.grid, a.pickups)).toBe(arenaGridHash(b.grid, b.pickups));
  });
});

