import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ContactOcclusionPass } from '../../src/render/contactOcclusion';

describe('desktop contact shading', () => {
  it('omits transparent effects from depth while preserving all previous visibility and camera projection', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, 1, .1, 500);
    const solid = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial({ transparent: true }));
    const hidden = new THREE.Sprite(new THREE.SpriteMaterial());
    hidden.visible = false;
    scene.add(solid, glass, hidden);
    const pass = new ContactOcclusionPass(scene, camera);
    pass.setSize(1440, 900);
    expect(pass.normalRenderTarget.width).toBe(720);
    expect(pass.normalRenderTarget.height).toBe(450);
    camera.aspect = .5;
    camera.updateProjectionMatrix();
    pass.overrideVisibility();
    expect(solid.visible).toBe(true);
    expect(glass.visible).toBe(false);
    expect(hidden.visible).toBe(false);
    expect(pass.ssaoMaterial.uniforms.cameraProjectionMatrix.value.equals(camera.projectionMatrix)).toBe(true);
    pass.restoreVisibility();
    expect(glass.visible).toBe(true);
    expect(hidden.visible).toBe(false);
    pass.dispose();
  });
});
