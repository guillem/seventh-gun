// Shared, target-agnostic combat helpers for hitscan + projectile math.
//
// These functions are pure (no RNG). Callers are responsible for drawing
// any spread randomness so RNG order stays byte-identical across modes.
import type { SolidState } from './physics';
import { isSolidCell, raycastCylinder, raycastWall } from './physics';
import type { WeaponDef } from './weapons';
import { CELL } from './types';

export interface Dir3 {
  dirX: number;
  dirY: number;
  dirZ: number;
}

export interface Body {
  id: number;
  x: number;
  z: number;
  radius: number;
  yMin: number;
  yMax: number;
}

export interface ProjectileLike {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  gravity: number;
  radius: number;
}

export interface Impact {
  kind: 'wall' | 'ground' | 'body';
  bodyId?: number;
  // For wall/ground, these are the projectile's pre-impact position (matching
  // the single-player implementation which does not advance on solid hit).
  x: number;
  y: number;
  z: number;
  // Used by gameplay layers (secret/plate logic) that rely on the
  // projectile's candidate cell after the step.
  hitCell: [number, number];
}

export function spreadDir(dirX: number, dirY: number, dirZ: number, a: number, r: number): Dir3 {
  // Perpendicular basis to the ray: right = (dirZ, -dirX)
  const rightX = dirZ, rightZ = -dirX;
  const rl = Math.hypot(rightX, rightZ) || 1;
  const rxn = rightX / rl, rzn = rightZ / rl;
  const ca = Math.cos(a) * r;
  const sa = Math.sin(a) * r;
  let sx = dirX + rxn * ca;
  let sy = dirY + sa;
  let sz = dirZ + rzn * ca;
  const sl = Math.hypot(sx, sy, sz);
  // sl should never be 0 for unit dir + small spread, but guard for safety.
  if (sl > 1e-12) { sx /= sl; sy /= sl; sz /= sl; }
  return { dirX: sx, dirY: sy, dirZ: sz };
}

export function damageAtRange(w: WeaponDef, t: number, base: number): number {
  if (t <= w.falloffStart) return base;
  if (t >= w.falloffEnd) return base * w.falloffMin;
  const f = (t - w.falloffStart) / (w.falloffEnd - w.falloffStart);
  return base * (1 - f * (1 - w.falloffMin));
}

/** Wall DDA + sorted cylinder hits along a ray. */
export function sweepHitscan(
  solid: SolidState,
  ox: number, oy: number, oz: number,
  dirX: number, dirY: number, dirZ: number,
  maxRange: number,
  bodies: Body[],
): { wall: ReturnType<typeof raycastWall>; hits: { id: number; t: number }[]; tracerEnd: number } {
  const wall = raycastWall(solid, ox, oz, dirX, dirZ, maxRange);
  const maxD = Math.min(wall.dist, maxRange);

  let tracerD = maxD;
  // Floor intersection: used to cap tracer visual when looking steep down.
  if (dirY < -1e-8) {
    const tFloor = (0 - oy) / dirY;
    if (tFloor > 0) tracerD = Math.min(tracerD, tFloor);
  }

  const hits: { id: number; t: number }[] = [];
  for (const b of bodies) {
    const t = raycastCylinder(
      ox, oy, oz,
      dirX, dirY, dirZ,
      b.x, b.z,
      b.radius,
      b.yMin, b.yMax,
      maxD + 0.45,
    );
    if (t === null) continue;
    hits.push({ id: b.id, t });
  }
  hits.sort((a, b) => a.t - b.t);
  return { wall, hits, tracerEnd: tracerD };
}

/** One integration step; returns impact {kind:'wall'|'ground'|'body', bodyId?, x,y,z}. */
export function integrateProjectile(
  solid: SolidState,
  p: ProjectileLike & { age: number },
  dt: number,
  bodies: Body[],
): Impact | null {
  // The caller manages `p.age` bookkeeping; this function is responsible for
  // updating velocity + choosing whether to advance or stop.
  p.vy -= p.gravity * dt;
  const nx = p.x + p.vx * dt;
  const ny = p.y + p.vy * dt;
  const nz = p.z + p.vz * dt;
  const hitCell: [number, number] = [Math.floor(nx / CELL), Math.floor(nz / CELL)];

  if (isSolidCell(solid, hitCell[0], hitCell[1])) {
    return { kind: 'wall', x: p.x, y: p.y, z: p.z, hitCell };
  }
  if (ny <= p.radius && p.gravity > 0) {
    return { kind: 'ground', x: p.x, y: p.y, z: p.z, hitCell };
  }

  // Body collision along the swept segment (raycastCylinder against each body).
  const span = Math.hypot(nx - p.x, ny - p.y, nz - p.z);
  if (span < 1e-12) {
    // Degenerate step: only allow hits at the candidate point.
    let best: Body | null = null;
    let bestT: number = 0;
    for (const b of bodies) {
      const dx = b.x - nx;
      const dz = b.z - nz;
      // In the original code this uses `ny` and expanded yMin/yMax and
      // does not advance the projectile when span is ~0.
      const rr = b.radius;
      if (dx * dx + dz * dz < rr * rr && ny >= b.yMin && ny <= b.yMax) {
        const t = 0;
        if (t !== null && t <= bestT) best = b;
      }
    }
    if (best) {
      return { kind: 'body', bodyId: best.id, x: p.x, y: p.y, z: p.z, hitCell };
    }
  } else {
    const inv = 1 / span;
    const pdx = (nx - p.x) * inv;
    const pdy = (ny - p.y) * inv;
    const pdz = (nz - p.z) * inv;
    let bestT = span;
    let best: Body | null = null;
    for (const b of bodies) {
      const t = raycastCylinder(
        p.x, p.y, p.z,
        pdx, pdy, pdz,
        b.x, b.z,
        b.radius,
        b.yMin, b.yMax,
        span,
      );
      if (t === null) continue;
      if (t !== null && t <= bestT) { bestT = t; best = b; }
    }
    if (best) {
      p.x += pdx * bestT;
      p.y += pdy * bestT;
      p.z += pdz * bestT;
      return { kind: 'body', bodyId: best.id, x: p.x, y: p.y, z: p.z, hitCell };
    }
  }

  // No hit: advance projectile.
  p.x = nx; p.y = ny; p.z = nz;
  return null;
}

/** Splash falloff list: [{ id, factor }] for bodies inside radius. */
export function splashFactors(px: number, pz: number, radius: number, bodies: Body[]): { id: number; factor: number }[] {
  const out: { id: number; factor: number }[] = [];
  for (const b of bodies) {
    const d = Math.hypot(b.x - px, b.z - pz);
    if (d >= radius + b.radius) continue;
    // Enemy-style falloff with a 0.25 factor floor.
    const f = 1 - Math.max(0, d - b.radius) / radius;
    out.push({ id: b.id, factor: Math.max(0.25, f) });
  }
  return out;
}

