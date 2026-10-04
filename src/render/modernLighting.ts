import * as THREE from 'three';
import { CELL, type GameMap, type Room, type RoomLight } from '../sim/types';
import type { CampaignArtId } from './campaignTextures';
import { environmentFixtures, CAMPAIGN_ENVIRONMENT_PALETTES } from './campaignEnvironment';
import type { RoomVolumes } from './roomVolumes';
import { foundryCell } from './foundry';

export const MODERN_PRACTICAL_LIGHT_LIMIT = 12;

export interface ModernPracticalLight {
  roomId: number;
  sourceIndex: number;
  x: number;
  y: number;
  z: number;
  color: [number, number, number];
  intensity: number;
  distance: number;
  decay: number;
}

// Lens heights in tools/modern-art/build_environment_kit.py. The light sits
// just beyond the shallow saved housing, on its walkable side.
const FIXTURE_HEIGHT: Record<CampaignArtId, number> = {
  foundry: 3.57, gullet: 3.47, catacombs: 3.42, pit: 3.35,
  spire: 3.3, ward: 4, sanctum: 3.4,
};
const FIXTURE_OFFSET = .24;
type Source = { source: RoomLight; sourceIndex: number };
type Position = { x: number; y: number; z: number; art?: CampaignArtId };

function distanceSq(a: Pick<Position, 'x' | 'z'>, b: Pick<Position, 'x' | 'z'>): number {
  return (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
}

function sourceOrder(a: Source, b: Source): number {
  return a.source.x - b.source.x || a.source.z - b.source.z || a.source.y - b.source.y ||
    b.source.intensity - a.source.intensity || b.source.radius - a.source.radius ||
    a.source.color[0] - b.source.color[0] || a.source.color[1] - b.source.color[1] ||
    a.source.color[2] - b.source.color[2] || a.sourceIndex - b.sourceIndex;
}

/** Configure a persistent light pool once per map. Selection and placement have
 * no camera/player input: a room is lit before its doorway is approached. Every
 * ordinary indoor room gets a first source before secrets or second sources in
 * large rooms. The authored Foundry hall already has seven fixed spotlights. */
export function selectModernPracticalLights(
  map: GameMap, artId: CampaignArtId = 'foundry', limit = MODERN_PRACTICAL_LIGHT_LIMIT, volumes?: RoomVolumes,
): ModernPracticalLight[] {
  const budget = Math.max(0, Math.min(MODERN_PRACTICAL_LIGHT_LIMIT, Math.floor(limit)));
  if (!budget) return [];
  const fixtures = environmentFixtures(map, artId, volumes).map(fixture => {
    const offset = fixture.y === undefined ? FIXTURE_OFFSET : 0;
    return {
      x: fixture.x + Math.sin(fixture.yaw) * offset,
      y: fixture.y ?? FIXTURE_HEIGHT[fixture.art],
      z: fixture.z + Math.cos(fixture.yaw) * offset,
      art: fixture.art,
    };
  });
  const groups = map.rooms.filter(room => !room.outdoor).map(room => ({
    room,
    sources: map.lights.map((source, sourceIndex) => ({ source, sourceIndex }))
      .filter(({ source }) => source.roomId === room.id && source.intensity > 0 && source.radius > 0 &&
        [source.x, source.y, source.z, source.intensity, source.radius, ...source.color].every(Number.isFinite) &&
        !foundryCell(map, Math.floor(source.x / CELL), Math.floor(source.z / CELL)))
      .sort((a, b) => distanceSq(a.source, { x: room.cx, z: room.cz }) -
        distanceSq(b.source, { x: room.cx, z: room.cz }) || sourceOrder(a, b)),
    fixtures: fixtures.filter(fixture => contains(room, fixture)),
  })).filter(group => group.sources.length > 0).sort((a, b) =>
    Number(a.room.kind === 'secret') - Number(b.room.kind === 'secret') ||
    a.room.routeDist - b.room.routeDist || a.room.id - b.room.id,
  );
  const selected: ModernPracticalLight[] = [];
  const occupied = new Set<string>();
  const positionKey = (position: Position) => `${position.x.toFixed(4)},${position.y.toFixed(4)},${position.z.toFixed(4)}`;
  const color = new THREE.Color();
  const tint = new THREE.Color();

  const add = (group: typeof groups[number], source: Source): void => {
    if (selected.length >= budget) return;
    const sameRoom = selected.filter(light => light.roomId === group.room.id);
    const center = { x: group.room.cx, z: group.room.cz };
    const score = (position: Position) => .3 * distanceSq(position, source.source) + .7 * distanceSq(position, center) -
      (sameRoom.length ? .85 * Math.min(...sameRoom.map(light => distanceSq(position, light))) : 0);
    const candidates = group.fixtures.filter(position => !occupied.has(positionKey(position)))
      .sort((a, b) => score(a) - score(b) || a.x - b.x || a.z - b.z);
    // Tiny authored rooms can have no saved fixture at the wall-kit interval.
    // Retain their actual cosmetic light source rather than invent a centre fill.
    const position = candidates[0] ?? (group.fixtures.length ? undefined : {
      x: source.source.x, y: Math.min(source.source.y, 3.8), z: source.source.z,
    });
    if (!position || occupied.has(positionKey(position))) return;
    occupied.add(positionKey(position));
    tint.set(CAMPAIGN_ENVIRONMENT_PALETTES[position.art ?? artId].fixture);
    color.setRGB(...source.source.color).lerp(tint, .7);
    selected.push({
      roomId: group.room.id, sourceIndex: source.sourceIndex, x: position.x, y: position.y, z: position.z,
      // A lamp hung high in a raised room is further from the floor than a
      // wall luminaire; compensate so the floor pool keeps its brightness.
      color: [color.r, color.g, color.b], intensity: 24 * source.source.intensity * Math.max(1, position.y / 3.5) ** 1.2,
      distance: Math.min(24, source.source.radius * 1.35) + Math.max(0, position.y - 3.5), decay: 1.6,
    });
  };

  for (const group of groups) add(group, group.sources[0]);
  // A second fixture serves large rooms only after geographic coverage; do not
  // spend the entire budget on the largest chamber while its side rooms go dark.
  for (const group of groups.filter(group => group.room.w * group.room.h > 90 && group.sources.length > 1)
    .sort((a, b) => b.room.w * b.room.h - a.room.w * a.room.h || a.room.id - b.room.id)) {
    add(group, group.sources[1]);
  }
  return selected;
}

function contains(room: Room, point: Position): boolean {
  return point.x >= room.x * CELL && point.x < (room.x + room.w) * CELL &&
    point.z >= room.z * CELL && point.z < (room.z + room.h) * CELL;
}
