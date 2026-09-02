import { describe, it, expect } from 'vitest';
import { Sim, emptyInput } from '../../src/sim/sim';
import { CAMPAIGN, campaignEconomy, ECONOMY_FLOOR, snapshotLoadout } from '../../src/campaign/index';
import {
  CAMPAIGN_PROGRESS_KEY, applyMapWin, canContinue, clearCampaignProgress,
  isMapUnlocked, loadCampaignProgress, parseCampaignProgress, saveCampaignProgress,
  unlockedThrough, type CampaignStorage,
} from '../../src/app/campaignProgress';

function memoryStorage(initial?: Record<string, string>): CampaignStorage & { data: Record<string, string> } {
  const data: Record<string, string> = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = v; },
    removeItem: (k) => { delete data[k]; },
  };
}

function playUntilWon(sim: Sim): void {
  const sb = sim.map.sealBreak;
  if (sb.type === 'gun') {
    const pk = sim.pickups.find(p => p.kind === 'gun' && p.gun === sb.gun);
    if (pk) { sim.player.x = pk.x; sim.player.z = pk.z; }
  } else {
    const pk = sim.pickups.find(p => p.kind === 'key');
    if (pk) { sim.player.x = pk.x; sim.player.z = pk.z; }
  }
  for (let i = 0; i < 8; i++) sim.step(emptyInput());
  expect(sim.sealIntact).toBe(false);
  const arena = sim.map.rooms[sim.map.arenaRoomId];
  sim.player.x = arena.cx;
  sim.player.z = arena.cz;
  for (const e of sim.enemies) {
    if (!e.dead && sim.enemyRoomId(e) === sim.map.arenaRoomId) {
      e.hp = 1;
      sim.damageEnemy(e, 20, 0);
    }
  }
  for (let i = 0; i < 90; i++) sim.step(emptyInput());
  expect(sim.phase).toBe('won');
}

describe('campaign maps', () => {
  it('compiles and validates all seven maps', () => {
    expect(CAMPAIGN).toHaveLength(7);
    const titles = CAMPAIGN.map(m => m.title);
    expect(titles).toEqual([
      'THE FOUNDRY', 'THE GULLET', 'THE CATACOMBS', 'THE PIT',
      'THE SPIRE', 'THE WARD', 'THE SANCTUM',
    ]);
    for (const m of CAMPAIGN) {
      expect(m.warnings, m.id).toEqual([]);
      expect(m.map.rooms.some(r => r.kind === 'start')).toBe(true);
      expect(m.map.rooms.some(r => r.kind === 'arena')).toBe(true);
      expect(m.map.rooms.some(r => r.kind === 'antechamber')).toBe(true);
      expect(m.blueprint.lights?.length).toBeGreaterThan(0);
      expect(m.blueprint.decors?.length).toBeGreaterThan(0);
      const eco = campaignEconomy(m.dsl, m.map);
      expect(eco.ratio, `${m.id} economy ${eco.ratio}`).toBeGreaterThanOrEqual(ECONOMY_FLOOR);
    }
  });

  it('map 1: shotgun breaks the seal and clearing the arena wins', () => {
    const m = CAMPAIGN[0];
    const sim = Sim.fromMap(m.map, 'normal', { loadout: m.incomingLoadout, rngKey: 'campaign:01-foundry' });
    expect(sim.player.owned[1]).toBe(true);
    expect(sim.player.owned[2]).toBe(false);
    expect(sim.sealIntact).toBe(true);
    const gun = sim.pickups.find(p => p.kind === 'gun' && p.gun === 2);
    expect(gun).toBeTruthy();
    sim.player.x = gun!.x;
    sim.player.z = gun!.z;
    sim.step(emptyInput());
    expect(sim.player.owned[2]).toBe(true);
    expect(sim.sealIntact).toBe(false);
    playUntilWon(sim);
  });

  it('map 6: guns do not break the seal; the key does', () => {
    const m = CAMPAIGN[5];
    expect(m.map.sealBreak).toEqual({ type: 'key' });
    const sim = Sim.fromMap(m.map, 'normal', { loadout: m.incomingLoadout, rngKey: 'campaign:06-ward' });
    expect(sim.player.owned[6]).toBe(true);
    expect(sim.player.owned[7]).toBe(false);
    const gun = sim.pickups.find(p => p.kind === 'gun');
    expect(gun).toBeUndefined();
    const key = sim.pickups.find(p => p.kind === 'key');
    expect(key).toBeTruthy();
    sim.player.x = key!.x;
    sim.player.z = key!.z;
    sim.step(emptyInput());
    expect(sim.hasKey).toBe(true);
    expect(sim.sealIntact).toBe(false);
  });

  it('loadout carries exact ammo and guns into the next map', () => {
    const m1 = CAMPAIGN[0];
    const sim1 = Sim.fromMap(m1.map, 'normal', { loadout: m1.incomingLoadout, rngKey: 'c1' });
    sim1.player.ammo.bullets = 41;
    const gun = sim1.pickups.find(p => p.kind === 'gun' && p.gun === 2)!;
    sim1.player.x = gun.x;
    sim1.player.z = gun.z;
    sim1.step(emptyInput());
    const carried = snapshotLoadout(sim1.player);
    expect(carried.owned[2]).toBe(true);
    expect(carried.ammo.bullets).toBe(41);

    const m2 = CAMPAIGN[1];
    const sim2 = Sim.fromMap(m2.map, 'normal', { loadout: carried, rngKey: 'c2' });
    expect(sim2.player.owned[2]).toBe(true);
    expect(sim2.player.ammo.bullets).toBe(41);
    expect(sim2.player.hp).toBe(100);
    expect(sim2.hasKey).toBe(false);
  });

  it('retry restores the entry loadout, not mid-map pickups', () => {
    const m = CAMPAIGN[0];
    const entry = snapshotLoadout(m.incomingLoadout);
    const sim = Sim.fromMap(m.map, 'normal', { loadout: entry, rngKey: 'retry-a' });
    const gun = sim.pickups.find(p => p.kind === 'gun' && p.gun === 2)!;
    sim.player.x = gun.x;
    sim.player.z = gun.z;
    sim.step(emptyInput());
    sim.player.ammo.bullets = 3;
    expect(sim.player.owned[2]).toBe(true);

    const retry = Sim.fromMap(m.map, 'normal', { loadout: snapshotLoadout(entry), rngKey: 'retry-b' });
    expect(retry.player.owned[2]).toBe(false);
    expect(retry.player.ammo.bullets).toBe(entry.ammo.bullets);
    expect(retry.player.hp).toBe(100);
    expect(retry.hasKey).toBe(false);
  });

  it('each map can be completed from its incoming loadout', () => {
    for (const m of CAMPAIGN) {
      const sim = Sim.fromMap(m.map, 'normal', {
        loadout: snapshotLoadout(m.incomingLoadout),
        rngKey: `play:${m.id}`,
      });
      playUntilWon(sim);
    }
  });

  it('key does not persist between maps', () => {
    const m6 = CAMPAIGN[5];
    const sim6 = Sim.fromMap(m6.map, 'normal', { loadout: m6.incomingLoadout, rngKey: 'k6' });
    const key = sim6.pickups.find(p => p.kind === 'key')!;
    sim6.player.x = key.x;
    sim6.player.z = key.z;
    sim6.step(emptyInput());
    expect(sim6.hasKey).toBe(true);
    const carried = snapshotLoadout(sim6.player);
    const sim7 = Sim.fromMap(CAMPAIGN[6].map, 'normal', { loadout: carried, rngKey: 'k7' });
    expect(sim7.hasKey).toBe(false);
  });
});

describe('campaign continue key', () => {
  it('saves and offers continue only when nextMap is 2–7', () => {
    const storage = memoryStorage();
    expect(canContinue(loadCampaignProgress(storage))).toBe(false);
    saveCampaignProgress({
      difficulty: 'hard',
      nextMap: 3,
      loadout: CAMPAIGN[2].incomingLoadout,
    }, storage);
    const loaded = loadCampaignProgress(storage)!;
    expect(loaded.difficulty).toBe('hard');
    expect(loaded.nextMap).toBe(3);
    expect(canContinue(loaded)).toBe(true);
    expect(storage.data[CAMPAIGN_PROGRESS_KEY]).toBeTruthy();
  });

  it('parses missing fields and ignores unknown ones', () => {
    const parsed = parseCampaignProgress({
      difficulty: 'easy',
      nextMap: 4,
      loadout: { owned: [false, true, true], ammo: { bullets: 12 }, gun: 2, extra: 1 },
      kind: 'future',
    });
    expect(parsed?.difficulty).toBe('easy');
    expect(parsed?.nextMap).toBe(4);
    expect(parsed?.loadout.owned[2]).toBe(true);
    expect(parsed?.loadout.ammo.bullets).toBe(12);
    expect(parsed?.loadout.ammo.shells).toBe(0);
    expect(parsed).not.toHaveProperty('kind');
  });

  it('nextMap 1 or 8 does not offer continue; quota errors are ignored', () => {
    expect(canContinue({ difficulty: 'normal', nextMap: 1, loadout: CAMPAIGN[0].incomingLoadout })).toBe(false);
    expect(canContinue({ difficulty: 'normal', nextMap: 8, loadout: CAMPAIGN[0].incomingLoadout })).toBe(false);
    const exploding: CampaignStorage = {
      getItem: () => null,
      setItem: () => { throw new Error('quota'); },
    };
    expect(() => saveCampaignProgress({
      difficulty: 'normal', nextMap: 2, loadout: CAMPAIGN[0].incomingLoadout,
    }, exploding)).not.toThrow();
    const storage = memoryStorage({ [CAMPAIGN_PROGRESS_KEY]: '{"difficulty":"normal","nextMap":2,"loadout":{"owned":[false,true],"ammo":{},"gun":1}}' });
    clearCampaignProgress(storage);
    expect(loadCampaignProgress(storage)).toBeNull();
  });
});

describe('campaign unlock rules', () => {
  const loadout = CAMPAIGN[0].incomingLoadout;

  it('first visit unlocks only map 1; winning N unlocks N+1', () => {
    expect(unlockedThrough(null)).toBe(1);
    expect(isMapUnlocked(1, null)).toBe(true);
    expect(isMapUnlocked(2, null)).toBe(false);
    expect(isMapUnlocked(7, null)).toBe(false);

    const after1 = applyMapWin(null, 1, loadout, 'normal');
    expect(after1.nextMap).toBe(2);
    expect(after1.unlocked).toBe(2);
    expect(isMapUnlocked(1, after1)).toBe(true);
    expect(isMapUnlocked(2, after1)).toBe(true);
    expect(isMapUnlocked(3, after1)).toBe(false);

    const after2 = applyMapWin(after1, 2, CAMPAIGN[1].incomingLoadout, 'normal');
    expect(after2.nextMap).toBe(3);
    expect(after2.unlocked).toBe(3);
    expect(isMapUnlocked(3, after2)).toBe(true);
    expect(isMapUnlocked(4, after2)).toBe(false);
  });

  it('replaying an earlier map does not rewind nextMap or loadout', () => {
    const frontier = applyMapWin(
      applyMapWin(null, 1, CAMPAIGN[0].incomingLoadout, 'hard'),
      2, CAMPAIGN[1].incomingLoadout, 'hard',
    );
    expect(frontier.nextMap).toBe(3);
    const replay = applyMapWin(frontier, 1, loadout, 'hard');
    expect(replay.nextMap).toBe(3);
    expect(replay.unlocked).toBe(3);
    expect(replay.loadout).toEqual(frontier.loadout);
    expect(replay.difficulty).toBe('hard');
  });

  it('winning map 7 finishes the campaign and keeps all maps unlocked', () => {
    const almost: ReturnType<typeof applyMapWin> = {
      difficulty: 'normal',
      nextMap: 7,
      loadout: CAMPAIGN[6].incomingLoadout,
      unlocked: 7,
    };
    const done = applyMapWin(almost, 7, CAMPAIGN[6].incomingLoadout, 'normal');
    expect(done.nextMap).toBe(8);
    expect(done.unlocked).toBe(7);
    expect(canContinue(done)).toBe(false);
    for (let n = 1; n <= 7; n++) expect(isMapUnlocked(n, done)).toBe(true);
  });

  it('derives unlocked from nextMap on old saves', () => {
    const parsed = parseCampaignProgress({
      difficulty: 'easy',
      nextMap: 4,
      loadout: { owned: [false, true], ammo: {}, gun: 1 },
    });
    expect(parsed?.unlocked).toBeUndefined();
    expect(unlockedThrough(parsed)).toBe(4);
    expect(isMapUnlocked(4, parsed)).toBe(true);
    expect(isMapUnlocked(5, parsed)).toBe(false);
  });
});
