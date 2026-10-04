// Room vertical grammar: presentation-only ceiling heights, art identities and
// tall-room dressing derived from an unchanged GameMap. Collision and line of
// sight are 2D, so nothing here can change how a seed plays. Variation comes
// from a render-local hash of the map seed and room id, never from src/sim RNG.
import { CELL, WALL_H, type GameMap, type Room, type Theme } from '../sim/types';
import type { CampaignArtId } from './campaignTextures';

/** Height of the original indoor wall and of every corridor. */
export const BASE_CEILING = WALL_H;
/** The upper-wall register starts at the original wall height. */
export const UPPER_REGISTER_Y = WALL_H;
/** Hanging pieces reach 3.2 m below the ceiling and must stay above 4.6 m. */
export const HANG_MIN_CEILING = 8;
export const HANG_DEPTH = 3.2;
/** Depth below the ceiling of each hanging piece's lit part
 * (tools/modern-art/build_environment_kit.py); a practical light sits there. */
export const HANG_GLOW_DEPTH: Record<CampaignArtId, number> = {
  foundry: 2.1, gullet: 2.3, catacombs: 2.25, pit: 2.7,
  spire: 2.1, ward: 1.95, sanctum: 2.0,
};

export interface RoomVolume {
  room: Room;
  art: CampaignArtId;
  ceiling: number;
}

export interface RoomVolumes {
  /** True when this map uses the grammar (raised rooms, run-based dressing). */
  vertical: boolean;
  /** The single identity of a campaign map, or the most common one in a maze. */
  primaryArt: CampaignArtId;
  rooms: RoomVolume[];
  ceilingAt(x: number, z: number): number;
  artAt(x: number, z: number): CampaignArtId;
  roomAt(x: number, z: number): RoomVolume | undefined;
}

/** Maze rooms keep their generated theme; each theme has a pair of identities
 * so neighbouring rooms of one theme do not all share a look. */
const THEME_ART: Record<Theme, CampaignArtId[]> = {
  industrial: ['foundry', 'pit'],
  organic: ['gullet'],
  stone: ['catacombs', 'spire'],
  tech: ['sanctum', 'ward'],
};

/** Campaign identities using the grammar. The pilot covers the Gullet; the
 * others keep the original flat-ceiling dressing until reviewed. */
export const VERTICAL_CAMPAIGN_ART: ReadonlySet<CampaignArtId> = new Set(['gullet']);

/** FNV-1a; deterministic across engines, independent of the simulation. */
export function cosmeticHash(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Unit interval value for a key; used for every cosmetic choice. */
export function cosmeticUnit(seed: string, key: string): number {
  return cosmeticHash(`${seed}|${key}`) / 0x100000000;
}

function roomCeiling(map: GameMap, room: Room): number {
  if (room.outdoor || room.kind === 'secret') return BASE_CEILING;
  const area = room.w * room.h;
  if (Math.min(room.w, room.h) < 5 || area < 42) return BASE_CEILING;
  const base = room.kind === 'arena' ? 14
    : area >= 150 ? 12.5
      : area >= 100 ? 11
        : area >= 64 ? 9.5
          : 8;
  // Half-metre steps keep neighbouring rooms of one size class distinct.
  const jitter = Math.floor(cosmeticUnit(map.seed, `ceiling:${room.id}`) * 3) * .5 - .5;
  return base + jitter;
}

export function planRoomVolumes(map: GameMap, artId?: CampaignArtId, maze = false): RoomVolumes {
  const vertical = artId ? VERTICAL_CAMPAIGN_ART.has(artId) : maze;
  const rooms: RoomVolume[] = map.rooms.map(room => {
    const choices = THEME_ART[room.theme] ?? THEME_ART.industrial;
    const art = artId ?? (vertical
      ? choices[Math.floor(cosmeticUnit(map.seed, `art:${room.id}`) * choices.length)]
      : 'foundry');
    return { room, art, ceiling: vertical ? roomCeiling(map, room) : BASE_CEILING };
  });
  const cellRoom = new Int32Array(map.w * map.h).fill(-1);
  rooms.forEach((volume, i) => {
    const { x, z, w, h } = volume.room;
    for (let cz = z; cz < z + h; cz++) for (let cx = x; cx < x + w; cx++) {
      if (cx >= 0 && cz >= 0 && cx < map.w && cz < map.h) cellRoom[cz * map.w + cx] = i;
    }
  });
  // Corridors inherit the identity of the nearest room centre, as the
  // original theme lookup does, and always keep the original headroom.
  const corridorArt = new Map<number, CampaignArtId>();
  const nearestArt = (x: number, z: number): CampaignArtId => {
    const key = z * map.w + x;
    const known = corridorArt.get(key);
    if (known) return known;
    let best = rooms[0];
    let bestD = Infinity;
    for (const volume of rooms) {
      const d = Math.hypot(volume.room.cx / CELL - x, volume.room.cz / CELL - z);
      if (d < bestD) { bestD = d; best = volume; }
    }
    const art = best?.art ?? artId ?? 'foundry';
    corridorArt.set(key, art);
    return art;
  };
  const roomAt = (x: number, z: number) => {
    if (x < 0 || z < 0 || x >= map.w || z >= map.h) return undefined;
    const i = cellRoom[z * map.w + x];
    return i < 0 ? undefined : rooms[i];
  };
  const counts = new Map<CampaignArtId, number>();
  for (const volume of rooms) counts.set(volume.art, (counts.get(volume.art) ?? 0) + volume.room.w * volume.room.h);
  const primaryArt = artId ?? [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? 'foundry';
  return {
    vertical,
    primaryArt,
    rooms,
    roomAt,
    ceilingAt: (x, z) => roomAt(x, z)?.ceiling ?? BASE_CEILING,
    artAt: (x, z) => artId ?? roomAt(x, z)?.art ?? (vertical ? nearestArt(x, z) : 'foundry'),
  };
}

export interface TallRoomPlacement {
  module: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  scaleY?: number;
}

/** Overhead members across the short axis and suspended pieces, per tall room.
 * Spacing and phase come from the cosmetic hash so rooms differ. */
export function tallRoomOverheads(map: GameMap, volumes: RoomVolumes): TallRoomPlacement[] {
  const out: TallRoomPlacement[] = [];
  for (const { room, art, ceiling } of volumes.rooms) {
    if (ceiling <= BASE_CEILING) continue;
    const alongX = room.w >= room.h; // members span the short (z) axis
    const length = alongX ? room.w : room.h;
    const across = alongX ? room.h : room.w;
    const spacing = 3 + Math.floor(cosmeticUnit(map.seed, `span:${room.id}`) * 2); // 3–4 cells
    const count = Math.max(1, Math.floor((length - 1) / spacing));
    const start = (length - (count - 1) * spacing) / 2; // centred bays
    const hangEvery = ceiling >= HANG_MIN_CEILING ? 1 + Math.floor(cosmeticUnit(map.seed, `hang:${room.id}`) * 2) : 0;
    for (let i = 0; i < count; i++) {
      const along = start + i * spacing;
      for (let k = 0; k < across; k++) {
        const a = (alongX ? room.x : room.z) * CELL + along * CELL;
        const b = (alongX ? room.z : room.x) * CELL + (k + .5) * CELL;
        out.push({ module: `${art}_span`, x: alongX ? a : b, y: ceiling, z: alongX ? b : a, yaw: alongX ? Math.PI / 2 : 0 });
      }
      if (!hangEvery || i % hangEvery) continue;
      // Pieces hang between members, a third of the way in from each side,
      // so a room reads as a sequence of bays rather than a central lamp.
      const between = along + spacing / 2 <= length - 1 ? along + spacing / 2 : along - spacing / 2;
      for (const fraction of across >= 8 ? [1 / 3, 2 / 3] : [.5]) {
        const a = (alongX ? room.x : room.z) * CELL + between * CELL;
        const b = (alongX ? room.z : room.x) * CELL + across * fraction * CELL;
        out.push({ module: `${art}_hang`, x: alongX ? a : b, y: ceiling, z: alongX ? b : a, yaw: 0 });
      }
    }
  }
  return out;
}
