import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FxRenderer } from '../../src/render/fx';
import { ArenaClient, type ArenaNetSocket } from '../../src/net/client';
import { encode, PROTOCOL_V, type ServerMessage } from '../../src/net/protocol';
import { generateArena, arenaGridHash } from '../../src/sim/arenagen';
import { ARENA_GEN_VERSION } from '../../src/sim/arenaConstants';
import type { ArenaSnapshot } from '../../src/sim/arena';
import { emptyInput } from '../../src/sim/sim';

beforeAll(() => {
  if (typeof document !== 'undefined') return;
  const gradient = { addColorStop() {} };
  const context = new Proxy({ canvas: { width: 64, height: 64 }, createLinearGradient: () => gradient, createRadialGradient: () => gradient }, {
    get(target, key) {
      if (key in target) return target[key as keyof typeof target];
      return () => undefined;
    },
  });
  (globalThis as unknown as { document: { createElement: () => unknown } }).document = {
    createElement: () => ({ width: 64, height: 64, getContext: () => context }),
  };
});

class Socket implements ArenaNetSocket {
  private message: ((event: { data: string }) => void) | null = null;
  send(): void {}
  close(): void {}
  addEventListener(type: 'message' | 'close' | 'error' | 'open', listener: (event: never) => void): void {
    if (type === 'message') this.message = listener as unknown as (event: { data: string }) => void;
    if (type === 'open') queueMicrotask(() => (listener as () => void)());
  }
  push(message: ServerMessage): void { this.message?.({ data: encode(message) }); }
}

const ammo = { bullets: 70, shells: 0, nails: 0, grenades: 0, cores: 0, void: 0 };
function snapshot(tick: number, projectiles: ArenaSnapshot['projectiles']): ArenaSnapshot {
  return { tick, projectiles, pickups: [], players: [{
    id: 0, name: 'A', colorIndex: 0, x: 10, z: 10, yaw: 0, pitch: 0,
    hp: 100, gun: 1, ownedMask: 1, alive: true, protect: 0, frags: 0, deaths: 0,
    spawnCount: 1, lastSeq: 0, ammo,
  }] };
}

describe('arena render presentation', () => {
  it('places rail and nail geometry ahead of a pitched shooter', () => {
    const scene = new THREE.Scene();
    const fx = new FxRenderer(scene);
    fx.tracer(1, 2, 3, 9, 7, -5, 'rail');
    scene.updateMatrixWorld(true);
    const rail = scene.children[0] as THREE.Group;
    const core = rail.children[0] as THREE.Mesh;
    const midpoint = core.getWorldPosition(new THREE.Vector3());
    expect(midpoint.distanceTo(new THREE.Vector3(5, 4.5, -1))).toBeLessThan(1e-5);

    const velocity = new THREE.Vector3(5, 3, -7).normalize();
    fx.syncProjectiles([{ id: 9, kind: 'nail', fromPlayer: true, x: 1, y: 2, z: 3,
      vx: velocity.x, vy: velocity.y, vz: velocity.z, gravity: 0, radius: 0.2,
      damage: 0, splashRadius: 0, damageSelfPct: 0, age: 0 }]);
    scene.updateMatrixWorld(true);
    const nail = (fx as unknown as { projectileMeshes: Map<number, THREE.Group> }).projectileMeshes.get(9)!;
    const tip = nail.children[1]!;
    const origin = nail.getWorldPosition(new THREE.Vector3());
    const tipPosition = tip.getWorldPosition(new THREE.Vector3());
    expect(tipPosition.sub(origin).normalize().dot(velocity)).toBeGreaterThan(0.99);
  });

  it('keeps an observer projectile through delayed samples, then removes it by identity', async () => {
    let clock = 0;
    const socket = new Socket();
    const client = new ArenaClient(() => socket, () => clock);
    const map = generateArena('observer-presentation');
    const connect = client.connect('ws://arena', 'A');
    socket.push({ v: PROTOCOL_V, t: 'welcome', id: 0, seed: 'observer-presentation', genVersion: ARENA_GEN_VERSION,
      gridHash: arenaGridHash(map.grid, map.pickups), tick: 0, snapshot: snapshot(0, []) });
    await connect;
    const projectile = { id: 44, ownerId: 1, kind: 'nail' as const, x: 2, y: 2, z: 3, vx: 5, vy: 2, vz: -7, gravity: 0, radius: 0.18, age: 0 };
    socket.push({ v: PROTOCOL_V, t: 'events', es: [{ t: 'spawnProjectile', id: 1, projectileId: 44, ownerId: 1, kind: 'nail',
      x: projectile.x, y: projectile.y, z: projectile.z, vx: projectile.vx, vy: projectile.vy, vz: projectile.vz,
      gravity: projectile.gravity, radius: projectile.radius, age: projectile.age }] });
    clock = 50;
    client.ingestSnapshot(snapshot(3, [projectile]), clock);
    // Render history still targets the pre-spawn welcome at time 0. The
    // event-owned state bridges that gap instead of flickering out.
    clock = 100;
    const view = client.worldView()!;
    const early = view.projectiles.find((p) => p.id === 44);
    expect(early).toMatchObject({ vx: 5, vy: 2, vz: -7 });
    expect(early!.x).toBeGreaterThan(projectile.x);
    const fx = new FxRenderer(new THREE.Scene());
    fx.syncProjectiles(view.projectiles);
    expect((fx as unknown as { projectileMeshes: Map<number, unknown> }).projectileMeshes.has(44)).toBe(true);

    clock = 150;
    client.ingestSnapshot(snapshot(6, [projectile]), clock);
    clock = 200;
    socket.push({ v: PROTOCOL_V, t: 'events', es: [{ t: 'despawnProjectile', projectileId: 44 }] });
    // The delayed renderer is still sampling the prior live snapshot, so
    // this verifies tombstone filtering rather than only early-map removal.
    expect(client.worldView()!.projectiles.some((p) => p.id === 44)).toBe(false);
    clock = 1400;
    // Tombstones outlive the 100 ms delayed render window, then retire once
    // stale samples are pruned rather than accumulating for a whole match.
    client.stepLocal(0, emptyInput());
    expect(client.worldView()!.projectiles.some((p) => p.id === 44)).toBe(false);
    expect((client as unknown as { despawnedProjectiles: Map<number, number> }).despawnedProjectiles.size).toBe(0);
  });
});
