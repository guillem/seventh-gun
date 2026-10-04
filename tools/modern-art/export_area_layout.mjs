// Export an authored area's gameplay boundaries for offline Blender work; the
// map is read, never carved. Usage:
//   node tools/modern-art/export_area_layout.mjs <campaignIndex> <areaId> <x0,z0,x1,z1> [...]
// Rectangles are end-exclusive cell ranges, as in src/render/authoredAreas.ts.
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';

const [index, id, ...rects] = process.argv.slice(2);
if (!index || !id || !rects.length) throw new Error('usage: <campaignIndex> <areaId> <x0,z0,x1,z1> [...]');
const boxes = rects.map(r => r.split(',').map(Number));
const vite = await createServer({
  mode: 'portable', server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const { CAMPAIGN } = await vite.ssrLoadModule('/src/campaign/index.ts');
  const { findExposedWallFace, reachableFloorCells } = await vite.ssrLoadModule('/src/sim/blueprint.ts');
  const map = CAMPAIGN[Number(index) - 1].map;
  const inside = (x, z) => boxes.some(([x0, z0, x1, z1]) => x >= x0 && x < x1 && z >= z0 && z < z1);
  const cells = [];
  for (let z = 0; z < map.h; z++) for (let x = 0; x < map.w; x++) if (inside(x, z) && map.grid[z * map.w + x] === 1) cells.push([x, z]);
  const owned = new Set(cells.map(([x, z]) => `${x},${z}`));
  const touches = list => list.some(([x, z]) => owned.has(`${x},${z}`));
  // Doors, the seal and secrets stay runtime objects; an area must not own them.
  const conflicts = [
    ...map.doors.filter(d => touches(d.cells)).map(d => `door ${d.id}`),
    ...(touches(map.seal.cells) ? ['seal'] : []),
    ...(map.secrets ?? []).filter(s => touches(s.cells) || (s.trigger && owned.has(`${s.trigger.x},${s.trigger.z}`))).map(s => `secret ${s.id}`),
  ];
  // Remote secret controls (lever / shootable sigil) mounted on an area wall:
  // the runtime draws them, so the area must keep that wall face clear.
  const closed = new Set();
  for (const s of map.secrets ?? []) for (const [x, z] of s.cells) closed.add(z * map.w + x);
  const reach = reachableFloorCells(map.grid, map.w, map.h, Math.floor(map.playerStart.x / 2), Math.floor(map.playerStart.z / 2), closed);
  const controls = [];
  for (const s of map.secrets ?? []) {
    if (!s.trigger) continue;
    const face = findExposedWallFace(map.grid, map.w, map.h, s.trigger.x, s.trigger.z, reach);
    if (face && owned.has(`${s.trigger.x + face.dx},${s.trigger.z + face.dz}`)) {
      controls.push({ secret: s.id, kind: s.kind, x: (s.trigger.x + .5) * 2 + face.dx, z: (s.trigger.z + .5) * 2 + face.dz, dx: face.dx, dz: face.dz });
    }
  }
  // Secret plates opening off the area read as openings; record them.
  const plates = (map.secrets ?? []).filter(s => s.cells.some(([x, z]) =>
    [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => owned.has(`${x + dx},${z + dz}`)))).map(s => ({ secret: s.id, kind: s.kind, x: s.x, z: s.z, axis: s.axis }));
  const dir = `art/modern/areas/${id}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/layout.json`, JSON.stringify({
    id, seed: map.seed, w: map.w, h: map.h, rects: boxes, grid: Array.from(map.grid), cells,
    doors: map.doors, seal: map.seal, secrets: map.secrets ?? [],
    rooms: map.rooms.filter(r => touches(Array.from({ length: r.w * r.h }, (_, i) => [r.x + i % r.w, r.z + Math.floor(i / r.w)]))),
    conflicts, controls, plates,
  }) + '\n');
  console.log(`Exported ${cells.length} cells for ${id} (${map.seed}); conflicts: ${conflicts.join(', ') || 'none'}; controls: ${controls.length}; plates: ${plates.length}`);
} finally { await vite.close(); }
