import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { CAMPAIGN, campaignEconomy, ECONOMY_FLOOR } from '../../src/campaign/index';
import { Sim, emptyInput } from '../../src/sim/sim';
import { generateMap } from '../../src/sim/mapgen';
import { decodeBlueprint, encodeBlueprint, FLAG_SECRETS, unwrapEncoded } from '../../src/sim/mapcodec';
import { compileBlueprint, findExposedWallFace, secretPlatePublicFace, stripCosmetics, validateBlueprint } from '../../src/sim/blueprint';
import { isSolidCell } from '../../src/sim/physics';
import { exploredPct } from '../../src/ui/hud';
import { WEAPONS } from '../../src/sim/weapons';
import { CELL, GEN_VERSION } from '../../src/sim/types';

const PRE_SECRET_HASH: Record<string, string> = {
  '01-foundry': '8c81d54e9c5946d0a8cc6579a8960fba2beb22d27b54e7cb1b7a9e5fb4c3e1f5',
  '02-gullet': '30210fc4f800f16ab4959cda4778426ac562ea49801f679e6a685ef5ef2f5c56',
  '03-catacombs': '38eb7783849044c1d8345995aa4cc5edaaf33b344a480defc7dc9035fbcc69d5',
  '04-pit': '5def27da20ff1317e74d221f8fe69a962d39e9a02096db734ff54c8382fdd202',
  '05-spire': '4facd466173d7b0feca99f54a590abbee512d0b5227ac5659861764f4c1566b3',
  '06-ward': '4fa41e5640eee680bfa819fccb1992f72a7de89584fc90c3e0cd0ece67502bc6',
  '07-sanctum': '08f638ae16d257eddc68ee3465533baef9e4ccc121cb62490f89c27105df3a09',
};

const PRE_SECRET_EXPLORED: Record<string, number> = {
  '01-foundry': 6,
  '02-gullet': 3,
  '03-catacombs': 3,
  '04-pit': 2,
  '05-spire': 4,
  '06-ward': 5,
  '07-sanctum': 3,
};

const MAZE_EXPLORED: Record<string, number> = {
  alpha: 3, bravo: 3, charlie: 3, delta: 3, echo: 4,
};

const EXPECTED_PLATES: Record<string, { cx: number; cz: number; axis: 'x' | 'z' }> = {
  's-slag-cache': { cx: 35, cz: 38, axis: 'z' },
  's-throat-cache': { cx: 65, cz: 43, axis: 'x' },
  's-crop-blister': { cx: 21, cz: 29, axis: 'z' },
  's-ileum-ganglion': { cx: 45, cz: 51, axis: 'z' },
  's-ossuary-reliquary': { cx: 33, cz: 6, axis: 'x' },
  's-gallery-crypt': { cx: 64, cz: 39, axis: 'z' },
  's-toolshed-locker': { cx: 28, cz: 23, axis: 'x' },
  's-stair-sump': { cx: 9, cz: 64, axis: 'x' },
  's-alcove-oubliette': { cx: 9, cz: 37, axis: 'x' },
  's-beacon-lens': { cx: 43, cz: 24, axis: 'x' },
  's-clinic-morgue': { cx: 25, cz: 19, axis: 'z' },
  's-cells-oubliette': { cx: 47, cz: 48, axis: 'z' },
  's-reliq-crypt': { cx: 15, cz: 37, axis: 'z' },
  's-vestry-censer': { cx: 67, cz: 37, axis: 'z' },
  's-choir-heptagram': { cx: 37, cz: 74, axis: 'x' },
};

function cosmeticsHash(map: (typeof CAMPAIGN)[number]['map']): string {
  const publicIds = new Set(map.rooms.filter(r => r.kind !== 'secret').map(r => r.id));
  const lights = map.lights.filter(l => publicIds.has(l.roomId));
  return createHash('sha256').update(JSON.stringify({ lights, decors: map.decors })).digest('hex');
}

function ownedAmmo(incomingGuns: number[], sealGun?: number): Set<string> {
  const guns = new Set(incomingGuns);
  if (sealGun && sealGun >= 1 && sealGun <= 7) guns.add(sealGun);
  const ammo = new Set<string>();
  for (const g of guns) ammo.add(WEAPONS[g - 1].ammo);
  return ammo;
}

function cellCenter(x: number, z: number): { x: number; z: number } {
  return { x: (x + 0.5) * CELL, z: (z + 0.5) * CELL };
}

function aimAt(sim: Sim, x: number, z: number) {
  const dx = x - sim.player.x;
  const dz = z - sim.player.z;
  const length = Math.hypot(dx, dz);
  return { dirX: dx / length, dirY: 0, dirZ: dz / length };
}

function plateApproach(sim: Sim, roomId: number, cells: [number, number][]): { x: number; z: number } {
  const room = sim.map.rooms.find(r => r.id === roomId)!;
  for (const [x, z] of cells) {
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const nx = x + dx, nz = z + dz;
      const outsideSecretRoom = nx < room.x || nx >= room.x + room.w || nz < room.z || nz >= room.z + room.h;
      if (outsideSecretRoom && sim.map.grid[nz * sim.map.w + nx]) return cellCenter(nx, nz);
    }
  }
  throw new Error(`no public approach for secret room ${roomId}`);
}

describe('campaign secrets', () => {
  it('GEN_VERSION stays 4', () => {
    expect(GEN_VERSION).toBe(4);
  });

  it('places ≥1 secret per map, ≥2 enemies per pocket, no ammo for unowned guns', () => {
    let total = 0;
    for (const m of CAMPAIGN) {
      const secrets = m.map.secrets;
      expect(secrets.length, m.id).toBeGreaterThanOrEqual(1);
      total += secrets.length;
      const awarded = m.dsl.sealBreak.type === 'gun' ? m.dsl.sealBreak.gun : undefined;
      const ammoOk = ownedAmmo(m.incomingGuns, awarded);
      for (const s of secrets) {
        const room = m.map.rooms.find(r => r.id === s.roomId);
        expect(room?.kind, s.name).toBe('secret');
        const enemies = m.map.enemies.filter(e => e.roomId === s.roomId);
        expect(enemies.length, `${m.id} ${s.name}`).toBeGreaterThanOrEqual(2);
        for (const p of m.map.pickups.filter(pk => pk.roomId === s.roomId && pk.kind === 'ammo')) {
          expect(ammoOk.has(p.ammoType ?? ''), `${m.id} ${s.name} ${p.ammoType}`).toBe(true);
        }
        const expectPlate = s.name ? EXPECTED_PLATES[s.name] : undefined;
        if (expectPlate) {
          expect(s.cx, s.name).toBe(expectPlate.cx);
          expect(s.cz, s.name).toBe(expectPlate.cz);
          expect(s.axis, s.name).toBe(expectPlate.axis);
        }
      }
    }
    expect(total).toBe(15);
    const sevenfold = CAMPAIGN[6].map.pickups.filter(p => p.kind === 'powerup' && p.powerup === 'sevenfold');
    expect(sevenfold.length).toBe(1);
    for (let i = 0; i < 6; i++) {
      expect(CAMPAIGN[i].map.pickups.some(p => p.powerup === 'sevenfold')).toBe(false);
    }
  });

  it('maze generateMap still has no secrets', () => {
    const map = generateMap('no-secrets', 'normal');
    expect(map.secrets).toEqual([]);
  });

  it('exploredPct is unchanged on 7 campaign maps and maze seeds', () => {
    for (const m of CAMPAIGN) {
      const sim = Sim.fromMap(m.map, 'normal', { loadout: m.incomingLoadout, rngKey: m.map.seed });
      sim.step(emptyInput());
      expect(exploredPct(sim), m.id).toBe(PRE_SECRET_EXPLORED[m.id]);
    }
    for (const seed of Object.keys(MAZE_EXPLORED)) {
      const sim = new Sim(seed, 'normal');
      sim.step(emptyInput());
      expect(exploredPct(sim), seed).toBe(MAZE_EXPLORED[seed]);
    }
  });

  it('unfound secret cells are never marked explored (fog leak)', () => {
    const m = CAMPAIGN[0];
    const sim = Sim.fromMap(m.map, 'normal', { loadout: m.incomingLoadout, rngKey: 'fog' });
    const secret = sim.secrets.find(s => s.name === 's-slag-cache')!;
    sim.player.x = (35 + 0.5) * CELL;
    sim.player.z = (40 + 0.5) * CELL;
    for (let i = 0; i < 12; i++) sim.step(emptyInput());
    expect(secret.found).toBe(false);
    const w = sim.map.w;
    for (const [x, z] of secret.cells) {
      expect(sim.explored[z * w + x], `plate ${x},${z}`).toBe(0);
    }
    const room = sim.map.rooms.find(r => r.id === secret.roomId)!;
    expect(sim.explored[(room.z + 1) * w + (room.x + 1)]).toBe(0);
    expect(sim.secretCell[(room.z + 1) * w + (room.x + 1)]).toBe(1);
  });

  it('campaign lights+decors hash is unchanged for public rooms', () => {
    for (const m of CAMPAIGN) {
      expect(cosmeticsHash(m.map), m.id).toBe(PRE_SECRET_HASH[m.id]);
      for (const l of m.map.lights) {
        const room = m.map.rooms.find(r => r.id === l.roomId);
        if (room?.kind === 'secret') expect(l.radius).toBeLessThanOrEqual(6);
      }
    }
  });

  it('campaignEconomy ignores powerups and stays ≥ 2.2× on all 7 maps', () => {
    for (const m of CAMPAIGN) {
      const eco = campaignEconomy(m.dsl, m.map);
      expect(eco.ratio, m.id).toBeGreaterThanOrEqual(ECONOMY_FLOOR);
      const withExtra = {
        ...m.map,
        pickups: [
          ...m.map.pickups,
          { id: 999, kind: 'powerup' as const, powerup: 'ward' as const, x: 0, z: 0, roomId: 0 },
        ],
      };
      expect(campaignEconomy(m.dsl, withExtra).damage).toBe(eco.damage);
    }
  });

  it('golden pre-secrets SGMAP.v1 still decodes', () => {
    const code = readFileSync(join(process.cwd(), 'tests/fixtures/sgmap-v1-pre-secrets.txt'), 'utf8').trim();
    expect(code.startsWith('SGMAP.v1.')).toBe(true);
    const bp = decodeBlueprint(code);
    expect(bp.secrets).toBeUndefined();
    expect(bp.rooms.some(r => r.kind === 'secret')).toBe(false);
    expect(validateBlueprint(bp)).toEqual([]);
    const map = compileBlueprint(bp);
    expect(map.rooms[0].kind).toBe('start');
    expect(map.secrets).toEqual([]);
  });

  it('secrets encode/decode through FLAG_SECRETS', () => {
    const src = CAMPAIGN[0].blueprint;
    const code = encodeBlueprint(stripCosmetics(src));
    const { flags } = unwrapEncoded(code);
    expect(flags & FLAG_SECRETS).toBeTruthy();
    const back = decodeBlueprint(code);
    expect(back.secrets?.length).toBe(2);
    expect(back.pickups.some(p => p.kind === 'powerup' && p.powerup === 'ward')).toBe(true);
    const map = compileBlueprint(back);
    expect(map.secrets).toHaveLength(2);
    expect(map.secrets[0].cells).toHaveLength(3);
  });

  it('plate-use opens on E; plate-shoot opens on a hit; enemies never open', () => {
    const m = CAMPAIGN[0];
    const sim = Sim.fromMap(m.map, 'normal', { loadout: m.incomingLoadout, rngKey: 'open' });
    const use = sim.secrets.find(s => s.kind === 'plate-use')!;
    sim.player.x = use.x;
    sim.player.z = use.z + 2;
    sim.step({ ...emptyInput(), use: true });
    expect(use.found).toBe(true);
    expect(use.opening).toBe(true);

    const shootSim = Sim.fromMap(m.map, 'normal', { loadout: m.incomingLoadout, rngKey: 'shoot' });
    const plate = shootSim.secrets.find(s => s.kind === 'plate-shoot')!;
    shootSim.trySecretShot(plate.cx, plate.cz, 20);
    expect(plate.found).toBe(true);

    const locked = Sim.fromMap(m.map, 'normal', { loadout: m.incomingLoadout, rngKey: 'ai' });
    const closed = locked.secrets.find(s => s.kind === 'plate-use')!;
    locked.player.x = 10;
    locked.player.z = 10;
    for (const e of locked.enemies) {
      e.x = closed.x;
      e.z = closed.z;
      e.awakened = true;
      e.state = 'chase';
    }
    for (let i = 0; i < 30; i++) locked.step(emptyInput());
    expect(closed.found).toBe(false);
    expect(closed.opening).toBe(false);
  });

  it('every authored secret has a visible control or plate and opens through its intended interaction', () => {
    const kinds = new Set<string>();
    for (const campaign of CAMPAIGN) {
      for (const def of campaign.map.secrets) {
        kinds.add(def.kind);
        const sim = Sim.fromMap(campaign.map, 'normal', {
          loadout: campaign.incomingLoadout,
          rngKey: `secret-${def.id}`,
        });
        const secret = sim.secrets[def.id];
        const room = campaign.map.rooms.find(r => r.id === secret.roomId)!;
        expect(campaign.map.pickups.some(p => p.roomId === room.id), secret.name).toBe(true);
        sim.enemies = []; // Isolate the authored interaction ray from combat.

        const publicFace = secretPlatePublicFace(room, secret.cx, secret.cz, secret.axis);
        expect(secret.cells.some(([x, z]) => {
          const nx = x + publicFace.dx, nz = z + publicFace.dz;
          const outsideRoom = nx < room.x || nx >= room.x + room.w || nz < room.z || nz >= room.z + room.h;
          return outsideRoom && campaign.map.grid[nz * campaign.map.w + nx] === 1;
        }), `${secret.name} public plate face`).toBe(true);

        if (secret.kind === 'plate-use') {
          Object.assign(sim.player, plateApproach(sim, secret.roomId, secret.cells));
          sim.step({ ...emptyInput(), use: true });
        } else if (secret.kind === 'remote-use') {
          const trigger = secret.trigger!;
          const face = findExposedWallFace(campaign.map.grid, campaign.map.w, campaign.map.h, trigger.x, trigger.z)!;
          Object.assign(sim.player, cellCenter(trigger.x + face.dx, trigger.z + face.dz));
          sim.step({ ...emptyInput(), use: true });
        } else if (secret.kind === 'plate-shoot') {
          Object.assign(sim.player, plateApproach(sim, secret.roomId, secret.cells));
          sim.giveGun(6);
          for (let shot = 0; shot < 3 && !secret.found; shot++) {
            sim.step({ ...emptyInput(), fire: true, aimDir: aimAt(sim, secret.x, secret.z) });
            for (let i = 0; i < 64; i++) sim.step(emptyInput());
          }
        } else {
          const trigger = secret.trigger!;
          const face = findExposedWallFace(campaign.map.grid, campaign.map.w, campaign.map.h, trigger.x, trigger.z);
          expect(face, secret.name).toBeDefined();
          // A control lives just beyond an actual walkable wall face; the
          // renderer uses the same face to keep the clue out of the wall.
          expect(face && campaign.map.grid[(trigger.z + face.dz) * campaign.map.w + trigger.x + face.dx], secret.name).toBe(1);
          Object.assign(sim.player, cellCenter(trigger.x + face!.dx, trigger.z + face!.dz));
          sim.giveGun(6);
          const target = cellCenter(trigger.x, trigger.z);
          sim.step({ ...emptyInput(), fire: true, aimDir: aimAt(sim, target.x, target.z) });
        }

        expect(secret.found, secret.name).toBe(true);
        expect(secret.opening, secret.name).toBe(true);
        for (let i = 0; i < 60; i++) sim.step(emptyInput());
        expect(secret.offset, secret.name).toBe(1);
        for (const [x, z] of secret.cells) {
          expect(isSolidCell(sim, x, z), `${secret.name} ${x},${z}`).toBe(false);
        }
        const inside = cellCenter(room.x + 1, room.z + 1);
        Object.assign(sim.player, inside);
        sim.step(emptyInput());
        expect(sim.explored[(room.z + 1) * campaign.map.w + room.x + 1], `${secret.name} fog`).toBe(1);
        for (const reward of sim.pickups.filter(p => p.roomId === room.id)) {
          sim.player.hp = 1;
          sim.player.x = reward.x;
          sim.player.z = reward.z;
          sim.step(emptyInput());
          expect(reward.taken, `${secret.name} ${reward.kind} reward`).toBe(true);
        }
      }
    }
    expect(kinds).toEqual(new Set(['plate-use', 'plate-shoot', 'remote-use', 'remote-shoot']));
  });

  it('rejects malformed secret imports before they reach simulation or rendering', () => {
    const src = structuredClone(CAMPAIGN[0].blueprint);
    const remote = structuredClone(CAMPAIGN[1].blueprint);
    remote.secrets![1].trigger = { x: remote.secrets![1].cx, z: remote.secrets![1].cz }; // floor, not a mountable wall cell
    expect(validateBlueprint(remote)).toContain("secret 's-ileum-ganglion' trigger 45,51 is not a wall cell");

    const missingRoom = structuredClone(src);
    missingRoom.secrets![0].roomId = 999;
    expect(validateBlueprint(missingRoom)).toContain("secret 's-slag-cache' names missing room 999");

    const wrongRoom = structuredClone(src);
    wrongRoom.secrets![0].roomId = wrongRoom.rooms.find(r => r.kind === 'start')!.id;
    expect(validateBlueprint(wrongRoom)).toEqual(expect.arrayContaining([expect.stringContaining('is not a secret room')]));

    const offGrid = structuredClone(src);
    offGrid.secrets![0].cx = 255;
    offGrid.secrets![0].cz = 255;
    expect(validateBlueprint(offGrid)).toEqual(expect.arrayContaining([expect.stringContaining('plate cell 255,255 is not floor')]));
  });
});
