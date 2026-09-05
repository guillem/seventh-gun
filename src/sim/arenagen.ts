import { makeRng } from './rng';
import { CELL, type GameMap, type Room, type Theme, cellToWorld, type PickupDef } from './types';
import { placeCosmetics } from './cosmetics';
import { WEAPONS } from './weapons';
import { ARENA_GEN_VERSION, ARENA_GRID } from './arenaConstants';
import type { AmmoType } from './types';

// 32-bit FNV-1a mix over grid bytes + pickup positions.
export function arenaGridHash(grid: Uint8Array, pickups: PickupDef[]): number {
  let h = 0x811c9dc5 >>> 0;
  const step = (v: number) => {
    h ^= v & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  for (let i = 0; i < grid.length; i++) step(grid[i]);
  for (const pk of pickups) {
    step(pk.id);
    step(Math.floor(pk.x / CELL));
    step(Math.floor(pk.z / CELL));
    // Include pickup kind identity (string is short, so character loop is fine).
    const kind = pk.kind;
    for (let i = 0; i < kind.length; i++) step(kind.charCodeAt(i));
    if (pk.kind === 'gun') step(pk.gun ?? 0);
    if (pk.kind === 'ammo') {
      const at = pk.ammoType ?? 'bullets';
      for (let i = 0; i < at.length; i++) step(at.charCodeAt(i));
    }
    step(Math.floor(pk.amount ?? 0));
  }
  return h >>> 0;
}

function carveRect(grid: Uint8Array, w: number, x: number, z: number, rw: number, rh: number): void {
  for (let cz = z; cz < z + rh; cz++) {
    for (let cx = x; cx < x + rw; cx++) {
      if (cx < 1 || cz < 1 || cx >= w - 1 || cz >= w - 1) continue; // keep 1-cell border
      grid[cz * w + cx] = 1;
    }
  }
}

function neighborFloorCount(grid: Uint8Array, w: number, x: number, z: number): number {
  let c = 0;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const nx = x + dx, nz = z + dz;
    if (nx < 0 || nz < 0 || nx >= w || nz >= w) continue;
    if (grid[nz * w + nx] === 1) c++;
  }
  return c;
}

function computeFloorReachable(grid: Uint8Array, w: number, h: number): boolean {
  // Flood-fill all floor cells and ensure the set is connected.
  let start = -1;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === 1) { start = i; break; }
  }
  if (start < 0) return false;
  const seen = new Uint8Array(grid.length);
  const q: number[] = [start];
  seen[start] = 1;
  while (q.length) {
    const i = q.pop()!;
    const x = i % w;
    const z = (i / w) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
      const ni = nz * w + nx;
      if (grid[ni] !== 1 || seen[ni]) continue;
      seen[ni] = 1;
      q.push(ni);
    }
  }
  for (let i = 0; i < grid.length; i++) if (grid[i] === 1 && !seen[i]) return false;
  return true;
}

export function generateArena(seed: string): GameMap {
  const w = ARENA_GRID;
  const h = ARENA_GRID;

  // Content stream is independent of layout retries.
  const contentRng = makeRng(`SGA|v${ARENA_GEN_VERSION}|${seed}|pads`);
  // Layout retry stream: attempt counter only affects layout RNG.

  const themeCycle: Theme[] = ['industrial', 'organic', 'stone', 'tech'];
  const slotSize = 22;
  const offset = 4;

  for (let attempt = 0; attempt < 10; attempt++) {
    const layoutRng = makeRng(`SGA|v${ARENA_GEN_VERSION}|${seed}|attempt:${attempt}`);
    const grid = new Uint8Array(w * h);
    const rooms: Room[] = [];

    // Room placement: one room per slot unless skipped.
    const placed: boolean[] = new Array(16).fill(true);
    let count = 0;
    for (let i = 0; i < 16; i++) {
      if (layoutRng.chance(0.18)) placed[i] = false;
      else placed[i] = true;
      if (placed[i]) count++;
    }
    // Enforce minimum room count.
    while (count < 13) {
      const idx = layoutRng.int(16);
      if (!placed[idx]) { placed[idx] = true; count++; }
    }

    // Courtyards: one per quadrant (2x2 block of slots).
    const courtyardSlot = new Set<number>();
    for (const qz of [0, 1]) {
      for (const qx of [0, 1]) {
        const cands: number[] = [];
        for (let sz = qz * 2; sz < qz * 2 + 2; sz++) {
          for (let sx = qx * 2; sx < qx * 2 + 2; sx++) {
            const si = sz * 4 + sx;
            if (placed[si]) cands.push(si);
          }
        }
        if (cands.length) courtyardSlot.add(layoutRng.pick(cands));
      }
    }

    let nextRoomId = 0;
    const slotToRoomId = new Array<number>(16).fill(-1);
    const slotCenters: { cx: number; cz: number }[] = new Array(16);

    for (let sz = 0; sz < 4; sz++) {
      for (let sx = 0; sx < 4; sx++) {
        const si = sz * 4 + sx;
        if (!placed[si]) continue;
        const x0 = offset + sx * slotSize;
        const z0 = offset + sz * slotSize;
        const theme = themeCycle[sz % themeCycle.length]!;
        const outdoor = courtyardSlot.has(si);
        let rw = 8 + layoutRng.int(7); // 8..14
        let rh = 8 + layoutRng.int(5); // 8..12
        if (outdoor) { rw += 2; rh += 2; }
        rw = Math.min(rw, slotSize - 2);
        rh = Math.min(rh, slotSize - 2);

        const rx = x0 + layoutRng.int(slotSize - rw);
        const rz = z0 + layoutRng.int(slotSize - rh);
        const r: Room = {
          id: nextRoomId++,
          x: rx,
          z: rz,
          w: rw,
          h: rh,
          cx: (rx + rw / 2) * CELL,
          cz: (rz + rh / 2) * CELL,
          theme,
          outdoor,
          kind: 'spine',
          routeDist: 0,
        };
        rooms.push(r);
        slotToRoomId[si] = r.id;
        slotCenters[si] = { cx: rx + Math.floor(rw / 2), cz: rz + Math.floor(rh / 2) };
        carveRect(grid, w, rx, rz, rw, rh);
      }
    }

    if (rooms.length < 13) continue;

    // Candidate edges between lattice neighbors.
    type Edge = { a: number; b: number; ax: number; az: number; bx: number; bz: number };
    const edges: Edge[] = [];
    const placedSlots = (s: number) => placed[s];
    for (let sz = 0; sz < 4; sz++) {
      for (let sx = 0; sx < 4; sx++) {
        const si = sz * 4 + sx;
        if (!placedSlots(si)) continue;
        const a = slotToRoomId[si];
        if (sx < 3) {
          const sj = sz * 4 + (sx + 1);
          if (placedSlots(sj)) {
            const b = slotToRoomId[sj];
            edges.push({
              a,
              b,
              ax: slotCenters[si]!.cx,
              az: slotCenters[si]!.cz,
              bx: slotCenters[sj]!.cx,
              bz: slotCenters[sj]!.cz,
            });
          }
        }
        if (sz < 3) {
          const sj = (sz + 1) * 4 + sx;
          if (placedSlots(sj)) {
            const b = slotToRoomId[sj];
            edges.push({
              a,
              b,
              ax: slotCenters[si]!.cx,
              az: slotCenters[si]!.cz,
              bx: slotCenters[sj]!.cx,
              bz: slotCenters[sj]!.cz,
            });
          }
        }
      }
    }

    const roomsById = new Map<number, Room>(rooms.map((r) => [r.id, r]));
    const roomIds = rooms.map((r) => r.id);
    const connectRoomGraph = (activeEdges: Edge[]) => {
      const adj = new Map<number, number[]>();
      for (const r of roomIds) adj.set(r, []);
      for (const e of activeEdges) {
        adj.get(e.a)!.push(e.b);
        adj.get(e.b)!.push(e.a);
      }
      const seen = new Set<number>();
      const start = roomIds[0]!;
      const q: number[] = [start];
      seen.add(start);
      while (q.length) {
        const v = q.pop()!;
        for (const nb of adj.get(v) ?? []) if (!seen.has(nb)) { seen.add(nb); q.push(nb); }
      }
      return seen.size === roomIds.length;
    };

    // Consume RNG for ~20% edge-removal attempts while keeping a denser
    // lattice (more loops) so the room graph always has several cycles.
    const targetRemove = Math.floor(edges.length * 0.2);
    const active = edges.slice();
    let removed = 0;
    let guard = 0;
    while (removed < Math.min(2, targetRemove) && active.length > 0 && guard++ < 200) {
      const idx = layoutRng.int(active.length);
      const next = active.slice();
      next.splice(idx, 1);
      if (connectRoomGraph(next) && next.length >= roomIds.length) {
        active.splice(idx, 1);
        removed++;
      }
    }

    const carveLink = (aRoom: Room, bRoom: Room) => {
      const ax = aRoom.x + Math.floor(aRoom.w / 2);
      const az = aRoom.z + Math.floor(aRoom.h / 2);
      const bx = bRoom.x + Math.floor(bRoom.w / 2);
      const bz = bRoom.z + Math.floor(bRoom.h / 2);
      const leg1x = Math.min(ax, bx) - 1;
      const leg1z = az - 1;
      const leg1w = Math.abs(ax - bx) + 3;
      const leg2x = bx - 1;
      const leg2z = Math.min(az, bz) - 1;
      const leg2h = Math.abs(az - bz) + 3;
      carveRect(grid, w, leg1x, leg1z, leg1w, 3);
      carveRect(grid, w, leg2x, leg2z, 3, leg2h);
    };

    // Carve kept adjacency edges.
    for (const e of active) {
      const a = roomsById.get(e.a)!;
      const b = roomsById.get(e.b)!;
      carveLink(a, b);
    }

    // Diagonal shortcuts: 2 edges between rooms two slots apart if possible.
    let shortcuts = 0;
    for (let tries = 0; tries < 200 && shortcuts < 2; tries++) {
      const siA = layoutRng.int(16);
      const siB = layoutRng.int(16);
      if (!placed[siA] || !placed[siB] || siA === siB) continue;
      const axSlot = siA % 4;
      const azSlot = (siA / 4) | 0;
      const bxSlot = siB % 4;
      const bzSlot = (siB / 4) | 0;
      // two slots apart diagonally
      if (Math.abs(axSlot - bxSlot) !== 2 || Math.abs(azSlot - bzSlot) !== 2) continue;
      const a = slotToRoomId[siA];
      const b = slotToRoomId[siB];
      if (a < 0 || b < 0 || a === b) continue;
      carveLink(roomsById.get(a)!, roomsById.get(b)!);
      shortcuts++;
    }

    if (!computeFloorReachable(grid, w, h)) continue;

    // Determine largest room: make it the arena + start anchor.
    const largest = rooms.reduce((best, r) => (r.w * r.h > best.w * best.h ? r : best), rooms[0]!);
    const largestRoomId = largest.id;
    // Ensure room0 is the largest (stable pad ordering).
    const sorted = rooms
      .slice()
      .sort((a, b) => (b.w * b.h) - (a.w * a.h));
    const rooms2: Room[] = sorted.map((r, i) => ({
      ...r,
      id: i,
      kind: r.id === largestRoomId ? 'arena' : 'spine',
    }));

    // Re-derive slot->room id for new ids.
    // (Only needed for theme/courtyard; ids above were used just for edges.)
    const arenaRoomId = 0; // largest after sort
    const startRoomId = 0;
    const antechamberId = 0;

    const seal = { cells: [] as [number, number][], x: 0, z: 0, axis: 'x' as const };
    const sealBreak = { type: 'gun' as const, gun: 7 };

    // Pads (content stream, ids in placement order).
    const used = new Set<number>();
    const floorNeighborOk = (cx: number, cz: number) => neighborFloorCount(grid, w, cx, cz) >= 3;
    const key = (x: number, z: number) => z * w + x;

    const interiorCellsByRoom = rooms2.map((r) => {
      const cells: [number, number][] = [];
      for (let cz = r.z + 1; cz <= r.z + r.h - 2; cz++) {
        for (let cx = r.x + 1; cx <= r.x + r.w - 2; cx++) {
          if (grid[cz * w + cx] !== 1) continue;
          if (!floorNeighborOk(cx, cz)) continue;
          if (cx < 1 || cz < 1 || cx >= w - 1 || cz >= h - 1) continue;
          cells.push([cx, cz]);
        }
      }
      return { room: r, cells };
    });

    const anyCells: [number, number][] = [];
    for (let cz = 1; cz < h - 1; cz++) {
      for (let cx = 1; cx < w - 1; cx++) {
        if (grid[cz * w + cx] !== 1) continue;
        if (!floorNeighborOk(cx, cz)) continue;
        anyCells.push([cx, cz]);
      }
    }

    const pickups: PickupDef[] = [];
    let pickupId = 0;

    const pickFromInterior = (rooms: typeof interiorCellsByRoom, avoidRooms: Set<number> | null) => {
      for (let tries = 0; tries < 80; tries++) {
        const rc = rooms[contentRng.int(rooms.length)]!;
        if (avoidRooms && avoidRooms.has(rc.room.id)) continue;
        if (!rc.cells.length) continue;
        const cell = rc.cells[contentRng.int(rc.cells.length)]!;
        const k = key(cell[0], cell[1]);
        if (used.has(k)) continue;
        used.add(k);
        return { cell, roomId: rc.room.id };
      }
      return null;
    };

    // gun 2 and 3: 2 each on distinct rooms.
    const placeGun = (gun: number, count: number, distinctRooms: boolean) => {
      const placedRooms = new Set<number>();
      for (let i = 0; i < count; i++) {
        const res = pickFromInterior(
          interiorCellsByRoom,
          distinctRooms ? placedRooms : null,
        );
        if (!res) continue;
        const [cx, cz] = res.cell;
        pickups.push({
          id: pickupId++,
          kind: 'gun',
          gun,
          x: cellToWorld(cx),
          z: cellToWorld(cz),
          roomId: res.roomId,
        });
        used.add(key(cx, cz));
        if (distinctRooms) placedRooms.add(res.roomId);
      }
    };

    placeGun(2, 2, true);
    placeGun(3, 2, true);

    // gun 4..6: 1 each anywhere in interiors.
    const placeSingleGunAny = (gun: number) => {
      const rPick = pickFromInterior(interiorCellsByRoom, null);
      if (!rPick) return;
      const [cx, cz] = rPick.cell;
      pickups.push({
        id: pickupId++,
        kind: 'gun',
        gun,
        x: cellToWorld(cx),
        z: cellToWorld(cz),
        roomId: rPick.roomId,
      });
      used.add(key(cx, cz));
    };

    placeSingleGunAny(4);
    placeSingleGunAny(5);
    placeSingleGunAny(6);

    // gun 7: exactly one pad in the largest room (room0).
    const largestInterior = interiorCellsByRoom[0]!;
    if (largestInterior.cells.length) {
      let pick = largestInterior.cells[contentRng.int(largestInterior.cells.length)]!;
      let guard = 0;
      while (used.has(key(pick[0], pick[1])) && guard++ < 200) pick = largestInterior.cells[contentRng.int(largestInterior.cells.length)]!;
      const [cx, cz] = pick;
      pickups.push({
        id: pickupId++,
        kind: 'gun',
        gun: 7,
        x: cellToWorld(cx),
        z: cellToWorld(cz),
        roomId: 0,
      });
      used.add(key(cx, cz));
    }

    const ammoWeightsByGun: [number, number][] = [
      [1, 3], [2, 2], [3, 2], [4, 1], [5, 1], [6, 1], [7, 1],
    ];
    const pickAmmoType = (): AmmoType => {
      let total = 0;
      for (const [, w] of ammoWeightsByGun) total += w;
      let roll = contentRng.float() * total;
      for (const [gun, w] of ammoWeightsByGun) {
        roll -= w;
        if (roll <= 0) {
          return WEAPONS[gun - 1]!.ammo as AmmoType;
        }
      }
      return WEAPONS[0]!.ammo as AmmoType;
    };

    const ammoCount = Math.round(1.1 * rooms2.length);
    for (let i = 0; i < ammoCount; i++) {
      let placedCell: [number, number] | null = null;
      for (let tries = 0; tries < 80; tries++) {
        const c = anyCells[contentRng.int(anyCells.length)]!;
        const k = key(c[0], c[1]);
        if (used.has(k)) continue;
        used.add(k);
        placedCell = c;
        break;
      }
      if (!placedCell) continue;
      const ammoType = pickAmmoType();
      const wdef = WEAPONS.find((w) => w.ammo === ammoType)!;
      pickups.push({
        id: pickupId++,
        kind: 'ammo',
        ammoType,
        amount: wdef.boxAmmo,
        x: cellToWorld(placedCell[0]),
        z: cellToWorld(placedCell[1]),
        roomId: 0,
      });
    }

    const medikitCount = Math.round(0.5 * rooms2.length);
    for (let i = 0; i < medikitCount; i++) {
      let placedCell: [number, number] | null = null;
      for (let tries = 0; tries < 80; tries++) {
        const c = anyCells[contentRng.int(anyCells.length)]!;
        const k = key(c[0], c[1]);
        if (used.has(k)) continue;
        used.add(k);
        placedCell = c;
        break;
      }
      if (!placedCell) continue;
      pickups.push({
        id: pickupId++,
        kind: 'medikit',
        x: cellToWorld(placedCell[0]),
        z: cellToWorld(placedCell[1]),
        roomId: 0,
      });
    }

    // Lights / wall decors.
    const cosmetics = placeCosmetics(grid, rooms2, layoutRng, w, h);

    // Player start = center of room0 (largest).
    const start = rooms2[0]!;
    const map: GameMap = {
      version: ARENA_GEN_VERSION,
      seed,
      difficulty: 'normal',
      w,
      h,
      grid,
      rooms: rooms2,
      doors: [],
      seal: seal,
      sealBreak,
      decors: cosmetics.decors,
      pickups,
      enemies: [],
      lights: cosmetics.lights,
      secrets: [],
      playerStart: { x: start.cx, z: start.cz, yaw: Math.PI / 2 },
      startRoomId,
      arenaRoomId,
      antechamberId,
      vaultRoomId: -1,
      sealBreakMessage: undefined,
      title: undefined,
    };

    // Attachments for server/client sync (hash computed separately).
    // Note: GameMap type does not include `gridHash`; protocol computes it.

    return map;
  }

  throw new Error(`generateArena: could not place a connected arena for seed=${seed}`);
}
