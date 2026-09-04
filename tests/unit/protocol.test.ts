import { describe, it, expect } from 'vitest';
import { decodeClient, decodeServer, isClientMessage, isServerMessage } from '../../src/net/protocol';
import { ArenaSim } from '../../src/sim/arena';

describe('protocol guards', () => {
  it('accepts valid client frames', () => {
    expect(isClientMessage({ v: 2, t: 'join', name: 'TEST' })).toBe(true);
    expect(isClientMessage({
      v: 2, t: 'input', seq: 1,
      inputs: [{ moveX: 0, moveZ: 1, yaw: 0, pitch: 0, fire: false }],
    })).toBe(true);
    expect(isClientMessage({ v: 2, t: 'ping', at: 1 })).toBe(true);
  });

  it('rejects bad v', () => {
    expect(decodeClient(JSON.stringify({ v: 1, t: 'join', name: 'X' }))).toBe('bad-v');
  });

  it('ignores unknown t', () => {
    expect(decodeClient(JSON.stringify({ v: 2, t: 'chat', text: 'hi' }))).toBe('unknown');
  });

  it('caps inputs per message at 8', () => {
    const inputs = Array.from({ length: 9 }, () => ({
      moveX: 0, moveZ: 0, yaw: 0, pitch: 0, fire: false,
    }));
    expect(isClientMessage({ v: 2, t: 'input', seq: 1, inputs })).toBe(false);
    inputs.pop();
    expect(isClientMessage({ v: 2, t: 'input', seq: 1, inputs })).toBe(true);
  });

  it('accepts valid server frames', () => {
    expect(isServerMessage({ v: 2, t: 'full' })).toBe(true);
    expect(isServerMessage({ v: 2, t: 'kicked', reason: 'idle' })).toBe(true);
  });

  it('rejects incomplete welcome and snapshot payloads', () => {
    expect(isServerMessage({ v: 2, t: 'welcome' })).toBe(false);
    expect(isServerMessage({ v: 2, t: 'snap', snapshot: { tick: 0, players: [], projectiles: [] } })).toBe(false);
    expect(decodeServer(JSON.stringify({ v: 2, t: 'welcome', seed: 'x' }))).toBe('invalid');
    expect(isServerMessage({ v: 2, t: 'kicked', reason: 'anything' })).toBe(false);
  });

  it('accepts validated zero-based event ids', () => {
    expect(isServerMessage({ v: 2, t: 'events', es: [{ t: 'playerSpawn', id: 0 }] })).toBe(true);
  });

  it('requires complete projectile motion and pickup ownership in v2 events', () => {
    const projectile = { id: 1, ownerId: 0, kind: 'nail', x: 1, y: 2, z: 3, vx: 4, vy: 5, vz: 6, gravity: 0, radius: 0.2, age: 0 };
    expect(isServerMessage({ v: 2, t: 'snap', snapshot: { tick: 1, players: [], projectiles: [projectile], pickups: [] } })).toBe(true);
    expect(isServerMessage({ v: 2, t: 'events', es: [{ t: 'pickup', playerId: 0, pickupId: 7, kind: 'ammo', label: '+10' }] })).toBe(true);
    expect(isServerMessage({ v: 2, t: 'events', es: [{ t: 'spawnProjectile', id: 0, projectileId: 1, ownerId: 0, kind: 'nail', x: 1, y: 2, z: 3, vx: 4, vy: 5, vz: 6, gravity: 0, radius: 0.2, age: 0 }] })).toBe(true);
    expect(isServerMessage({ v: 2, t: 'snap', snapshot: { tick: 1, players: [], projectiles: [{ ...projectile, vx: Number.NaN }], pickups: [] } })).toBe(false);
  });

  it('rejects impossible guns and inconsistent welcomes', () => {
    const sim = new ArenaSim('protocol-guard');
    const joined = sim.join('A');
    if (joined === 'full') throw new Error('unexpected full arena');
    const snapshot = sim.snapshot();
    const welcome = { v: 2 as const, t: 'welcome' as const, id: joined.id, seed: 'protocol-guard', genVersion: 1, gridHash: 1, tick: snapshot.tick, snapshot };
    expect(isServerMessage(welcome)).toBe(true);
    expect(isServerMessage({ ...welcome, tick: snapshot.tick + 1 })).toBe(false);
    expect(isServerMessage({ ...welcome, id: 99 })).toBe(false);
    expect(isServerMessage({
      v: 2, t: 'snap', snapshot: { ...snapshot, players: [{ ...snapshot.players[0]!, gun: 8 }] },
    })).toBe(false);
    expect(isServerMessage({ v: 2, t: 'events', es: [{ t: 'shot', id: 0, gun: 8, x: 0, z: 0, yaw: 0 }] })).toBe(false);
  });

  it('rejects non-finite numbers and bad switchGun / seq', () => {
    const base = { moveX: 0, moveZ: 1, yaw: 0, pitch: 0, fire: false };
    expect(isClientMessage({ v: 2, t: 'input', seq: 1, inputs: [{ ...base, yaw: NaN }] })).toBe(false);
    expect(isClientMessage({ v: 2, t: 'input', seq: 1, inputs: [{ ...base, pitch: Infinity }] })).toBe(false);
    expect(isClientMessage({ v: 2, t: 'input', seq: 1, inputs: [{ ...base, moveX: Number.NaN }] })).toBe(false);
    expect(isClientMessage({ v: 2, t: 'input', seq: -1, inputs: [base] })).toBe(false);
    expect(isClientMessage({ v: 2, t: 'input', seq: 1.5, inputs: [base] })).toBe(false);
    expect(isClientMessage({ v: 2, t: 'input', seq: 1, inputs: [{ ...base, switchGun: 8 }] })).toBe(false);
    expect(isClientMessage({ v: 2, t: 'input', seq: 1, inputs: [{ ...base, switchGun: 3 }] })).toBe(true);
    expect(isClientMessage({ v: 2, t: 'ping', at: NaN })).toBe(false);
  });
});
