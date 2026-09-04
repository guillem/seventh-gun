import { describe, it, expect } from 'vitest';
import { ArenaSim } from '../../src/sim/arena';
import { circleFits, hasLineOfSight, isSolidCell } from '../../src/sim/physics';
import { CELL, PLAYER_RADIUS } from '../../src/sim/types';
import { emptyInput, STEP_DT, type SimInput } from '../../src/sim/sim';
import {
  ARENA_DEATH_LOCKOUT,
  ARENA_IDLE_S,
  ARENA_SPAWN_PROTECT,
} from '../../src/sim/arenaConstants';

function inputTick(partial: Partial<SimInput>): SimInput {
  return { ...emptyInput(), ...partial };
}

function findFloorCells(sim: ArenaSim): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let z = 1; z < sim.map.h - 1; z++) {
    for (let x = 1; x < sim.map.w - 1; x++) {
      const idx = z * sim.map.w + x;
      if (sim.map.grid[idx] !== 1) continue;
      const wx = (x + 0.5) * CELL;
      const wz = (z + 0.5) * CELL;
      if (!circleFits(sim, wx, wz, PLAYER_RADIUS)) continue;
      out.push({ x: wx, z: wz });
    }
  }
  return out;
}

function pickShootingPair(sim: ArenaSim): { shooter: { x: number; z: number }; victim: { x: number; z: number } } {
  const cells = findFloorCells(sim);
  for (let i = 0; i < cells.length; i++) {
    for (let j = 0; j < cells.length; j++) {
      if (i === j) continue;
      const a = cells[i]!;
      const b = cells[j]!;
      const dist = Math.hypot(a.x - b.x, a.z - b.z);
      if (dist < 5 || dist > 80) continue;
      if (!hasLineOfSight(sim, a.x, a.z, b.x, b.z)) continue;
      return { shooter: a, victim: b };
    }
  }
  // Should be rare to fail; still keep deterministic fallback.
  const first = cells[0]!;
  return { shooter: first, victim: cells[1]! };
}

function yawToTarget(shooter: { x: number; z: number }, target: { x: number; z: number }): number {
  const dx = target.x - shooter.x;
  const dz = target.z - shooter.z;
  // aimDirFromLook(yaw, pitch=0): dirX=-sin(yaw), dirZ=-cos(yaw)
  // Solve yaw from desired (dx,dz) direction.
  return Math.atan2(-dx, -dz);
}

describe('arena sim (server-authoritative)', () => {
  it('two-player pistol kill + respawn far + counters', () => {
    const sim = new ArenaSim('arena-test-1');
    const a = sim.join('A') as any;
    const b = sim.join('B') as any;
    expect(a.id).not.toBe(b.id);
    sim.takeEvents();

    const pair = pickShootingPair(sim);
    a.x = pair.shooter.x; a.z = pair.shooter.z;
    b.x = pair.victim.x; b.z = pair.victim.z;
    a.yaw = yawToTarget({ x: a.x, z: a.z }, { x: b.x, z: b.z }); a.pitch = 0;
    b.yaw = yawToTarget({ x: b.x, z: b.z }, { x: a.x, z: a.z }); b.pitch = 0;
    // Fire until B dies.
    for (let step = 0; step < 600; step++) {
      sim.pushInput(a.id, step + 1, [inputTick({ yaw: a.yaw, pitch: a.pitch, fire: true })]);
      sim.step(STEP_DT);
      if (!b.alive) break;
    }
    expect(b.deaths).toBe(1);
    expect(a.frags).toBe(1);
    expect(b.frags).toBe(0);
    expect(b.alive).toBe(false);

    const deadCellX = Math.floor(b.corpse!.x / CELL);
    const deadCellZ = Math.floor(b.corpse!.z / CELL);

    // Wait 2s for respawn.
    for (let step = 0; step < Math.ceil(ARENA_DEATH_LOCKOUT / STEP_DT) + 3; step++) {
      sim.step(STEP_DT);
    }
    expect(b.alive).toBe(true);
    expect(b.hp).toBe(100);
    expect(b.gun).toBe(1);
    expect(Math.floor(b.x / CELL) !== deadCellX || Math.floor(b.z / CELL) !== deadCellZ).toBe(true);
  });

  it('spawn protection blocks incoming damage then allows after 2.1s', () => {
    const sim = new ArenaSim('arena-test-2');
    const a = sim.join('A') as any;
    const b = sim.join('B') as any;
    sim.takeEvents();
    const pair = pickShootingPair(sim);

    a.x = pair.shooter.x; a.z = pair.shooter.z;
    b.x = pair.victim.x; b.z = pair.victim.z;
    a.yaw = yawToTarget({ x: a.x, z: a.z }, { x: b.x, z: b.z }); a.pitch = 0;
    b.yaw = yawToTarget({ x: b.x, z: b.z }, { x: a.x, z: a.z }); b.pitch = 0;

    // Ensure both are protected at t=0.
    expect(a.protectUntil).toBeCloseTo(ARENA_SPAWN_PROTECT, 6);
    expect(b.protectUntil).toBeCloseTo(ARENA_SPAWN_PROTECT, 6);

    // Let time reach ~1s with no firing.
    for (let t = 0; t < Math.floor(1 / STEP_DT); t++) sim.step(STEP_DT);

    // Fire at t ~ 1s; victim should still be protected.
    sim.pushInput(a.id, 1, [inputTick({ yaw: a.yaw, pitch: a.pitch, fire: true })]);
    const hpBefore = b.hp;
    sim.step(STEP_DT);
    expect(b.hp).toBe(hpBefore);

    // Firing strips the shooter's own protect: after A's shot, its
    // protectUntil must be <= current server time.
    expect(a.protectUntil).toBeLessThanOrEqual(sim.time + 1e-6);

    // Continue to after 2.1s: victim should eventually take damage.
    a.protectUntil = 0;
    let seq = 2;
    while (sim.time < 2.5 && b.hp === hpBefore) {
      a.yaw = yawToTarget({ x: a.x, z: a.z }, { x: b.x, z: b.z });
      a.pitch = 0;
      sim.pushInput(a.id, seq++, [inputTick({ yaw: a.yaw, pitch: 0, fire: true })]);
      sim.step(STEP_DT);
    }
    expect(b.hp).toBeLessThan(hpBefore);
  });

  it('pad taken respawns after constant ± one step; medikit not taken at 100', () => {
    const sim = new ArenaSim('arena-test-3');
    const a = sim.join('A') as any;
    sim.takeEvents();

    // Teleport A onto the first available pickup.
    const pk = sim.pickups.find((p: any) => p.kind === 'ammo' || p.kind === 'medikit' || p.kind === 'gun')!;
    a.x = pk.x; a.z = pk.z;
    a.yaw = 0; a.pitch = 0;
    a.input = { ...emptyInput(), yaw: 0, pitch: 0, fire: false, use: false, switchGun: null };
    expect(typeof pk.respawnAt).toBe('number');

    // Touch pickup.
    sim.step(STEP_DT);
    expect(pk.taken).toBe(true);

    // Move A away so it cannot immediately re-take the pad when it respawns.
    const away = findFloorCells(sim)
      .slice()
      .sort((p0, p1) => {
        const d0 = Math.hypot(p0.x - pk.x, p0.z - pk.z);
        const d1 = Math.hypot(p1.x - pk.x, p1.z - pk.z);
        return d1 - d0;
      })[0]!;
    a.x = away.x;
    a.z = away.z;

    // Step to just after server-computed respawn time.
    const target = pk.respawnAt;
    while (sim.time < target + STEP_DT) sim.step(STEP_DT);
    expect(pk.taken).toBe(false);

    // Medikit at full HP should not be taken.
    const med = sim.pickups.find((p: any) => p.kind === 'medikit')!;
    a.hp = 100;
    a.x = med.x; a.z = med.z;
    a.input.fire = false;
    const medTakenBefore = med.taken;
    for (let i = 0; i < 10; i++) sim.step(STEP_DT);
    expect(med.taken).toBe(medTakenBefore);
  });

  it('splash self-kill credits suicide (deaths=1, frags=0)', () => {
    const sim = new ArenaSim('arena-test-4');
    const a = sim.join('A') as any;
    const b = sim.join('B') as any;
    sim.takeEvents();

    const pair = pickShootingPair(sim);
    // Place A and B far enough apart that only self-splash matters.
    a.x = pair.shooter.x; a.z = pair.shooter.z;
    const far = findFloorCells(sim).slice().sort((p0, p1) => {
      const d0 = Math.hypot(p0.x - a.x, p0.z - a.z);
      const d1 = Math.hypot(p1.x - a.x, p1.z - a.z);
      return d1 - d0;
    })[0]!;
    b.x = far.x; b.z = far.z;

    // Bile Launcher self-splash should deal 90 * 0.25 = 22.5 at pd=0.
    a.hp = 20;
    a.protectUntil = 0;
    a.frags = 0;
    a.deaths = 0;
    a.gun = 5;
    a.input = { ...emptyInput(), yaw: 0, pitch: 0, fire: false, use: false, switchGun: null };

    // Spawn a synthetic projectile that impacts a wall in one tick.
    const weaponSplash = { splashRadius: 5, damageSelfPct: 0.25, damage: 90, gravity: 22, radius: 0.3 };
    const dirCandidates = [
      { dx: 1, dz: 0 },
      { dx: -1, dz: 0 },
      { dx: 0, dz: 1 },
      { dx: 0, dz: -1 },
    ];

    let chosenDir: { dx: number; dz: number } | null = null;
    for (const d of dirCandidates) {
      const nx = a.x + d.dx * CELL;
      const nz = a.z + d.dz * CELL;
      const hitCx = Math.floor(nx / CELL);
      const hitCz = Math.floor(nz / CELL);
      if (isSolidCell(sim, hitCx, hitCz)) { chosenDir = d; break; }
    }
    // If something is wrong with the map geometry, fall back deterministically.
    chosenDir ??= dirCandidates[0]!;

    sim.projectiles.push({
      id: 777,
      kind: 'grenade',
      ownerId: a.id,
      x: a.x,
      y: 2,
      z: a.z,
      vx: chosenDir.dx * (CELL / STEP_DT),
      vy: 0,
      vz: chosenDir.dz * (CELL / STEP_DT),
      gravity: weaponSplash.gravity,
      radius: weaponSplash.radius,
      damage: weaponSplash.damage,
      splashRadius: weaponSplash.splashRadius,
      damageSelfPct: weaponSplash.damageSelfPct,
      age: 0,
    } as any);

    sim.step(STEP_DT);

    expect(a.alive).toBe(false);
    expect(a.deaths).toBe(1);
    expect(a.frags).toBe(0);
  });

  it('idle kick emits kick after 120s of no move/look/fire', () => {
    const sim = new ArenaSim('arena-test-5');
    const a = sim.join('A') as any;
    sim.takeEvents();

    // Keep input unchanged (no move/fire/look change).
    const initialYaw = a.yaw;
    const initialPitch = a.pitch;
    a.input.yaw = initialYaw;
    a.input.pitch = initialPitch;

    for (let i = 0; i < Math.ceil(ARENA_IDLE_S / STEP_DT) + 5; i++) {
      sim.step(STEP_DT);
    }
    const es = sim.takeEvents();
    const kick = es.find((e: any) => e.t === 'kick' && e.id === a.id);
    expect(kick).toBeTruthy();
  });

  it('player bodies block each other (pushCircleOut)', () => {
    const sim = new ArenaSim('arena-test-6');
    const a = sim.join('A') as any;
    const b = sim.join('B') as any;
    sim.takeEvents();

    const pair = pickShootingPair(sim);
    a.x = pair.shooter.x; a.z = pair.shooter.z;
    b.x = pair.shooter.x; b.z = pair.shooter.z;
    a.yaw = 0; b.yaw = 0;
    a.pitch = 0; b.pitch = 0;
    a.input = { ...emptyInput(), yaw: 0, pitch: 0, fire: false, use: false, switchGun: null };
    b.input = { ...emptyInput(), yaw: 0, pitch: 0, fire: false, use: false, switchGun: null };

    // One tick should separate them due to blocking.
    sim.step(STEP_DT);
    const d = Math.hypot(a.x - b.x, a.z - b.z);
    expect(d).toBeGreaterThanOrEqual(PLAYER_RADIUS * 2 - 1e-6);
  });

  it('10 joins succeed and 11th is full', () => {
    const sim = new ArenaSim('arena-test-full');
    for (let i = 0; i < 10; i++) {
      const p = sim.join(`P${i}`);
      expect(p).not.toBe('full');
    }
    expect(sim.join('OVERFLOW')).toBe('full');
  });

  it('input queue caps at 8', () => {
    const sim = new ArenaSim('arena-test-7');
    const a = sim.join('A') as any;
    sim.takeEvents();

    const tape: SimInput[] = [];
    for (let i = 0; i < 20; i++) {
      tape.push(inputTick({ moveX: 2, moveZ: -2, yaw: 0, pitch: 0, fire: false }));
    }
    sim.pushInput(a.id, 123, tape);
    expect(a.queued.length).toBeLessThanOrEqual(8);
    expect(a.queued.every((inpt: any) => Math.abs(inpt.moveX) <= 1 && Math.abs(inpt.moveZ) <= 1)).toBe(true);
  });

  it('input seq is first-of-batch; resend is de-duped; lastSeq is consumed', () => {
    const sim = new ArenaSim('arena-test-seq');
    const a = sim.join('A') as any;
    sim.takeEvents();
    const frame = inputTick({ moveZ: 1, yaw: 0, pitch: 0 });
    sim.pushInput(a.id, 1, [frame, frame, frame, frame]);
    expect(a.queuedSeqs).toEqual([1, 2, 3, 4]);
    sim.step(STEP_DT);
    expect(a.lastSeq).toBe(1);
    expect(a.queuedSeqs).toEqual([2, 3, 4]);
    sim.pushInput(a.id, 1, [frame, frame, frame, frame]);
    expect(a.queuedSeqs).toEqual([2, 3, 4]);
  });

  it('does not acknowledge a brief queued fire or switch before it is simulated', () => {
    const fireSim = new ArenaSim('arena-short-fire');
    const shooter = fireSim.join('A') as any;
    fireSim.takeEvents();
    const idle = inputTick({ yaw: shooter.yaw, pitch: 0, fire: false });
    const fire = inputTick({ yaw: shooter.yaw, pitch: 0, fire: true });
    fireSim.pushInput(shooter.id, 1, Array.from({ length: 8 }, () => idle));
    fireSim.pushInput(shooter.id, 9, [fire]);
    expect(shooter.lastQueuedSeq).toBe(8);
    for (let i = 0; i < 8; i++) fireSim.step(STEP_DT);
    expect(shooter.lastSeq).toBe(8);
    fireSim.pushInput(shooter.id, 9, [fire]);
    fireSim.step(STEP_DT);
    expect(shooter.lastSeq).toBe(9);
    expect(fireSim.takeEvents().some((e) => e.t === 'shot')).toBe(true);

    const switchSim = new ArenaSim('arena-short-switch');
    const player = switchSim.join('A') as any;
    player.owned[2] = true;
    switchSim.pushInput(player.id, 1, Array.from({ length: 8 }, () => idle));
    switchSim.pushInput(player.id, 9, [inputTick({ yaw: player.yaw, pitch: 0, switchGun: 2 })]);
    for (let i = 0; i < 8; i++) switchSim.step(STEP_DT);
    expect(player.gun).toBe(1);
    switchSim.pushInput(player.id, 9, [inputTick({ yaw: player.yaw, pitch: 0, switchGun: 2 })]);
    switchSim.step(STEP_DT);
    expect(player.lastSeq).toBe(9);
    expect(player.gun).toBe(2);
  });

  it('rejects sequence gaps and neutralizes actions between network frames', () => {
    const sim = new ArenaSim('arena-input-gaps');
    const player = sim.join('A') as any;
    const move = inputTick({ yaw: player.yaw, pitch: 0, moveZ: 1 });
    sim.pushInput(player.id, 1, Array.from({ length: 8 }, () => move));
    sim.pushInput(player.id, 9, [inputTick({ yaw: player.yaw, pitch: 0, fire: true })]);
    for (let i = 0; i < 3; i++) sim.step(STEP_DT);
    // New controls can arrive while a full queue is being drained, but a
    // later sequence cannot leapfrog the rejected fire at sequence 9.
    sim.pushInput(player.id, 12, [move, move, move]);
    expect(player.lastQueuedSeq).toBe(8);
    while (player.queued.length) sim.step(STEP_DT);
    sim.pushInput(player.id, 9, [inputTick({ yaw: player.yaw, pitch: 0, fire: true })]);
    sim.step(STEP_DT);
    expect(sim.takeEvents().filter((event) => event.t === 'shot')).toHaveLength(1);

    const before = { x: player.x, z: player.z };
    for (let i = 0; i < 60; i++) sim.step(STEP_DT);
    expect(Math.hypot(player.x - before.x, player.z - before.z)).toBeLessThan(1e-8);
    expect(sim.takeEvents().filter((event) => event.t === 'shot')).toHaveLength(0);
  });

  it('kill by a player who already left is no credit and no suicide', () => {
    const sim = new ArenaSim('arena-test-left-killer');
    const a = sim.join('A') as any;
    const b = sim.join('B') as any;
    sim.takeEvents();
    b.lastHitBy = { id: a.id, at: sim.time };
    b.hp = 1;
    b.protectUntil = 0;
    a.frags = 0;
    b.frags = 3;
    sim.leave(a.id);
    // Direct death: leftover credit window still points at A.
    (sim as any).handleDeath(b);
    expect(b.deaths).toBe(1);
    expect(b.frags).toBe(3);
    const frags = sim.takeEvents().filter((e: any) => e.t === 'frag');
    expect(frags.length).toBe(0);
  });

  it('determinism: same seed + join + input tape => same snapshot at 3s', () => {
    const seed = 'arena-determinism-1';
    const makeSim = () => {
      const sim = new ArenaSim(seed);
      const p1 = sim.join('P1') as any;
      const p2 = sim.join('P2') as any;
      sim.takeEvents();
      return { sim, p1, p2 };
    };

    const A = makeSim();
    const B = makeSim();

    const pairA = pickShootingPair(A.sim);
    const pairB = pickShootingPair(B.sim);

    // Force identical placements (deterministic given same seed).
    A.p1.x = pairA.shooter.x; A.p1.z = pairA.shooter.z;
    A.p2.x = pairA.victim.x; A.p2.z = pairA.victim.z;
    B.p1.x = pairB.shooter.x; B.p1.z = pairB.shooter.z;
    B.p2.x = pairB.victim.x; B.p2.z = pairB.victim.z;

    const yaw1A = yawToTarget({ x: A.p1.x, z: A.p1.z }, { x: A.p2.x, z: A.p2.z });
    const yaw1B = yawToTarget({ x: B.p1.x, z: B.p1.z }, { x: B.p2.x, z: B.p2.z });
    A.p1.yaw = yaw1A; A.p1.pitch = 0;
    B.p1.yaw = yaw1B; B.p1.pitch = 0;

    // Both sims get the same input tape batches: shooter fires every 0.3s.
    const ticks = Math.floor(3 / STEP_DT);
    for (let t = 0; t < ticks; t++) {
      // Client sends batches every 4 ticks.
      if (t % 4 === 0) {
        const batchStart = t;
        const batch: SimInput[] = [];
        for (let k = 0; k < 4 && batchStart + k < ticks; k++) {
          const fire = (batchStart + k) % Math.floor(0.3 / STEP_DT) === 0;
          batch.push(inputTick({ yaw: yaw1A, pitch: 0, moveX: 0, moveZ: 0, fire }));
        }
        A.sim.pushInput(A.p1.id, batchStart + 1, batch);
        // Remote player sends no movement/fire, but still sends yaw/pitch packets.
        const idleBatch: SimInput[] = batch.map(() => inputTick({ yaw: A.p2.yaw, pitch: 0, moveX: 0, moveZ: 0, fire: false }));
        A.sim.pushInput(A.p2.id, batchStart + 1, idleBatch);

        const batchB: SimInput[] = [];
        for (let k = 0; k < 4 && batchStart + k < ticks; k++) {
          const fire = (batchStart + k) % Math.floor(0.3 / STEP_DT) === 0;
          batchB.push(inputTick({ yaw: yaw1B, pitch: 0, moveX: 0, moveZ: 0, fire }));
        }
        B.sim.pushInput(B.p1.id, batchStart + 1, batchB);
        const idleBatchB: SimInput[] = batchB.map(() => inputTick({ yaw: B.p2.yaw, pitch: 0, moveX: 0, moveZ: 0, fire: false }));
        B.sim.pushInput(B.p2.id, batchStart + 1, idleBatchB);
      }
      A.sim.step(STEP_DT);
      B.sim.step(STEP_DT);
    }

    expect(JSON.stringify(A.sim.snapshot())).toBe(JSON.stringify(B.sim.snapshot()));
  });
});
