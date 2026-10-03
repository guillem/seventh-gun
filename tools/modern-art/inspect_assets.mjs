// Validate the actual exported resources and document integration coordinates.
// This uses the same Three.js GLTFLoader as the client, without a browser.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { Box3, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const conventions = {
  pistol: ['pistol', 'weapon', 'hands', 'slide', 'trigger', 'muzzle'],
  husk: ['husk', 'body', 'head', 'jaw', 'mouth', 'arm_l', 'arm_r', 'leg_l', 'leg_r', 'eye_l', 'eye_r'],
  architecture: ['architecture', 'wall_rib', 'wall_fixture', 'pipe_run', 'service_panel', 'floor_grille'],
};
const round = vector => vector.toArray().map(value => +value.toFixed(5));
const report = {};
for (const [name, required] of Object.entries(conventions)) {
  const bytes = await readFile(path.join(root, 'public/modern/models', `${name}.glb`));
  const array = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const { scene, animations } = await new GLTFLoader().parseAsync(array, '');
  scene.updateMatrixWorld(true);
  for (const node of required) assert(scene.getObjectByName(node), `${name}: missing ${node}`);
  let meshes = 0;
  let triangles = 0;
  const materials = new Set();
  scene.traverse(object => {
    if (!object.isMesh) return;
    ++meshes;
    const geometry = object.geometry;
    assert(geometry.attributes.uv?.count === geometry.attributes.position.count, `${name}/${object.name}: missing UVs`);
    assert(geometry.attributes.normal?.count === geometry.attributes.position.count, `${name}/${object.name}: missing normals`);
    for (const position of geometry.attributes.position.array) assert(Number.isFinite(position));
    triangles += (geometry.index?.count ?? geometry.attributes.position.count) / 3;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
  });
  const bounds = new Box3().setFromObject(scene);
  const nodes = Object.fromEntries(required.map(nodeName => {
    const node = scene.getObjectByName(nodeName);
    const box = new Box3().setFromObject(node);
    return [nodeName, {
      position: round(node.getWorldPosition(new Vector3())),
      ...(box.isEmpty() ? {} : { min: round(box.min), max: round(box.max) }),
    }];
  }));
  if (name === 'husk') {
    assert(bounds.max.y < 2.05 && bounds.min.y >= -0.02, 'Husk must fit existing vertical hit volume');
    const mouth = scene.getObjectByName('mouth').getWorldPosition(new Vector3());
    assert(mouth.distanceTo(new Vector3(.09, 1.668, .53)) < .004, 'Husk mouth must match projectile anchor');
  }
  if (name === 'pistol') {
    const muzzle = scene.getObjectByName('muzzle').getWorldPosition(new Vector3());
    assert(muzzle.distanceTo(new Vector3(0, .055, -.376)) < .001, 'Pistol muzzle moved');
  }
  report[name] = { bytes: bytes.length, meshes, triangles, materials: materials.size,
    animations: animations.length, min: round(bounds.min), max: round(bounds.max), nodes };
}
await writeFile(path.join(root, 'art/modern/model-inspection.json'), `${JSON.stringify(report, null, 2)}\n`);
for (const [name, item] of Object.entries(report)) {
  console.log(`${name}: ${item.meshes} meshes / ${item.triangles} triangles / ${item.bytes} bytes; all required pivots, UVs, normals and bounds valid`);
}
