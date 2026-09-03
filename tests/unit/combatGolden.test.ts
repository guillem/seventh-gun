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
        "e174aed5",
        "233e5dc5",
        "10a2e911",
        "9bb40307",
        "44264968",
        "5b1a384d",
        "76c5de87",
        "237ac3e9",
        "29b1c3cb",
        "65203ce0",
        "e46f51b1",
        "3c7e992f",
        "3ff77fd9",
        "e49683de",
        "df38be70",
        "a9c77cba",
        "b48edfa9",
        "19be1f08",
        "1176e98a",
        "5a7fa7d5",
        "329a52d4",
        "4c95dd10",
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
        "42f5037c",
        "8a5b4c9",
        "14f2c1b2",
        "8dc9826e",
        "bc44246",
        "372ab66",
        "335ad476",
        "cef5a73a",
        "74829632",
        "1137b81d",
        "d67dfa92",
        "f8171f3a",
        "309de7d5",
        "71035b3c",
        "261b7780",
        "35e31011",
        "41b21601",
        "c11d4cdf",
        "53c8a1a3",
        "550aeb4d",
        "297d0719",
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
        "5dfd2d5e",
        "a7255734",
        "8e088c0c",
        "38934d5e",
        "b9103ce4",
        "35f1979e",
        "1e8a6e5a",
        "a52f44d2",
        "5005b098",
        "1db3b203",
        "4f255bfb",
        "8c72a79d",
        "a1967a90",
        "dc082793",
        "153b4551",
        "a303476c",
        "f9140bd3",
        "e3a1dfd2",
        "f6877262",
        "d1e6a1b2",
        "12bd4368",
        "77181c2b",
        "ce338cfd",
        "c54c0a28",
      ]
    `);
  });
});
