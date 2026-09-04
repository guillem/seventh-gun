import { describe, it, expect } from 'vitest';
import { compileBlueprint, stripCosmetics, validateBlueprint } from '../../src/sim/blueprint';
import { decodeBlueprint, encodeBlueprint } from '../../src/sim/mapcodec';
import {
  DEFAULT_START_ROOM,
  EditorDoc,
  corridorLegsBetween,
  economyWarning,
  emptyBlueprint,
  validateEditor,
} from '../../src/editor/model';
import {
  MYMAPS_CAP,
  MYMAPS_KEY,
  loadLibrary,
  parseLibraryEntry,
  upsertLibrary,
  filenameFromTitle,
  type LibraryStorage,
} from '../../src/editor/library';

function memoryStorage(initial?: Record<string, string>): LibraryStorage & { data: Record<string, string> } {
  const data: Record<string, string> = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = v; },
  };
}

function stampTiny(doc: EditorDoc): void {
  doc.bp.rooms = [];
  delete doc.bp.playerStart;
  doc.setTitle('TIN HALL');
  doc.setCosmeticSeed(1001);
  doc.setSealBreak({ type: 'gun', gun: 2 });
  doc.stampRoom({ x: 4, z: 20, w: 7, h: 7, kind: 'start', theme: 'industrial' });
  doc.stampRoom({ x: 16, z: 18, w: 9, h: 9, kind: 'spine', theme: 'organic' });
  doc.stampRoom({ x: 32, z: 20, w: 7, h: 7, kind: 'antechamber', theme: 'tech' });
  doc.stampRoom({ x: 46, z: 16, w: 13, h: 12, kind: 'arena', theme: 'tech' });
  doc.linkRooms(0, 1);
  doc.linkRooms(1, 2);
  doc.linkRooms(2, 3);
  doc.stampDoor(11, 23, 'x', false);
  expect(doc.stampPickup({ kind: 'gun', gun: 2, x: 35, z: 23 })).toBe(true);
  expect(doc.stampPickup({ kind: 'medikit', x: 19, z: 22 })).toBe(true);
  expect(doc.stampEnemy('husk', 20, 22, 0.5)).toBe(true);
  expect(doc.stampEnemy('slab', 52, 22, 1.2)).toBe(true);
}

describe('editor model', () => {
  it('new maps start with a labeled START room that cannot be erased', () => {
    const bp = emptyBlueprint();
    expect(bp.rooms).toHaveLength(1);
    expect(bp.rooms[0]).toMatchObject({ ...DEFAULT_START_ROOM, kind: 'start' });
    expect(bp.playerStart).toEqual({
      x: DEFAULT_START_ROOM.x + 4,
      z: DEFAULT_START_ROOM.z + 4,
      yaw: Math.PI / 2,
    });
    const doc = new EditorDoc();
    expect(doc.eraseAt(DEFAULT_START_ROOM.x + 1, DEFAULT_START_ROOM.z + 1)).toBe('blocked-start');
    expect(doc.bp.rooms.filter(r => r.kind === 'start')).toHaveLength(1);
  });

  it('stamp rooms + link + gun + enemies compiles, encodes, decodes, validates', () => {
    const doc = new EditorDoc();
    stampTiny(doc);
    const { errors, warnings } = doc.validate();
    expect(errors, errors.join(' | ')).toEqual([]);
    expect(warnings.length).toBe(0);

    const map = doc.compile();
    expect(map.rooms).toHaveLength(4);
    expect(map.rooms.some(r => r.kind === 'start')).toBe(true);
    expect(map.rooms.some(r => r.kind === 'arena')).toBe(true);
    expect(map.rooms.some(r => r.kind === 'antechamber')).toBe(true);
    expect(map.pickups.some(p => p.kind === 'gun' && p.gun === 2)).toBe(true);
    expect(map.enemies).toHaveLength(2);
    expect(doc.bp.corridors.length).toBeGreaterThan(0);
    expect(map.seal.cells.length).toBeGreaterThan(0);

    const code = doc.encode();
    expect(code.startsWith('SGMAP.v1.')).toBe(true);
    const decoded = decodeBlueprint(code);
    expect(validateBlueprint(decoded)).toEqual([]);
    const again = compileBlueprint(decoded);
    expect([...again.grid]).toEqual([...map.grid]);
    expect(again.rooms.map(r => [r.id, r.kind, r.x, r.z, r.w, r.h]))
      .toEqual(map.rooms.map(r => [r.id, r.kind, r.x, r.z, r.w, r.h]));
    expect(again.pickups.map(p => [p.kind, p.gun, p.x, p.z]))
      .toEqual(map.pickups.map(p => [p.kind, p.gun, p.x, p.z]));
    expect(again.enemies.map(e => [e.type, e.x, e.z]))
      .toEqual(map.enemies.map(e => [e.type, e.x, e.z]));
    expect(again.sealBreak).toEqual({ type: 'gun', gun: 2 });

    const round = compileBlueprint(decodeBlueprint(encodeBlueprint(stripCosmetics(doc.bp))));
    expect([...round.grid]).toEqual([...map.grid]);
  });

  it('secret room + powerup encode/decode/compile round-trip', () => {
    const doc = new EditorDoc();
    stampTiny(doc);
    const arena = doc.bp.rooms.find(r => r.kind === 'arena')!;
    const secret = doc.stampRoom({ x: 60, z: 18, w: 7, h: 6, kind: 'secret', theme: 'industrial' })!;
    doc.linkRooms(arena.id, secret.id);
    doc.bp.secrets = [{
      kind: 'plate-use',
      // The three-cell plate sits in the linked corridor, immediately before
      // the secret room. It must be carved floor while collision keeps it
      // closed until the secret is found.
      cx: secret.x - 1, cz: secret.z + 4, axis: 'x',
      roomId: secret.id,
      name: 's-test-cache',
    }];
    expect(doc.stampPickup({ kind: 'powerup', powerup: 'ward', x: secret.x + 3, z: secret.z + 2 })).toBe(true);
    expect(doc.stampEnemy('husk', secret.x + 2, secret.z + 2)).toBe(true);
    expect(doc.stampEnemy('husk', secret.x + 4, secret.z + 3)).toBe(true);

    const map = doc.compile();
    expect(map.rooms.some(r => r.kind === 'secret')).toBe(true);
    expect(map.secrets).toHaveLength(1);
    expect(map.secrets[0].cells).toHaveLength(3);
    expect(map.pickups.some(p => p.kind === 'powerup' && p.powerup === 'ward')).toBe(true);

    const code = doc.encode();
    expect(code.startsWith('SGMAP.v1.')).toBe(true);
    const decoded = decodeBlueprint(code);
    expect(decoded.rooms.some(r => r.kind === 'secret')).toBe(true);
    expect(decoded.secrets).toHaveLength(1);
    expect(decoded.pickups.some(p => p.kind === 'powerup' && p.powerup === 'ward')).toBe(true);
    expect(validateBlueprint(decoded)).toEqual([]);
    const again = compileBlueprint(decoded);
    expect(again.secrets).toHaveLength(1);
    expect(again.pickups.some(p => p.kind === 'powerup' && p.powerup === 'ward')).toBe(true);
    expect([...again.grid]).toEqual([...map.grid]);
  });

  it('click-two-rooms corridor matches L-link legs', () => {
    const doc = new EditorDoc();
    const a = doc.stampRoom({ x: 4, z: 20, w: 7, h: 7, kind: 'start' })!;
    const b = doc.stampRoom({ x: 20, z: 20, w: 7, h: 7, kind: 'spine' })!;
    const legs = corridorLegsBetween(a, b);
    const added = doc.applyCorridorClicks(7, 23, 23, 23);
    expect(added.length).toBeGreaterThan(0);
    expect(doc.bp.corridors).toEqual(legs);
  });

  it('refuses to erase the only start even after other rooms are gone', () => {
    const doc = new EditorDoc();
    doc.bp.rooms = [];
    doc.stampRoom({ x: 4, z: 20, w: 7, h: 7, kind: 'start' });
    doc.stampRoom({ x: 16, z: 20, w: 7, h: 7, kind: 'spine' });
    expect(doc.eraseAt(6, 22)).toBe('blocked-start');
    expect(doc.bp.rooms.filter(r => r.kind === 'start')).toHaveLength(1);
    expect(doc.eraseAt(18, 22)).toBe('room');
    expect(doc.eraseAt(6, 22)).toBe('blocked-start');
    expect(doc.bp.rooms).toHaveLength(1);
    expect(doc.bp.rooms[0].kind).toBe('start');
  });

  it('economy warning does not become a blocking error', () => {
    const doc = new EditorDoc();
    stampTiny(doc);
    for (let i = 0; i < 20; i++) {
      doc.stampEnemy('hierophant', 48 + (i % 8), 18 + ((i / 8) | 0));
    }
    const { errors, warnings } = validateEditor(doc.bp);
    expect(warnings.some(w => /economy/i.test(w))).toBe(true);
    expect(errors.some(e => /economy/i.test(e))).toBe(false);
    expect(economyWarning(emptyBlueprint())).toBeNull();
  });
});

describe('map library', () => {
  it('upserts newest-first and replaces the same id', () => {
    const storage = memoryStorage();
    upsertLibrary({ id: 'm1', title: 'A', code: 'SGMAP.v1.aaa', savedAt: 1 }, storage);
    upsertLibrary({ id: 'm2', title: 'B', code: 'SGMAP.v1.bbb', savedAt: 2 }, storage);
    const once = loadLibrary(storage);
    expect(once[0].id).toBe('m2');
    upsertLibrary({ id: 'm1', title: 'A2', code: 'SGMAP.v1.ccc', savedAt: 3 }, storage);
    const again = loadLibrary(storage);
    expect(again).toHaveLength(2);
    expect(again[0]).toMatchObject({ id: 'm1', title: 'A2', code: 'SGMAP.v1.ccc' });
  });

  it('caps at 40 and drops the oldest', () => {
    const storage = memoryStorage();
    for (let i = 0; i < MYMAPS_CAP + 3; i++) {
      upsertLibrary({ id: `m${i}`, title: `t${i}`, code: `SGMAP.v1.${i}`, savedAt: i }, storage);
    }
    const list = loadLibrary(storage);
    expect(list).toHaveLength(MYMAPS_CAP);
    expect(list[0].id).toBe(`m${MYMAPS_CAP + 2}`);
    expect(list.some(e => e.id === 'm0')).toBe(false);
    expect(storage.data[MYMAPS_KEY]).toBeTruthy();
  });

  it('parses missing title and ignores junk', () => {
    expect(parseLibraryEntry({ id: 'm', code: 'SGMAP.v1.x' })?.title).toBe('UNTITLED');
    expect(parseLibraryEntry({ title: 'nope' })).toBeNull();
    const storage = memoryStorage({ [MYMAPS_KEY]: 'nope' });
    expect(loadLibrary(storage)).toEqual([]);
  });

  it('fails soft on quota errors', () => {
    const storage: LibraryStorage = {
      getItem: () => '[]',
      setItem: () => { throw new Error('quota'); },
    };
    expect(() => upsertLibrary({ title: 'Z', code: 'SGMAP.v1.z' }, storage)).not.toThrow();
  });

  it('START-only maps still encode a share code despite VALIDATE errors', () => {
    const doc = new EditorDoc();
    const { errors } = doc.validate();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => /arena/i.test(e))).toBe(true);
    const code = doc.encode();
    expect(code.startsWith('SGMAP.v1.')).toBe(true);
  });

  it('builds a .sgmap filename from the title', () => {
    expect(filenameFromTitle('TIN HALL')).toBe('tin-hall.sgmap');
    expect(filenameFromTitle('')).toBe('untitled.sgmap');
  });
});
