// Seven saved Blender kits and generated surface specimens, placed against the
// unchanged simulation grid. The authored Foundry first encounter stays intact.
import * as THREE from 'three';
import { CELL, WALL_H, type GameMap } from '../sim/types';
import { findExposedWallFace, reachableFloorCells } from '../sim/blueprint';
import type { CampaignArtId } from './campaignTextures';
import { foundryCell } from './foundry';
import { batchArchitecture, instanceArchitecturePart, type ArchitecturePlacement } from './modernWorld';
import { cloneOwnedModel } from './modernAssets';
import { applyRadialFog } from './radialFog';
import {
  BASE_CEILING, cosmeticUnit, HANG_GLOW_DEPTH, tallRoomOverheads, UPPER_REGISTER_Y, type RoomVolumes,
} from './roomVolumes';

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
  ward: { fog: 0x28363c, sky: 0x9ab6c1, fixture: 0xc8edff, wall: 'ceramic', floor: 'ceramic', ceiling: 'ceramic', wallColor: 0xe6f4f3, floorColor: 0x91a6a4, ceilingColor: 0xa9b8b8, reliefInterval: 4, crownInterval: 4 },
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
    // Door slabs are painted plate: fully metallic alloy reflected the dark
    // environment and read as a black void in the doorway.
    metalness: kind === 'door' ? .22 : metal ? .52 : 0,
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
  if (key === 'lamp.status') {
    // Recoloured per door (locked or not); see doorStatusColor.
    material.emissiveIntensity *= .3;
    return;
  }
  if (key.startsWith('lamp.')) {
    // Keep lenses legible without turning every fitting into a blown-out neon
    // spot. Gullet glands have a warm, organic rather than pink-white glow.
    material.emissiveIntensity *= artId === 'gullet' ? .35 : .6;
    if (artId === 'gullet') material.emissive.set(0xcb906b);
    return;
  }
  if (key === 'hazard' || key === 'timber' || key === 'glass') {
    // Painted bands, mine timber and glazing keep their authored colour; a
    // stone or metal specimen would read as the wrong material.
    material.map = key === 'timber' ? surface(assets, 'basalt') : null;
    material.normalMap = assets.concreteNormal;
    material.normalScale.setScalar(key === 'glass' ? 0 : .1);
    material.envMapIntensity = key === 'glass' ? .9 : .2;
    material.needsUpdate = true;
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

interface WallFace {
  x: number; z: number; dx: number; dz: number;
  /** A header is the strip above a lower opening into a taller room. */
  header: boolean;
  ceiling: number;
  art: CampaignArtId;
  outdoor: boolean;
}

/** Faces grouped into straight runs: same side, same line, same identity and
 * headroom, contiguous. Dressing is laid out per run, centred and symmetric,
 * instead of by absolute grid coordinate. */
export function wallRuns(map: GameMap, volumes: RoomVolumes): WallFace[][] {
  const walkable = (x: number, z: number) => x >= 0 && z >= 0 && x < map.w && z < map.h && map.grid[z * map.w + x] === 1;
  const groups = new Map<string, WallFace[]>();
  for (let z = 0; z < map.h; z++) for (let x = 0; x < map.w; x++) {
    if (!walkable(x, z) || foundryCell(map, x, z)) continue;
    const ceiling = volumes.ceilingAt(x, z);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const open = walkable(x + dx, z + dz);
      if (open && volumes.ceilingAt(x + dx, z + dz) >= ceiling) continue;
      const room = volumes.roomAt(x, z)?.room;
      const face: WallFace = { x, z, dx, dz, header: open, ceiling, art: volumes.artAt(x, z), outdoor: !!room?.outdoor };
      const key = `${dx},${dz},${dx ? x : z},${face.header},${face.ceiling},${face.art},${face.outdoor}`;
      const list = groups.get(key);
      if (list) list.push(face); else groups.set(key, [face]);
    }
  }
  const runs: WallFace[][] = [];
  for (const faces of groups.values()) {
    faces.sort((a, b) => (a.dx ? a.z - b.z : a.x - b.x));
    let run: WallFace[] = [];
    for (const face of faces) {
      const last = run[run.length - 1];
      if (last && (face.dx ? face.z - last.z : face.x - last.x) !== 1) { runs.push(run); run = []; }
      run.push(face);
    }
    if (run.length) runs.push(run);
  }
  return runs;
}

function evenly(length: number, count: number): Set<number> {
  const out = new Set<number>();
  for (let j = 0; j < count; j++) out.add(Math.round((j + .5) * length / count - .5));
  return out;
}

function rhythm(length: number, bay: number): (i: number) => boolean {
  const offset = Math.floor(((length - 1) % bay) / 2);
  return i => (i - offset) % bay === 0;
}

/** Wall faces carrying a remote secret control (lever or shootable sigil),
 * keyed as `x,z,dx,dz` from the walkable side. Same face lookup as world.ts. */
export function secretControlFaces(map: GameMap): Set<string> {
  const faces = new Set<string>();
  const closed = new Set<number>();
  for (const secret of map.secrets ?? []) for (const [x, z] of secret.cells) closed.add(z * map.w + x);
  const reach = reachableFloorCells(map.grid, map.w, map.h,
    Math.floor(map.playerStart.x / CELL), Math.floor(map.playerStart.z / CELL), closed);
  for (const secret of map.secrets ?? []) {
    if (!secret.trigger) continue;
    const face = findExposedWallFace(map.grid, map.w, map.h, secret.trigger.x, secret.trigger.z, reach);
    if (face) faces.add(`${secret.trigger.x + face.dx},${secret.trigger.z + face.dz},${-face.dx},${-face.dz}`);
  }
  return faces;
}

/** Run-based dressing for maps using the room vertical grammar. Keys are kit
 * module names, since one maze mixes several identities. */
export function verticalEnvironmentPlacements(map: GameMap, volumes: RoomVolumes): Record<string, ArchitecturePlacement[]> {
  const result: Record<string, ArchitecturePlacement[]> = {};
  const push = (module: string, placement: ArchitecturePlacement) => (result[module] ??= []).push(placement);
  // Relief or a luminaire would hide a secret control mounted on the wall.
  const controls = secretControlFaces(map);
  for (const run of wallRuns(map, volumes)) {
    const first = run[0];
    const palette = CAMPAIGN_ENVIRONMENT_PALETTES[first.art];
    const variety = cosmeticUnit(map.seed, `run:${first.dx},${first.dz},${first.x},${first.z},${run.length}`);
    const relief = rhythm(run.length, palette.reliefInterval + (variety < .5 ? 0 : 1));
    // The upper order uses a wider bay than the wall below, so tall walls get
    // broad fields between major members instead of a dense repeat.
    const upper = rhythm(run.length, 3 + Math.floor(variety * 4) % 2);
    const crown = rhythm(run.length, palette.crownInterval);
    const fixtures = first.header || run.length < 3 ? new Set<number>()
      : evenly(run.length, run.length >= 17 ? 3 : run.length >= 10 ? 2 : 1);
    const tall = first.ceiling > BASE_CEILING;
    // Alternate the two constructions symmetrically about the run centre:
    // the middle bay (or pair) uses one, the next bays out the other, so a
    // wall reads as a composed elevation rather than a single repeat.
    const flip = variety < .5;
    const variant = (i: number, role: 'relief' | 'upper') => {
      const fromCentre = Math.round(Math.abs(i - (run.length - 1) / 2) / (role === 'relief' ? 2 : 3));
      return (fromCentre % 2 === 0) !== flip ? role : `${role}2`;
    };
    // A raised wall seen from outside (over a courtyard's 6 m walls) is capped
    // by the identity's string course, turned outward, at the roofline.
    const coping = tall && !first.outdoor;
    run.forEach((face, i) => {
      const px = (face.x + .5) * CELL + face.dx * CELL / 2;
      const pz = (face.z + .5) * CELL + face.dz * CELL / 2;
      const yaw = Math.atan2(-face.dx, -face.dz);
      const placement: ArchitecturePlacement = { x: px, y: 0, z: pz, yaw, color: placementColor(map, px, pz) };
      const art = face.art;
      if (!face.header) {
        push(`${art}_trim`, placement);
        if (controls.has(`${face.x},${face.z},${face.dx},${face.dz}`)) return;
        if (fixtures.has(i)) push(`${art}_fixture`, { ...placement, color: undefined });
        else if (relief(i)) push(`${art}_${variant(i, 'relief')}`, placement);
      }
      if (face.outdoor) return;
      if (crown(i)) push(`${art}_crown`, { ...placement, y: face.ceiling - BASE_CEILING });
      if (coping) push(`${art}_course`, { ...placement, y: face.ceiling - .35, yaw: placement.yaw + Math.PI, color: undefined });
      if (!tall || face.ceiling < 9) return;
      push(`${art}_course`, { ...placement, y: UPPER_REGISTER_Y });
      // The upper register continues the bay rhythm below it, so piers and
      // ribs read as one tall order rather than a second stacked wall.
      if (upper(i)) {
        push(`${art}_${variant(i, 'upper')}`, { ...placement, y: UPPER_REGISTER_Y, scaleY: (face.ceiling - UPPER_REGISTER_Y - 1.2) / 4 });
      }
    });
  }
  for (const { module, ...placement } of tallRoomOverheads(map, volumes)) {
    push(module, { ...placement, color: placementColor(map, placement.x, placement.z) });
  }
  return result;
}

/** A luminaire. Wall fixtures have no `y` (their lens height is per identity);
 * hanging lamps in tall rooms carry their own height and need no wall offset. */
export interface EnvironmentFixture { x: number; z: number; yaw: number; art: CampaignArtId; y?: number }

/** Wall luminaires, used by the stationary practical-light selection. */
export function environmentFixtures(map: GameMap, artId: CampaignArtId, volumes?: RoomVolumes): EnvironmentFixture[] {
  if (!volumes?.vertical) {
    return campaignEnvironmentPlacements(map, artId).fixture.map(({ x, z, yaw }) => ({ x, z, yaw, art: artId }));
  }
  return Object.entries(verticalEnvironmentPlacements(map, volumes))
    .filter(([module]) => module.endsWith('_fixture') || module.endsWith('_hang'))
    .flatMap(([module, list]) => list.map(({ x, y, z, yaw }): EnvironmentFixture => {
      const art = module.split('_')[0] as CampaignArtId;
      return module.endsWith('_hang') ? { x, z, yaw, art, y: y - HANG_GLOW_DEPTH[art] - 1 } : { x, z, yaw, art };
    }))
    .sort((a, b) => a.x - b.x || a.z - b.z);
}

export function addCampaignEnvironment(
  parent: THREE.Group, map: GameMap, artId: CampaignArtId, assets: EnvironmentAssets, volumes?: RoomVolumes,
): void {
  const group = new THREE.Group();
  group.name = `campaign-environment-${volumes?.vertical ? 'vertical' : artId}`;
  if (volumes?.vertical) {
    // Material binding depends only on identity and kit material name, so
    // every module of one identity sharing a material shares one batch.
    const art = (module: string) => module.split('_')[0] as CampaignArtId;
    batchArchitecture(group, assets.environmentKit, verticalEnvironmentPlacements(map, volumes),
      (module, material) => `${art(module)}|${material.name}`,
      (module, material) => bindKitMaterial(material, assets, art(module)));
    parent.add(group);
    return;
  }
  const placements = campaignEnvironmentPlacements(map, artId);
  for (const [role, parts] of Object.entries(placements)) {
    instanceArchitecturePart(group, assets.environmentKit, `${artId}_${role}`, parts, material => bindKitMaterial(material, assets, artId));
  }
  parent.add(group);
}

/** A rising slab clipped at the corridor ceiling never shows above a roof,
 * even from a courtyard; the doorhead housing hides it below that line. */
export const DOOR_CEILING_CLIP = new THREE.Plane(new THREE.Vector3(0, -1, 0), BASE_CEILING);

/** Locked doors show red; others take the identity's luminaire colour. */
export function doorStatusColor(art: CampaignArtId, locked: boolean): number {
  return locked ? 0xff2a1a : CAMPAIGN_ENVIRONMENT_PALETTES[art].fixture;
}

function cloneKitModule(assets: EnvironmentAssets, name: string, art: CampaignArtId, status?: number, clip = false): THREE.Group | null {
  const kit = assets.environmentKit;
  const module = kit.getObjectByName(name);
  if (!module) return null;
  kit.updateMatrixWorld(true);
  const group = cloneOwnedModel(module);
  const copy = group.children[0];
  // Keep the module's authored placement relative to the kit root.
  new THREE.Matrix4().copy(kit.matrixWorld).invert().multiply(module.matrixWorld)
    .decompose(copy.position, copy.quaternion, copy.scale);
  group.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    node.castShadow = false;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      bindKitMaterial(material, assets, art);
      if (material instanceof THREE.MeshStandardMaterial && material.name === 'env.lamp.status' && status !== undefined) {
        material.color.set(status);
        material.emissive.set(status);
      }
      if (clip) material.clippingPlanes = [DOOR_CEILING_CLIP];
      applyRadialFog(material);
    }
  });
  return group;
}

/** Frame a door (or the arena seal) with its identity's doorhead, and dress
 * the moving slab with its leaf hardware. Collision is unchanged: the frame
 * stays within the corridor walls' clearance and above the slab. */
export function addDoorAssembly(
  parent: THREE.Group, assets: EnvironmentAssets, art: CampaignArtId,
  at: { x: number; z: number; axis: 'x' | 'z' }, status: number, slab?: THREE.Mesh,
): void {
  const yaw = at.axis === 'x' ? Math.PI / 2 : 0;
  const head = cloneKitModule(assets, `${art}_doorhead`, art, status);
  if (head) {
    head.name = `door-head-${art}`;
    head.position.set(at.x, 0, at.z);
    head.rotation.y = yaw;
    parent.add(head);
  }
  if (!slab) return;
  for (const material of Array.isArray(slab.material) ? slab.material : [slab.material]) material.clippingPlanes = [DOOR_CEILING_CLIP];
  const leaf = cloneKitModule(assets, `${art}_doorleaf`, art, undefined, true);
  if (leaf) {
    leaf.name = `door-leaf-${art}`;
    leaf.rotation.y = yaw;
    slab.add(leaf);
  }
}
