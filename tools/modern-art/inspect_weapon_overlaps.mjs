// Inspect parallel flat faces in saved GLBs for positive-area coplanar overlap.
// Opposite-facing/merely touching faces are excluded. This is asset diagnosis,
// not a blanket ban on intentionally intersecting rounded geometry.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readFile } from 'node:fs/promises';

const cross = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
function signedArea(polygon) {
  return polygon.reduce((sum, point, i) => {
    const next = polygon[(i + 1) % polygon.length];
    return sum + point[0] * next[1] - point[1] * next[0];
  }, 0) / 2;
}
function intersectionArea(subject, clip) {
  let result = subject;
  const direction = Math.sign(signedArea(clip));
  for (let i = 0; i < clip.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length], input = result;
    result = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j], q = input[(j + 1) % input.length];
      const cp = cross(a, b, p) * direction, cq = cross(a, b, q) * direction;
      if (cp >= 0) result.push(p);
      if ((cp > 0 && cq < 0) || (cp < 0 && cq > 0)) {
        const t = cp / (cp - cq);
        result.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
    }
  }
  return Math.abs(signedArea(result));
}

export function coplanarOverlaps(root, tolerance = 1e-6) {
  root.updateMatrixWorld(true);
  const planes = new Map();
  root.traverse(node => {
    if (!node.isMesh || node.name.includes('hand')) return;
    const positions = node.geometry.getAttribute('position');
    const indices = node.geometry.index;
    for (let i = 0; i < (indices?.count ?? positions.count); i += 3) {
      const vertices = Array.from({ length: 3 }, (_, j) => new THREE.Vector3().fromBufferAttribute(positions, indices ? indices.getX(i + j) : i + j).applyMatrix4(node.matrixWorld));
      const normal = vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0])).normalize();
      if (normal.lengthSq() < .9) continue;
      const axis = ['x', 'y', 'z'].sort((a, b) => Math.abs(normal[b]) - Math.abs(normal[a]))[0];
      const distance = normal.dot(vertices[0]);
      const key = `${normal.toArray().map(value => Math.round(value * 1000)).join(':')}:${Math.round(distance / tolerance)}`;
      const other = ['x', 'y', 'z'].filter(value => value !== axis);
      const polygon = vertices.map(vertex => other.map(axis => vertex[axis]));
      const row = { name: node.name, material: node.material.name, triangle: i / 3, polygon,
        min: [0, 1].map(axis => Math.min(...polygon.map(point => point[axis]))),
        max: [0, 1].map(axis => Math.max(...polygon.map(point => point[axis]))), distance, axis, normal, vertices };
      if (!planes.has(key)) planes.set(key, []);
      planes.get(key).push(row);
    }
  });
  const overlaps = [];
  for (const faces of planes.values()) for (let i = 0; i < faces.length; i++) for (let j = i + 1; j < faces.length; j++) {
    const a = faces[i], b = faces[j];
    if ([0, 1].some(axis => a.max[axis] <= b.min[axis] || b.max[axis] <= a.min[axis])) continue;
    if (a.normal.dot(b.normal) < .999999 || b.vertices.some(point => Math.abs(a.normal.dot(point) - a.distance) > tolerance)) continue;
    const area = intersectionArea(a.polygon, b.polygon);
    if (area > 1e-8) overlaps.push({ area, axis: a.axis, plane: a.distance,
      a: { name: a.name, material: a.material, triangle: a.triangle },
      b: { name: b.name, material: b.material, triangle: b.triangle } });
  }
  return overlaps.sort((a, b) => b.area - a.area);
}

if (process.argv[1]?.endsWith('inspect_weapon_overlaps.mjs')) {
  for (let id = 1; id <= 7; id++) {
    const bytes = await readFile(new URL(`../../public/modern/roster/weapons/${id}.glb`, import.meta.url));
    const model = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const overlaps = coplanarOverlaps(model.scene);
    console.log(JSON.stringify({ id, count: overlaps.length, area: overlaps.reduce((sum, row) => sum + row.area, 0), largest: overlaps.slice(0, 8) }));
  }
}
