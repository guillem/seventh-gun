import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GameRenderer } from '../../src/render/renderer';
import { buildViewModel, type ViewModel } from '../../src/render/viewmodels';

const fixture = vi.hoisted(() => ({ flash: null as THREE.Texture | null, failAt: 0 }));
vi.mock('../../src/render/modernAssets', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/render/modernAssets')>(),
  getModernAssets: () => ({ flash: fixture.flash }),
}));
vi.mock('../../src/render/viewmodels', () => ({
  buildViewModel: vi.fn((id: number): ViewModel => {
    if (id === fixture.failAt) throw new Error('test model construction failure');
    const group = new THREE.Group();
    group.name = `weapon-${id}`;
    const material = new THREE.MeshStandardMaterial({ map: fixture.flash });
    group.add(new THREE.Mesh(new THREE.BoxGeometry(.1, .1, .4), material));
    const muzzle = new THREE.Object3D();
    group.add(muzzle);
    return { group, muzzle, update: vi.fn(), reset: vi.fn(), dispose: vi.fn() };
  }),
}));

type Harness = Pick<GameRenderer, 'setGun' | 'fireVisual' | 'muzzleState' | 'prepareViewmodelsForWarmup' | 'disposeViewmodels'> & {
  viewModel: ViewModel | null;
  viewmodels: Map<number, ViewModel>;
  vmHolder: THREE.Group;
  muzzleSprite: THREE.Sprite | null;
  muzzleLife: number;
  currentGun: number;
  updateMuzzleLifetime: (dt: number) => void;
};

function harness(): Harness {
  // Exercise the actual renderer lifecycle methods without creating WebGL.
  return Object.assign(Object.create(GameRenderer.prototype), {
    viewModel: null, viewmodels: new Map(), vmHolder: new THREE.Group(),
    currentGun: 0, muzzleSprite: null, muzzleLife: 0,
    fx: { muzzleFlashWorld: vi.fn() },
  }) as Harness;
}

beforeEach(() => {
  fixture.flash = new THREE.Texture();
  fixture.failAt = 0;
  vi.mocked(buildViewModel).mockClear();
});

describe('retained weapon GPU resources', () => {
  it('warms all seven models, restores only the selected model, and reuses every owner when equipping again', () => {
    const renderer = harness();
    renderer.setGun(4);
    const selected = renderer.viewModel!;
    const warmup = renderer.prepareViewmodelsForWarmup();
    expect(renderer.vmHolder.children).toHaveLength(7);
    expect(renderer.viewmodels.size).toBe(7);
    expect(renderer.muzzleSprite!.parent).toBe(selected.muzzle);
    expect(renderer.muzzleSprite!.material.opacity).toBe(0);
    const originals = new Map(renderer.viewmodels);
    warmup.release();
    warmup.release();
    expect(renderer.vmHolder.children).toEqual([selected.group]);
    for (let repeat = 0; repeat < 3; repeat++) for (let id = 1; id <= 7; id++) {
      renderer.setGun(id);
      expect(renderer.viewModel).toBe(originals.get(id));
      expect(renderer.vmHolder.children).toEqual([originals.get(id)!.group]);
      expect(renderer.muzzleSprite!.parent).toBe(originals.get(id)!.muzzle);
      expect(originals.get(id)!.dispose).not.toHaveBeenCalled();
    }
    expect(buildViewModel).toHaveBeenCalledTimes(7);
    expect(originals.get(1)!.reset).toHaveBeenCalledTimes(3);
    renderer.disposeViewmodels();
  });

  it('reuses one flash sprite/material through firing, expiry and weapon switches; frees it only at teardown', () => {
    const renderer = harness();
    renderer.setGun(1);
    renderer.prepareViewmodelsForWarmup().release();
    const sprite = renderer.muzzleSprite!;
    const dispose = vi.spyOn(sprite.material, 'dispose');
    const textureDispose = vi.spyOn(fixture.flash!, 'dispose');
    for (const id of [1, 2, 7, 1]) {
      renderer.fireVisual(id, 0, 0, 0, 0);
      expect(renderer.muzzleSprite).toBe(sprite);
      expect(renderer.muzzleState).toMatchObject({ alive: true, attached: true, gunVisible: true, opacity: 1 });
      renderer.updateMuzzleLifetime(.1);
      expect(renderer.muzzleSprite).toBe(sprite);
      expect(renderer.muzzleState).toMatchObject({ alive: false, attached: true, gunVisible: true, opacity: 0 });
      expect(dispose).not.toHaveBeenCalled();
    }
    const models = [...renderer.viewmodels.values()];
    renderer.disposeViewmodels();
    renderer.disposeViewmodels();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(textureDispose).not.toHaveBeenCalled();
    models.forEach(model => expect(model.dispose).toHaveBeenCalledTimes(1));
    expect(renderer.vmHolder.children).toHaveLength(0);
    expect(renderer.viewmodels.size).toBe(0);
  });

  it('restores the selected parent after a partial warmup construction failure and can retry', () => {
    const renderer = harness();
    renderer.setGun(1);
    const selected = renderer.viewModel!;
    fixture.failAt = 3;
    expect(() => renderer.prepareViewmodelsForWarmup()).toThrow('test model construction failure');
    expect(renderer.vmHolder.children).toEqual([selected.group]);
    expect(renderer.viewmodels.get(2)!.group.parent).toBeNull();
    expect(renderer.muzzleSprite!.parent).toBe(selected.muzzle);
    fixture.failAt = 0;
    renderer.prepareViewmodelsForWarmup().release();
    expect(renderer.viewmodels.size).toBe(7);
    expect(renderer.vmHolder.children).toEqual([selected.group]);
    renderer.disposeViewmodels();
  });
});
