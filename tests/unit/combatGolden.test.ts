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

function runTape(seed: string): string[] {
  const sim = new Sim(seed, 'normal');
  for (let g = 1; g <= 7; g++) sim.giveGun(g);
  const hashes: string[] = [];
  for (let i = 0; i < 1800; i++) {
    sim.player.hp = 100;
    sim.player.gun = (Math.floor(i / 240) % 7) + 1;
    sim.step({
      ...emptyInput(),
      moveZ: 1,
      moveX: i % 80 < 40 ? 1 : -1,
      yaw: i * 0.01,
      pitch: 0.3 * Math.sin(i * 0.02),
      fire: i % 12 === 0,
    });
    if (i % 60 === 59) hashes.push(hashState(sim));
  }
  return hashes;
}

describe('combat extraction golden', () => {
  it('owns all guns, pitched aim, 3 seeds — hashes stay stable', () => {
    // Recorded after accepting the projectile-spreadDir normalize (see DECISIONS.md).
    expect(runTape('golden-1')).toMatchInlineSnapshot(`
      [
        "6d7cf3ca",
        "bcc342cd",
        "de2d753c",
        "edd6a22f",
        "233e5dc5",
        "7b90cbce",
        "316b3d09",
        "44264968",
        "5b1a384d",
        "acb5c1c7",
        "237ac3e9",
        "29b1c3cb",
        "65203ce0",
        "34c36c31",
        "3c7e992f",
        "d5b8cf09",
        "1b2293b3",
        "f2854c90",
        "3e2facab",
        "b48edfa9",
        "ee0699ae",
        "1176e98a",
        "4cbbf71a",
        "329a52d4",
        "70828868",
        "41e4fc32",
        "75cbf6c6",
        "7044819d",
        "5d75085b",
        "e0af30ee",
      ]
    `);
    expect(runTape('golden-2')).toMatchInlineSnapshot(`
      [
        "6585e750",
        "f3c3e4a",
        "9113c656",
        "33d6e71",
        "1935050a",
        "278e4df2",
        "14f2c1b2",
        "8dc9826e",
        "bc44246",
        "375f8a4f",
        "17122d32",
        "10adfb5a",
        "74829632",
        "9c0f94e9",
        "d67dfa92",
        "f8171f3a",
        "309de7d5",
        "ca4c2e50",
        "261b7780",
        "834639e8",
        "3f874868",
        "c11d4cdf",
        "c978ed2d",
        "550aeb4d",
        "979baedb",
        "d1f91bb",
        "9201fa38",
        "bc07b623",
        "d6cba8fc",
        "a38d8d15",
      ]
    `);
    expect(runTape('golden-3')).toMatchInlineSnapshot(`
      [
        "7dcc820d",
        "985c01be",
        "4467c1d",
        "a769004e",
        "c724e6d9",
        "98f8602b",
        "277cff93",
        "81fb6dd4",
        "4b1ff3db",
        "c9ca7587",
        "bb71a5a4",
        "35f1979e",
        "82ee923d",
        "764564d3",
        "7659db5e",
        "d7545d0e",
        "4dbaf2e6",
        "8a94382e",
        "cc7430ea",
        "6ed5d158",
        "1e83e6aa",
        "f9660be5",
        "95744c86",
        "1ec25f04",
        "e3df5239",
        "29e0202",
        "a5b2f98e",
        "c0d9d1c3",
        "9c73a08c",
        "e5a89551",
      ]
    `);
  });
});
