import { describe, it, expect } from 'vitest';
import { ArenaClient, type ArenaNetSocket } from '../../src/net/client';
import { encode, type ServerMessage } from '../../src/net/protocol';
import { generateArena, arenaGridHash } from '../../src/sim/arenagen';
import { ARENA_GEN_VERSION } from '../../src/sim/arenaConstants';
import { emptyInput, STEP_DT } from '../../src/sim/sim';
import { ArenaSim, type ArenaSnapshot } from '../../src/sim/arena';
import { ArenaRoom, type RoomSocket, type TickScheduler } from '../../server/room';
import { MAX_ARENA_MESSAGE_BYTES } from '../../src/net/protocol';

class FakeSock implements ArenaNetSocket {
  sent: string[] = [];
  onSend: ((data: string) => void) | null = null;
  failSend = false;
  private msg: ((ev: { data: string }) => void) | null = null;
  private cls: ((ev: { code: number; reason: string }) => void) | null = null;
  send(data: string): void {
    if (this.failSend) throw new Error('send failed');
    this.sent.push(data);
    this.onSend?.(data);
  }
  close(): void { this.cls?.({ code: 1000, reason: 'closed' }); }
  disconnect(code: number, reason: string): void { this.cls?.({ code, reason }); }
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

type TestPlayer = Omit<ArenaSnapshot['players'][number], 'spawnCount'> & { spawnCount?: number };
function snap(partial: Omit<Partial<ArenaSnapshot>, 'players'> & { players: TestPlayer[] }): ArenaSnapshot {
  return { tick: 0, projectiles: [], pickups: [], ...partial, players: partial.players.map((player) => ({ ...player, spawnCount: player.spawnCount ?? 1 })) };
}

describe('ArenaClient', () => {
  it('welcome connects', async () => {
    const sock = new FakeSock();
    const client = new ArenaClient(() => sock);
    const map = generateArena('c1');
    const p = client.connect('ws://x/arena', 'TEST');
    const player = {
      id: 0, name: 'TEST', colorIndex: 0, x: 10, z: 10, yaw: 0, pitch: 0,
      hp: 100, gun: 1, ownedMask: 1, alive: true, protect: 2, frags: 0, deaths: 0,
      lastSeq: 0, ammo: { bullets: 70, shells: 0, nails: 0, grenades: 0, cores: 0, void: 0 },
    };
    sock.push({
      v: 3, t: 'welcome', id: 0, seed: 'c1', genVersion: ARENA_GEN_VERSION,
      gridHash: arenaGridHash(map.grid, map.pickups), tick: 0,
      snapshot: snap({ players: [player] }),
    });
    await p;
    expect(client.connected).toBe(true);
    expect(client.id).toBe(0);

    // These arrive through the socket listener after welcome, not through the
    // direct test helper. They must continue to drive the live client.
    sock.push({ v: 3, t: 'snap', snapshot: snap({ tick: 3, players: [{ ...player, x: 12 }] }) });
    sock.push({ v: 3, t: 'events', es: [{ t: 'playerSpawn', id: 0 }] });
    expect(client.tick).toBe(3);
    expect(client.takeEvents()).toEqual([{ t: 'playerSpawn', id: 0 }]);
  });

  it('rejects malformed server payloads before using them', async () => {
    const sock = new FakeSock();
    const client = new ArenaClient(() => sock);
    const pending = client.connect('ws://x/arena', 'TEST');
    sock.push({ v: 3, t: 'welcome' } as unknown as ServerMessage);
    await expect(pending).rejects.toBe('offline');
    expect(client.connected).toBe(false);
  });

  it('reports an incompatible deployed protocol without waiting for timeout', async () => {
    const sock = new FakeSock();
    const client = new ArenaClient(() => sock);
    const pending = client.connect('ws://x/arena', 'TEST');
    sock.push({ v: 1, t: 'full' } as unknown as ServerMessage);
    await expect(pending).rejects.toBe('protocol');
  });

  it('maps an old server closing pre-welcome with protocol reason to update required', async () => {
    const sock = new FakeSock();
    const client = new ArenaClient(() => sock);
    const pending = client.connect('ws://x/arena', 'TEST');
    sock.disconnect(4000, 'protocol');
    await expect(pending).rejects.toBe('protocol');
  });

  it('can cancel a pending connect and times out a silent endpoint', async () => {
    const cancelling = new ArenaClient(() => new SilentSock());
    const pending = cancelling.connect('ws://x/arena', 'TEST', 1000);
    cancelling.close();
    await expect(pending).rejects.toBe('offline');

    const timedOut = new ArenaClient(() => new SilentSock());
    await expect(timedOut.connect('ws://x/arena', 'TEST', 1)).rejects.toBe('offline');
  });

  it('notifies onClose once when a connected transport send throws', async () => {
    const sock = new FakeSock();
    const client = new ArenaClient(() => sock);
    const map = generateArena('c-send');
    const pending = client.connect('ws://x/arena', 'A');
    const player = {
      id: 0, name: 'A', colorIndex: 0, x: 10, z: 10, yaw: 0, pitch: 0,
      hp: 100, gun: 1, ownedMask: 1, alive: true, protect: 0, frags: 0, deaths: 0,
      lastSeq: 0, ammo: { bullets: 70, shells: 0, nails: 0, grenades: 0, cores: 0, void: 0 },
    };
    sock.push({
      v: 3, t: 'welcome', id: 0, seed: 'c-send', genVersion: ARENA_GEN_VERSION,
      gridHash: arenaGridHash(map.grid, map.pickups), tick: 0, snapshot: snap({ players: [player] }),
    });
    await pending;
    const reasons: string[] = [];
    client.onClose = (reason) => reasons.push(reason);
    sock.failSend = true;
    client.stepLocal(5, emptyInput());
    expect(reasons).toEqual(['disconnected']);
    expect(client.connected).toBe(false);
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
      v: 3, t: 'welcome', id: 0, seed: 'c2', genVersion: ARENA_GEN_VERSION,
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

  it('resends the oldest unacknowledged frames after a full server queue drains', async () => {
    const sim = new ArenaSim('client-resend-overflow');
    const player = sim.join('A');
    if (player === 'full') throw new Error('full');
    const sock = new FakeSock();
    const client = new ArenaClient(() => sock);
    const welcome = client.connect('ws://x/arena', 'A');
    sock.push({
      v: 3, t: 'welcome', id: player.id, seed: 'client-resend-overflow', genVersion: ARENA_GEN_VERSION,
      gridHash: arenaGridHash(sim.map.grid, sim.map.pickups), tick: sim.tick, snapshot: sim.snapshot(),
    });
    await welcome;
    const sentStarts: number[] = [];
    sock.onSend = (data) => {
      const message = JSON.parse(data) as { t?: string; spawnCount?: number; seq?: number; inputs?: ReturnType<typeof emptyInput>[] };
      if (message.t === 'input' && message.seq != null && message.inputs) {
        sentStarts.push(message.seq);
        sim.pushInput(player.id, message.spawnCount!, message.seq, message.inputs);
      }
    };
    const walk = { ...emptyInput(), moveZ: 1, yaw: player.yaw, pitch: 0 };
    for (let i = 0; i < 16; i++) client.stepLocal(STEP_DT, walk);
    expect(player.queued.length).toBe(8);
    expect(player.lastQueuedSeq).toBe(8);
    // Fresh frames 9..16 were generated while the queue was full, but the
    // wire retries the oldest unacknowledged prefix instead of skipping it.
    expect(sentStarts.slice(0, 3)).toEqual([1, 1, 1]);

    for (let i = 0; i < 8; i++) sim.step(STEP_DT);
    client.ingestSnapshot(sim.snapshot());
    expect(client.pendingCount()).toBeGreaterThan(0);
    (client as unknown as { flushInputs: () => void }).flushInputs();
    expect(sentStarts.at(-1)).toBe(9);
    expect(player.queuedSeqs).toContain(9);
    expect(player.queuedSeqs).toContain(12);
  });

  it('does not let delayed old-life client controls cross an unseen death and respawn', async () => {
    const sim = new ArenaSim('client-life-gap');
    const player = sim.join('A');
    if (player === 'full') throw new Error('full');
    const sock = new FakeSock();
    let clock = 0;
    const client = new ArenaClient(() => sock, () => clock);
    const welcome = client.connect('ws://x/arena', 'A');
    sock.push({ v: 3, t: 'welcome', id: player.id, seed: 'client-life-gap', genVersion: ARENA_GEN_VERSION, gridHash: arenaGridHash(sim.map.grid, sim.map.pickups), tick: sim.tick, snapshot: sim.snapshot() });
    await welcome;

    const delayed: { spawnCount: number; seq: number; inputs: ReturnType<typeof emptyInput>[] }[] = [];
    sock.onSend = (text) => {
      const message = JSON.parse(text) as { t?: string; spawnCount?: number; seq?: number; inputs?: ReturnType<typeof emptyInput>[] };
      if (message.t === 'input' && message.spawnCount != null && message.seq != null && message.inputs) delayed.push({ spawnCount: message.spawnCount, seq: message.seq, inputs: message.inputs });
    };
    for (let i = 0; i < 12; i++) { clock += STEP_DT * 1000; client.stepLocal(STEP_DT, { ...emptyInput(), moveZ: 1 }); }
    // Deliver enough first-life traffic to fill the server queue, while the
    // client has already generated twelve predicted frames.
    for (const message of delayed.slice(0, 2)) sim.pushInput(player.id, message.spawnCount, message.seq, message.inputs);
    expect(player.queued).toHaveLength(8);
    expect(client.pendingCount()).toBeGreaterThanOrEqual(8);

    const oldEpoch = player.spawnCount;
    (sim as any).handleDeath(player);
    for (const message of delayed) sim.pushInput(player.id, message.spawnCount, message.seq, message.inputs);
    for (let i = 0; i < Math.ceil(2 / STEP_DT) + 1; i++) sim.step(STEP_DT);
    expect(player.spawnCount).toBe(oldEpoch + 1);
    for (const message of delayed) sim.pushInput(player.id, message.spawnCount, message.seq, message.inputs);
    expect(player.queued).toHaveLength(0);

    // The client never receives a dead snapshot; the first authoritative
    // update it sees is the new epoch via the actual socket message path.
    player.owned[2] = true;
    player.ammo.shells = 2;
    sock.push({ v: 3, t: 'snap', snapshot: sim.snapshot() });
    expect(client.pendingCount()).toBe(0);
    delayed.length = 0;
    for (let i = 0; i < 4; i++) {
      clock += STEP_DT * 1000;
      client.stepLocal(STEP_DT, { ...emptyInput(), switchGun: i === 0 ? 2 : null, fire: i === 0 });
    }
    const fresh = delayed.find((message) => message.spawnCount === player.spawnCount);
    expect(fresh).toMatchObject({ spawnCount: player.spawnCount, seq: 1 });
    sim.pushInput(player.id, fresh!.spawnCount, fresh!.seq, fresh!.inputs);
    for (let i = 0; i < 4; i++) sim.step(STEP_DT);
    expect(player.gun).toBe(2);
    expect(player.lastSeq).toBe(4);
    expect(sim.takeEvents().filter((event) => event.t === 'shot' && event.id === player.id)).toHaveLength(1);
  });

  it.each([50, 100, 200])('%ims RTT keeps the actual room acknowledgement lag bounded', async (rttMs) => {
    let now = 0;
    let tick: () => void = () => {};
    const scheduler: TickScheduler = {
      start(fn) { tick = fn; }, stop() { tick = () => {}; }, timeout() { return () => {}; },
    };
    const room = new ArenaRoom(() => now, () => 'room-throughput', scheduler);
    const clientSock = new FakeSock();
    type Due = { at: number; run: () => void };
    const due: Due[] = [];
    let clientToServerAt = 0;
    let serverToClientAt = 0;
    let maxBytes = 0;
    let inputMessages = 0;
    let serverShots = 0;
    const jitter = (n: number) => [0, 12, 31, 50, 7, 24][n % 6]!;
    const scheduleClientToServer = (run: () => void, n: number) => {
      clientToServerAt = Math.max(clientToServerAt, now + rttMs / 2 + jitter(n));
      due.push({ at: clientToServerAt, run });
    };
    const scheduleServerToClient = (run: () => void, n: number) => {
      serverToClientAt = Math.max(serverToClientAt, now + rttMs / 2 + jitter(n));
      due.push({ at: serverToClientAt, run });
    };
    const serverSock: RoomSocket = {
      send(text) {
        const message = JSON.parse(text) as ServerMessage;
        if (message.t === 'events') serverShots += message.es.filter((event) => event.t === 'shot').length;
        scheduleServerToClient(() => clientSock.push(message), room.sim?.tick ?? 0);
      },
      close() { /* test transport stays open */ },
    };
    room.onOpen(serverSock);
    clientSock.onSend = (text) => {
      maxBytes = Math.max(maxBytes, new TextEncoder().encode(text).byteLength);
      if ((JSON.parse(text) as { t?: string }).t === 'input') inputMessages++;
      scheduleClientToServer(() => room.onMessage(serverSock, text), due.length);
    };
    const client = new ArenaClient(() => clientSock, () => now);
    const connected = client.connect('ws://x/arena', 'A');
    await Promise.resolve();
    const flush = () => {
      const ready = due.filter((item) => item.at <= now).sort((a, b) => a.at - b.at);
      for (const item of ready) item.run();
      for (const item of ready) due.splice(due.indexOf(item), 1);
    };
    for (let i = 0; i < 30; i++) { now += STEP_DT * 1000; flush(); tick(); }
    await connected;
    const player = room.sim!.players[0]!;
    player.owned[2] = true;
    player.ammo.shells = 2;
    let generated = 0;
    const lags: number[] = [];
    let stoppedPosition: { x: number; z: number } | null = null;
    for (let i = 0; i < 1800; i++) {
      now += STEP_DT * 1000;
      client.stepLocal(STEP_DT, { ...emptyInput(), moveZ: i < 180 ? 1 : 0, switchGun: i === 60 ? 2 : null, fire: i === 60 });
      generated++;
      flush();
      tick();
      if (i === 204) {
        // Frame 181 is the first neutral control. It must have been applied
        // within 24 fixed ticks (400 ms), even at the worst tested RTT/jitter.
        expect(player.lastSeq).toBeGreaterThanOrEqual(181);
        stoppedPosition = { x: player.x, z: player.z };
      } else if (stoppedPosition) {
        expect(player.x).toBeCloseTo(stoppedPosition.x, 10);
        expect(player.z).toBeCloseTo(stoppedPosition.z, 10);
      }
      if (i > 300 && i % 60 === 0) lags.push(generated - player.lastSeq);
    }
    expect(maxBytes).toBeLessThanOrEqual(MAX_ARENA_MESSAGE_BYTES);
    expect(inputMessages).toBeGreaterThanOrEqual(440);
    expect(inputMessages).toBeLessThanOrEqual(460);
    expect(serverShots).toBe(1);
    expect(lags.length).toBeGreaterThan(10);
    expect(Math.max(...lags)).toBeLessThanOrEqual(20);
    expect(lags.at(-1)!).toBeLessThanOrEqual(lags[0]! + 4);
  });

  it('interpolation returns a pose between two snapshots at 100ms', async () => {
    const sock = new FakeSock();
    let clock = 0;
    const client = new ArenaClient(() => sock, () => clock);
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
      v: 3, t: 'welcome', id: 0, seed: 'c3', genVersion: ARENA_GEN_VERSION,
      gridHash: arenaGridHash(map.grid, map.pickups), tick: 0,
      snapshot: snap({ players: [self, mk(0, 0)] }),
    });
    await p;
    clock = 1000;
    client.ingestSnapshot(snap({ players: [self, mk(0, 0)] }));
    clock = 1100;
    client.ingestSnapshot(snap({ players: [self, mk(10, 0)] }));
    const mid = client.interpolateAt(1150);
    const other = mid?.players.find((pl) => pl.id === 1);
    expect(other?.x).toBeGreaterThan(0);
    expect(other?.x).toBeLessThan(10);
  });

  it('brackets 20 Hz and jittered snapshots, including shortest-arc look and removals', async () => {
    const sock = new FakeSock();
    let clock = 0;
    const client = new ArenaClient(() => sock, () => clock);
    const map = generateArena('c3-jitter');
    const p = client.connect('ws://x/arena', 'A');
    const self = {
      id: 0, name: 'A', colorIndex: 0, x: 10, z: 10, yaw: 0, pitch: 0,
      hp: 100, gun: 1, ownedMask: 1, alive: true, protect: 0, frags: 0, deaths: 0,
      lastSeq: 0, ammo: { bullets: 70, shells: 0, nails: 0, grenades: 0, cores: 0, void: 0 },
    };
    const other = (_tick: number, x: number, yaw: number, pitch: number) => ({
      id: 1, name: 'B', colorIndex: 1, x, z: 0, yaw, pitch,
      hp: 100, gun: 1, ownedMask: 1, alive: true, protect: 0, frags: 0, deaths: 0,
      lastSeq: 0, ammo: { bullets: 70, shells: 0, nails: 0, grenades: 0, cores: 0, void: 0 },
    });
    sock.push({
      v: 3, t: 'welcome', id: 0, seed: 'c3-jitter', genVersion: ARENA_GEN_VERSION,
      gridHash: arenaGridHash(map.grid, map.pickups), tick: 0,
      snapshot: snap({ players: [self, other(0, 0, 3.1, -0.4)] }),
    });
    await p;
    const at = 1000;
    client.ingestSnapshot(snap({ tick: 3, players: [self, other(3, 0, 3.1, -0.4)] }), at);
    client.ingestSnapshot(snap({ tick: 6, players: [self, other(6, 5, -3.1, 0.4)] }), at + 50);
    client.ingestSnapshot(snap({ tick: 9, players: [self, other(9, 10, -3.0, 0.8)] }), at + 100);
    const smooth = client.interpolateAt(at + 125)?.players.find((player) => player.id === 1);
    expect(smooth?.x).toBeCloseTo(2.5, 5);
    expect(Math.abs(smooth?.yaw ?? 0)).toBeGreaterThan(3);
    expect(smooth?.pitch).toBeCloseTo(0, 5);

    // A burst arriving late still brackets by arrival time; a stale packet
    // cannot bring a removed player back.
    client.ingestSnapshot(snap({ tick: 12, players: [self, other(12, 15, -2.9, 1)] }), at + 160);
    expect(client.interpolateAt(at + 160)?.players.find((player) => player.id === 1)?.x).toBeCloseTo(6, 5);
    client.ingestSnapshot(snap({ tick: 15, players: [self] }), at + 210);
    expect(client.others(at + 310)).toEqual([]);
    client.ingestSnapshot(snap({ tick: 12, players: [self, other(12, 15, -2.9, 1)] }), at + 315);
    expect(client.others(at + 415)).toEqual([]);
  });

  it('close() does not fire onClose (intentional leave)', async () => {
    const sock = new FakeSock();
    const client = new ArenaClient(() => sock);
    const map = generateArena('c4');
    const p = client.connect('ws://x/arena', 'A');
    sock.push({
      v: 3, t: 'welcome', id: 0, seed: 'c4', genVersion: ARENA_GEN_VERSION,
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

  it.each([50, 100, 200])('%ims RTT preserves controls and smooth remote poses through jitter, bursts, and stalls', async (rttMs) => {
    const sim = new ArenaSim('rtt-jitter');
    const player = sim.join('A');
    const rival = sim.join('B');
    if (player === 'full' || rival === 'full') throw new Error('full');
    player.owned[2] = true;
    player.ammo.shells = 4;
    let clock = 0;
    const sock = new FakeSock();
    const rivalSock = new FakeSock();
    const client = new ArenaClient(() => sock, () => clock);
    const rivalClient = new ArenaClient(() => rivalSock, () => clock);
    const welcomeA = client.connect('ws://x/arena', 'A');
    const welcomeB = rivalClient.connect('ws://x/arena', 'B');
    sock.push({ v: 3, t: 'welcome', id: player.id, seed: 'rtt-jitter', genVersion: ARENA_GEN_VERSION, gridHash: arenaGridHash(sim.map.grid, sim.map.pickups), tick: sim.tick, snapshot: sim.snapshot() });
    rivalSock.push({ v: 3, t: 'welcome', id: rival.id, seed: 'rtt-jitter', genVersion: ARENA_GEN_VERSION, gridHash: arenaGridHash(sim.map.grid, sim.map.pickups), tick: sim.tick, snapshot: sim.snapshot() });
    await Promise.all([welcomeA, welcomeB]);

    type Due = { at: number; run: () => void };
    const delayed: Due[] = [];
    const oneWay = rttMs / 2;
    const jitter = (n: number) => [0, 7, -4, 11, -2][n % 5]!;
    const schedule = (run: () => void, n: number) => delayed.push({ at: clock + Math.max(1, oneWay + jitter(n)), run });
    const flushDue = () => {
      const ready = delayed.filter((item) => item.at <= clock).sort((a, b) => a.at - b.at);
      for (const item of ready) item.run();
      for (const item of ready) delayed.splice(delayed.indexOf(item), 1);
    };
    const wireInput = (id: number, n: number) => (data: string) => {
      const message = JSON.parse(data) as { t?: string; spawnCount?: number; seq?: number; inputs?: ReturnType<typeof emptyInput>[] };
      if (message.t === 'input' && message.spawnCount != null && message.seq != null && message.inputs) schedule(() => sim.pushInput(id, message.spawnCount!, message.seq!, message.inputs!), n + message.seq);
    };
    sock.onSend = wireInput(player.id, 0);
    rivalSock.onSend = wireInput(rival.id, 2);

    const remoteDistances: number[] = [];
    const remoteDeltas: number[] = [];
    let lastRemote: { x: number; z: number } | null = null;
    let serverShots = 0;
    const advance = (i: number, inputs: boolean) => {
      clock += STEP_DT * 1000;
      if (inputs) {
        client.stepLocal(STEP_DT, { ...emptyInput(), yaw: player.yaw, pitch: 0, moveZ: 1, switchGun: i === 12 ? 2 : null, fire: i === 24 });
        rivalClient.stepLocal(STEP_DT, { ...emptyInput(), yaw: rival.yaw, pitch: 0, moveX: 1 });
      } else if (i % 4 === 0) {
        // Keep the transport retry cadence alive while no new local frame is
        // produced, without manufacturing a final reconciliation snapshot.
        (client as unknown as { flushInputs: () => void }).flushInputs();
        (rivalClient as unknown as { flushInputs: () => void }).flushInputs();
      }
      // Three skipped delivery passes emulate a brief event-loop stall; due
      // packets are then released as a burst in deterministic timestamp order.
      if (i % 29 >= 3) flushDue();
      sim.step(STEP_DT);
      const events = sim.takeEvents();
      serverShots += events.filter((event) => event.t === 'shot' && event.id === player.id).length;
      if (events.length && i < 600) {
        schedule(() => sock.push({ v: 3, t: 'events', es: events }), i);
        schedule(() => rivalSock.push({ v: 3, t: 'events', es: events }), i + 1);
      }
      if (i < 600 && sim.tick % 3 === 0) {
        const snapshot = sim.snapshot();
        schedule(() => sock.push({ v: 3, t: 'snap', snapshot }), i + 3);
        schedule(() => rivalSock.push({ v: 3, t: 'snap', snapshot }), i + 4);
      }
      const remote = client.others().find((other) => other.id === rival.id);
      if (remote) {
        remoteDistances.push(Math.hypot(remote.x - rival.x, remote.z - rival.z));
        if (lastRemote) remoteDeltas.push(Math.hypot(remote.x - lastRemote.x, remote.z - lastRemote.z));
        lastRemote = remote;
      }
    };

    for (let i = 0; i < 150; i++) advance(i, true);
    for (let i = 150; i < 600 || delayed.length; i++) advance(i, false);

    expect(player.gun).toBe(2);
    expect(serverShots).toBe(1);
    expect(rivalClient.takeEvents().filter((event) => event.t === 'shot' && event.id === player.id)).toHaveLength(1);
    expect(Math.max(...remoteDistances)).toBeLessThan(3.5);
    expect(Math.max(...remoteDeltas)).toBeLessThan(1);
    // No direct final snapshot is injected: both server acknowledgements have
    // advanced through the controls delivered before input stopped.
    expect(player.lastSeq).toBeGreaterThanOrEqual(120);
    expect(rival.lastSeq).toBeGreaterThanOrEqual(120);
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
      v: 3, t: 'welcome', id: 0, seed: 'c-respawn', genVersion: ARENA_GEN_VERSION,
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

  it('reuses full-arena fog grids while rebuilding network views', async () => {
    const sock = new FakeSock();
    const client = new ArenaClient(() => sock);
    const map = generateArena('view-grid-cache');
    const p = client.connect('ws://x/arena', 'A');
    const player = {
      id: 0, name: 'A', colorIndex: 0, x: 20, z: 20, yaw: 0, pitch: 0,
      hp: 100, gun: 1, ownedMask: 1, alive: true, protect: 0, frags: 0, deaths: 0,
      lastSeq: 0, ammo: { bullets: 70, shells: 0, nails: 0, grenades: 0, cores: 0, void: 0 },
    };
    sock.push({ v: 3, t: 'welcome', id: 0, seed: 'view-grid-cache', genVersion: ARENA_GEN_VERSION,
      gridHash: arenaGridHash(map.grid, map.pickups), tick: 0, snapshot: snap({ players: [player] }) });
    await p;
    const first = client.worldView()!;
    client.stepLocal(STEP_DT, { ...emptyInput(), yaw: 0, pitch: 0 });
    const next = client.worldView()!;
    expect(next).not.toBe(first);
    expect(next.explored).toBe(first.explored);
    expect(next.secretCell).toBe(first.secretCell);
  });

  it('resets life and connection state across missed death snapshots and reconnects', async () => {
    const first = new FakeSock();
    const second = new FakeSock();
    const sockets = [first, second];
    let clock = 0;
    const client = new ArenaClient(() => sockets.shift()!, () => clock);
    const map = generateArena('life-client');
    const base = {
      id: 0, name: 'A', colorIndex: 0, x: 10, z: 10, yaw: 0, pitch: 0,
      hp: 100, gun: 1, ownedMask: 1, alive: true, protect: 0, frags: 0, deaths: 0,
      lastSeq: 0, ammo: { bullets: 70, shells: 0, nails: 0, grenades: 0, cores: 0, void: 0 },
    };
    const connected = client.connect('ws://x/arena', 'A');
    first.push({ v: 3, t: 'welcome', id: 0, seed: 'life-client', genVersion: ARENA_GEN_VERSION, gridHash: arenaGridHash(map.grid, map.pickups), tick: 100, snapshot: snap({ tick: 100, players: [{ ...base, spawnCount: 1 }] }) });
    await connected;
    for (let i = 0; i < 8; i++) { clock += STEP_DT * 1000; client.stepLocal(STEP_DT, { ...emptyInput(), moveZ: 1 }); }
    expect(client.pendingCount()).toBeGreaterThan(0);

    // The respawn snapshot can arrive without an observed dead snapshot.
    clock += 50;
    client.ingestSnapshot(snap({ tick: 103, players: [{ ...base, x: 40, z: 40, spawnCount: 2 }] }));
    expect(client.pendingCount()).toBe(0);
    for (let i = 0; i < 4; i++) { clock += STEP_DT * 1000; client.stepLocal(STEP_DT, { ...emptyInput(), switchGun: 1, fire: true }); }
    const input = first.sent.map((text) => JSON.parse(text)).find((message) => message.t === 'input' && message.spawnCount === 2);
    expect(input).toMatchObject({ v: 3, spawnCount: 2, seq: 1 });

    const reconnected = client.connect('ws://x/arena', 'A');
    second.push({ v: 3, t: 'welcome', id: 0, seed: 'life-client', genVersion: ARENA_GEN_VERSION, gridHash: arenaGridHash(map.grid, map.pickups), tick: 0, snapshot: snap({ players: [{ ...base, spawnCount: 1 }] }) });
    await reconnected;
    expect(client.debugState()?.tick).toBe(0);
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
      v: 3, t: 'welcome', id: 0, seed: 'c-dry', genVersion: ARENA_GEN_VERSION,
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
