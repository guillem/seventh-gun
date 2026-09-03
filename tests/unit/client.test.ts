import { describe, it, expect } from 'vitest';
import { ArenaClient, type ArenaNetSocket } from '../../src/net/client';
import { encode, type ServerMessage } from '../../src/net/protocol';
import { generateArena, arenaGridHash } from '../../src/sim/arenagen';
import { ARENA_GEN_VERSION } from '../../src/sim/arenaConstants';
import { emptyInput, STEP_DT } from '../../src/sim/sim';
import type { ArenaSnapshot } from '../../src/sim/arena';

class FakeSock implements ArenaNetSocket {
  sent: string[] = [];
  private msg: ((ev: { data: string }) => void) | null = null;
  private cls: ((ev: { code: number; reason: string }) => void) | null = null;
  send(data: string): void { this.sent.push(data); }
  close(): void { this.cls?.({ code: 1000, reason: 'closed' }); }
  addEventListener(type: 'message' | 'close' | 'error' | 'open', fn: (ev: never) => void): void {
    if (type === 'message') this.msg = fn as (ev: { data: string }) => void;
    if (type === 'close') this.cls = fn as (ev: { code: number; reason: string }) => void;
    if (type === 'open') queueMicrotask(() => (fn as () => void)());
  }
  push(msg: ServerMessage): void { this.msg?.({ data: encode(msg) }); }
}

function snap(partial: Partial<ArenaSnapshot> & { players: ArenaSnapshot['players'] }): ArenaSnapshot {
  return { tick: 0, projectiles: [], pickups: [], ...partial };
}

describe('ArenaClient', () => {
  it('welcome connects', async () => {
    const sock = new FakeSock();
    const client = new ArenaClient(() => sock);
    const map = generateArena('c1');
    const p = client.connect('ws://x/arena', 'TEST');
    sock.push({
      v: 1, t: 'welcome', id: 0, seed: 'c1', genVersion: ARENA_GEN_VERSION,
      gridHash: arenaGridHash(map.grid, map.pickups), tick: 0,
      snapshot: snap({
        players: [{
          id: 0, name: 'TEST', colorIndex: 0, x: 10, z: 10, yaw: 0, pitch: 0,
          hp: 100, gun: 1, ownedMask: 1, alive: true, protect: 2, frags: 0, deaths: 0,
          lastSeq: 0, ammo: { bullets: 70, shells: 0, nails: 0, grenades: 0, cores: 0, void: 0 },
        }],
      }),
    });
    await p;
    expect(client.connected).toBe(true);
    expect(client.id).toBe(0);
  });

  it('prediction replays un-acked inputs after a snapshot', async () => {
    const sock = new FakeSock();
    const client = new ArenaClient(() => sock);
    const map = generateArena('c2');
    const p = client.connect('ws://x/arena', 'A');
    const start = map.playerStart;
    const base = {
      id: 0, name: 'A', colorIndex: 0, x: start.x, z: start.z, yaw: 0, pitch: 0,
      hp: 100, gun: 1, ownedMask: 1, alive: true, protect: 0, frags: 0, deaths: 0,
      lastSeq: 0, ammo: { bullets: 70, shells: 0, nails: 0, grenades: 0, cores: 0, void: 0 },
    };
    sock.push({
      v: 1, t: 'welcome', id: 0, seed: 'c2', genVersion: ARENA_GEN_VERSION,
      gridHash: arenaGridHash(map.grid, map.pickups), tick: 0,
      snapshot: snap({ players: [base] }),
    });
    await p;
    const inp = { ...emptyInput(), yaw: 0, pitch: 0, moveZ: 1 };
    for (let i = 0; i < 8; i++) client.stepLocal(STEP_DT, inp);
    const before = client.worldView()!.player;
    client.ingestSnapshot(snap({
      tick: 8,
      players: [{ ...base, lastSeq: 2 }],
    }));
    const after = client.worldView()!.player;
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(8);
    expect(Math.hypot(after.x - start.x, after.z - start.z)).toBeGreaterThan(0.01);
  });

  it('interpolation returns a pose between two snapshots at 100ms', async () => {
    const sock = new FakeSock();
    const client = new ArenaClient(() => sock);
    const map = generateArena('c3');
    const p = client.connect('ws://x/arena', 'A');
    const mk = (x: number, z: number) => ({
      id: 1, name: 'B', colorIndex: 1, x, z, yaw: 0, pitch: 0,
      hp: 100, gun: 1, ownedMask: 1, alive: true, protect: 0, frags: 0, deaths: 0,
      lastSeq: 0, ammo: { bullets: 70, shells: 0, nails: 0, grenades: 0, cores: 0, void: 0 },
    });
    const self = {
      id: 0, name: 'A', colorIndex: 0, x: 10, z: 10, yaw: 0, pitch: 0,
      hp: 100, gun: 1, ownedMask: 1, alive: true, protect: 0, frags: 0, deaths: 0,
      lastSeq: 0, ammo: { bullets: 70, shells: 0, nails: 0, grenades: 0, cores: 0, void: 0 },
    };
    sock.push({
      v: 1, t: 'welcome', id: 0, seed: 'c3', genVersion: ARENA_GEN_VERSION,
      gridHash: arenaGridHash(map.grid, map.pickups), tick: 0,
      snapshot: snap({ players: [self, mk(0, 0)] }),
    });
    await p;
    client.ingestSnapshot(snap({ players: [self, mk(0, 0)] }), 1000);
    client.ingestSnapshot(snap({ players: [self, mk(10, 0)] }), 1100);
    const mid = client.interpolateAt(1150);
    const other = mid?.players.find((pl) => pl.id === 1);
    expect(other?.x).toBeGreaterThan(0);
    expect(other?.x).toBeLessThan(10);
  });
});
