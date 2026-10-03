// Seven saved Blender kits and generated surface specimens, placed against the
// unchanged simulation grid. The authored Foundry first encounter stays intact.
import * as THREE from 'three';
import { CELL, WALL_H, type GameMap } from '../sim/types';
import type { CampaignArtId } from './campaignTextures';
import { foundryCell } from './foundry';
import { instanceArchitecturePart, type ArchitecturePlacement } from './modernWorld';

export interface EnvironmentAssets {
  environmentKit: THREE.Group;
  surfaces: Record<string, THREE.Texture>;
  concrete: THREE.Texture;
  steel: THREE.Texture;
  titanium: THREE.Texture;
  entranceFloor: THREE.Texture;
  concreteNormal: THREE.Texture;
  steelNormal: THREE.Texture;
  concreteRoughness: THREE.Texture;
  steelRoughness: THREE.Texture;
}

interface EnvironmentPalette {
  fog: number;
  sky: number;
  fixture: number;
  wall: string;
  floor: string;
  ceiling: string;
  wallColor: number;
  floorColor: number;
  ceilingColor?: number;
  reliefInterval: number;
  crownInterval: number;
}

export const CAMPAIGN_ENVIRONMENT_PALETTES: Record<CampaignArtId, EnvironmentPalette> = {
  foundry: { fog: 0x15282f, sky: 0x718a95, fixture: 0xffad62, wall: 'concrete', floor: 'floor', ceiling: 'alloy', wallColor: 0xc7c7bb, floorColor: 0xadb6ae, reliefInterval: 3, crownInterval: 2 },
  gullet: { fog: 0x252421, sky: 0x77776a, fixture: 0xe2c8ad, wall: 'organic', floor: 'floor', ceiling: 'concrete', wallColor: 0x9fbdbe, floorColor: 0x969d89, ceilingColor: 0x747e79, reliefInterval: 2, crownInterval: 2 },
  catacombs: { fog: 0x242b30, sky: 0x647482, fixture: 0xe5c29a, wall: 'limestone', floor: 'limestone', ceiling: 'limestone', wallColor: 0x737d81, floorColor: 0x777e85, ceilingColor: 0x657078, reliefInterval: 3, crownInterval: 3 },
  pit: { fog: 0x2b251d, sky: 0x8d7b65, fixture: 0xffb653, wall: 'basalt', floor: 'basalt', ceiling: 'concrete', wallColor: 0xc5a27d, floorColor: 0xbcb0a0, reliefInterval: 3, crownInterval: 3 },
  spire: { fog: 0x5e676e, sky: 0xb4c2cc, fixture: 0xffe2b0, wall: 'limestone', floor: 'limestone', ceiling: 'limestone', wallColor: 0xfff5dc, floorColor: 0xc5c7c2, reliefInterval: 4, crownInterval: 2 },
  ward: { fog: 0x28363c, sky: 0x9ab6c1, fixture: 0xc8edff, wall: 'ceramic', floor: 'ceramic', ceiling: 'alloy', wallColor: 0xe6f4f3, floorColor: 0x91a6a4, reliefInterval: 4, crownInterval: 4 },
  sanctum: { fog: 0x101f28, sky: 0x426877, fixture: 0x65dfe8, wall: 'alloy', floor: 'alloy', ceiling: 'alloy', wallColor: 0x899ca8, floorColor: 0x81949e, reliefInterval: 2, crownInterval: 3 },
};

/** Six metre indoor headroom keeps all new overhangs above the combat volume. */
export const MODERN_CAMPAIGN_CEILING = WALL_H;

function surface(assets: EnvironmentAssets, name: string): THREE.Texture {
  if (name === 'floor') return assets.entranceFloor;
  if (name === 'concrete') return assets.concrete;
  if (name === 'steel') return assets.steel;
  return assets.surfaces[name] ?? assets.concrete;
}

export function campaignEnvironmentSurface(
  kind: 'wall' | 'floor' | 'ceil' | 'door', artId: CampaignArtId, assets: EnvironmentAssets,
): THREE.MeshStandardMaterial {
  const palette = CAMPAIGN_ENVIRONMENT_PALETTES[artId];
  const specimen = kind === 'floor' ? palette.floor : kind === 'ceil' ? palette.ceiling : kind === 'door' ? 'alloy' : palette.wall;
  const metal = specimen === 'alloy';
  const ceramic = specimen === 'ceramic';
  const material = new THREE.MeshStandardMaterial({
    map: surface(assets, specimen),
    color: kind === 'floor' ? palette.floorColor : kind === 'ceil' ? palette.ceilingColor ?? 0x9da7a6 : kind === 'door' ? 0xaab9bf : palette.wallColor,
    roughness: metal ? .64 : ceramic ? .49 : specimen === 'organic' ? .68 : .9,
    metalness: metal ? .52 : 0,
    envMapIntensity: metal ? .6 : ceramic ? .4 : .18,
    normalMap: metal ? assets.steelNormal : assets.concreteNormal,
    normalScale: new THREE.Vector2(metal ? .06 : ceramic ? .035 : .14, metal ? .06 : ceramic ? .035 : .14),
    side: kind === 'floor' || kind === 'ceil' ? THREE.DoubleSide : THREE.FrontSide,
  });
  // The level's saved light positions still give surfaces local variation.
  // A door has no baked vertex-colour attribute.
  material.vertexColors = kind !== 'door';
  material.name = `campaign-${artId}-${kind}-${specimen}`;
  return material;
}

function bindKitMaterial(material: THREE.Material, assets: EnvironmentAssets, artId: CampaignArtId): void {
  if (!(material instanceof THREE.MeshStandardMaterial)) return;
  const key = material.name.slice(4);
  if (key.startsWith('lamp.')) {
    // Keep lenses legible without turning every fitting into a blown-out neon
    // spot. Gullet glands have a warm, organic rather than pink-white glow.
    material.emissiveIntensity *= artId === 'gullet' ? .35 : .6;
    if (artId === 'gullet') material.emissive.set(0xcb906b);
    return;
  }
  material.map = surface(assets, key === 'dark' ? 'alloy' : key === 'bone' ? 'limestone' : key);
  material.normalMap = key === 'alloy' || key === 'dark' ? assets.steelNormal : assets.concreteNormal;
  material.normalScale.setScalar(.08);
  material.envMapIntensity = key === 'alloy' ? .55 : .2;
  if (artId === 'catacombs' && key === 'basalt') {
    material.map = surface(assets, 'limestone');
    material.color.set(0x9aa4a6);
  }
  if (key === 'cutStone') {
    material.map = surface(assets, 'limestone');
    material.color.set(artId === 'catacombs' ? 0x879191 : 0xd3cec0);
  }
  if (key === 'trimMetal') {
    material.map = assets.titanium;
    material.color.set(artId === 'sanctum' ? 0x69777d : 0x77827e);
    material.metalness = .35;
    material.roughness = .69;
  }
  material.needsUpdate = true;
}

function placementColor(map: GameMap, x: number, z: number): THREE.Color {
  const color = new THREE.Color(.65, .65, .65);
  for (const light of map.lights) {
    const falloff = Math.max(0, 1 - Math.hypot(light.x - x, light.z - z) / light.radius);
    const strength = falloff * falloff * Math.min(light.intensity, 1) * .35;
    color.r += light.color[0] * strength;
    color.g += light.color[1] * strength;
    color.b += light.color[2] * strength;
  }
  color.r = Math.min(1, color.r); color.g = Math.min(1, color.g); color.b = Math.min(1, color.b);
  return color;
}

/** Pure placement data is exported so collision-clearance tests inspect it. */
export function campaignEnvironmentPlacements(map: GameMap, artId: CampaignArtId): Record<string, ArchitecturePlacement[]> {
  const palette = CAMPAIGN_ENVIRONMENT_PALETTES[artId];
  const result: Record<string, ArchitecturePlacement[]> = { relief: [], fixture: [], crown: [], trim: [] };
  const walkable = (x: number, z: number) => x >= 0 && z >= 0 && x < map.w && z < map.h && map.grid[z * map.w + x] === 1;
  const outdoor = (x: number, z: number) => map.rooms.some(room => room.outdoor && x >= room.x && x < room.x + room.w && z >= room.z && z < room.z + room.h);
  for (let z = 0; z < map.h; z++) for (let x = 0; x < map.w; x++) {
    if (!walkable(x, z) || foundryCell(map, x, z)) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (walkable(x + dx, z + dz)) continue;
      const px = (x + .5) * CELL + dx * CELL / 2;
      const pz = (z + .5) * CELL + dz * CELL / 2;
      const placement: ArchitecturePlacement = { x: px, y: 0, z: pz, yaw: Math.atan2(-dx, -dz), color: placementColor(map, px, pz) };
      const coordinate = dx ? z : x;
      result.trim.push(placement);
      if (coordinate % palette.reliefInterval === 0) result.relief.push(placement);
      // Fixtures offset from structural bays; narrow corridors still receive
      // legible light sources. No point-light count grows with map size.
      if (coordinate % 5 === 2) result.fixture.push({ ...placement, color: undefined });
      if (coordinate % palette.crownInterval === 1 && !outdoor(x, z)) result.crown.push(placement);
    }
  }
  return result;
}

export function addCampaignEnvironment(parent: THREE.Group, map: GameMap, artId: CampaignArtId, assets: EnvironmentAssets): void {
  const group = new THREE.Group();
  group.name = `campaign-environment-${artId}`;
  const placements = campaignEnvironmentPlacements(map, artId);
  for (const [role, parts] of Object.entries(placements)) {
    instanceArchitecturePart(group, assets.environmentKit, `${artId}_${role}`, parts, material => bindKitMaterial(material, assets, artId));
  }
  parent.add(group);
}
