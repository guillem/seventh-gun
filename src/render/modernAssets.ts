// Saved, offline-authored resources for the experimental art branch.
// Before preload completes (including headless unit tests), legacy builders
// remain usable. The browser boot gate requires this pack before creating Game.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

export const MODERN_ASSET_VERSION = 'foundry-02';
export const MODERN_ASSET_URLS = {
  concrete: '/modern/textures/concrete.webp',
  steel: '/modern/textures/steel.webp',
  skin: '/modern/textures/dermal.webp',
  titanium: '/modern/textures/titanium.webp',
  pistol: '/modern/models/pistol.glb',
  husk: '/modern/models/husk.glb',
  architecture: '/modern/models/architecture.glb',
  foundry: '/modern/foundry/environment.glb',
  irradiance: '/modern/foundry/irradiance.webp',
  concreteNormal: '/modern/foundry/concrete-normal.webp',
  concreteRoughness: '/modern/foundry/concrete-roughness.webp',
  steelNormal: '/modern/foundry/steel-normal.webp',
  steelRoughness: '/modern/foundry/steel-roughness.webp',
} as const;

export interface ModernAssets {
  concrete: THREE.Texture;
  steel: THREE.Texture;
  skin: THREE.Texture;
  titanium: THREE.Texture;
  pistol: THREE.Group;
  husk: THREE.Group;
  architecture: THREE.Group;
  foundry: THREE.Group;
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
      return model.scene;
    };
    // Settle every request before cleanup so a late success cannot leak after
    // another member of the pack fails. A retry starts from a clean cache.
    const results = await Promise.allSettled([
      loadTexture(MODERN_ASSET_URLS.concrete), loadTexture(MODERN_ASSET_URLS.steel),
      loadTexture(MODERN_ASSET_URLS.skin), loadTexture(MODERN_ASSET_URLS.titanium),
      loadModel(MODERN_ASSET_URLS.pistol), loadModel(MODERN_ASSET_URLS.husk),
      loadModel(MODERN_ASSET_URLS.architecture),
      loadModel(MODERN_ASSET_URLS.foundry), loadTexture(MODERN_ASSET_URLS.irradiance),
      loadTexture(MODERN_ASSET_URLS.concreteNormal), loadTexture(MODERN_ASSET_URLS.concreteRoughness),
      loadTexture(MODERN_ASSET_URLS.steelNormal), loadTexture(MODERN_ASSET_URLS.steelRoughness),
    ]);
    const failure = results.find(result => result.status === 'rejected');
    if (failure) {
      for (const result of results) {
        if (result.status !== 'fulfilled') continue;
        if (result.value instanceof THREE.Texture) result.value.dispose();
        else disposeCachedModel(result.value);
      }
      throw new Error('The art pack could not be loaded. Check your connection and retry.');
    }
    const values = results.map(result => (result as PromiseFulfilledResult<THREE.Texture | THREE.Group>).value);
    assets = {
      concrete: values[0] as THREE.Texture, steel: values[1] as THREE.Texture,
      skin: values[2] as THREE.Texture, titanium: values[3] as THREE.Texture,
      pistol: values[4] as THREE.Group, husk: values[5] as THREE.Group,
      architecture: values[6] as THREE.Group,
      foundry: values[7] as THREE.Group, irradiance: values[8] as THREE.Texture,
      concreteNormal: values[9] as THREE.Texture, concreteRoughness: values[10] as THREE.Texture,
      steelNormal: values[11] as THREE.Texture, steelRoughness: values[12] as THREE.Texture,
    };
    for (const texture of [assets.concreteNormal, assets.concreteRoughness, assets.steelNormal, assets.steelRoughness]) {
      texture.colorSpace = THREE.NoColorSpace;
      texture.flipY = false;
    }
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
        material.envMapIntensity = 0.35;
        if (material.name === 'foundry.concrete') {
          material.map = assets!.concrete;
          material.color.set(0xc6c8c2);
          material.normalMap = assets!.concreteNormal;
          material.normalScale.setScalar(0.3);
          material.roughnessMap = assets!.concreteRoughness;
          material.roughness = 1;
        } else if (material.name === 'foundry.floor') {
          material.map = assets!.steel;
          material.color.set(0x87989e);
          material.metalness = 0.25;
          material.normalMap = assets!.steelNormal;
          material.normalScale.setScalar(0.12);
          material.roughnessMap = assets!.steelRoughness;
          material.roughness = 1;
        } else if (/steel|edge|ochre/.test(material.name)) {
          material.map = assets!.titanium;
          material.metalness = 0.45;
          material.envMapIntensity = 1;
          material.color.multiplyScalar(1.7);
          material.normalMap = assets!.steelNormal;
          material.normalScale.setScalar(0.12);
          material.roughnessMap = assets!.steelRoughness;
        }
      }
    });
    // Bind saved material scans to named, UV-mapped Blender materials once.
    // Texture data is shared by all instances; the authored GLBs stay compact.
    const configured = new Set<THREE.Material>();
    for (const root of [assets.pistol, assets.husk, assets.architecture]) root.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if (!(material instanceof THREE.MeshStandardMaterial) || configured.has(material)) continue;
        configured.add(material);
        const name = material.name.toLowerCase();
        if (/tissue|tendon/.test(name)) {
          material.map = assets!.skin;
          material.color.set(0xb7c3b8);
          material.roughness = 0.88;
        } else if (/glove leather|polymer|sleeve/.test(name)) {
          material.map = assets!.skin;
          material.color.set(/sleeve/.test(name) ? 0x9ea892 : 0xa3afaa);
        } else if (/titanium|surgical metal|ivory composite|exposed nickel|painted steel|brushed/.test(name)) {
          material.map = assets!.titanium;
          material.color.set(/ivory/.test(name) ? 0xd8cfb8 : 0xc4ccd0);
        }
        material.needsUpdate = true;
      }
    });
  })().catch(error => { loading = null; throw error; });
  return loading;
}

function disposeCachedModel(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    geometries.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
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
    node.castShadow = true;
    node.receiveShadow = true;
  });
  const group = new THREE.Group();
  group.add(copy);
  return group;
}

export function modernSurface(kind: 'wall' | 'floor' | 'ceil' | 'door'): THREE.MeshStandardMaterial | null {
  if (!assets) return null;
  const metal = kind === 'floor' || kind === 'door';
  return new THREE.MeshStandardMaterial({
    map: metal ? assets.steel : assets.concrete,
    color: kind === 'ceil' ? 0x7e8d93 : metal ? 0x8c9ca4 : 0xb3b9b7,
    metalness: metal ? 0.42 : 0.02,
    roughness: metal ? 0.7 : 0.91,
    envMapIntensity: metal ? 0.45 : 0.25,
    side: kind === 'floor' || kind === 'ceil' ? THREE.DoubleSide : THREE.FrontSide,
  });
}
