import { describe, it, expect } from 'vitest';
import { ArenaRoom, type RoomSocket, type TickScheduler } from '../../server/room';
import { decodeServer } from '../../src/net/protocol';
import { ARENA_GEN_VERSION } from '../../src/sim/arenaConstants';

class FakeSock implements RoomSocket {
  closed: { code?: number; reason?: string } | null = null;
  sent: string[] = [];
  send(text: string): void { this.sent.push(text); }
  close(code?: number, reason?: string): void { this.closed = { code, reason }; }
}

function scheduler(): TickScheduler & { fire: () => void } {
  let fn: (() => void) | null = null;
  return {
    start(f) { fn = f; },
    stop() { fn = null; },
    fire() { fn?.(); },
  };
}

describe('ArenaRoom', () => {
  it('first join creates a seed; second join shares it; 11th is full', () => {
    let now = 0;
    let seedN = 0;
    const sched = scheduler();
    const room = new ArenaRoom(() => now, () => `seed-${seedN++}`, sched);

    const a = new FakeSock();
    const b = new FakeSock();
    room.onOpen(a);
    room.onMessage(a, JSON.stringify({ v: 1, t: 'join', name: 'A' }));
    room.onOpen(b);
    room.onMessage(b, JSON.stringify({ v: 1, t: 'join', name: 'B' }));

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
      room.onMessage(s, JSON.stringify({ v: 1, t: 'join', name: `P${i}` }));
    }
    const overflow = new FakeSock();
    room.onOpen(overflow);
    room.onMessage(overflow, JSON.stringify({ v: 1, t: 'join', name: 'OVERFLOW' }));
    const last = decodeServer(overflow.sent[0]!);
    expect(typeof last === 'object' && last.t === 'full').toBe(true);
    expect(overflow.closed).toBeTruthy();
  });

  it('snapshots every 3rd tick and last close reseeds', () => {
    let now = 0;
    let seedN = 0;
    const sched = scheduler();
    const room = new ArenaRoom(() => now, () => `seed-${seedN++}`, sched);
    const a = new FakeSock();
    room.onOpen(a);
    room.onMessage(a, JSON.stringify({ v: 1, t: 'join', name: 'A' }));
    const welcome = decodeServer(a.sent[0]!);
    if (typeof welcome !== 'object' || welcome.t !== 'welcome') throw new Error('no welcome');
    const seed1 = welcome.seed;

    a.sent.length = 0;
    for (let i = 0; i < 6; i++) sched.fire();
    const snaps = a.sent.map((s) => decodeServer(s)).filter((m) => typeof m === 'object' && m.t === 'snap');
    expect(snaps.length).toBe(2);

    room.onClose(a);
    expect(room.sim).toBeNull();

    const b = new FakeSock();
    room.onOpen(b);
    room.onMessage(b, JSON.stringify({ v: 1, t: 'join', name: 'B' }));
    const w2 = decodeServer(b.sent[0]!);
    if (typeof w2 !== 'object' || w2.t !== 'welcome') throw new Error('no welcome 2');
    expect(w2.seed).not.toBe(seed1);
  });

  it('oversized / flooding socket is dropped after three violations', () => {
    let now = 0;
    const sched = scheduler();
    const room = new ArenaRoom(() => now, () => 'seed-x', sched);
    const a = new FakeSock();
    room.onOpen(a);
    room.onMessage(a, JSON.stringify({ v: 1, t: 'join', name: 'A' }));
    a.sent.length = 0;
    const big = 'x'.repeat(3000);
    room.onMessage(a, big);
    room.onMessage(a, big);
    room.onMessage(a, big);
    const kicked = a.sent.map((s) => decodeServer(s)).find((m) => typeof m === 'object' && m.t === 'kicked');
    expect(kicked).toBeTruthy();
    expect(a.closed).toBeTruthy();
  });
});
