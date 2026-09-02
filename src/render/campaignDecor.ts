// Campaign-only extra artwork placement. Driven by art id + GameMap room
// kinds already on the compiled map — does not rewrite JSON or generateMap.
// Renderer-side only: extras never enter GameMap.decors.
// Optional heroDecals (one prominent ClampToEdge quad per map) use hint
// arena-back / pit-rim / sanctum-apse; missing field → no hero.
import * as THREE from 'three';
import { CELL, CEIL_H, cellToWorld } from '../sim/types';
import type { GameMap, Room } from '../sim/types';
import {
  resolveHeroDecals,
  type CampaignArtId, type CampaignHeroDecal, type CampaignTextureLib,
} from './campaignTextures';

export const CAMPAIGN_AMBIENT: Record<CampaignArtId, [number, number, number]> = {
  foundry: [0.30, 0.16, 0.09],
  gullet: [0.30, 0.10, 0.12],
  catacombs: [0.16, 0.16, 0.15],
  pit: [0.20, 0.18, 0.10],
  spire: [0.16, 0.14, 0.24],
  ward: [0.12, 0.20, 0.20],
  sanctum: [0.18, 0.10, 0.22],
};

export const CAMPAIGN_FOG: Record<CampaignArtId, number> = {
  foundry: 0x1a0c08,
  gullet: 0x16080c,
  catacombs: 0x0e0d0b,
  pit: 0x141208,
  spire: 0x0c0a14,
  ward: 0x0a1212,
  sanctum: 0x100814,
};

export const CAMPAIGN_DOOR_EMISSIVE: Record<CampaignArtId, number> = {
  foundry: 0x4a1800,
  gullet: 0x3a0810,
  catacombs: 0x2a2418,
  pit: 0x3a3010,
  spire: 0x2a1840,
  ward: 0x103030,
  sanctum: 0x2a1050,
};

export type ExtraKind = 'decal' | 'chain' | 'glow' | 'shelf' | 'banner' | 'floor' | 'hero';

export interface ExtraPlacement {
  kind: ExtraKind;
  decalId?: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  w: number;
  h: number;
  color?: number;
  additive?: boolean;
}

type RoomKind = Room['kind'];

interface WallSlot {
  x: number;
  y: number;
  z: number;
  yaw: number;
  room: Room;
}

const DIRS: [number, number, number][] = [
  [1, 0, -Math.PI / 2],
  [-1, 0, Math.PI / 2],
  [0, 1, Math.PI],
  [0, -1, 0],
];

function solid(map: GameMap, x: number, z: number): boolean {
  return x < 0 || z < 0 || x >= map.w || z >= map.h || map.grid[z * map.w + x] === 0;
}

function nearExistingDecor(map: GameMap, x: number, z: number, min = 0.95): boolean {
  for (const d of map.decors) {
    if (Math.hypot(d.x - x, d.z - z) < min) return true;
  }
  return false;
}

function collectWallSlots(map: GameMap, room: Room): WallSlot[] {
  const out: WallSlot[] = [];
  for (let z = room.z; z < room.z + room.h; z++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      if (solid(map, x, z)) continue;
      for (const [dx, dz, yaw] of DIRS) {
        if (!solid(map, x + dx, z + dz)) continue;
        const wx = cellToWorld(x) + dx * (CELL / 2 - 0.03);
        const wz = cellToWorld(z) + dz * (CELL / 2 - 0.03);
        if (nearExistingDecor(map, wx, wz)) continue;
        out.push({ x: wx, y: 1.65, z: wz, yaw, room });
      }
    }
  }
  return out;
}

function takeStride<T>(items: T[], stride: number, offset = 0, max = 18): T[] {
  const out: T[] = [];
  for (let i = offset; i < items.length && out.length < max; i += Math.max(1, stride)) {
    out.push(items[i]);
  }
  return out;
}

function roomsOf(map: GameMap, kinds: RoomKind[]): Room[] {
  return map.rooms.filter(r => kinds.includes(r.kind));
}

function hangPoints(room: Room, step: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  const inset = 1;
  for (let z = room.z + inset; z < room.z + room.h - inset; z += step) {
    for (let x = room.x + inset; x < room.x + room.w - inset; x += step) {
      out.push({ x: cellToWorld(x), z: cellToWorld(z) });
    }
  }
  return out;
}

const SPINE: RoomKind[] = ['spine'];
const WORK: RoomKind[] = ['spine', 'spur'];
const HALL: RoomKind[] = ['spine', 'antechamber'];
const BIG: RoomKind[] = ['spine', 'arena'];
const RITUAL: RoomKind[] = ['arena', 'antechamber'];
const SIDE: RoomKind[] = ['spur', 'vault'];

export function planCampaignExtras(map: GameMap, artId: CampaignArtId): ExtraPlacement[] {
  const extras: ExtraPlacement[] = [];
  const push = (e: ExtraPlacement) => {
    if (extras.length < 96) extras.push(e);
  };

  const slotsFor = (kinds: RoomKind[], stride: number, offset = 0, max = 18): WallSlot[] => {
    const slots: WallSlot[] = [];
    for (const r of roomsOf(map, kinds)) slots.push(...collectWallSlots(map, r));
    return takeStride(slots, stride, offset, max);
  };

  if (artId === 'foundry') {
    for (const s of slotsFor(WORK, 3, 0)) {
      push({ kind: 'decal', decalId: 'furnace', x: s.x, y: 1.7, z: s.z, yaw: s.yaw, w: CELL * 0.9, h: CELL * 0.9 });
    }
    for (const s of slotsFor(SPINE, 4, 1)) {
      push({ kind: 'glow', decalId: 'slag', x: s.x, y: 1.15, z: s.z, yaw: s.yaw, w: CELL * 0.7, h: CELL * 0.55, color: 0xff6a18, additive: true });
    }
    for (const r of roomsOf(map, WORK)) {
      if (r.outdoor) continue;
      for (const p of hangPoints(r, 3)) {
        push({ kind: 'chain', decalId: 'chain', x: p.x, y: CEIL_H - 0.85, z: p.z, yaw: 0.2, w: 0.16, h: 1.7, color: 0x3a2a22 });
      }
    }
  } else if (artId === 'gullet') {
    for (const s of slotsFor(WORK, 3, 0)) {
      push({ kind: 'decal', decalId: 'membrane', x: s.x, y: 1.75, z: s.z, yaw: s.yaw, w: CELL, h: CELL });
    }
    for (const s of slotsFor(SPINE, 4, 2)) {
      push({ kind: 'decal', decalId: 'tooth', x: s.x, y: 2.15, z: s.z, yaw: s.yaw, w: CELL * 0.7, h: CELL * 0.55 });
    }
    for (const s of slotsFor(WORK, 5, 1)) {
      push({ kind: 'glow', decalId: 'drip', x: s.x, y: 2.6, z: s.z, yaw: s.yaw, w: 0.35, h: 1.4, color: 0xc04038, additive: true });
    }
    for (const r of roomsOf(map, SPINE)) {
      if (r.outdoor) continue;
      for (const p of hangPoints(r, 3)) {
        push({ kind: 'chain', decalId: 'membrane', x: p.x, y: CEIL_H - 0.7, z: p.z, yaw: 0.4, w: 0.5, h: 1.4, color: 0x6a2030 });
      }
    }
  } else if (artId === 'catacombs') {
    for (const s of slotsFor(WORK, 3, 1, 12)) {
      push({ kind: 'shelf', decalId: 'ossuary', x: s.x, y: 1.2, z: s.z, yaw: s.yaw, w: 1.45, h: 0.1, color: 0xc8b890 });
      push({ kind: 'shelf', decalId: 'ossuary', x: s.x, y: 2.35, z: s.z, yaw: s.yaw, w: 1.45, h: 0.1, color: 0xc8b890 });
    }
    for (const s of slotsFor(WORK, 3, 0, 14)) {
      push({ kind: 'decal', decalId: 'epitaph', x: s.x, y: 1.85, z: s.z, yaw: s.yaw, w: CELL * 0.75, h: CELL * 0.75 });
    }
    for (const s of slotsFor(SIDE, 2, 0, 10)) {
      push({ kind: 'decal', decalId: 'femur', x: s.x, y: 1.55, z: s.z, yaw: s.yaw, w: CELL * 0.8, h: CELL * 0.45 });
    }
  } else if (artId === 'pit') {
    for (const s of slotsFor(WORK, 4, 0)) {
      push({ kind: 'decal', decalId: 'rust', x: s.x, y: 1.6, z: s.z, yaw: s.yaw, w: CELL * 0.85, h: CELL * 0.85 });
    }
    for (const r of map.rooms.filter(rm => rm.outdoor)) {
      const pts = hangPoints(r, 2);
      for (let i = 0; i < pts.length; i += 2) {
        const p = pts[i];
        push({ kind: 'floor', decalId: 'grate', x: p.x, y: 0.03, z: p.z, yaw: 0, w: CELL * 1.4, h: CELL * 1.4, color: 0x3a4020 });
      }
      for (let i = 1; i < pts.length; i += 3) {
        const p = pts[i];
        push({ kind: 'floor', decalId: 'acid', x: p.x, y: 0.04, z: p.z, yaw: 0, w: CELL, h: CELL, color: 0xc8d040, additive: true });
      }
    }
    for (const r of roomsOf(map, SPINE)) {
      if (r.outdoor) continue;
      for (const p of hangPoints(r, 3)) {
        push({ kind: 'chain', decalId: 'grate', x: p.x, y: CEIL_H - 0.8, z: p.z, yaw: 0.15, w: 0.14, h: 1.6, color: 0x3a3220 });
      }
    }
  } else if (artId === 'spire') {
    for (const s of slotsFor(BIG, 3, 0)) {
      push({ kind: 'glow', decalId: 'window', x: s.x, y: 2.1, z: s.z, yaw: s.yaw, w: CELL * 0.7, h: 2.6, color: 0xd4a84a, additive: true });
    }
    for (const s of slotsFor(HALL, 4, 1)) {
      push({ kind: 'decal', decalId: 'brass', x: s.x, y: 1.55, z: s.z, yaw: s.yaw, w: CELL * 0.7, h: CELL * 0.7 });
    }
    for (const s of slotsFor(SPINE, 4, 2)) {
      push({ kind: 'banner', decalId: 'banner', x: s.x, y: 2.4, z: s.z, yaw: s.yaw, w: 0.7, h: 2.2, color: 0x3a2c4a });
    }
  } else if (artId === 'ward') {
    for (const s of slotsFor(WORK, 3, 0)) {
      push({ kind: 'decal', decalId: 'chart', x: s.x, y: 1.8, z: s.z, yaw: s.yaw, w: CELL * 0.8, h: CELL * 0.65 });
    }
    for (const s of slotsFor(WORK, 4, 2)) {
      push({ kind: 'decal', decalId: 'restraint', x: s.x, y: 1.5, z: s.z, yaw: s.yaw, w: CELL * 0.7, h: CELL * 0.9 });
    }
    for (const s of slotsFor(HALL, 3, 1)) {
      push({ kind: 'glow', decalId: 'wardlamp', x: s.x, y: 3.15, z: s.z, yaw: s.yaw, w: CELL * 0.9, h: 0.22, color: 0x7ad0c8, additive: true });
    }
    for (const s of slotsFor(SIDE, 2, 0)) {
      push({ kind: 'shelf', x: s.x, y: 1.05, z: s.z, yaw: s.yaw, w: 1.3, h: 0.08, color: 0x8aa0a0 });
    }
  } else {
    // sanctum
    for (const s of slotsFor(HALL, 3, 0)) {
      push({ kind: 'decal', decalId: 'relic', x: s.x, y: 1.7, z: s.z, yaw: s.yaw, w: CELL * 0.75, h: CELL * 0.75 });
    }
    for (const s of slotsFor(SPINE, 4, 1)) {
      push({ kind: 'banner', decalId: 'veil', x: s.x, y: 2.35, z: s.z, yaw: s.yaw, w: 0.85, h: 2.4, color: 0x4a2080 });
    }
    for (const r of roomsOf(map, RITUAL)) {
      push({
        kind: 'floor', decalId: 'sigil',
        x: r.cx, y: 0.03, z: r.cz, yaw: 0,
        w: Math.min(r.w, r.h) * CELL * 0.55,
        h: Math.min(r.w, r.h) * CELL * 0.55,
        color: 0xc46aff, additive: true,
      });
    }
    for (const s of slotsFor(RITUAL, 4, 2)) {
      push({ kind: 'glow', decalId: 'sigil', x: s.x, y: 2.0, z: s.z, yaw: s.yaw, w: CELL * 0.6, h: CELL * 0.6, color: 0xc46aff, additive: true });
    }
  }

  return extras;
}

export type HeroHint = 'arena-back' | 'pit-rim' | 'sanctum-apse';

const HERO_WALL_INSET = CELL / 2 - 0.06;

function pickHeroDecal(
  heroes: CampaignHeroDecal[],
  artId: CampaignArtId,
  seed: string,
): CampaignHeroDecal | undefined {
  if (!heroes.length) return undefined;
  const seedL = seed.toLowerCase();
  const match = heroes.find(h => {
    if (!h.map) return true;
    const m = h.map.toLowerCase();
    return m === artId || seedL.includes(m) || m.includes(artId);
  });
  return match;
}

export function normalizeHeroHint(hint: string | undefined, artId: CampaignArtId): HeroHint {
  const h = (hint ?? '').toLowerCase();
  if (/\brim\b/.test(h) || h.includes('pit-rim')) return 'pit-rim';
  if (h.includes('apse') || h.includes('choir') || h.includes('narthex')) return 'sanctum-apse';
  if (h.includes('arena') || h.includes('back')) return 'arena-back';
  if (artId === 'pit') return 'pit-rim';
  if (artId === 'sanctum') return 'sanctum-apse';
  return 'arena-back';
}

function facesOnSide(map: GameMap, room: Room, dx: number, dz: number, yaw: number): WallSlot[] {
  const out: WallSlot[] = [];
  for (let z = room.z; z < room.z + room.h; z++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      if (solid(map, x, z)) continue;
      if (!solid(map, x + dx, z + dz)) continue;
      if (dx === 0 && z !== (dz < 0 ? room.z : room.z + room.h - 1)) continue;
      if (dz === 0 && x !== (dx < 0 ? room.x : room.x + room.w - 1)) continue;
      out.push({
        x: cellToWorld(x) + dx * HERO_WALL_INSET,
        y: 2.1,
        z: cellToWorld(z) + dz * HERO_WALL_INSET,
        yaw,
        room,
      });
    }
  }
  return out;
}

function longestRunMid(faces: WallSlot[]): WallSlot | null {
  if (!faces.length) return null;
  // facesOnSide walks x then z; group by the axis that varies
  return faces[Math.floor(faces.length / 2)] ?? null;
}

function sideDistance(
  room: Room,
  dx: number,
  dz: number,
  fromX: number,
  fromZ: number,
): number {
  const cx = room.cx + dx * (room.w * CELL) / 2;
  const cz = room.cz + dz * (room.h * CELL) / 2;
  return Math.hypot(cx - fromX, cz - fromZ);
}

function bestWallOnRoom(
  map: GameMap,
  room: Room,
  fromX: number,
  fromZ: number,
  preferFarthest: boolean,
): WallSlot | null {
  const ranked = DIRS
    .map(([dx, dz, yaw]) => ({
      dx, dz, yaw,
      dist: sideDistance(room, dx, dz, fromX, fromZ),
      faces: facesOnSide(map, room, dx, dz, yaw),
    }))
    .filter(s => s.faces.length > 0)
    .sort((a, b) => preferFarthest
      ? (b.dist - a.dist) || (b.faces.length - a.faces.length)
      : (b.faces.length - a.faces.length) || (b.dist - a.dist));
  const top = ranked[0];
  return top ? longestRunMid(top.faces) : null;
}

function arenaRoomOf(map: GameMap): Room | undefined {
  return map.rooms.find(r => r.kind === 'arena')
    ?? map.rooms.find(r => r.id === map.arenaRoomId)
    ?? map.rooms[map.arenaRoomId];
}

function anteRef(map: GameMap): { x: number; z: number } {
  const ante = map.rooms.find(r => r.kind === 'antechamber')
    ?? map.rooms.find(r => r.id === map.antechamberId);
  if (ante) return { x: ante.cx, z: ante.cz };
  return { x: map.seal.x, z: map.seal.z };
}

function startRef(map: GameMap): { x: number; z: number } {
  const start = map.rooms.find(r => r.kind === 'start')
    ?? map.rooms.find(r => r.id === map.startRoomId);
  if (start) return { x: start.cx, z: start.cz };
  return map.playerStart;
}

function apseRoomOf(map: GameMap): Room | undefined {
  const start = startRef(map);
  let best: Room | undefined;
  let bestD = -1;
  for (const r of map.rooms) {
    if (r.kind === 'arena' || r.kind === 'antechamber' || r.kind === 'start') continue;
    const d = Math.hypot(r.cx - start.x, r.cz - start.z);
    if (d > bestD) {
      bestD = d;
      best = r;
    }
  }
  return best ?? arenaRoomOf(map);
}

function pitRimRoom(map: GameMap): Room | undefined {
  const outdoor = map.rooms.filter(r => r.outdoor);
  if (!outdoor.length) return arenaRoomOf(map);
  outdoor.sort((a, b) => (b.w * b.h) - (a.w * a.h));
  return outdoor[0];
}

function heroSize(outdoor: boolean, faceCount: number): { w: number; h: number; y: number } {
  const run = Math.max(1, faceCount) * CELL;
  const w = Math.min(CELL * 2.6, Math.max(CELL * 0.95, run * 0.72));
  const h = outdoor ? 3.7 : 3.05;
  const y = outdoor ? 2.35 : 2.05;
  return { w, h, y };
}

export function planHeroPlacement(
  map: GameMap,
  artId: CampaignArtId,
  heroes: CampaignHeroDecal[],
): ExtraPlacement | null {
  const hero = pickHeroDecal(heroes, artId, map.seed);
  if (!hero) return null;
  const hint = normalizeHeroHint(hero.hint, artId);
  let room: Room | undefined;
  let from: { x: number; z: number };
  let preferFarthest = true;
  if (hint === 'pit-rim') {
    room = pitRimRoom(map);
    const arena = arenaRoomOf(map);
    from = arena ? { x: arena.cx, z: arena.cz } : startRef(map);
    preferFarthest = true;
  } else if (hint === 'sanctum-apse') {
    room = apseRoomOf(map);
    from = startRef(map);
    preferFarthest = true;
  } else {
    room = arenaRoomOf(map);
    from = anteRef(map);
    preferFarthest = true;
  }
  if (!room) return null;
  const slot = bestWallOnRoom(map, room, from.x, from.z, preferFarthest);
  if (!slot) return null;
  let chosenCount = 1;
  for (const [dx, dz, yaw] of DIRS) {
    const faces = facesOnSide(map, room, dx, dz, yaw);
    if (faces.some(f => Math.abs(f.x - slot.x) < 0.01 && Math.abs(f.z - slot.z) < 0.01 && f.yaw === yaw)) {
      chosenCount = faces.length;
      break;
    }
  }
  const size = heroSize(!!room.outdoor, chosenCount);
  return {
    kind: 'hero',
    decalId: hero.id,
    x: slot.x,
    y: size.y,
    z: slot.z,
    yaw: slot.yaw,
    w: size.w,
    h: size.h,
  };
}

function decalTex(lib: CampaignTextureLib, id: string | undefined): THREE.Texture | undefined {
  if (!id) return undefined;
  return lib.extraDecals.find(d => d.id === id)?.tex;
}

function heroTex(lib: CampaignTextureLib, artId: CampaignArtId, id: string | undefined): THREE.Texture | undefined {
  if (!id) return undefined;
  const heroes = resolveHeroDecals(artId, lib);
  const hit = heroes.find(h => h.id === id);
  if (hit) return hit.tex;
  return decalTex(lib, id);
}

export function applyCampaignDecor(
  group: THREE.Group,
  map: GameMap,
  artId: CampaignArtId,
  lib: CampaignTextureLib,
  disposables: THREE.BufferGeometry[],
): number {
  const extras = planCampaignExtras(map, artId);
  const hero = planHeroPlacement(map, artId, resolveHeroDecals(artId, lib));
  const all = hero ? extras.concat(hero) : extras;
  for (const e of all) {
    const tex = e.kind === 'hero'
      ? heroTex(lib, artId, e.decalId)
      : decalTex(lib, e.decalId);
    if (tex && e.kind === 'hero') {
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
    }
    if (e.kind === 'shelf') {
      const geo = new THREE.BoxGeometry(e.w, e.h, 0.34);
      disposables.push(geo);
      const mat = new THREE.MeshBasicMaterial({
        map: tex, color: e.color ?? 0xc8b890, fog: true,
      });
      const mesh = new THREE.Mesh(geo, mat);
      const depth = 0.2;
      mesh.position.set(e.x + Math.sin(e.yaw) * depth, e.y, e.z + Math.cos(e.yaw) * depth);
      mesh.rotation.y = e.yaw;
      mesh.renderOrder = 1;
      group.add(mesh);
      continue;
    }

    const geo = new THREE.PlaneGeometry(e.w, e.h);
    disposables.push(geo);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      color: e.color ?? 0xffffff,
      transparent: true,
      depthWrite: false,
      fog: true,
      side: THREE.DoubleSide,
      blending: e.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    if (e.kind === 'floor') {
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(e.x, e.y, e.z);
    } else if (e.kind === 'chain') {
      mesh.position.set(e.x, e.y, e.z);
      mesh.rotation.y = e.yaw;
      const cross = new THREE.Mesh(geo, mat);
      cross.rotation.y = e.yaw + Math.PI / 2;
      cross.position.copy(mesh.position);
      cross.renderOrder = 1;
      group.add(cross);
    } else {
      mesh.position.set(e.x, e.y, e.z);
      mesh.rotation.y = e.yaw;
    }
    mesh.renderOrder = e.kind === 'hero' ? 2 : 1;
    group.add(mesh);
  }
  return all.length;
}
