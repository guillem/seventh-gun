import { describe, it, expect } from 'vitest';
import { Sim, emptyInput } from '../../src/sim/sim';

function hashState(sim: Sim): string {
  const payload = {
    player: { x: sim.player.x, z: sim.player.z, hp: sim.player.hp, gun: sim.player.gun },
    enemies: sim.enemies.map((e) => ({ hp: e.hp, x: e.x, z: e.z, state: e.state })),
    projectiles: sim.projectiles.map((p) => ({ x: p.x, y: p.y, z: p.z, kind: p.kind })),
    pickups: sim.pickups.map((p) => p.taken),
    events: sim.takeEvents().map((e) => e.t),
  };
  let h = 5381;
  const s = JSON.stringify(payload);
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

describe('combat extraction golden', () => {
  it('scripted maze tape hashes stay stable', () => {
    const sim = new Sim('golden-1', 'normal');
    const hashes: string[] = [];
    for (let i = 0; i < 1800; i++) {
      const fire = i % 20 === 0;
      sim.step({
        ...emptyInput(),
        moveZ: 1,
        yaw: i * 0.01,
        pitch: 0,
        fire,
        switchGun: i % 300 === 0 ? ((i / 300) % 7) + 1 : null,
      });
      if (i % 60 === 59) hashes.push(hashState(sim));
    }
    expect(hashes.length).toBe(30);
    // Recorded after combat extraction (see PR note: pre-extraction golden
    // was not committed separately). Lock these so future edits cannot drift.
    expect(hashes).toMatchInlineSnapshot(`
      [
        "130a320c",
        "ea450675",
        "ba0c10e0",
        "f40b3095",
        "3d16fdeb",
        "1de78df3",
        "8dff1451",
        "1dce603b",
        "d51d10fc",
        "1aa59599",
        "bf7b6c53",
        "c9c8379c",
        "a7eae54c",
        "a96d0dbe",
        "3bf199da",
        "a24248f4",
        "1d7199f5",
        "6f523da2",
        "22ebb90e",
        "22ebb90e",
        "22ebb90e",
        "22ebb90e",
        "22ebb90e",
        "22ebb90e",
        "22ebb90e",
        "22ebb90e",
        "22ebb90e",
        "22ebb90e",
        "22ebb90e",
        "22ebb90e",
      ]
    `);
  });
});
