import { describe, it, expect } from 'vitest';
import { decodeClient, decodeServer, isClientMessage, isServerMessage } from '../../src/net/protocol';
import { ArenaSim } from '../../src/sim/arena';

describe('protocol guards', () => {
  it('accepts valid client frames', () => {
    expect(isClientMessage({ v: 3, t: 'join', name: 'TEST' })).toBe(true);
    expect(isClientMessage({
      v: 3, t: 'input', spawnCount: 1, seq: 1,
      inputs: [{ moveX: 0, moveZ: 1, yaw: 0, pitch: 0, fire: false }],
    })).toBe(true);
    expect(isClientMessage({ v: 3, t: 'ping', at: 1 })).toBe(true);
  });

  it('rejects bad v', () => {
    expect(decodeClient(JSON.stringify({ v: 1, t: 'join', name: 'X' }))).toBe('bad-v');
  });

  it('ignores unknown t', () => {
    expect(decodeClient(JSON.stringify({ v: 3, t: 'chat', text: 'hi' }))).toBe('unknown');
  });

  it('caps inputs per message at 8', () => {
    const inputs = Array.from({ length: 9 }, () => ({
      moveX: 0, moveZ: 0, yaw: 0, pitch: 0, fire: false,
    }));
    expect(isClientMessage({ v: 3, t: 'input', spawnCount: 1, seq: 1, inputs })).toBe(false);
    inputs.pop();
    expect(isClientMessage({ v: 3, t: 'input', spawnCount: 1, seq: 1, inputs })).toBe(true);
  });

  it('requires a positive life epoch on each input batch', () => {
    const frame = { moveX: 0, moveZ: 0, yaw: 0, pitch: 0, fire: false };
    expect(isClientMessage({ v: 3, t: 'input', seq: 1, inputs: [frame] })).toBe(false);
    expect(isClientMessage({ v: 3, t: 'input', spawnCount: 0, seq: 1, inputs: [frame] })).toBe(false);
  });

  it('accepts valid server frames', () => {
    expect(isServerMessage({ v: 3, t: 'full' })).toBe(true);
    expect(isServerMessage({ v: 3, t: 'kicked', reason: 'idle' })).toBe(true);
  });

  it('rejects incomplete welcome and snapshot payloads', () => {
    expect(isServerMessage({ v: 3, t: 'welcome' })).toBe(false);
    expect(isServerMessage({ v: 3, t: 'snap', snapshot: { tick: 0, players: [], projectiles: [] } })).toBe(false);
    expect(decodeServer(JSON.stringify({ v: 3, t: 'welcome', seed: 'x' }))).toBe('invalid');
    expect(isServerMessage({ v: 3, t: 'kicked', reason: 'anything' })).toBe(false);
  });

  it('accepts validated zero-based event ids', () => {
    expect(isServerMessage({ v: 3, t: 'events', es: [{ t: 'playerSpawn', id: 0 }] })).toBe(true);
  });

  it('rejects impossible guns and inconsistent welcomes', () => {
    const sim = new ArenaSim('protocol-guard');
    const joined = sim.join('A');
    if (joined === 'full') throw new Error('unexpected full arena');
    const snapshot = sim.snapshot();
    const welcome = { v: 3 as const, t: 'welcome' as const, id: joined.id, seed: 'protocol-guard', genVersion: 1, gridHash: 1, tick: snapshot.tick, snapshot };
    expect(isServerMessage(welcome)).toBe(true);
    expect(isServerMessage({ ...welcome, tick: snapshot.tick + 1 })).toBe(false);
    expect(isServerMessage({ ...welcome, id: 99 })).toBe(false);
    expect(isServerMessage({
      v: 3, t: 'snap', snapshot: { ...snapshot, players: [{ ...snapshot.players[0]!, gun: 8 }] },
    })).toBe(false);
    expect(isServerMessage({ v: 3, t: 'events', es: [{ t: 'shot', id: 0, gun: 8, x: 0, z: 0, yaw: 0 }] })).toBe(false);
  });

  it('rejects non-finite numbers and bad switchGun / seq', () => {
    const base = { moveX: 0, moveZ: 1, yaw: 0, pitch: 0, fire: false };
    expect(isClientMessage({ v: 3, t: 'input', spawnCount: 1, seq: 1, inputs: [{ ...base, yaw: NaN }] })).toBe(false);
    expect(isClientMessage({ v: 3, t: 'input', spawnCount: 1, seq: 1, inputs: [{ ...base, pitch: Infinity }] })).toBe(false);
    expect(isClientMessage({ v: 3, t: 'input', spawnCount: 1, seq: 1, inputs: [{ ...base, moveX: Number.NaN }] })).toBe(false);
    expect(isClientMessage({ v: 3, t: 'input', spawnCount: 1, seq: -1, inputs: [base] })).toBe(false);
    expect(isClientMessage({ v: 3, t: 'input', spawnCount: 1, seq: 1.5, inputs: [base] })).toBe(false);
    expect(isClientMessage({ v: 3, t: 'input', spawnCount: 1, seq: 1, inputs: [{ ...base, switchGun: 8 }] })).toBe(false);
    expect(isClientMessage({ v: 3, t: 'input', spawnCount: 1, seq: 1, inputs: [{ ...base, switchGun: 3 }] })).toBe(true);
    expect(isClientMessage({ v: 3, t: 'ping', at: NaN })).toBe(false);
  });
});
