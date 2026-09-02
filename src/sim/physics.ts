// Collision + raycast helpers over the grid (doors and the seal count as solid).
import { CELL } from './types';
import type { GameMap } from './types';
import type { Sim } from './sim';

/** collision = gameplay solidity; visual = what the camera may see through. */
export type SolidMode = 'collision' | 'visual';

export function isSolidCell(state: Sim, cx: number, cz: number, mode: SolidMode = 'collision'): boolean {
  if (cx < 0 || cz < 0 || cx >= state.map.w || cz >= state.map.h) return true;
  if (state.map.grid[cz * state.map.w + cx] === 0) return true;
  for (const d of state.doors) {
    const blocks = mode === 'visual'
      ? !d.opening && d.offset <= 0
      : d.offset < 0.65;
    if (blocks) {
      for (const [x, z] of d.cells) if (x === cx && z === cz) return true;
    }
  }
  if (state.sealIntact) {
    for (const [x, z] of state.map.seal.cells) if (x === cx && z === cz) return true;
  }
  return false;
}

export function circleFits(state: Sim, x: number, z: number, r: number): boolean {
  const c0x = Math.floor((x - r) / CELL), c1x = Math.floor((x + r) / CELL);
  const c0z = Math.floor((z - r) / CELL), c1z = Math.floor((z + r) / CELL);
  for (let cz = c0z; cz <= c1z; cz++) {
    for (let cx = c0x; cx <= c1x; cx++) {
      if (!isSolidCell(state, cx, cz)) continue;
      // precise circle vs cell AABB
      const px = Math.max(cx * CELL, Math.min(x, (cx + 1) * CELL));
      const pz = Math.max(cz * CELL, Math.min(z, (cz + 1) * CELL));
      const dx = x - px, dz = z - pz;
      if (dx * dx + dz * dz < r * r) return false;
    }
  }
  return true;
}

/** Slide movement: try full move, then axis-separated. */
export function moveCircle(state: Sim, x: number, z: number, dx: number, dz: number, r: number): { x: number; z: number } {
  let nx = x, nz = z;
  if (circleFits(state, x + dx, z, r)) nx = x + dx;
  if (circleFits(state, nx, z + dz, r)) nz = z + dz;
  return { x: nx, z: nz };
}

/** Push circle `r` out of another circle, still sliding on walls. Deterministic. */
export function pushCircleOut(
  state: Sim,
  x: number, z: number, r: number,
  ox: number, oz: number, orad: number,
): { x: number; z: number } {
  const dx = x - ox, dz = z - oz;
  const minD = r + orad;
  const d2 = dx * dx + dz * dz;
  if (d2 >= minD * minD) return { x, z };
  if (d2 < 1e-8) return moveCircle(state, x, z, minD, 0, r);
  const d = Math.sqrt(d2);
  const push = minD - d;
  return moveCircle(state, x, z, (dx / d) * push, (dz / d) * push, r);
}

/** Grid DDA raycast. Returns distance to wall (or maxDist) and hit point. */
export function raycastWall(
  state: Sim, x0: number, z0: number, dirX: number, dirZ: number, maxDist: number,
  mode: SolidMode = 'collision',
): { dist: number; x: number; z: number; cell: [number, number] | null } {
  let cx = Math.floor(x0 / CELL), cz = Math.floor(z0 / CELL);
  const stepX = dirX > 0 ? 1 : -1;
  const stepZ = dirZ > 0 ? 1 : -1;
  const tDeltaX = dirX !== 0 ? Math.abs(CELL / dirX) : Infinity;
  const tDeltaZ = dirZ !== 0 ? Math.abs(CELL / dirZ) : Infinity;
  let tMaxX = dirX !== 0
    ? ((dirX > 0 ? (cx + 1) * CELL - x0 : x0 - cx * CELL) / Math.abs(dirX))
    : Infinity;
  let tMaxZ = dirZ !== 0
    ? ((dirZ > 0 ? (cz + 1) * CELL - z0 : z0 - cz * CELL) / Math.abs(dirZ))
    : Infinity;
  if (isSolidCell(state, cx, cz, mode)) return { dist: 0, x: x0, z: z0, cell: [cx, cz] };
  let t = 0;
  for (let i = 0; i < 256; i++) {
    if (tMaxX < tMaxZ) {
      t = tMaxX; tMaxX += tDeltaX; cx += stepX;
    } else {
      t = tMaxZ; tMaxZ += tDeltaZ; cz += stepZ;
    }
    if (t > maxDist) return { dist: maxDist, x: x0 + dirX * maxDist, z: z0 + dirZ * maxDist, cell: null };
    if (isSolidCell(state, cx, cz, mode)) {
      return { dist: t, x: x0 + dirX * t, z: z0 + dirZ * t, cell: [cx, cz] };
    }
  }
  return { dist: maxDist, x: x0 + dirX * maxDist, z: z0 + dirZ * maxDist, cell: null };
}

/** Line of sight between two world points (ignores height). */
export function hasLineOfSight(
  state: Sim, x0: number, z0: number, x1: number, z1: number,
  mode: SolidMode = 'collision',
): boolean {
  const dx = x1 - x0, dz = z1 - z0;
  const d = Math.hypot(dx, dz);
  if (d < 0.001) return true;
  const hit = raycastWall(state, x0, z0, dx / d, dz / d, d, mode);
  return hit.dist >= d - 0.01;
}

/** Same as LOS, but opening doors do not occlude (used by the renderer). */
export function hasVisualLineOfSight(state: Sim, x0: number, z0: number, x1: number, z1: number): boolean {
  return hasLineOfSight(state, x0, z0, x1, z1, 'visual');
}

/** A* pathfinding on the grid. Returns waypoints (world coords) or null. */
export function findPath(state: Sim, sx: number, sz: number, tx: number, tz: number): { x: number; z: number }[] | null {
  const w = state.map.w, h = state.map.h;
  const start = Math.floor(sz / CELL) * w + Math.floor(sx / CELL);
  const goal = Math.floor(tz / CELL) * w + Math.floor(tx / CELL);
  if (start === goal) return [{ x: tx, z: tz }];
  const open: number[] = [start];
  const gScore = new Map<number, number>([[start, 0]]);
  const fScore = new Map<number, number>([[start, 0]]);
  const cameFrom = new Map<number, number>();
  const goalX = goal % w, goalZ = (goal / w) | 0;
  const closed = new Set<number>();
  let guard = 0;
  while (open.length && guard++ < 4000) {
    // pick lowest f
    let bi = 0;
    for (let i = 1; i < open.length; i++) {
      const f = fScore.get(open[i]) ?? Infinity;
      if (f < (fScore.get(open[bi]) ?? Infinity)) bi = i;
    }
    const cur = open.splice(bi, 1)[0];
    if (cur === goal) {
      const path: { x: number; z: number }[] = [];
      let c: number | undefined = cur;
      while (c !== undefined) {
        path.push({ x: ((c % w) + 0.5) * CELL, z: (((c / w) | 0) + 0.5) * CELL });
        c = cameFrom.get(c);
      }
      path.reverse();
      path.shift(); // drop current cell
      path[path.length - 1] = { x: tx, z: tz };
      return path;
    }
    closed.add(cur);
    const cx = cur % w, cz = (cur / w) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
      const nk = nz * w + nx;
      if (closed.has(nk)) continue;
      if (isSolidCell(state, nx, nz)) continue;
      // discourage diagonal-free corners: also require the cell we'd brush past is open — n/a for 4-dir
      const ng = (gScore.get(cur) ?? Infinity) + 1;
      if (ng < (gScore.get(nk) ?? Infinity)) {
        cameFrom.set(nk, cur);
        gScore.set(nk, ng);
        const hEst = Math.abs(nx - goalX) + Math.abs(nz - goalZ);
        fScore.set(nk, ng + hEst * 1.05);
        if (!open.includes(nk)) open.push(nk);
      }
    }
  }
  return null;
}

export function roomAt(map: GameMap, x: number, z: number): number {
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  for (const r of map.rooms) {
    if (cx >= r.x && cx < r.x + r.w && cz >= r.z && cz < r.z + r.h) return r.id;
  }
  return -1;
}
