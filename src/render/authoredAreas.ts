// Hand-built, light-baked Blender areas placed over the unchanged campaign
// grid (presentation only; the simulation never imports this). The Foundry
// opening ships in the boot pack. Every other area is loaded per map, and its
// cells keep the runtime room grammar until its assets are ready, so a
// synchronous debug start or a failed download degrades instead of blocking.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { GameMap } from '../sim/types';
import { cloneOwnedModel, getModernAssets, type ModernAssets } from './modernAssets';
import { applyRadialFogDeep } from './radialFog';
import { LAZY_AUTHORED_AREAS } from './authoredAreaList';

export interface AreaPractical {
  x: number; y: number; z: number;
  color: [number, number, number];
  intensity: number;
  distance: number;
}

export interface AuthoredAreaDef {
  id: string;
  mapSeed: string;
  /** Cell rectangles [x0, z0, x1, z1) (end-exclusive); walkable cells inside
   * are drawn by the area instead of the runtime grammar. */
  rects: [number, number, number, number][];
  /** In the boot pack (the original Foundry opening); no lazy load. */
  boot?: boolean;
  /** Door ids framed by the area's own geometry (no kit doorhead). */
  doors?: number[];
  /** Runtime lights at the baked fixtures, lighting actors and doors. They
   * take priority over the map's generic practical selection. */
  practicals?: AreaPractical[];
}

/** Map light scale on lightmapped area surfaces. The bake already holds the
 * area's light; the map's ambient/hemisphere fill would light it twice. */
export const AREA_AMBIENT_SCALE = 0.4;

export const AUTHORED_AREAS: AuthoredAreaDef[] = [
  { id: 'foundry-opening', mapSeed: 'campaign:01-foundry', rects: [[6, 39, 52, 48]], boot: true, doors: [0] },
  ...LAZY_AUTHORED_AREAS,
];

interface LoadedArea { model: THREE.Group; lightmap: THREE.Texture }
const loaded = new Map<string, LoadedArea>();
const loading = new Map<string, Promise<void>>();

/** Tests only: mark an area loaded (or not) without fetching its assets. */
export function setAreaLoadedForTest(id: string, isLoaded: boolean): void {
  if (isLoaded) loaded.set(id, { model: new THREE.Group(), lightmap: new THREE.Texture() });
  else loaded.delete(id);
}

export function areaUrl(id: string, file: string): string {
  return `/modern/areas/${id}/${file}`;
}

export function areasForMap(seed: string): AuthoredAreaDef[] {
  return AUTHORED_AREAS.filter(area => area.mapSeed === seed);
}

export function areaReady(area: AuthoredAreaDef): boolean {
  return !!area.boot || loaded.has(area.id);
}

function insideArea(area: AuthoredAreaDef, x: number, z: number): boolean {
  return area.rects.some(([x0, z0, x1, z1]) => x >= x0 && x < x1 && z >= z0 && z < z1);
}

/** The ready area drawing this walkable cell, if any. */
export function authoredAreaAt(map: Pick<GameMap, 'seed' | 'grid' | 'w'>, x: number, z: number): AuthoredAreaDef | undefined {
  if (map.grid[z * map.w + x] !== 1) return undefined;
  return AUTHORED_AREAS.find(area => area.mapSeed === map.seed && areaReady(area) && insideArea(area, x, z));
}

export function authoredCell(map: Pick<GameMap, 'seed' | 'grid' | 'w'>, x: number, z: number): boolean {
  return !!authoredAreaAt(map, x, z);
}

export function authoredDoor(map: Pick<GameMap, 'seed'>, doorId: number): boolean {
  return areasForMap(map.seed).some(area => areaReady(area) && area.doors?.includes(doorId));
}

export function readyAreaPracticals(seed: string): AreaPractical[] {
  return areasForMap(seed).filter(areaReady).flatMap(area => area.practicals ?? []);
}

/** Specimen names in area GLBs: `area.<specimen>`, matching the kit's
 * surfaces so every area uses the same generated material images. */
function bindAreaMaterial(material: THREE.MeshStandardMaterial, assets: ModernAssets, lightmap: THREE.Texture): void {
  // `area.<specimen>[.<variant>]`, e.g. area.organic.membrane, area.lamp.heart.
  const key = material.name.split('.')[1] ?? '';
  material.lightMap = lightmap;
  material.lightMapIntensity = 8 * Math.PI;
  material.envMapIntensity = .18;
  if (key === 'lamp') return;
  const specimen = AREA_SPECIMENS[key] ?? key;
  const metal = METAL_SPECIMENS.has(key);
  material.map = PLAIN_SPECIMENS.has(key) ? null : assets.surfaces[specimen] ?? assets.concrete;
  material.normalMap = metal ? assets.steelNormal : assets.concreteNormal;
  material.normalScale.setScalar(metal ? .12 : .2);
  material.roughnessMap = metal ? assets.steelRoughness : assets.concreteRoughness;
  if (metal) {
    // Area bakes hold diffuse light only; strongly metallic surfaces would
    // keep little of it and read black against the dim environment map.
    material.metalness = Math.min(material.metalness, .3);
    material.envMapIntensity = .4;
  }
  material.needsUpdate = true;
}

/** Area specimens that reuse another generated surface image. */
const AREA_SPECIMENS: Record<string, string> = {
  bone: 'limestone', floor: 'entranceFloor', dark: 'alloy', edge: 'alloy', timber: 'basalt',
};
const METAL_SPECIMENS = new Set(['steel', 'alloy', 'dark', 'edge']);
const PLAIN_SPECIMENS = new Set(['glass', 'hazard']);

/** Scale the ambient + hemisphere irradiance before the lightmap is added. */
export function scaleAmbient(material: THREE.Material, scale = AREA_AMBIENT_SCALE): void {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_maps>',
      `irradiance *= ${scale.toFixed(3)};\n#include <lights_fragment_maps>`);
  };
  const previousKey = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${previousKey()}|areaAmbient${scale}`;
}

/** Fetch every area of a map once. Failures are logged and leave the cells
 * to the runtime grammar; they never block a start. */
export function loadAreasFor(seed: string): Promise<void> {
  const assets = getModernAssets();
  if (!assets) return Promise.resolve();
  return Promise.all(areasForMap(seed).filter(area => !areaReady(area)).map(area => {
    let task = loading.get(area.id);
    if (!task) {
      task = (async () => {
        const [gltf, lightmap] = await Promise.all([
          new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(areaUrl(area.id, 'environment.glb')),
          new THREE.TextureLoader().loadAsync(areaUrl(area.id, 'irradiance.webp')),
        ]);
        lightmap.colorSpace = THREE.SRGBColorSpace;
        lightmap.flipY = false;
        lightmap.channel = 1;
        lightmap.wrapS = lightmap.wrapT = THREE.ClampToEdgeWrapping;
        const bound = new Set<THREE.Material>();
        gltf.scene.traverse(node => {
          if (!(node instanceof THREE.Mesh)) return;
          for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
            if (!(material instanceof THREE.MeshStandardMaterial) || bound.has(material)) continue;
            bound.add(material);
            bindAreaMaterial(material, assets, lightmap);
          }
        });
        loaded.set(area.id, { model: gltf.scene, lightmap });
      })().catch(error => {
        loading.delete(area.id);
        console.warn(`Authored area ${area.id} unavailable; using the runtime grammar`, error);
      });
      loading.set(area.id, task);
    }
    return task;
  })).then(() => undefined);
}

/** Add every ready lazily-loaded area of this map (the Foundry opening is
 * added by addFoundryEnvironment). */
let lastAdded: string[] = [];
/** Areas drawn by the most recent world build (debug API / tests). */
export function lastAddedAreas(): string[] { return [...lastAdded]; }

export function addAuthoredAreas(parent: THREE.Group, map: Pick<GameMap, 'seed'>): void {
  lastAdded = areasForMap(map.seed).filter(area => area.boot && getModernAssets()).map(area => area.id);
  for (const area of areasForMap(map.seed)) {
    const entry = loaded.get(area.id);
    if (!entry) continue;
    lastAdded.push(area.id);
    const model = cloneOwnedModel(entry.model);
    model.name = `authored-area-${area.id}`;
    model.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      node.castShadow = false;
      node.receiveShadow = true;
      // cloneOwnedModel copies materials, and Material.copy drops shader
      // hooks, so patch the copies that are actually rendered.
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) scaleAmbient(material);
    });
    applyRadialFogDeep(model);
    parent.add(model);
  }
}
