// The silhouette redesigns grew heads, horns, mitres and raised launchers.
// Art that renders ABOVE the hit volume is a gameplay bug, not a look: a
// shot at a visible skull that sits over `enemyVolumeY(def).yMax` misses.
// Measure the actual built geometry against the volume the sim shoots at.
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { ENEMIES, enemyVolumeY } from '../../src/sim/enemyTypes';
import type { EnemyType } from '../../src/sim/types';
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

const TYPES: EnemyType[] = ['husk', 'crawler', 'slab', 'wisp', 'hierophant', 'fiend'];

// Thin held props (staff shaft, finial ring) may overhang — nobody aims at a
// staff. Discriminate by thickness, not by a per-enemy slack constant: a
// blanket allowance hides a fat mass like a mitre, which players DO aim at.
const PROP_THICKNESS = 0.12;

// Art is measured at rest, but EnemyRenderer.update bobs `rig.body` upward
// during movement — by a different amount per locomotion branch. Headroom
// must match the real bob or the check is either toothless or wrong.
const BOB: Record<EnemyType, number> = {
  husk: 0.045,        // biped: abs(sin) * 0.045
  slab: 0.045,        // biped
  fiend: 0.045,       // biped
  crawler: 0.04,      // skitter: abs(sin) * 0.04
  wisp: ENEMIES.wisp.hoverBob, // hover: sin * def.hoverBob — single source of truth, can't drift
  hierophant: 0.13,   // sin * 0.05 + speedNorm * abs(sin) * 0.08
};

// Nothing is currently exempted. (Previously the wisp was skipped here: its
// 0.18 hover bob carried its crown above a static hit volume sized only to
// `height`. That was a volume bug, not an art problem — enemyVolumeY now
// widens the flying hit volume by the bob amplitude, so the wisp's art —
// deliberately left untouched — passes this check on its own merits.)
const PRE_EXISTING: EnemyType[] = [];

/** Tallest point of any mesh substantial enough that a player would aim at it. */
async function measureBody(type: EnemyType): Promise<number> {
  const rig = await buildRig(type);
  let top = -Infinity;
  rig.group.traverse((o: THREE.Object3D) => {
    if (!(o as THREE.Mesh).isMesh) return;
    const b = new THREE.Box3().setFromObject(o);
    const thickness = Math.min(b.max.x - b.min.x, b.max.z - b.min.z);
    if (thickness < PROP_THICKNESS) return; // thin prop, not a target
    top = Math.max(top, b.max.y);
  });
  return top;
}

async function buildRig(type: EnemyType): Promise<{ group: THREE.Object3D }> {
  const { EnemyRenderer } = await import('../../src/render/enemies');
  const scene = new THREE.Scene();
  const renderer = new EnemyRenderer(scene);
  renderer.syncStart([{
    id: 1, type, def: ENEMIES[type], x: 0, z: 0, yaw: 0, hp: 10, maxHp: 10,
    speed: 0, accuracy: 0, state: 'idle', timer: 0, attackCd: 0, burstLeft: 0,
    burstTimer: 0, path: null, pathIndex: 0, pathTimer: 0, noLosTime: 0,
    awakened: true, dead: false, deathTime: 0, animPhase: 0,
    rng: makeRng(`hitbox-${type}`),
  }] as never);
  const rig = renderer.rigs.get(1)!;
  rig.group.updateMatrixWorld(true);
  return rig;
}

describe('enemy art fits the volume the sim shoots at', () => {
  for (const type of TYPES) {
    const label = PRE_EXISTING.includes(type) ? ' [pre-existing, documented]' : '';
    it.skipIf(PRE_EXISTING.includes(type))(
      `${type}: aimable body stays inside enemyVolumeY, with bob headroom${label}`, async () => {
      const vol = enemyVolumeY(ENEMIES[type]);
      const top = await measureBody(type);
      const ceiling = vol.yMax - BOB[type];

      expect(
        top,
        `${type} body art reaches y=${top.toFixed(2)}; hittable only to ${vol.yMax.toFixed(2)} `
        + `(${ceiling.toFixed(2)} allowing for its ${BOB[type]} bob). Shots at the top of it will miss.`,
      ).toBeLessThanOrEqual(ceiling);
    });
  }

  it('no enemy is drawn so short that most of its hit volume is empty air', async () => {
    // The inverse failure: a hit volume much taller than the art means the
    // player hits nothing visible above the body.
    for (const type of TYPES) {
      const vol = enemyVolumeY(ENEMIES[type]);
      const top = await measureBody(type);
      expect(
        top,
        `${type} art tops out at ${top.toFixed(2)}, far below its ${vol.yMax.toFixed(2)} hit ceiling`,
      ).toBeGreaterThan(vol.yMax * 0.6);
    }
  });
});
