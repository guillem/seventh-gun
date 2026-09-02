// Finite-cylinder ray hits used by guns (hitscan + player projectiles).
import { describe, it, expect } from 'vitest';
import { raycastCylinder } from '../../src/sim/physics';
import { PLAYER_EYE } from '../../src/sim/types';
import { ENEMIES, enemyVolumeY } from '../../src/sim/enemyTypes';

function dirTo(dx: number, dy: number, dz: number): [number, number, number] {
  const l = Math.hypot(dx, dy, dz) || 1;
  return [dx / l, dy / l, dz / l];
}

describe('raycastCylinder', () => {
  const crawler = ENEMIES.crawler;
  const vol = enemyVolumeY(crawler);
  const r = crawler.radius + 0.12;
  const D = 1.07; // ~player radius + crawler radius (point-blank hug)

  it('steep look-down at a close crawler chest hits (the old XZ-closest test missed this)', () => {
    const [dx, dy, dz] = dirTo(0, vol.yCenter - PLAYER_EYE, -D);
    const t = raycastCylinder(0, PLAYER_EYE, 0, dx, dy, dz, 0, -D, r, vol.yMin, vol.yMax, 120);
    expect(t).not.toBeNull();
    expect(t!).toBeGreaterThan(0);
    const yAt = PLAYER_EYE + dy * t!;
    expect(yAt).toBeGreaterThanOrEqual(vol.yMin);
    expect(yAt).toBeLessThanOrEqual(vol.yMax);
  });

  it('a ray through the floor in front does not count as a body hit', () => {
    const floorD = D * 0.35;
    const [dx, dy, dz] = dirTo(0, 0 - PLAYER_EYE, -floorD);
    const t = raycastCylinder(0, PLAYER_EYE, 0, dx, dy, dz, 0, -D, r, vol.yMin, vol.yMax, 120);
    expect(t).toBeNull();
  });

  it('a ray clearly above the crawler head misses', () => {
    const [dx, dy, dz] = dirTo(0, (vol.yMax + 0.8) - PLAYER_EYE, -D);
    const t = raycastCylinder(0, PLAYER_EYE, 0, dx, dy, dz, 0, -D, r, vol.yMin, vol.yMax, 120);
    expect(t).toBeNull();
  });

  it('maxDist (a wall) clips a cylinder that sits behind it', () => {
    const [dx, dy, dz] = dirTo(0, 0, -1);
    const husk = enemyVolumeY(ENEMIES.husk);
    const hit = raycastCylinder(0, PLAYER_EYE, 0, dx, dy, dz, 0, -8, 0.67, husk.yMin, husk.yMax, 120);
    expect(hit).not.toBeNull();
    const blocked = raycastCylinder(0, PLAYER_EYE, 0, dx, dy, dz, 0, -8, 0.67, husk.yMin, husk.yMax, 3);
    expect(blocked).toBeNull();
  });

  it('wisp volume is the hovering torso, not a stack above the head', () => {
    const w = ENEMIES.wisp;
    const wv = enemyVolumeY(w);
    const wr = w.radius + 0.12;
    const torso = dirTo(0, wv.yCenter - PLAYER_EYE, -5);
    expect(raycastCylinder(0, PLAYER_EYE, 0, ...torso, 0, -5, wr, wv.yMin, wv.yMax, 120)).not.toBeNull();
    const above = dirTo(0, (wv.yMax + 0.45) - PLAYER_EYE, -5);
    expect(raycastCylinder(0, PLAYER_EYE, 0, ...above, 0, -5, wr, wv.yMin, wv.yMax, 120)).toBeNull();
    const floorBand = dirTo(0, 0.65 - PLAYER_EYE, -5);
    expect(raycastCylinder(0, PLAYER_EYE, 0, ...floorBand, 0, -5, wr, wv.yMin, wv.yMax, 120)).toBeNull();
  });

  it('origin already inside the volume reports t = 0, not a behind-the-gun miss', () => {
    const t = raycastCylinder(0, 0.6, 0, 0, 0, -1, 0, 0, r, vol.yMin, vol.yMax, 120);
    expect(t).toBe(0);
  });
});
