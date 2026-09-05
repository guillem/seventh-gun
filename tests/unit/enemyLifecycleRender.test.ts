// Exercise the six actual procedural rigs through the states their renderer
// owns. This is deliberately separate from balance tests: a species can have
// a valid sim definition while a missing rig branch silently stops animating.
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ENEMIES } from '../../src/sim/enemyTypes';
import type { EnemyEnt } from '../../src/sim/sim';
import type { EnemyType } from '../../src/sim/types';
import { makeRng } from '../../src/sim/rng';

function installCanvasStub(): void {
  if (typeof document !== 'undefined') return;
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter',
    shadowColor: '', shadowBlur: 0, globalAlpha: 1, globalCompositeOperation: 'source-over',
    fillRect() {}, strokeRect() {}, clearRect() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, ellipse() {},
    fill() {}, stroke() {}, clip() {}, rect() {}, quadraticCurveTo() {}, bezierCurveTo() {}, save() {}, restore() {}, setTransform() {}, translate() {}, rotate() {}, scale() {},
    createLinearGradient() { return { addColorStop() {} }; }, createRadialGradient() { return { addColorStop() {} }; },
  };
  (globalThis as unknown as { document: { createElement: (tag: string) => unknown } }).document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => ctx }),
  };
}

beforeAll(installCanvasStub);

const TYPES: EnemyType[] = ['husk', 'crawler', 'slab', 'wisp', 'hierophant', 'fiend'];

function enemy(type: EnemyType, id: number): EnemyEnt {
  const def = ENEMIES[type];
  return {
    id, type, def, x: id * 2, z: 0, yaw: 0, hp: def.hp, maxHp: def.hp,
    speed: def.speed, accuracy: def.accuracy, state: 'attack', timer: def.windup / 2,
    attackCd: 0, burstLeft: def.burst, burstTimer: 0, path: null, pathIndex: 0,
    pathTimer: 0, noLosTime: 0, awakened: true, dead: false, deathTime: 0,
    animPhase: 0.4, rng: makeRng(`render-lifecycle-${type}`),
  };
}

describe('six species renderer lifecycle', () => {
  it('builds, culls, attacks, and reaches a death pose for every species', async () => {
    const { EnemyRenderer } = await import('../../src/render/enemies');
    const scene = new THREE.Scene();
    const renderer = new EnemyRenderer(scene);
    const enemies = TYPES.map(enemy);
    renderer.syncStart(enemies);

    expect(renderer.rigs.size).toBe(TYPES.length);
    renderer.setAllVisible(false);
    expect(renderer.rigInfo().every(rig => !rig.visible)).toBe(true);
    renderer.setAllVisible(true);

    renderer.update(1 / 60, enemies, new THREE.PerspectiveCamera(), 1);
    for (const [index, type] of TYPES.entries()) {
      const rig = renderer.rigs.get(index)!;
      expect(rig.group.parent, `${type} rig attached`).toBe(scene);
      expect(rig.body.rotation.x, `${type} attack windup`).toBeLessThan(0);
    }

    for (const e of enemies) { e.dead = true; e.deathTime = 0; }
    renderer.update(1 / 60, enemies, new THREE.PerspectiveCamera(), 0.5);
    for (const [index, type] of TYPES.entries()) {
      expect(Math.abs(renderer.rigs.get(index)!.group.rotation.x), `${type} death pose`).toBeGreaterThan(0.5);
    }

    renderer.dispose();
    expect(scene.children).toHaveLength(0);
  });
});
