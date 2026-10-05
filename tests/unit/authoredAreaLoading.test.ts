import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

// Drive the loader with controllable GLB/texture requests instead of fetches.
const gltfLoads: Array<{ url: string; resolve: (v: unknown) => void; reject: (e: unknown) => void }> = [];
vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    setMeshoptDecoder() { return this; }
    loadAsync(url: string) { return new Promise((resolve, reject) => gltfLoads.push({ url, resolve, reject })); }
  },
}));
vi.mock('../../src/render/modernAssets', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/render/modernAssets')>(),
  getModernAssets: () => ({}),
}));

const { areaReady, areasForMap, loadAreasFor } = await import('../../src/render/authoredAreas');

const SEED = 'campaign:02-gullet';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  gltfLoads.length = 0;
});

describe('authored area loading', () => {
  it('frees the model when its lightmap fails, and allows a retry', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockRejectedValue(new Error('404'));
    const geometry = new THREE.BoxGeometry();
    const dispose = vi.spyOn(geometry, 'dispose');
    const done = loadAreasFor(SEED);
    await vi.waitFor(() => expect(gltfLoads.length).toBe(areasForMap(SEED).length));
    for (const load of gltfLoads) {
      const scene = new THREE.Group();
      scene.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()));
      load.resolve({ scene });
    }
    await done;
    expect(dispose).toHaveBeenCalled();
    expect(areasForMap(SEED).some(areaReady)).toBe(false);
    // A failed area is forgotten, so the next start requests it again.
    gltfLoads.length = 0;
    void loadAreasFor(SEED);
    await vi.waitFor(() => expect(gltfLoads.length).toBe(areasForMap(SEED).length));
  });

  it('lets a start proceed when a download stalls', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockReturnValue(new Promise(() => {}));
    expect(areasForMap('campaign:03-catacombs').length).toBeGreaterThan(0);
    let settled = false;
    void loadAreasFor('campaign:03-catacombs', 1000).then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('still loading'));
  });
});
