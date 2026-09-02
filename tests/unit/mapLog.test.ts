import { describe, it, expect } from 'vitest';
import {
  MAP_LOG_CAP,
  MAP_LOG_KEY,
  loadMapLog,
  parseMapLogEntry,
  prependMapLog,
  patchLatestMapLog,
  shouldLogRun,
  type MapLogStorage,
} from '../../src/app/mapLog';
import { GEN_VERSION } from '../../src/sim/types';

function memoryStorage(initial?: Record<string, string>): MapLogStorage & { data: Record<string, string> } {
  const data: Record<string, string> = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = v; },
  };
}

describe('map log', () => {
  it('prepends newest-first', () => {
    const storage = memoryStorage();
    prependMapLog({ seed: 'alpha', difficulty: 'easy', startedAt: 1000, genVersion: 4 }, storage);
    prependMapLog({ seed: 'beta', difficulty: 'hard', startedAt: 2000, genVersion: 4 }, storage);
    const log = loadMapLog(storage);
    expect(log).toHaveLength(2);
    expect(log[0].seed).toBe('beta');
    expect(log[0].difficulty).toBe('hard');
    expect(log[1].seed).toBe('alpha');
    expect(log[1].difficulty).toBe('easy');
  });

  it('caps at 200 and drops the oldest', () => {
    const storage = memoryStorage();
    for (let i = 0; i < MAP_LOG_CAP + 5; i++) {
      prependMapLog({
        seed: `s${i}`,
        difficulty: 'normal',
        startedAt: i,
        genVersion: GEN_VERSION,
      }, storage);
    }
    const log = loadMapLog(storage);
    expect(log).toHaveLength(MAP_LOG_CAP);
    expect(log[0].seed).toBe(`s${MAP_LOG_CAP + 4}`);
    expect(log[MAP_LOG_CAP - 1].seed).toBe('s5');
    expect(log.some((e) => e.seed === 's0')).toBe(false);
  });

  it('parses missing fields and ignores unknown ones', () => {
    const storage = memoryStorage({
      [MAP_LOG_KEY]: JSON.stringify([
        { seed: 'bare', extra: 'nope', future: { nested: true } },
        { seed: '', difficulty: 'hard' },
        { notASeed: true },
        'ignore-me',
        {
          seed: 'full',
          difficulty: 'easy',
          startedAt: 42,
          genVersion: 3,
          outcome: 'won',
          durationSec: 12,
          kills: 7,
          kind: 'campaign',
        },
      ]),
    });
    const log = loadMapLog(storage);
    expect(log).toHaveLength(2);
    expect(log[0]).toEqual({
      seed: 'bare',
      difficulty: 'normal',
      startedAt: 0,
      genVersion: 0,
    });
    expect(log[0]).not.toHaveProperty('extra');
    expect(log[0]).not.toHaveProperty('future');
    expect(log[1]).toEqual({
      seed: 'full',
      difficulty: 'easy',
      startedAt: 42,
      genVersion: 3,
      outcome: 'won',
      durationSec: 12,
      kills: 7,
    });
    expect(log[1]).not.toHaveProperty('kind');
  });

  it('parseMapLogEntry defaults optional fields', () => {
    expect(parseMapLogEntry({ seed: 'x' })).toEqual({
      seed: 'x',
      difficulty: 'normal',
      startedAt: 0,
      genVersion: 0,
    });
    expect(parseMapLogEntry({ seed: 'x', outcome: 'explode' })?.outcome).toBeUndefined();
    expect(parseMapLogEntry(null)).toBeNull();
    expect(parseMapLogEntry({})).toBeNull();
  });

  it('ignores quota errors from fake storage', () => {
    const storage: MapLogStorage = {
      getItem: () => '[]',
      setItem: () => { throw new Error('QuotaExceededError'); },
    };
    expect(() => {
      prependMapLog({ seed: 'q', difficulty: 'normal', startedAt: 1 }, storage);
    }).not.toThrow();
    expect(() => {
      patchLatestMapLog(
        { seed: 'q', startedAt: 1 },
        { outcome: 'quit', durationSec: 3, kills: 0 },
        storage,
      );
    }).not.toThrow();
  });

  it('patches the latest matching seed+startedAt', () => {
    const storage = memoryStorage();
    prependMapLog({ seed: 'same', difficulty: 'normal', startedAt: 1 }, storage);
    prependMapLog({ seed: 'same', difficulty: 'normal', startedAt: 2 }, storage);
    patchLatestMapLog(
      { seed: 'same', startedAt: 2 },
      { outcome: 'died', durationSec: 9, kills: 4 },
      storage,
    );
    const log = loadMapLog(storage);
    expect(log[0].outcome).toBe('died');
    expect(log[0].durationSec).toBe(9);
    expect(log[0].kills).toBe(4);
    expect(log[1].outcome).toBeUndefined();
  });

  it('does not log campaign seeds, and ignores poisoned campaign: entries on load', () => {
    const storage = memoryStorage({
      [MAP_LOG_KEY]: JSON.stringify([
        { seed: 'campaign:01-foundry', difficulty: 'hard', startedAt: 9, genVersion: 4 },
        { seed: 'real-maze', difficulty: 'normal', startedAt: 8, genVersion: 4 },
      ]),
    });
    expect(loadMapLog(storage).map((e) => e.seed)).toEqual(['real-maze']);
    const after = prependMapLog(
      { seed: 'campaign:03-catacombs', difficulty: 'easy', startedAt: 10 },
      storage,
    );
    expect(after.map((e) => e.seed)).toEqual(['real-maze']);
    expect(loadMapLog(storage).some((e) => e.seed.startsWith('campaign:'))).toBe(false);
  });

  it('campaign / editor playtest / #m= runs are not loggable even after a maze run', () => {
    expect(shouldLogRun('maze', 'alpha')).toBe(true);
    expect(shouldLogRun('maze', 'campaign:01-foundry')).toBe(false);
    expect(shouldLogRun('campaign', 'campaign:01-foundry')).toBe(false);
    expect(shouldLogRun('map', 'the-foundry')).toBe(false);
    expect(shouldLogRun('map', 'untitled')).toBe(false);
    const storage = memoryStorage();
    prependMapLog({ seed: 'alpha', difficulty: 'normal', startedAt: 1 }, storage);
    prependMapLog({ seed: 'campaign:01-foundry', difficulty: 'hard', startedAt: 2 }, storage);
    expect(loadMapLog(storage)).toHaveLength(1);
    expect(loadMapLog(storage)[0].seed).toBe('alpha');
  });

  it('returns empty when storage throws on read', () => {
    const storage: MapLogStorage = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => {},
    };
    expect(loadMapLog(storage)).toEqual([]);
  });
});
