import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as cache from '../../src/render/modernAssets';
import { EnemyRenderer } from '../../src/render/enemies';
import { ENEMIES, enemyVolumeY } from '../../src/sim/enemyTypes';
import type { EnemyType } from '../../src/sim/types';
import type { EnemyEnt } from '../../src/sim/sim';
import { makeRng } from '../../src/sim/rng';

// Only the common legacy blob-shadow canvas is stubbed. These tests load and
// animate every real exported GLB with Three's own skinning and clip loader.
vi.mock('../../src/render/textures', async () => {
  const THREE = await import('three');
  return { getTextures: () => ({ shadow: new THREE.Texture() }) };
});

const types = Object.keys(ENEMIES) as EnemyType[];
const models: Record<string, THREE.Group> = {};
const clips: Record<string, THREE.AnimationClip[]> = {};
let getAssets: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  for (const type of types) {
    const bytes = readFileSync(new URL(`../../public/modern/roster/enemies/${type}.glb`, import.meta.url));
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    models[type] = gltf.scene;
    clips[type] = gltf.animations;
  }
  getAssets = vi.spyOn(cache, 'getModernAssets').mockReturnValue({ enemyModels: models, enemyClips: clips } as cache.ModernAssets);
});
afterAll(() => getAssets.mockRestore());

function entity(type: EnemyType, id = 1): EnemyEnt {
  const def = ENEMIES[type];
  return { id, type, def, x: 13, z: 21, yaw: 0.3, hp: def.hp, maxHp: def.hp,
    speed: def.speed, accuracy: def.accuracy, state: 'idle', timer: 0,
    attackCd: 0, burstLeft: def.burst, burstTimer: 0, path: null, pathIndex: 0,
    pathTimer: 0, noLosTime: 0, awakened: true, dead: false, deathTime: 0,
    animPhase: 0.37, rng: makeRng(`authored-${type}`) };
}

function posedBounds(model: THREE.Object3D): THREE.Box3 {
  model.updateMatrixWorld(true);
  model.traverse(node => { if (node instanceof THREE.SkinnedMesh) node.skeleton.update(); });
  return new THREE.Box3().setFromObject(model, true);
}

function boneRotations(model: THREE.Object3D): number[] {
  const values: number[] = [];
  model.traverse(node => { if (node instanceof THREE.Bone) values.push(...node.quaternion.toArray()); });
  return values;
}

describe('six saved skeletal enemy assets', () => {
  it('ships five skinned material draws and all five clips for every species', () => {
    for (const type of types) {
      let meshes = 0, triangles = 0;
      models[type].traverse(node => {
        if (!(node instanceof THREE.Mesh)) return;
        expect(node, type).toBeInstanceOf(THREE.SkinnedMesh);
        const skinned = node as THREE.SkinnedMesh;
        expect(skinned.skeleton.bones.length).toBeGreaterThanOrEqual(13);
        expect(node.geometry.getAttribute('uv')).toBeDefined();
        expect(node.geometry.getAttribute('skinWeight')).toBeDefined();
        const weights = node.geometry.getAttribute('skinWeight');
        for (let i = 0; i < weights.count; i++) {
          expect(weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i)).toBeCloseTo(1, 4);
        }
        expect((node.material as THREE.Material).name).toMatch(/^(enemy\.(skin|armour|dark|bone)|eye\.)/);
        triangles += (node.geometry.index?.count ?? node.geometry.getAttribute('position').count) / 3;
        meshes++;
      });
      expect(meshes, type).toBe(5);
      expect(triangles, type).toBeGreaterThan(4000);
      expect(triangles, type).toBeLessThan(25000);
      expect(clips[type].map(clip => clip.name).sort()).toEqual(['attack', 'death', 'hit', 'idle', 'walk']);
    }
  });

  it('keeps animated heads within the unchanged vertical gun volume and exact muzzle markers', () => {
    for (const type of types) {
      const model = cache.cloneOwnedModel(models[type]);
      const mixer = new THREE.AnimationMixer(model);
      const def = ENEMIES[type];
      const volume = enemyVolumeY(def);
      const baseY = def.flying ? def.hoverY : 0;
      const marker = model.getObjectByName('muzzle')!;
      const muzzle = marker.getWorldPosition(new THREE.Vector3());
      expect(muzzle.x, type).toBeCloseTo(def.muzzleOffset.right, 4);
      expect(muzzle.y, type).toBeCloseTo((def.flying ? 0 : def.height * .72) + def.muzzleOffset.up, 4);
      expect(muzzle.z, type).toBeCloseTo(def.muzzleOffset.forward, 4);
      for (const clip of clips[type].filter(c => c.name !== 'death')) {
        mixer.stopAllAction();
        const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1).play();
        action.paused = true;
        for (const fraction of [0, .2, .4, .6, .8, .9999]) {
          action.time = fraction * clip.duration;
          mixer.update(0);
          const bounds = posedBounds(model);
          const top = bounds.max.y + baseY + def.hoverBob;
          expect(top, `${type} ${clip.name} ${fraction}`).toBeLessThanOrEqual(volume.yMax + .005);
          expect(bounds.min.y, `${type} feet ${clip.name}`).toBeGreaterThan(def.flying ? -.6 : -.18);
        }
      }
      mixer.stopAllAction();
      const attack = mixer.clipAction(clips[type].find(c => c.name === 'attack')!).play();
      attack.paused = true; attack.time = attack.getClip().duration; mixer.update(0);
      // Neutral release is explicit in the authored curves; root never travels.
      expect(model.getObjectByName('root')!.position.length(), type).toBeLessThan(1e-6);
      expect(model.getObjectByName('head')!.quaternion.clone().normalize().angleTo(models[type].getObjectByName('head')!.quaternion.clone().normalize()), type).toBeLessThan(.0001);
      mixer.uncacheRoot(model);
    }
  });

  it('leaves animated mesh culling to the rig because death leaves the cached rest bounds', () => {
    const model = cache.cloneOwnedModel(models.husk);
    model.updateMatrixWorld(true);
    const eye = model.getObjectByName('eye_husk_husk') as THREE.SkinnedMesh;
    eye.computeBoundingSphere();
    const rest = eye.boundingSphere!.clone();
    const mixer = new THREE.AnimationMixer(model);
    const action = mixer.clipAction(clips.husk.find(clip => clip.name === 'death')!).play();
    action.paused = true;
    action.time = action.getClip().duration;
    mixer.update(0);
    model.updateMatrixWorld(true);
    eye.skeleton.update();
    let outside = 0;
    const vertex = new THREE.Vector3();
    for (let i = 0; i < eye.geometry.getAttribute('position').count; i++) {
      outside = Math.max(outside, eye.getVertexPosition(i, vertex).distanceTo(rest.center) - rest.radius);
    }
    // Actual exported animation demonstrates why a static per-mesh sphere
    // would pop eyes/body parts even when their enclosing rig remains visible.
    expect(outside).toBeGreaterThan(1);
    model.traverse(node => {
      if (node instanceof THREE.SkinnedMesh) expect(node.frustumCulled).toBe(false);
    });
    mixer.uncacheRoot(model);
  });

  it('scrubs state clips independently of render FPS and preserves clone isolation', () => {
    const renderer = new EnemyRenderer(new THREE.Scene());
    const camera = new THREE.PerspectiveCamera();
    for (const type of types) {
      const e = entity(type);
      renderer.syncStart([]);
      renderer.syncStart([e, { ...e, id: 2 }]);
      const rig = renderer.rigs.get(1)!;
      const other = renderer.rigs.get(2)!;
      expect(rig.authored).toBeDefined();
      const untouched = boneRotations(other.authored!.model);
      const neutral = boneRotations(rig.authored!.model);
      for (const state of ['chase', 'attack', 'pain'] as const) {
        e.state = state;
        e.timer = state === 'attack' ? e.def.windup * .5 : e.def.painTime * .7;
        renderer.update(1 / 120, [e], camera, 1);
        const first = boneRotations(rig.authored!.model);
        expect(first, `${type} ${state} visible animation`).not.toEqual(neutral);
        renderer.update(1 / 20, [e], camera, 1);
        expect(boneRotations(rig.authored!.model)).toEqual(first);
        expect(boneRotations(other.authored!.model)).toEqual(untouched);
        expect(rig.group.position.toArray()).toEqual([e.x, 0, e.z]);
      }
      e.state = 'idle'; renderer.update(1 / 60, [e], camera, 1);
      expect(rig.eyeMat.color.equals(rig.eyeBase!)).toBe(true);
      e.dead = true; e.deathTime = 1;
      renderer.update(1 / 60, [e], camera, 1.625);
      expect(rig.authored!.active).toBe('death');
      expect(Math.abs(rig.authored!.model.getObjectByName('root')!.quaternion.x)).toBeGreaterThan(.5);
      renderer.update(1 / 60, [e], camera, 3);
      expect(rig.group.position.y).toBeLessThan(0);
      expect(rig.eyeMat.color.g).toBeLessThan(rig.eyeBase!.g);
    }
    const mixer = renderer.rigs.get(1)!.authored!.mixer;
    const uncache = vi.spyOn(mixer, 'uncacheRoot');
    renderer.dispose();
    expect(uncache).toHaveBeenCalledOnce();
  });
});
