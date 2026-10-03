import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { prepareGpuResources } from '../../src/render/prepareGpu';

function rendererStub() {
  return {
    initTexture: vi.fn(), getRenderTarget: () => null, getClearColor: (color: THREE.Color) => color.set(0x123456),
    getClearAlpha: () => .5, setRenderTarget: vi.fn(), setClearColor: vi.fn(), autoClear: false,
  };
}

describe('GPU preparation', () => {
  it('uploads unique textures and submits hidden/out-of-view resources without changing the light layout', () => {
    const scene = new THREE.Scene(), parent = new THREE.Group();
    const texture = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map: texture, roughnessMap: texture });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    const light = new THREE.PointLight();
    parent.visible = false; mesh.frustumCulled = true; light.visible = false;
    parent.add(mesh); scene.add(parent, light);
    const renderer = rendererStub(), { initTexture } = renderer;
    const dispose = vi.spyOn(material, 'dispose');
    const draw = vi.fn(() => {
      expect(parent.visible).toBe(true);
      expect(mesh.frustumCulled).toBe(false);
      expect(light.visible).toBe(false);
      expect(initTexture).toHaveBeenCalledWith(texture);
    });
    prepareGpuResources(renderer as unknown as THREE.WebGLRenderer, [scene], draw);
    expect(draw).toHaveBeenCalledOnce();
    expect(initTexture).toHaveBeenCalledOnce();
    expect(parent.visible).toBe(false);
    expect(mesh.frustumCulled).toBe(true);
    expect(dispose).not.toHaveBeenCalled();
  });

  it('restores culling/visibility and reports preparation failure instead of entering play unprepared', () => {
    const mesh = new THREE.Mesh();
    const scene = new THREE.Scene(); scene.add(mesh);
    const renderer = rendererStub();
    mesh.visible = false;
    expect(() => prepareGpuResources(renderer as unknown as THREE.WebGLRenderer, [scene], () => {
      scene.overrideMaterial = new THREE.MeshNormalMaterial();
      renderer.autoClear = true;
      throw new Error('GPU unavailable');
    })).toThrow('GPU unavailable');
    expect(mesh.visible).toBe(false);
    expect(mesh.frustumCulled).toBe(true);
    expect(scene.overrideMaterial).toBeNull();
    expect(renderer.setRenderTarget).toHaveBeenCalledWith(null);
    expect(renderer.setClearColor).toHaveBeenCalledWith(new THREE.Color(0x123456), .5);
    expect(renderer.autoClear).toBe(false);
  });
});
