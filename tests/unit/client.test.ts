import { describe, it, expect } from 'vitest';
import { ArenaClient, type ArenaNetSocket } from '../../src/net/client';
import { encode, type ServerMessage } from '../../src/net/protocol';
import { generateArena, arenaGridHash } from '../../src/sim/arenagen';
import { ARENA_GEN_VERSION } from '../../src/sim/arenaConstants';
import { emptyInput, STEP_DT } from '../../src/sim/sim';
import { ArenaSim, type ArenaSnapshot } from '../../src/sim/arena';

class FakeSock implements ArenaNetSocket {
  sent: string[] = [];
  onSend: ((data: string) => void) | null = null;
  private msg: ((ev: { data: string }) => void) | null = null;
  private cls: ((ev: { code: number; reason: string }) => void) | null = null;
  send(data: string): void { this.sent.push(data); this.onSend?.(data); }
  close(): void { this.cls?.({ code: 1000, reason: 'closed' }); }
  addEventListener(type: 'message' | 'close' | 'error' | 'open', fn: (ev: never) => void): void {
    if (type === 'message') this.msg = fn as (ev: { data: string }) => void;
    if (type === 'close') this.cls = fn as (ev: { code: number; reason: string }) => void;
    if (type === 'open') queueMicrotask(() => (fn as () => void)());
  }
  push(msg: ServerMessage): void { this.msg?.({ data: encode(msg) }); }
}

class SilentSock implements ArenaNetSocket {
  close(): void { /* deliberately never reports close */ }
  send(): void { /* deliberately never opens */ }
  addEventListener(): void { /* deliberately silent */ }
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

  it('rejects malformed server payloads before using them', async () => {
    const sock = new FakeSock();
    const client = new ArenaClient(() => sock);
    const pending = client.connect('ws://x/arena', 'TEST');
    sock.push({ v: 1, t: 'welcome' } as unknown as ServerMessage);
    await expect(pending).rejects.toBe('offline');
    expect(client.connected).toBe(false);
  });

  it('can cancel a pending connect and times out a silent endpoint', async () => {
    const cancelling = new ArenaClient(() => new SilentSock());
    const pending = cancelling.connect('ws://x/arena', 'TEST', 1000);
    cancelling.close();
    await expect(pending).rejects.toBe('offline');

    const timedOut = new ArenaClient(() => new SilentSock());
    await expect(timedOut.connect('ws://x/arena', 'TEST', 1)).rejects.toBe('offline');
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

  it('close() does not fire onClose (intentional leave)', async () => {
    const sock = new FakeSock();
    const client = new ArenaClient(() => sock);
    const map = generateArena('c4');
    const p = client.connect('ws://x/arena', 'A');
    sock.push({
      v: 1, t: 'welcome', id: 0, seed: 'c4', genVersion: ARENA_GEN_VERSION,
      gridHash: arenaGridHash(map.grid, map.pickups), tick: 0,
      snapshot: snap({
        players: [{
          id: 0, name: 'A', colorIndex: 0, x: 10, z: 10, yaw: 0, pitch: 0,
          hp: 100, gun: 1, ownedMask: 1, alive: true, protect: 2, frags: 0, deaths: 0,
          lastSeq: 0, ammo: { bullets: 70, shells: 0, nails: 0, grenades: 0, cores: 0, void: 0 },
        }],
      }),
    });
    await p;
    let closed = false;
    client.onClose = () => { closed = true; };
    client.close();
    expect(closed).toBe(false);
  });

  it('100ms RTT walk: server pose matches prediction after settle', async () => {
    const sim = new ArenaSim('rtt-walk');
    const player = sim.join('A');
    if (player === 'full') throw new Error('full');
    const sock = new FakeSock();
    const client = new ArenaClient(() => sock);
    const welcomeP = client.connect('ws://x/arena', 'A');
    sock.push({
      v: 1, t: 'welcome', id: player.id, seed: 'rtt-walk', genVersion: ARENA_GEN_VERSION,
      gridHash: arenaGridHash(sim.map.grid, sim.map.pickups), tick: sim.tick,
      snapshot: sim.snapshot(),
    });
    await welcomeP;

    const oneWay = 0.05;
    let clock = 0;
    type Due = { at: number; run: () => void };
    const delayed: Due[] = [];
    const flushDue = () => {
      const keep: Due[] = [];
      for (const d of delayed) {
        if (clock >= d.at) d.run();
        else keep.push(d);
      }
      delayed.length = 0;
      delayed.push(...keep);
    };

    sock.onSend = (data) => {
      const msg = JSON.parse(data) as { t?: string; seq?: number; inputs?: ReturnType<typeof emptyInput>[] };
      if (msg.t !== 'input' || msg.seq == null || !msg.inputs) return;
      delayed.push({
        at: clock + oneWay,
        run: () => sim.pushInput(player.id, msg.seq!, msg.inputs!),
      });
    };

    const yaw = player.yaw;
    const walk = { ...emptyInput(), moveZ: 1, yaw, pitch: 0 };
    const ticks = Math.round(2 / STEP_DT);
    for (let i = 0; i < ticks; i++) {
      clock += STEP_DT;
      client.stepLocal(STEP_DT, walk);
      flushDue();
      sim.step(STEP_DT);
      if (sim.tick % 3 === 0) {
        const snapNow = sim.snapshot();
        delayed.push({
          at: clock + oneWay,
          run: () => client.ingestSnapshot(snapNow),
        });
      }
    }
    const idle = { ...emptyInput(), yaw, pitch: 0 };
    for (let i = 0; i < Math.round(0.35 / STEP_DT); i++) {
      clock += STEP_DT;
      client.stepLocal(STEP_DT, idle);
      flushDue();
      sim.step(STEP_DT);
      if (sim.tick % 3 === 0) client.ingestSnapshot(sim.snapshot());
    }
    flushDue();
    while (player.queued.length) sim.step(STEP_DT);
    client.ingestSnapshot(sim.snapshot());
    const view = client.worldView()!.player;
    expect(Math.hypot(view.x - player.x, view.z - player.z)).toBeLessThan(0.05);
    expect(client.pendingCount()).toBeLessThanOrEqual(0.1 / STEP_DT + 4);
  });

  it('does not replay lockout movement from the respawn cell', async () => {
    const sock = new FakeSock();
    const client = new ArenaClient(() => sock);
    const map = generateArena('c-respawn');
    const p = client.connect('ws://x/arena', 'A');
    const base = {
      id: 0, name: 'A', colorIndex: 0, x: 20, z: 20, yaw: 0, pitch: 0,
      hp: 100, gun: 1, ownedMask: 1, alive: true, protect: 0, frags: 0, deaths: 0,
      lastSeq: 10, ammo: { bullets: 70, shells: 0, nails: 0, grenades: 0, cores: 0, void: 0 },
    };
    sock.push({
      v: 1, t: 'welcome', id: 0, seed: 'c-respawn', genVersion: ARENA_GEN_VERSION,
      gridHash: arenaGridHash(map.grid, map.pickups), tick: 0,
      snapshot: snap({ players: [base] }),
    });
    await p;
    client.ingestSnapshot(snap({ players: [{ ...base, alive: false, hp: 0 }] }));
    const walk = { ...emptyInput(), moveZ: 1, yaw: 0, pitch: 0 };
    for (let i = 0; i < Math.round(2.05 / STEP_DT); i++) client.stepLocal(STEP_DT, walk);
    expect(client.pendingCount()).toBe(0);
    client.ingestSnapshot(snap({ players: [{ ...base, x: 40, z: 40, lastSeq: 10 }] }));
    const view = client.worldView()!.player;
    expect(Math.hypot(view.x - 40, view.z - 40)).toBeLessThan(0.05);
  });

  it('cosmetic shot stays silent when empty or dead', async () => {
    const sock = new FakeSock();
    const client = new ArenaClient(() => sock);
    const map = generateArena('c-dry');
    const p = client.connect('ws://x/arena', 'A');
    const base = {
      id: 0, name: 'A', colorIndex: 0, x: 10, z: 10, yaw: 0, pitch: 0,
      hp: 100, gun: 1, ownedMask: 1, alive: true, protect: 0, frags: 0, deaths: 0,
      lastSeq: 0, ammo: { bullets: 70, shells: 0, nails: 0, grenades: 0, cores: 0, void: 0 },
    };
    sock.push({
      v: 1, t: 'welcome', id: 0, seed: 'c-dry', genVersion: ARENA_GEN_VERSION,
      gridHash: arenaGridHash(map.grid, map.pickups), tick: 0,
      snapshot: snap({ players: [base] }),
    });
    await p;
    client.ingestSnapshot(snap({
      players: [{ ...base, ammo: { ...base.ammo, bullets: 0 } }],
    }));
    client.stepLocal(STEP_DT, { ...emptyInput(), fire: true });
    expect(client.takeCosmeticShot()).toBeNull();
  });
});
