// Regenerated lights / wall decors from a seeded RNG. Duplicated from
// mapgen (not extracted) so the 300-seed maze sweep stays byte-identical.
import { CELL, GRID_W, GRID_H, cellToWorld } from './types';
import type { Decor, DecorKind, Room, RoomLight, Theme } from './types';
import type { Rng } from './rng';

function key(x: number, z: number, w = GRID_W): number {
  return z * w + x;
}

export function placeCosmetics(
  grid: Uint8Array,
  rooms: Room[],
  rng: Rng,
  w = GRID_W,
  h = GRID_H,
): { lights: RoomLight[]; decors: Decor[] } {
  const lights: RoomLight[] = [];
  for (const r of rooms) {
    const count = r.outdoor ? 0 : 1 + (r.w * r.h > 90 ? 1 : 0);
    if (r.kind === 'secret') continue;
    for (let i = 0; i < count; i++) {
      const lx = cellToWorld(r.x + 1 + rng.int(Math.max(1, r.w - 2)));
      const lz = cellToWorld(r.z + 1 + rng.int(Math.max(1, r.h - 2)));
      const palette: Record<Theme, [number, number, number][]> = {
        industrial: [[1.0, 0.75, 0.45], [0.6, 0.8, 1.0]],
        organic: [[1.0, 0.35, 0.4], [0.9, 0.6, 0.3]],
        stone: [[0.7, 0.85, 0.8], [1.0, 0.9, 0.6]],
        tech: [[0.5, 0.9, 1.0], [0.9, 0.5, 1.0]],
      };
      const color = rng.pick(palette[r.theme]);
      lights.push({
        x: lx, z: lz, y: r.outdoor ? 5 : 3.9,
        color, intensity: 1.3 + rng.float() * 0.5, radius: 8 + rng.float() * 4, roomId: r.id,
      });
    }
  }

  const decors: Decor[] = [];
  const decorByTheme: Record<Theme, DecorKind[]> = {
    industrial: ['rune', 'skull', 'lamp', 'tendrils'],
    organic: ['tendrils', 'skull', 'rune', 'lamp'],
    stone: ['pentagram', 'rune', 'skull', 'tendrils'],
    tech: ['rune', 'lamp', 'tendrils', 'pentagram'],
  };
  for (const r of rooms) {
    if (r.kind === 'secret') continue;
    const n = 1 + Math.floor((r.w * r.h) / 28);
    for (let i = 0; i < n * 3 && decors.length < 400; i++) {
      if (decors.filter(d => Math.abs(d.x - r.cx) < r.w).length >= n) break;
      const x = r.x + rng.int(r.w), z = r.z + rng.int(r.h);
      if (x < 0 || z < 0 || x >= w || z >= h) continue;
      if (grid[key(x, z, w)] !== 1) continue;
      const dirs: [number, number, number][] = [
        [1, 0, -Math.PI / 2], [-1, 0, Math.PI / 2], [0, 1, Math.PI], [0, -1, 0],
      ];
      const shuffled = dirs.slice().sort(() => rng.float() - 0.5);
      for (const [dx, dz, face] of shuffled) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
        if (grid[key(nx, nz, w)] === 0) {
          const kind = rng.pick(decorByTheme[r.theme]);
          decors.push({
            x: cellToWorld(x) + dx * (CELL / 2 - 0.02),
            y: kind === 'lamp' ? 2.9 : 1.6 + rng.float() * 0.5,
            z: cellToWorld(z) + dz * (CELL / 2 - 0.02),
            facing: face, kind, theme: r.theme,
          });
          break;
        }
      }
    }
  }
  return { lights, decors };
}
