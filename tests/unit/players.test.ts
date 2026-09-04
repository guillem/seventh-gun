// Remote player rig (arena multiplayer). Node has no canvas; the name-label
// sprite paints onto a 2D context, so install the same stub trick used by
// enemyArt.test.ts before touching players.ts.
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';

function installCanvasStub(): void {
  if (typeof document !== 'undefined') return;
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter',
    shadowColor: '', shadowBlur: 0, globalAlpha: 1, globalCompositeOperation: 'source-over',
    font: '', textAlign: 'left' as CanvasTextAlign,
    fillRect() {}, strokeRect() {}, clearRect() {}, fillText() {}, measureText() { return { width: 0 }; },
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, ellipse() {},
    fill() {}, stroke() {}, clip() {}, rect() {},
    quadraticCurveTo() {}, bezierCurveTo() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    save() {}, restore() {}, setTransform() {}, translate() {}, rotate() {}, scale() {},
  };
  (globalThis as unknown as { document: { createElement: (tag: string) => unknown } }).document = {
    createElement(tag: string) {
      if (tag === 'canvas') return { width: 0, height: 0, getContext: () => ctx };
      return {};
    },
  };
}

beforeAll(() => {
  installCanvasStub();
});

describe('remote player rig fog (bug 5)', () => {
  it('patches every rig material (body/head/visor/gun/name-sprite) with radial fog', async () => {
    const { PlayerRenderer } = await import('../../src/render/players');
    const { applyRadialFog } = await import('../../src/render/radialFog');
    void applyRadialFog; // ensure module import order matches source

    const scene = new THREE.Scene();
    const pr = new PlayerRenderer(scene);
    const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100);
    camera.position.set(0, 1.6, 0);
    camera.updateMatrixWorld();

    // Far outside the 60u visibility range: `dist < 60` short-circuits before
    // the LOS check runs, so a stub SolidState is safe (never dereferenced).
    pr.update(0.016, [
      { id: 1, name: 'REMOTE', colorIndex: 0, x: 5000, z: 5000, yaw: 0, hp: 100, alive: true },
    ], camera, {} as never);

    let materialCount = 0;
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      const sprite = obj as THREE.Sprite;
      if (!mesh.isMesh && !sprite.isSprite) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (!m) continue;
        materialCount++;
        expect(m.userData.radialFog).toBe(true);
      }
    });
    expect(materialCount).toBeGreaterThanOrEqual(5); // body, head, visor, gun, name sprite
  });
});
