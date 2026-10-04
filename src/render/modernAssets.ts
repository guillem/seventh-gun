// Saved, offline-authored resources for the experimental art branch.
// Before preload completes (including headless unit tests), legacy builders
// remain usable. The browser boot gate requires this pack before creating Game.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { bindCreatureSurface, type CreatureSurfaces } from './creatureMaterials';

export const MODERN_ASSET_VERSION = 'vertical-01';
export const MODERN_ASSET_URLS = {
  creatureSkin: '/modern/refinement/materials/skin.webp',
  creatureSkinNormal: '/modern/refinement/materials/skin-normal.webp',
  creatureSkinRoughness: '/modern/refinement/materials/skin-roughness.webp',
  creatureRaw: '/modern/refinement/materials/raw.webp',
  creatureRawNormal: '/modern/refinement/materials/raw-normal.webp',
  creatureRawRoughness: '/modern/refinement/materials/raw-roughness.webp',
  creatureArmour: '/modern/refinement/materials/chitin.webp',
  creatureArmourNormal: '/modern/refinement/materials/chitin-normal.webp',
  creatureArmourRoughness: '/modern/refinement/materials/chitin-roughness.webp',
  creatureBone: '/modern/refinement/materials/bone.webp',
  creatureBoneNormal: '/modern/refinement/materials/bone-normal.webp',
  creatureBoneRoughness: '/modern/refinement/materials/bone-roughness.webp',
  weaponMetal: '/modern/roster/materials/weapon-metal.webp',
  glove: '/modern/roster/materials/glove.webp',
  fabric: '/modern/roster/materials/fabric.webp',
  carapace: '/modern/roster/materials/carapace.webp',
  basalt: '/modern/roster/materials/basalt.webp',
  organic: '/modern/roster/materials/organic.webp',
  ceramic: '/modern/roster/materials/ceramic.webp',
  limestone: '/modern/roster/materials/limestone.webp',
  alloy: '/modern/roster/materials/alloy.webp',
  sky: '/modern/roster/materials/sky.webp',
  flash: '/modern/roster/effects/flash.webp',
  smoke: '/modern/roster/effects/smoke.webp',
  environmentKit: '/modern/roster/environment/kit.glb',
  support: '/modern/roster/support/support.glb',
  weapon1: '/modern/roster/weapons/1.glb',
  weapon2: '/modern/roster/weapons/2.glb',
  weapon3: '/modern/roster/weapons/3.glb',
  weapon4: '/modern/roster/weapons/4.glb',
  weapon5: '/modern/roster/weapons/5.glb',
  weapon6: '/modern/roster/weapons/6.glb',
  weapon7: '/modern/roster/weapons/7.glb',
  enemy_husk: '/modern/roster/enemies/husk.glb',
  enemy_crawler: '/modern/roster/enemies/crawler.glb',
  enemy_slab: '/modern/roster/enemies/slab.glb',
  enemy_wisp: '/modern/roster/enemies/wisp.glb',
  enemy_hierophant: '/modern/roster/enemies/hierophant.glb',
  enemy_fiend: '/modern/roster/enemies/fiend.glb',
  concrete: '/modern/textures/concrete.webp',
  steel: '/modern/textures/steel.webp',
  titanium: '/modern/textures/titanium.webp',
  foundry: '/modern/foundry/environment.glb',
  entranceDoor: '/modern/foundry/entrance-door.webp',
  entranceFloor: '/modern/foundry/entrance-floor.webp',
  doorHardware: '/modern/foundry/door-hardware.glb',
  irradiance: '/modern/foundry/irradiance.webp',
  concreteNormal: '/modern/foundry/concrete-normal.webp',
  concreteRoughness: '/modern/foundry/concrete-roughness.webp',
  steelNormal: '/modern/foundry/steel-normal.webp',
  steelRoughness: '/modern/foundry/steel-roughness.webp',
} as const;

export interface ModernAssets {
  weapons: Record<number, THREE.Group>;
  weaponClips: Record<number, THREE.AnimationClip[]>;
  enemyModels: Record<string, THREE.Group>;
  enemyClips: Record<string, THREE.AnimationClip[]>;
  creatureSurfaces: CreatureSurfaces;
  environmentKit: THREE.Group;
  support: THREE.Group;
  surfaces: Record<string, THREE.Texture>;
  weaponMetal: THREE.Texture;
  glove: THREE.Texture;
  fabric: THREE.Texture;
  carapace: THREE.Texture;
  flash: THREE.Texture;
  smoke: THREE.Texture;
  sky: THREE.Texture;
  concrete: THREE.Texture;
  steel: THREE.Texture;
  titanium: THREE.Texture;
  foundry: THREE.Group;
  entranceDoor: THREE.Texture;
  entranceFloor: THREE.Texture;
  doorHardware: THREE.Group;
  irradiance: THREE.Texture;
  concreteNormal: THREE.Texture;
  concreteRoughness: THREE.Texture;
  steelNormal: THREE.Texture;
  steelRoughness: THREE.Texture;
}

let assets: ModernAssets | null = null;
let loading: Promise<void> | null = null;

export function getModernAssets(): ModernAssets | null { return assets; }

export function preloadModernAssets(progress: (loaded: number, total: number) => void = () => {}): Promise<void> {
  if (assets) return Promise.resolve();
  if (loading) return loading;
  loading = (async () => {
    const textureLoader = new THREE.TextureLoader();
    const modelLoader = new GLTFLoader();
    let loaded = 0;
    const total = Object.keys(MODERN_ASSET_URLS).length;
    progress(loaded, total);
    const loadTexture = async (url: string) => {
      const texture = await textureLoader.loadAsync(url);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.anisotropy = 8;
      progress(++loaded, total);
      return texture;
    };
    const loadModel = async (url: string) => {
      const model = await modelLoader.loadAsync(url);
      progress(++loaded, total);
      model.scene.animations = model.animations;
      return model.scene;
    };
    // Settle every request before cleanup so a late success cannot leak after
    // another member of the pack fails. A retry starts from a clean cache.
    const entries = Object.entries(MODERN_ASSET_URLS);
    const results = await Promise.allSettled(entries.map(([, url]) =>
      url.endsWith('.glb') ? loadModel(url) : loadTexture(url)));
    if (results.some(result => result.status === 'rejected')) {
      for (const result of results) {
        if (result.status !== 'fulfilled') continue;
        if (result.value instanceof THREE.Texture) result.value.dispose();
        else disposeCachedModel(result.value);
      }
      throw new Error('The art pack could not be loaded. Check your connection and retry.');
    }
    const values = Object.fromEntries(results.map((result, index) =>
      [entries[index][0], (result as PromiseFulfilledResult<THREE.Texture | THREE.Group>).value]));
    const texture = (key: string) => values[key] as THREE.Texture;
    const model = (key: string) => values[key] as THREE.Group;
    const weapons = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [i + 1, model(`weapon${i + 1}`)]));
    const enemyModels = Object.fromEntries(['husk', 'crawler', 'slab', 'wisp', 'hierophant', 'fiend']
      .map(type => [type, model(`enemy_${type}`)]));
    assets = {
      concrete: texture('concrete'), steel: texture('steel'), titanium: texture('titanium'), foundry: model('foundry'),
      irradiance: texture('irradiance'), concreteNormal: texture('concreteNormal'),
      concreteRoughness: texture('concreteRoughness'), steelNormal: texture('steelNormal'),
      steelRoughness: texture('steelRoughness'), entranceDoor: texture('entranceDoor'),
      entranceFloor: texture('entranceFloor'), doorHardware: model('doorHardware'),
      weapons, weaponClips: Object.fromEntries(Object.entries(weapons).map(([id, group]) => [id, group.animations])),
      enemyModels, enemyClips: Object.fromEntries(Object.entries(enemyModels).map(([id, group]) => [id, group.animations])),
      creatureSurfaces: Object.fromEntries(['skin', 'raw', 'armour', 'bone'].map(role => {
        const key = `creature${role[0].toUpperCase()}${role.slice(1)}`;
        return [role, { albedo: texture(key), normal: texture(`${key}Normal`), roughness: texture(`${key}Roughness`) }];
      })) as CreatureSurfaces,
      environmentKit: model('environmentKit'), support: model('support'),
      surfaces: Object.fromEntries(['basalt', 'organic', 'ceramic', 'limestone', 'alloy', 'concrete', 'steel', 'entranceFloor']
        .map(id => [id, texture(id)])),
      weaponMetal: texture('weaponMetal'), glove: texture('glove'), fabric: texture('fabric'), carapace: texture('carapace'),
      flash: texture('flash'), smoke: texture('smoke'), sky: texture('sky'),
    };
    for (const map of [assets.weaponMetal, assets.glove, assets.fabric, assets.carapace, ...Object.values(assets.surfaces)]) {
      map.flipY = false;
    }
    for (const map of [assets.flash, assets.smoke]) {
      map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
    }
    const rosterMaterials = new Set<THREE.Material>();
    for (const root of [...Object.values(weapons), ...Object.values(enemyModels), assets.support]) root.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if (!(material instanceof THREE.MeshStandardMaterial) || rosterMaterials.has(material)) continue;
        rosterMaterials.add(material);
        const name = material.name.toLowerCase();
        if (name.startsWith('weapon.metal') || name.startsWith('weapon.edge')) material.map = assets!.weaponMetal;
        else if (name.startsWith('weapon.grip') || name.startsWith('hand.glove')) material.map = assets!.glove;
        else if (name.startsWith('hand.fabric')) material.map = assets!.fabric;
        if (/^(support.metal|marine.steel)/.test(name)) material.map = assets!.weaponMetal;
        else if (name.startsWith('marine.fabric')) material.map = assets!.fabric;
        else if (name.startsWith('marine.dark')) material.map = assets!.glove;
        material.envMapIntensity = name.startsWith('weapon.') ? 0.85 : 0.4;
        bindCreatureSurface(material, assets!.creatureSurfaces);
        // Creature tint comes from its model; saved surface maps add relief and
        // roughness. Other roster maps remain base-color only.
        material.needsUpdate = true;
      }
    });
    for (const texture of [assets.concreteNormal, assets.concreteRoughness, assets.steelNormal, assets.steelRoughness]) {
      texture.colorSpace = THREE.NoColorSpace;
      texture.flipY = false;
    }
    assets.titanium.flipY = false;
    assets.entranceFloor.flipY = false;
    assets.entranceDoor.wrapS = assets.entranceDoor.wrapT = THREE.ClampToEdgeWrapping;
    assets.irradiance.flipY = false;
    assets.irradiance.channel = 1;
    assets.irradiance.wrapS = assets.irradiance.wrapT = THREE.ClampToEdgeWrapping;
    const foundryMaterials = new Set<THREE.Material>();
    assets.foundry.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if (!(material instanceof THREE.MeshStandardMaterial) || foundryMaterials.has(material)) continue;
        foundryMaterials.add(material);
        material.lightMap = assets!.irradiance;
        material.lightMapIntensity = 8 * Math.PI;
        material.envMapIntensity = 0.18;
        if (material.name === 'foundry.arrivalFloor') {
          material.map = assets!.entranceFloor;
          material.color.set(0xb9b6ac);
          material.metalness = 0;
          material.roughness = 0.84;
          material.normalMap = assets!.concreteNormal;
          material.normalScale.setScalar(0.1);
        } else if (['foundry.concrete', 'foundry.arrivalConcrete'].includes(material.name)) {
          material.map = assets!.concrete;
          material.color.set(material.name === 'foundry.arrivalConcrete' ? 0x85877d : 0x93988f);
          material.normalMap = assets!.concreteNormal;
          material.normalScale.setScalar(0.3);
          material.roughnessMap = assets!.concreteRoughness;
          material.roughness = 1;
        } else if (material.name === 'foundry.floor') {
          // A worn concrete slab catches local lamp pools without the broad
          // showroom reflections of the previous metallic checkerplate.
          material.map = assets!.entranceFloor;
          material.color.set(0x8d9388);
          material.metalness = 0;
          material.normalMap = assets!.concreteNormal;
          material.normalScale.setScalar(0.08);
          material.roughnessMap = null;
          material.roughness = 0.93;
        } else if (/steel|edge|ochre/.test(material.name)) {
          material.map = assets!.titanium;
          material.metalness = 0.45;
          material.envMapIntensity = 0.42;
          material.color.multiplyScalar(1.3);
          material.normalMap = assets!.steelNormal;
          material.normalScale.setScalar(0.12);
          material.roughnessMap = assets!.steelRoughness;
        }
      }
    });
  })().catch(error => { loading = null; throw error; });
  return loading;
}

function disposeCachedModel(root: THREE.Object3D): void {
  const skeletons = new Set<THREE.Skeleton>();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    geometries.add(node.geometry);
    if (node instanceof THREE.SkinnedMesh) skeletons.add(node.skeleton);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  skeletons.forEach(value => value.dispose());
  geometries.forEach(value => value.dispose());
  materials.forEach(value => value.dispose());
  textures.forEach(value => value.dispose());
}

/** Instance geometry/materials are owned, texture data stays shared. */
export function cloneOwnedModel(source: THREE.Object3D): THREE.Group {
  const copy = cloneSkeleton(source);
  const geometries = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  const materials = new Map<THREE.Material, THREE.Material>();
  copy.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    if (!geometries.has(node.geometry)) geometries.set(node.geometry, node.geometry.clone());
    node.geometry = geometries.get(node.geometry)!;
    const cloneMaterial = (material: THREE.Material) => {
      if (!materials.has(material)) materials.set(material, material.clone());
      return materials.get(material)!;
    };
    node.material = Array.isArray(node.material) ? node.material.map(cloneMaterial) : cloneMaterial(node.material);
    // The outer rig already owns frustum/LOS culling. Three caches per-mesh
    // skin bounds at the first pose, which omit later attack/death motion.
    if (node instanceof THREE.SkinnedMesh) node.frustumCulled = false;
    node.castShadow = true;
    node.receiveShadow = true;
  });
  const group = new THREE.Group();
  group.add(copy);
  return group;
}
