import { describe, it, expect } from 'vitest';
import { ArenaRoom, type RoomSocket, type TickScheduler } from '../../server/room';
import { decodeServer } from '../../src/net/protocol';
import { ARENA_GEN_VERSION } from '../../src/sim/arenaConstants';

class FakeSock implements RoomSocket {
  closed: { code?: number; reason?: string } | null = null;
  sent: string[] = [];
  failSend = false;
  send(text: string): void {
    if (this.failSend) throw new Error('peer gone');
    this.sent.push(text);
  }
  close(code?: number, reason?: string): void { this.closed = { code, reason }; }
}

function scheduler(now: () => number): TickScheduler & { fire: () => void; fireTimeouts: () => void } {
  let fn: (() => void) | null = null;
  const timeouts: { fn: () => void; at: number; cancelled: boolean }[] = [];
  return {
    start(f) { fn = f; },
    stop() { fn = null; },
    timeout(f, ms) {
      const item = { fn: f, at: now() + ms, cancelled: false };
      timeouts.push(item);
      return () => { item.cancelled = true; };
    },
    fire() { fn?.(); },
    fireTimeouts() {
      for (const t of timeouts) {
        if (!t.cancelled && now() >= t.at) {
          t.cancelled = true;
          t.fn();
        }
      }
    },
  };
}

describe('ArenaRoom', () => {
  it('first join creates a seed; second join shares it; 11th is full', () => {
    let now = 0;
    let seedN = 0;
    const sched = scheduler(() => now);
    const room = new ArenaRoom(() => now, () => `seed-${seedN++}`, sched);

    const a = new FakeSock();
    const b = new FakeSock();
    room.onOpen(a);
    room.onMessage(a, JSON.stringify({ v: 3, t: 'join', name: 'A' }));
    room.onOpen(b);
    room.onMessage(b, JSON.stringify({ v: 3, t: 'join', name: 'B' }));

    const wa = decodeServer(a.sent[0]!);
    const wb = decodeServer(b.sent[0]!);
    expect(wa).not.toBe('invalid');
    if (typeof wa === 'object' && wa.t === 'welcome' && typeof wb === 'object' && wb.t === 'welcome') {
      expect(wa.seed).toBe(wb.seed);
      expect(wa.genVersion).toBe(ARENA_GEN_VERSION);
      expect(typeof wa.gridHash).toBe('number');
      expect(wb.snapshot.players.length).toBe(2);
    } else {
      throw new Error('expected welcome');
    }

    const extras: FakeSock[] = [];
    for (let i = 0; i < 8; i++) {
      const s = new FakeSock();
      extras.push(s);
      room.onOpen(s);
      room.onMessage(s, JSON.stringify({ v: 3, t: 'join', name: `P${i}` }));
    }
    const overflow = new FakeSock();
    room.onOpen(overflow);
    room.onMessage(overflow, JSON.stringify({ v: 3, t: 'join', name: 'OVERFLOW' }));
    const last = decodeServer(overflow.sent[0]!);
    expect(typeof last === 'object' && last.t === 'full').toBe(true);
    expect(overflow.closed).toBeTruthy();
  });

  it('snapshots every 3rd tick and last close reseeds', () => {
    let now = 0;
    let seedN = 0;
    const sched = scheduler(() => now);
    const room = new ArenaRoom(() => now, () => `seed-${seedN++}`, sched);
    const a = new FakeSock();
    room.onOpen(a);
    room.onMessage(a, JSON.stringify({ v: 3, t: 'join', name: 'A' }));
    const welcome = decodeServer(a.sent[0]!);
    if (typeof welcome !== 'object' || welcome.t !== 'welcome') throw new Error('no welcome');
    const seed1 = welcome.seed;

    a.sent.length = 0;
    for (let i = 0; i < 6; i++) {
      now += 1000 / 60;
      sched.fire();
    }
    const snaps = a.sent.map((s) => decodeServer(s)).filter((m) => typeof m === 'object' && m.t === 'snap');
    expect(snaps.length).toBe(2);

    room.onClose(a);
    expect(room.sim).toBeNull();

    const b = new FakeSock();
    room.onOpen(b);
    room.onMessage(b, JSON.stringify({ v: 3, t: 'join', name: 'B' }));
    const w2 = decodeServer(b.sent[0]!);
    if (typeof w2 !== 'object' || w2.t !== 'welcome') throw new Error('no welcome 2');
    expect(w2.seed).not.toBe(seed1);
  });

  it('uses elapsed wall time with fixed steps and bounded catch-up', () => {
    let now = 0;
    const sched = scheduler(() => now);
    const room = new ArenaRoom(() => now, () => 'seed-clock', sched);
    const a = new FakeSock();
    room.onOpen(a);
    room.onMessage(a, JSON.stringify({ v: 3, t: 'join', name: 'A' }));

    now += 1000 / 120;
    sched.fire();
    expect(room.sim?.tick).toBe(0);
    now += 1000 / 120;
    sched.fire();
    expect(room.sim?.tick).toBe(1);

    now += (1000 / 60) * 3.2;
    sched.fire();
    expect(room.sim?.tick).toBe(4);

    now += 1000;
    sched.fire();
    expect(room.sim?.tick).toBe(9);
    expect(room.sim?.time).toBeCloseTo(9 / 60, 10);
  });

  it('does not skip a 20 Hz snapshot boundary after delayed callbacks', () => {
    let now = 0;
    const sched = scheduler(() => now);
    const room = new ArenaRoom(() => now, () => 'seed-snap-clock', sched);
    const a = new FakeSock();
    room.onOpen(a);
    room.onMessage(a, JSON.stringify({ v: 3, t: 'join', name: 'A' }));
    a.sent.length = 0;

    // Callbacks that each cover two ticks land on 2, 4, and 6. The callbacks
    // at 4 and 6 both crossed distinct 20 Hz boundaries (3 and 6).
    for (let i = 0; i < 3; i++) {
      now += (1000 / 60) * 2;
      sched.fire();
    }
    const snaps = a.sent.map((text) => decodeServer(text)).filter((message) => typeof message === 'object' && message.t === 'snap');
    expect(snaps).toHaveLength(2);
    expect(snaps.map((message) => (message as { snapshot: { tick: number } }).snapshot.tick)).toEqual([4, 6]);
  });

  it('oversized / flooding socket is dropped after three violations', () => {
    let now = 0;
    const sched = scheduler(() => now);
    const room = new ArenaRoom(() => now, () => 'seed-x', sched);
    const a = new FakeSock();
    room.onOpen(a);
    room.onMessage(a, JSON.stringify({ v: 3, t: 'join', name: 'A' }));
    a.sent.length = 0;
    const big = 'x'.repeat(9000);
    room.onMessage(a, big);
    room.onMessage(a, big);
    room.onMessage(a, big);
    const kicked = a.sent.map((s) => decodeServer(s)).find((m) => typeof m === 'object' && m.t === 'kicked');
    expect(kicked).toBeTruthy();
    expect(a.closed).toBeTruthy();
  });

  it('last player idle-closed inside tick does not throw', () => {
    let now = 0;
    const sched = scheduler(() => now);
    const room = new ArenaRoom(() => now, () => 'seed-idle', sched);
    const a = new FakeSock();
    room.onOpen(a);
    room.onMessage(a, JSON.stringify({ v: 3, t: 'join', name: 'A' }));
    now += 16_000;
    expect(() => sched.fire()).not.toThrow();
    expect(room.sim).toBeNull();
  });

  it('socket that never joins an empty room is closed after 15s', () => {
    let now = 0;
    const sched = scheduler(() => now);
    const room = new ArenaRoom(() => now, () => 'seed-empty', sched);
    const a = new FakeSock();
    room.onOpen(a);
    expect(room.sim).toBeNull();
    now += 16_000;
    sched.fireTimeouts();
    expect(a.closed).toBeTruthy();
  });

  it('never-joined socket on an occupied room is closed after 15s', () => {
    let now = 0;
    const sched = scheduler(() => now);
    const room = new ArenaRoom(() => now, () => 'seed-occ', sched);
    const a = new FakeSock();
    room.onOpen(a);
    room.onMessage(a, JSON.stringify({ v: 3, t: 'join', name: 'A' }));
    const b = new FakeSock();
    room.onOpen(b);
    now += 16_000;
    sched.fireTimeouts();
    expect(b.closed).toBeTruthy();
    expect(room.sim).not.toBeNull();
  });

  it('duplicate JOIN from one socket does not create a ghost player', () => {
    let now = 0;
    const sched = scheduler(() => now);
    const room = new ArenaRoom(() => now, () => 'seed-dup', sched);
    const a = new FakeSock();
    room.onOpen(a);
    room.onMessage(a, JSON.stringify({ v: 3, t: 'join', name: 'A' }));
    room.onMessage(a, JSON.stringify({ v: 3, t: 'join', name: 'A' }));
    expect(room.playerCount).toBe(1);
    room.onClose(a);
    expect(room.playerCount).toBe(0);
  });

  it('pending joins survive last-player shutdown and can start the next room', () => {
    let now = 0;
    const sched = scheduler(() => now);
    const room = new ArenaRoom(() => now, () => 'seed-shut', sched);
    const a = new FakeSock();
    const b = new FakeSock();
    room.onOpen(a);
    room.onMessage(a, JSON.stringify({ v: 3, t: 'join', name: 'A' }));
    room.onOpen(b);
    room.onClose(a);
    expect(room.sim).toBeNull();
    expect(b.closed).toBeNull();
    room.onMessage(b, JSON.stringify({ v: 3, t: 'join', name: 'B' }));
    expect(room.playerCount).toBe(1);
  });

  it('last-player close during a tick is safe with a pending socket in the copied list', () => {
    let now = 0;
    const sched = scheduler(() => now);
    const room = new ArenaRoom(() => now, () => 'seed-tick', sched);
    const a = new FakeSock();
    const b = new FakeSock();
    room.onOpen(a);
    room.onMessage(a, JSON.stringify({ v: 3, t: 'join', name: 'A' }));
    room.onOpen(b);
    now += 16_000;
    expect(() => sched.fire()).not.toThrow();
    expect(room.sim).toBeNull();
    expect(b.closed).toBeNull();
  });

  it('a failed event send to the final player safely stops the room', () => {
    const sched = scheduler(() => 0);
    const room = new ArenaRoom(() => 0, () => 'seed-final-send', sched);
    const a = new FakeSock();
    room.onOpen(a);
    room.onMessage(a, JSON.stringify({ v: 3, t: 'join', name: 'A' }));
    // Joining queues a spawn event; its broadcast must handle final teardown.
    a.failSend = true;
    expect(() => sched.fire()).not.toThrow();
    expect(a.closed).toBeTruthy();
    expect(room.sim).toBeNull();
    expect(() => sched.fire()).not.toThrow();
  });

  it('a failed send only removes that socket and does not crash the tick', () => {
    let now = 0;
    const sched = scheduler(() => now);
    const room = new ArenaRoom(() => now, () => 'seed-send', sched);
    const a = new FakeSock();
    const b = new FakeSock();
    room.onOpen(a);
    room.onMessage(a, JSON.stringify({ v: 3, t: 'join', name: 'A' }));
    room.onOpen(b);
    room.onMessage(b, JSON.stringify({ v: 3, t: 'join', name: 'B' }));
    a.failSend = true;
    expect(() => {
      for (let i = 0; i < 3; i++) sched.fire();
    }).not.toThrow();
    expect(a.closed).toBeTruthy();
    expect(room.playerCount).toBe(1);
  });
});
