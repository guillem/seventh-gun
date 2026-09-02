// Seeded maze generator: a spine of rooms start -> arena with turning
// 3-cell-wide corridors, loot spurs, one optional vault (key door), a couple
// of alternate links, and a sealed finale arena.
import { makeRng } from './rng';
import { CELL, GRID_W, GRID_H, GEN_VERSION, cellToWorld } from './types';
import type {
  GameMap, Room, RoomLight, Decor, DoorDef, SealDef, PickupDef, EnemySpawn,
  Difficulty, Theme, DecorKind, AmmoType, EnemyType,
} from './types';
import { DIFFICULTIES } from './difficulty';
import { WEAPONS } from './weapons';

export interface MapGenStats {
  spineRooms: number;
  spurs: number;
  doors: number;
  enemies: number;
  medikits: number;
  ammoBoxes: number;
}

interface Rect { x: number; z: number; w: number; h: number }

function key(x: number, z: number): number { return z * GRID_W + x; }

export function generateMap(seed: string, difficulty: Difficulty): GameMap {
  // layout stream: identical across difficulties (same seed => same geometry)
  const rng = makeRng(`SG|v${GEN_VERSION}|${seed}`);
  // content stream: economy (enemy counts, loot) scales with difficulty
  const crng = makeRng(`SG|v${GEN_VERSION}|${seed}|${difficulty}`);
  const grid = new Uint8Array(GRID_W * GRID_H);
  const rooms: Room[] = [];
  const routeRoomIds: number[] = []; // spine in order

  const inBounds = (x: number, z: number) => x >= 1 && z >= 1 && x < GRID_W - 1 && z < GRID_H - 1;

  function cellsOf(r: Rect): [number, number][] {
    const out: [number, number][] = [];
    for (let z = r.z; z < r.z + r.h; z++)
      for (let x = r.x; x < r.x + r.w; x++) out.push([x, z]);
    return out;
  }

  function rectFree(r: Rect, allow: Set<number>): boolean {
    for (const [x, z] of cellsOf(r)) {
      if (!inBounds(x, z)) return false;
      if (grid[key(x, z)] === 1 && !allow.has(key(x, z))) return false;
    }
    return true;
  }

  function carve(r: Rect) {
    for (const [x, z] of cellsOf(r)) {
      if (inBounds(x, z)) grid[key(x, z)] = 1;
    }
  }

  function inflate(r: Rect, n: number): Rect {
    return { x: r.x - n, z: r.z - n, w: r.w + 2 * n, h: r.h + 2 * n };
  }

  const themeCycle: Theme[] = ['industrial', 'organic', 'stone', 'industrial', 'organic', 'stone', 'tech'];
  let nextRoomId = 0;

  function addRoom(r: Rect, kind: Room['kind'], theme: Theme, outdoor: boolean): Room {
    const room: Room = {
      id: nextRoomId++,
      x: r.x, z: r.z, w: r.w, h: r.h,
      cx: (r.x + r.w / 2) * CELL, cz: (r.z + r.h / 2) * CELL,
      theme, outdoor, kind, routeDist: 0,
    };
    rooms.push(room);
    return room;
  }

  // ---- spine ----
  // Whole-layout retries until we get a long enough spine; deterministic
  // because the attempt counter only feeds the layout stream.
  type Dir = { x: number; z: number };
  let startRoom: Room | null = null;
  let cur: Room;
  let spineCount = 0;
  const MIN_SPINE = 11;
  for (let attempt = 0; attempt < 10; attempt++) {
    grid.fill(0);
    rooms.length = 0;
    nextRoomId = 0;
    routeRoomIds.length = 0;
    const startRect: Rect = { x: 4, z: 12 + rng.int(52), w: 7, h: 7 };
    carve(startRect);
    startRoom = addRoom(startRect, 'start', 'industrial', false);
    routeRoomIds.push(startRoom.id);
    let dir: Dir = { x: 1, z: 0 };
    cur = startRoom;
    spineCount = 0;

    const SPINE_TARGET = 12 + rng.int(3);
    for (let i = 0; i < SPINE_TARGET; i++) {
      // candidate directions: keep heading, left, right (never reverse),
      // ordered by a center pull so the walk stays off the map edges
      const left: Dir = { x: dir.z, z: -dir.x };
      const right: Dir = { x: -dir.z, z: dir.x };
      const cands: Dir[] = rng.float() < 0.52 ? [dir, left, right] : rng.chance(0.5) ? [left, dir, right] : [right, dir, left];
      const score = (d: Dir) => {
        const cx = cur.x + cur.w / 2 + d.x * 16, cz = cur.z + cur.h / 2 + d.z * 16;
        return -Math.abs(cx - GRID_W / 2) - Math.abs(cz - GRID_H / 2);
      };
      cands.sort((a, b) => score(b) - score(a));
      // if the best dir is badly off-map, drop it
      const usable = cands.filter(d => {
        const ex = cur.x + cur.w / 2 + d.x * 18, ez = cur.z + cur.h / 2 + d.z * 18;
        return ex > 4 && ex < GRID_W - 4 && ez > 4 && ez < GRID_H - 4;
      });
      const dirOrder = (usable.length ? usable : cands).slice(0, 3);
      const sizeRoll = rng.float();
      const sizeCandidates: [number, number, boolean][] = [];
      if (sizeRoll < 0.3) { sizeCandidates.push([5 + rng.int(2), 5 + rng.int(2), false]); }
      else if (sizeRoll < 0.65) { sizeCandidates.push([7 + rng.int(3), 7 + rng.int(3), false], [5, 5, false]); }
      else if (sizeRoll < 0.88) { sizeCandidates.push([10 + rng.int(4), 9 + rng.int(4), false], [6, 6, false]); }
      else { sizeCandidates.push([11 + rng.int(5), 11 + rng.int(5), rng.chance(0.75)], [7, 7, false]); }

      let placed = false;
      outerAttempt:
      for (const d of dirOrder) {
        for (const [rw0, rh0, outdoor] of sizeCandidates) {
          const lens = [5 + rng.int(6), 9 + rng.int(5)];
          for (const len of lens) {
            const rw = Math.max(5, rw0), rh = Math.max(5, rh0);
            const mouthZ0 = cur.z + Math.floor(cur.h / 2) - 1;
            const mouthX0 = cur.x + Math.floor(cur.w / 2) - 1;
            let corr: Rect, roomRect: Rect;
            if (d.x !== 0) {
              const cx0 = d.x > 0 ? cur.x + cur.w - 1 : cur.x - len + 1;
              corr = { x: cx0, z: mouthZ0, w: len, h: 3 };
              const rx = d.x > 0 ? corr.x + corr.w - 2 : corr.x - rw + 2;
              roomRect = { x: rx, z: mouthZ0 + 1 - Math.floor(rh / 2), w: rw, h: rh };
            } else {
              const cz0 = d.z > 0 ? cur.z + cur.h - 1 : cur.z - len + 1;
              corr = { x: mouthX0, z: cz0, w: 3, h: len };
              const rz = d.z > 0 ? corr.z + corr.h - 2 : corr.z - rh + 2;
              roomRect = { x: mouthX0 + 1 - Math.floor(rw / 2), z: rz, w: rw, h: rh };
            }
            const roomCells = new Set(cellsOf(roomRect).map(([x, z]) => key(x, z)));
            if (!rectFree(inflate(roomRect, 1), roomCells)) continue;
            const corrCells = new Set(cellsOf(corr).map(([x, z]) => key(x, z)));
            const curCells = new Set(cellsOf(inflate({ x: cur.x, z: cur.z, w: cur.w, h: cur.h }, 1)).map(([x, z]) => key(x, z)));
            const allowed = new Set([...corrCells, ...roomCells, ...curCells]);
            if (!rectFree(inflate(corr, 1), allowed)) continue;
            carve(corr);
            carve(roomRect);
            const theme = themeCycle[(i + 1) % themeCycle.length];
            const room = addRoom(roomRect, 'spine', theme, outdoor);
            routeRoomIds.push(room.id);
            cur = room;
            dir = d;
            spineCount++;
            placed = true;
            break outerAttempt;
          }
        }
      }
      if (!placed) break;
    }
    if (spineCount >= MIN_SPINE) break;
  }

  // ---- arena + antechamber ----
  // Route distances first so we can anchor the arena at the deepest spine
  // room, falling back to progressively shallower hosts until it fits.
  function computeRouteDist(): Int32Array {
    const d = new Int32Array(GRID_W * GRID_H).fill(-1);
    const q = [key(startRoom!.x + (startRoom!.w >> 1), startRoom!.z + (startRoom!.h >> 1))];
    d[q[0]] = 0;
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi];
      const x = c % GRID_W, z = (c / GRID_W) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= GRID_W || nz >= GRID_H) continue;
        const nk = key(nx, nz);
        if (grid[nk] === 1 && d[nk] === -1) { d[nk] = d[c] + 1; q.push(nk); }
      }
    }
    return d;
  }

  function placeAnnex(from: Room, w: number, h: number, kind: Room['kind'], theme: Theme, len = 6): Room | null {
    // try all four directions
    const dirs: Dir[] = [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }];
    for (const d of dirs) {
      const mouthZ0 = from.z + Math.floor(from.h / 2) - 1;
      const mouthX0 = from.x + Math.floor(from.w / 2) - 1;
      let corr: Rect, roomRect: Rect;
      if (d.x !== 0) {
        const cx0 = d.x > 0 ? from.x + from.w - 1 : from.x - len + 1;
        corr = { x: cx0, z: mouthZ0, w: len, h: 3 };
        const rx = d.x > 0 ? corr.x + corr.w - 2 : corr.x - w + 2;
        roomRect = { x: rx, z: mouthZ0 + 1 - Math.floor(h / 2), w, h };
      } else {
        const cz0 = d.z > 0 ? from.z + from.h - 1 : from.z - len + 1;
        corr = { x: mouthX0, z: cz0, w: 3, h: len };
        roomRect = { x: mouthX0 + 1 - Math.floor(w / 2), z: d.z > 0 ? corr.z + corr.h - 2 : corr.z - h + 2, w, h };
      }
      const roomCells = new Set(cellsOf(roomRect).map(([x, z]) => key(x, z)));
      if (!rectFree(inflate(roomRect, 1), roomCells)) continue;
      const corrCells = new Set(cellsOf(corr).map(([x, z]) => key(x, z)));
      const fromCells = new Set(cellsOf(inflate(from, 1)).map(([x, z]) => key(x, z)));
      const allowed = new Set([...corrCells, ...roomCells, ...fromCells]);
      if (!rectFree(inflate(corr, 1), allowed)) continue;
      carve(corr);
      carve(roomRect);
      return addRoom(roomRect, kind, theme, false);
    }
    return null;
  }

  let antechamber: Room | null = null;
  let arenaRoom: Room | null = null;
  {
    const earlyDist = computeRouteDist();
    const hosts = rooms
      .filter(r => r.kind === 'spine')
      .sort((a, b) => (earlyDist[key(b.x + (b.w >> 1), b.z + (b.h >> 1))] ?? 0) - (earlyDist[key(a.x + (a.w >> 1), a.z + (a.h >> 1))] ?? 0));
    outer:
    for (const host of hosts) {
      for (const [w, h] of [[16, 14], [15, 13], [13, 12]] as [number, number][]) {
        for (const len of [6, 8, 5]) {
          const arena = placeAnnex(host, w, h, 'arena', 'tech', len);
          if (arena) { antechamber = host; arenaRoom = arena; break outer; }
        }
      }
    }
    if (!arenaRoom || !antechamber) throw new Error('mapgen: could not place arena');
    antechamber.kind = 'antechamber';
    antechamber.theme = 'tech';
  }

  // ---- spurs (loot) + vault ----
  let vaultRoom: Room | null = null;
  const spurHosts = rooms.filter(r => r.kind === 'spine');
  const spurCount = 3 + rng.int(2);
  let spursPlaced = 0;
  for (let i = 0; i < spurCount + 4 && spursPlaced < spurCount; i++) {
    const host = rng.pick(spurHosts);
    if (!host) break;
    const spur = placeAnnex(host, 6 + rng.int(3), 6 + rng.int(3), 'spur', rng.pick(['organic', 'stone', 'industrial'] as Theme[]));
    if (spur) spursPlaced++;
    if (spur && !vaultRoom && spursPlaced >= 2) vaultRoom = spur;
  }

  // ---- alternate links (i <-> i+2 shortcuts) ----
  let links = 0;
  for (let tries = 0; tries < 24 && links < 2; tries++) {
    const a = rooms[rng.rangeInt(1, rooms.length - 3)];
    const b = rooms[rng.rangeInt(1, rooms.length - 1)];
    if (!a || !b || a === b || a.id === b.id) continue;
    if (Math.abs(a.x - b.x) + Math.abs(a.z - b.z) > 26) continue;
    if (!carveLink(a, b)) continue;
    links++;
  }

  function carveLink(a: Room, b: Room): boolean {
    // L-shaped 3-wide corridor between room centers; only through solid cells
    const ax = a.x + Math.floor(a.w / 2), az = a.z + Math.floor(a.h / 2);
    const bx = b.x + Math.floor(b.w / 2), bz = b.z + Math.floor(b.h / 2);
    const leg1: Rect = { x: Math.min(ax, bx) - 1, z: az - 1, w: Math.abs(ax - bx) + 3, h: 3 };
    const leg2: Rect = { x: bx - 1, z: Math.min(az, bz) - 1, w: 3, h: Math.abs(az - bz) + 3 };
    const allow = new Set<number>();
    for (const r of [a, b]) for (const [x, z] of cellsOf(inflate(r, 1))) allow.add(key(x, z));
    if (!rectFree(inflate(leg1, 1), allow) || !rectFree(inflate(leg2, 1), allow)) return false;
    carve(leg1); carve(leg2);
    return true;
  }

  // ---- final BFS route distance over all floor ----
  const dist = computeRouteDist();
  const roomDist = (r: Room) => dist[key(r.x + (r.w >> 1), r.z + (r.h >> 1))];
  for (const r of rooms) r.routeDist = roomDist(r);
  const maxDist = Math.max(...rooms.map(r => r.routeDist));

  // ---- doors ----
  const doors: DoorDef[] = [];
  function tryDoor(r: Room, locked: boolean): boolean {
    // place a door in the corridor cell just outside room r's edge, on its route entry
    // find the edge with floor continuing outward
    const cands: DoorDef[] = [];
    const cx = r.x + (r.w >> 1), cz = r.z + (r.h >> 1);
    const edges: { axis: 'x' | 'z'; cells: [number, number][]; nx: number; nz: number }[] = [];
    // west
    edges.push({ axis: 'x', cells: [[r.x - 1, cz - 1], [r.x - 1, cz], [r.x - 1, cz + 1]], nx: r.x - 1, nz: cz });
    edges.push({ axis: 'x', cells: [[r.x + r.w, cz - 1], [r.x + r.w, cz], [r.x + r.w, cz + 1]], nx: r.x + r.w, nz: cz });
    edges.push({ axis: 'z', cells: [[cx - 1, r.z - 1], [cx, r.z - 1], [cx + 1, r.z - 1]], nx: cx, nz: r.z - 1 });
    edges.push({ axis: 'z', cells: [[cx - 1, r.z + r.h], [cx, r.z + r.h], [cx + 1, r.z + r.h]], nx: cx, nz: r.z + r.h });
    for (const e of edges) {
      // all 3 cells floor, the cell beyond the middle must also be floor (corridor continues)
      let ok = e.cells.every(([x, z]) => inBounds(x, z) && grid[key(x, z)] === 1);
      if (ok) {
        const bx = e.nx + (e.axis === 'x' ? (e.nx < r.x ? -1 : 1) : 0);
        const bz = e.nz + (e.axis === 'z' ? (e.nz < r.z ? -1 : 1) : 0);
        ok = inBounds(bx, bz) && grid[key(bx, bz)] === 1;
      }
      if (ok) {
        // must not overlap another door
        if (doors.some(d => e.cells.some(([x, z]) => d.cells.some(([dx2, dz2]) => dx2 === x && dz2 === z)))) continue;
        cands.push({
          id: doors.length, cx: e.nx, cz: e.nz, axis: e.axis, cells: e.cells, locked,
          x: cellToWorld(e.nx), z: cellToWorld(e.nz),
        });
      }
    }
    if (!cands.length) return false;
    doors.push(rng.pick(cands));
    return true;
  }
  // 2 ordinary doors on mid/late spine rooms, far apart in route distance
  const spineRooms = rooms.filter(r => r.kind === 'spine').sort((a, b) => a.routeDist - b.routeDist);
  const doorRooms = new Set<Room>();
  if (spineRooms.length >= 4) {
    const pickA = spineRooms[Math.floor(spineRooms.length * 0.35)];
    const pickB = spineRooms[Math.floor(spineRooms.length * 0.75)];
    doorRooms.add(pickA); doorRooms.add(pickB);
  }
  let doorsPlaced = 0;
  for (const r of doorRooms) { if (tryDoor(r, false)) doorsPlaced++; }
  // key door on vault spur (if vault exists)
  let keyDoorPlaced = false;
  if (vaultRoom) keyDoorPlaced = tryDoor(vaultRoom, true);
  if (!keyDoorPlaced && vaultRoom) { /* vault open, still fine */ }
  // ensure at least 2 doors exist
  if (doorsPlaced < 2) {
    for (const r of spineRooms) {
      if (doorsPlaced >= 2) break;
      if (doorRooms.has(r)) continue;
      if (tryDoor(r, false)) doorsPlaced++;
    }
  }
  doors.forEach((d, i) => { d.id = i; });

  // ---- seal (arena barrier) ----
  const sealCells: [number, number][] = [];
  let sealAxis: 'x' | 'z' = 'z';
  {
    const cx = arenaRoom.x + (arenaRoom.w >> 1), cz = arenaRoom.z + (arenaRoom.h >> 1);
    // [cell, axis] — axis is the corridor travel direction through that edge
    const edges: [number, number, 'x' | 'z'][] = [
      [cx, arenaRoom.z - 1, 'z'], [cx, arenaRoom.z + arenaRoom.h, 'z'],
      [arenaRoom.x - 1, cz, 'x'], [arenaRoom.x + arenaRoom.w, cz, 'x'],
    ];
    for (const [x, z, ax] of edges) {
      if (grid[key(x, z)] === 1) { sealCells.push([x, z]); sealAxis = ax; break; }
    }
  }
  const sealCenter = sealCells[0] ?? [arenaRoom.x, arenaRoom.z];
  const seal: SealDef = {
    cells: sealCells,
    x: cellToWorld(sealCenter[0]), z: cellToWorld(sealCenter[1]),
    axis: sealAxis,
  };

  // ---- lights ----
  const lights: RoomLight[] = [];
  for (const r of rooms) {
    const count = r.outdoor ? 0 : 1 + (r.w * r.h > 90 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const lx = cellToWorld(r.x + 1 + rng.int(Math.max(1, r.w - 2)));
      const lz = cellToWorld(r.z + 1 + rng.int(Math.max(1, r.h - 2)));
      const palette: Record<Theme, [number, number, number][]> = {
        industrial: [[1.0, 0.75, 0.45], [0.6, 0.8, 1.0]],
        organic: [[1.0, 0.35, 0.4], [0.9, 0.6, 0.3]],
        stone: [[0.7, 0.85, 0.8], [1.0, 0.9, 0.6]],
        tech: [[0.5, 0.9, 1.0], [0.9, 0.5, 1.0]],
      };
      const color = rng.pick(palette[r.theme]);
      lights.push({
        x: lx, z: lz, y: r.outdoor ? 5 : 3.9,
        color, intensity: 1.3 + rng.float() * 0.5, radius: 8 + rng.float() * 4, roomId: r.id,
      });
    }
  }

  // ---- decorations (centered on wall panels) ----
  const decors: Decor[] = [];
  const decorByTheme: Record<Theme, DecorKind[]> = {
    industrial: ['rune', 'skull', 'lamp', 'tendrils'],
    organic: ['tendrils', 'skull', 'rune', 'lamp'],
    stone: ['pentagram', 'rune', 'skull', 'tendrils'],
    tech: ['rune', 'lamp', 'tendrils', 'pentagram'],
  };
  for (const r of rooms) {
    const n = 1 + Math.floor((r.w * r.h) / 28);
    for (let i = 0; i < n * 3 && decors.length < 400; i++) {
      if (decors.filter(d => Math.abs(d.x - r.cx) < r.w).length >= n) break;
      const x = r.x + rng.int(r.w), z = r.z + rng.int(r.h);
      if (grid[key(x, z)] !== 1) continue;
      // find a solid neighbor to mount on; face back toward the floor cell.
      // plane normal (sin θ, 0, cos θ) must equal (-dx, 0, -dz)
      const dirs: [number, number, number][] = [
        [1, 0, -Math.PI / 2], [-1, 0, Math.PI / 2], [0, 1, Math.PI], [0, -1, 0],
      ];
      const shuffled = dirs.slice().sort(() => rng.float() - 0.5);
      for (const [dx, dz, face] of shuffled) {
        const nx = x + dx, nz = z + dz;
        if (grid[key(nx, nz)] === 0) {
          const kind = rng.pick(decorByTheme[r.theme]);
          decors.push({
            x: cellToWorld(x) + dx * (CELL / 2 - 0.02),
            y: kind === 'lamp' ? 2.9 : 1.6 + rng.float() * 0.5,
            z: cellToWorld(z) + dz * (CELL / 2 - 0.02),
            facing: face, kind, theme: r.theme,
          });
          break;
        }
      }
    }
  }

  // ---- pickups ----
  const pickups: PickupDef[] = [];
  let pickupId = 0;
  const diff = DIFFICULTIES[difficulty];
  const roomFloorCells = (r: Room): [number, number][] =>
    cellsOf({ x: r.x + 1, z: r.z + 1, w: r.w - 2, h: r.h - 2 });
  const freeSpotIn = (r: Room, taken: Set<number>): [number, number] | null => {
    const cells = roomFloorCells(r);
    for (let i = 0; i < 30; i++) {
      const c = crng.pick(cells);
      if (!taken.has(key(c[0], c[1]))) { taken.add(key(c[0], c[1])); return c; }
    }
    return null;
  };

  // guns 2..6 along the spine in route order, spaced; gun 7 in the antechamber
  const taken = new Set<number>();
  const spineForGuns = spineRooms.filter(r => r.routeDist > 6);
  const gunRooms: Room[] = [];
  {
    const fracs = [0.05, 0.28, 0.5, 0.72, 0.98];
    let lastIdx = -1;
    for (const f of fracs) {
      let idx = Math.round(f * (spineForGuns.length - 1));
      idx = Math.max(idx, lastIdx + 1);
      while (idx < spineForGuns.length - 1 && gunRooms.length && spineForGuns[idx].routeDist <= gunRooms[gunRooms.length - 1].routeDist) idx++;
      if (idx <= spineForGuns.length - 1) {
        gunRooms.push(spineForGuns[idx]);
        lastIdx = idx;
      }
    }
    while (gunRooms.length < 5) {
      const remaining = spineForGuns.filter(r => !gunRooms.includes(r));
      if (!remaining.length) break;
      gunRooms.push(remaining[remaining.length - 1]);
    }
  }
  gunRooms.sort((a, b) => a.routeDist - b.routeDist);
  for (let i = 0; i < Math.min(5, gunRooms.length); i++) {
    const spot = freeSpotIn(gunRooms[i], taken) ?? [gunRooms[i].x + 1, gunRooms[i].z + 1];
    pickups.push({ id: pickupId++, kind: 'gun', gun: i + 2, x: cellToWorld(spot[0]), z: cellToWorld(spot[1]), roomId: gunRooms[i].id });
  }
  {
    const spot = freeSpotIn(antechamber, taken) ?? [antechamber.x + 1, antechamber.z + 1];
    pickups.push({ id: pickupId++, kind: 'gun', gun: 7, x: cellToWorld(spot[0]), z: cellToWorld(spot[1]), roomId: antechamber.id });
  }

  // key in a spine room well before the vault door
  if (vaultRoom && keyDoorPlaced) {
    const vaultDoor = doors.find(d => d.locked)!;
    const before = spineRooms.filter(r => r.routeDist < dist[key(vaultDoor.cx, vaultDoor.cz)] - 6);
    const keyRoom = before.length ? rng.pick(before) : spineRooms[0];
    const spot = freeSpotIn(keyRoom, taken) ?? [keyRoom.x + 1, keyRoom.z + 1];
    pickups.push({ id: pickupId++, kind: 'key', x: cellToWorld(spot[0]), z: cellToWorld(spot[1]), roomId: keyRoom.id });
  }

  // medikits + ammo boxes
  const medikitTarget = Math.round(rooms.length * 0.75 * diff.medikitCount);
  const ammoTarget = Math.round(rooms.length * 1.15 * diff.ammoAmount);
  const lootRooms = rooms.filter(r => r.kind !== 'start');
  for (let i = 0; i < medikitTarget; i++) {
    const r = crng.pick(lootRooms);
    const spot = freeSpotIn(r, taken);
    if (spot) pickups.push({ id: pickupId++, kind: 'medikit', x: cellToWorld(spot[0]), z: cellToWorld(spot[1]), roomId: r.id });
  }
  const ammoWeights: [AmmoType, number][] = [['bullets', 3], ['shells', 2.5], ['nails', 2.5], ['grenades', 1.4], ['cores', 1.1], ['void', 0.5]];
  const pickAmmoType = (): AmmoType => {
    const total = ammoWeights.reduce((s, [, w]) => s + w, 0);
    let roll = crng.float() * total;
    for (const [t, w] of ammoWeights) { roll -= w; if (roll <= 0) return t; }
    return 'bullets';
  };
  for (let i = 0; i < ammoTarget; i++) {
    const r = crng.pick(lootRooms);
    const spot = freeSpotIn(r, taken);
    if (!spot) continue;
    const t = pickAmmoType();
    const w = WEAPONS.find(g => g.ammo === t)!;
    pickups.push({
      id: pickupId++, kind: 'ammo', ammoType: t,
      amount: Math.max(1, Math.round(w.boxAmmo * diff.ammoAmount)),
      x: cellToWorld(spot[0]), z: cellToWorld(spot[1]), roomId: r.id,
    });
  }

  // ---- enemies ----
  const enemies: EnemySpawn[] = [];
  let enemyId = 0;
  // start-safety: blocked cells = door + seal cells (closed at spawn)
  const blockedCells = new Set<number>();
  for (const d of doors) for (const [x, z] of d.cells) blockedCells.add(key(x, z));
  for (const [x, z] of seal.cells) blockedCells.add(key(x, z));
  const losBlocked = (x0: number, z0: number, x1: number, z1: number): boolean => {
    // exact grid DDA (matches physics.hasLineOfSight; a coarse line sampler
    // can step over a clipped wall corner on diagonals)
    const dx = x1 - x0, dz = z1 - z0;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.001) return false;
    const dirX = dx / dist, dirZ = dz / dist;
    const solid = (cx: number, cz: number) =>
      cx < 0 || cz < 0 || cx >= GRID_W || cz >= GRID_H ||
      grid[key(cx, cz)] === 0 || blockedCells.has(key(cx, cz));
    let cx = Math.floor(x0 / CELL), cz = Math.floor(z0 / CELL);
    if (solid(cx, cz)) return true;
    const stepX = dirX > 0 ? 1 : -1;
    const stepZ = dirZ > 0 ? 1 : -1;
    const tDx = dirX !== 0 ? Math.abs(CELL / dirX) : Infinity;
    const tDz = dirZ !== 0 ? Math.abs(CELL / dirZ) : Infinity;
    let tMaxX = dirX !== 0
      ? (dirX > 0 ? (cx + 1) * CELL - x0 : x0 - cx * CELL) / Math.abs(dirX)
      : Infinity;
    let tMaxZ = dirZ !== 0
      ? (dirZ > 0 ? (cz + 1) * CELL - z0 : z0 - cz * CELL) / Math.abs(dirZ)
      : Infinity;
    for (let i = 0; i < 512; i++) {
      let t: number;
      if (tMaxX < tMaxZ) { t = tMaxX; tMaxX += tDx; cx += stepX; }
      else { t = tMaxZ; tMaxZ += tDz; cz += stepZ; }
      if (t > dist) return false;
      if (solid(cx, cz)) return true;
    }
    return false;
  };
  const spawnSafe = (x: number, z: number): boolean =>
    Math.hypot(x - startRoom!.cx, z - startRoom!.cz) > 16 && losBlocked(startRoom!.cx, startRoom!.cz, x, z);
  const spawnEnemy = (type: EnemyType, r: Room) => {
    // try several spots; only place ones that cannot see the spawn point
    for (let tries = 0; tries < 8; tries++) {
      const spot = freeSpotIn(r, taken);
      if (!spot) return;
      const wx = cellToWorld(spot[0]), wz = cellToWorld(spot[1]);
      if (!spawnSafe(wx, wz)) continue;
      enemies.push({
        id: enemyId++, type,
        x: wx, z: wz,
        roomId: r.id, yaw: crng.float() * Math.PI * 2,
      });
      return;
    }
  };
  const typeForProgress = (p: number): EnemyType => {
    if (p < 0.22) return 'husk';
    if (p < 0.42) return crng.chance(0.65) ? 'husk' : 'crawler';
    if (p < 0.62) return crng.pick(['husk', 'crawler', 'slab'] as EnemyType[]);
    if (p < 0.82) return crng.pick(['crawler', 'slab', 'wisp', 'husk'] as EnemyType[]);
    return crng.pick(['slab', 'wisp', 'hierophant', 'crawler'] as EnemyType[]);
  };
  for (const r of rooms) {
    if (r.kind === 'start' || r.kind === 'arena' || r.kind === 'antechamber') continue;
    if (r.routeDist <= 0) continue;
    const p = r.routeDist / Math.max(1, maxDist);
    const area = r.w * r.h;
    let count = Math.round((area / 22) * (0.7 + p * 0.8) * diff.enemyCount);
    count = Math.max(1, Math.min(7, count));
    for (let i = 0; i < count; i++) spawnEnemy(typeForProgress(p), r);
  }
  // arena wave
  {
    const wave: [EnemyType, number][] = [
      ['hierophant', difficulty === 'easy' ? 1 : 2],
      ['slab', 3], ['crawler', 4], ['husk', 3], ['wisp', 2],
    ];
    for (const [type, n] of wave) for (let i = 0; i < Math.round(n * diff.enemyCount); i++) spawnEnemy(type, arenaRoom);
  }

  return {
    version: GEN_VERSION,
    seed, difficulty,
    w: GRID_W, h: GRID_H,
    grid, rooms, doors, seal, decors, pickups, enemies, lights,
    playerStart: {
      x: startRoom!.cx, z: startRoom!.cz, yaw: Math.PI / 2,
    },
    startRoomId: startRoom!.id,
    arenaRoomId: arenaRoom.id,
    antechamberId: antechamber.id,
    vaultRoomId: vaultRoom ? vaultRoom.id : -1,
    sealBreak: { type: 'gun', gun: 7 },
  };
}

export function mapStats(map: GameMap): MapGenStats {
  return {
    spineRooms: map.rooms.filter(r => r.kind === 'spine' || r.kind === 'antechamber').length,
    spurs: map.rooms.filter(r => r.kind === 'spur').length,
    doors: map.doors.length,
    enemies: map.enemies.length,
    medikits: map.pickups.filter(p => p.kind === 'medikit').length,
    ammoBoxes: map.pickups.filter(p => p.kind === 'ammo').length,
  };
}
