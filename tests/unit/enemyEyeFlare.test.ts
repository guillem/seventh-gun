// Enemy eye flare (attack/pain) must restore to the rig's own resting
// colour on idle, and must never hardcode orange — it derives its flare
// hue from each species' own eye colour. Node has no canvas, so painting
// is exercised against a ctx stub, same trick as enemyArt.test.ts.
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { ENEMIES } from '../../src/sim/enemyTypes';
import { makeRng } from '../../src/sim/rng';

function installCanvasStub(): void {
  if (typeof document !== 'undefined') return;
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter',
    shadowColor: '', shadowBlur: 0, globalAlpha: 1, globalCompositeOperation: 'source-over',
    fillRect() {}, strokeRect() {}, clearRect() {},
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

async function makeFixture() {
  const { EnemyRenderer } = await import('../../src/render/enemies');
  const scene = new THREE.Scene();
  const renderer = new EnemyRenderer(scene);

  function entity(type: 'husk' | 'slab', state: 'idle' | 'attack' | 'pain', timer: number) {
    return {
      id: 1, type, def: ENEMIES[type], x: 0, z: 0, yaw: 0, hp: 10, maxHp: 10,
      speed: 0, accuracy: 0, state, timer, attackCd: 0, burstLeft: 0, burstTimer: 0,
      path: null, pathIndex: 0, pathTimer: 0, noLosTime: 0, awakened: true, dead: false,
      deathTime: 0, animPhase: 0, rng: makeRng('eye-flare-test'),
    };
  }

  return { renderer, entity };
}

describe('enemy eye flare (bug: eyes stuck flared, hardcoded orange)', () => {
  it('restores eyeMat.color to eyeBase after an attack windup, on the next idle frame', async () => {
    const { renderer, entity } = await makeFixture();
    const camera = new THREE.PerspectiveCamera();

    renderer.syncStart([entity('husk', 'idle', 0)]);
    const rig = renderer.rigs.get(1)!;
    const restColor = rig.eyeMat.color.clone();

    // full windup: eyes should be flared away from resting colour
    renderer.update(0.016, [entity('husk', 'attack', ENEMIES.husk.windup)], camera, 0);
    expect(rig.eyeMat.color.equals(restColor)).toBe(false);

    // back to idle: must restore exactly, not stay flared forever
    renderer.update(0.016, [entity('husk', 'idle', 0)], camera, 0.02);
    expect(rig.eyeMat.color.equals(restColor)).toBe(true);
  });

  it('restores eyeMat.color to eyeBase after a pain flash, on the next idle frame', async () => {
    const { renderer, entity } = await makeFixture();
    const camera = new THREE.PerspectiveCamera();

    renderer.syncStart([entity('husk', 'idle', 0)]);
    const rig = renderer.rigs.get(1)!;
    const restColor = rig.eyeMat.color.clone();

    renderer.update(0.016, [entity('husk', 'pain', 0)], camera, 0);
    expect(rig.eyeMat.color.equals(restColor)).toBe(false);

    renderer.update(0.016, [entity('husk', 'idle', 0)], camera, 0.02);
    expect(rig.eyeMat.color.equals(restColor)).toBe(true);
  });

  it('a green-eyed rig (husk) flares hot-green/white, never orange, through the whole windup', async () => {
    const { renderer, entity } = await makeFixture();
    const camera = new THREE.PerspectiveCamera();

    renderer.syncStart([entity('husk', 'idle', 0)]);
    const rig = renderer.rigs.get(1)!;
    // husk's own base colour must actually be green (g dominant), or this
    // test would pass vacuously.
    expect(rig.eyeBase!.g).toBeGreaterThan(rig.eyeBase!.r);

    for (const frac of [0, 0.25, 0.5, 0.75, 1]) {
      renderer.update(0.016, [entity('husk', 'attack', ENEMIES.husk.windup * frac)], camera, 0);
      // Orange means red clearly exceeds green. A husk's flare must not.
      expect(rig.eyeMat.color.r).toBeLessThanOrEqual(rig.eyeMat.color.g + 1e-6);
    }

    // pain flash too
    renderer.update(0.016, [entity('husk', 'pain', 0)], camera, 0);
    expect(rig.eyeMat.color.r).toBeLessThanOrEqual(rig.eyeMat.color.g + 1e-6);
  });

  it('attack flare is a pure function of windup t, not of the previously-mutated colour (no compounding)', async () => {
    const { renderer, entity } = await makeFixture();
    const camera = new THREE.PerspectiveCamera();

    renderer.syncStart([entity('husk', 'idle', 0)]);
    const rig = renderer.rigs.get(1)!;
    const halfway = ENEMIES.husk.windup * 0.5;

    // Reach the halfway point two different ways: directly, and via several
    // intermediate frames at the same halfway t. If the flare read its own
    // mutated .color (the bug), repeated frames at the same t would keep
    // drifting; a pure function of t settles on the same value immediately.
    renderer.update(0.016, [entity('husk', 'attack', halfway)], camera, 0);
    const once = rig.eyeMat.color.clone();
    renderer.update(0.016, [entity('husk', 'attack', halfway)], camera, 0);
    renderer.update(0.016, [entity('husk', 'attack', halfway)], camera, 0);
    renderer.update(0.016, [entity('husk', 'attack', halfway)], camera, 0);
    const repeated = rig.eyeMat.color.clone();

    expect(repeated.equals(once)).toBe(true);
  });

  it('death starts the eye fade from eyeBase, not from a flare that was active when death began', async () => {
    const { renderer, entity } = await makeFixture();
    const camera = new THREE.PerspectiveCamera();

    renderer.syncStart([entity('husk', 'idle', 0)]);
    const rig = renderer.rigs.get(1)!;
    const restColor = rig.eyeMat.color.clone();

    // flare mid-attack, then die on the very same frame's data (deathTime
    // === simTime: the first frame of death).
    renderer.update(0.016, [entity('husk', 'attack', ENEMIES.husk.windup)], camera, 0);
    expect(rig.eyeMat.color.equals(restColor)).toBe(false);

    const dead = { ...entity('husk', 'idle', 0), dead: true, deathTime: 5 };
    renderer.update(0.016, [dead], camera, 5); // dt2 = simTime - deathTime = 0

    // at dt2 = 0 the darken multiplier is 1: colour must equal eyeBase exactly.
    expect(rig.eyeMat.color.equals(restColor)).toBe(true);
  });
});
