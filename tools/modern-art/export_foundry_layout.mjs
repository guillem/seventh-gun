// Export existing gameplay boundaries for offline art authoring; never carve.
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
const vite = await createServer({ mode: 'portable', server: { middlewareMode: true, hmr: false }, appType: 'custom' });
try {
  const { CAMPAIGN } = await vite.ssrLoadModule('/src/campaign/index.ts');
  const map = CAMPAIGN[0].map;
  const cells = [];
  for (let z = 39; z < 48; z++) for (let x = 6; x < 52; x++) if (map.grid[z * map.w + x] === 1) cells.push([x, z]);
  writeFileSync('art/modern/foundry-room/layout.json', JSON.stringify({ seed: map.seed, w: map.w, h: map.h,
    grid: Array.from(map.grid), cells, doors: map.doors, playerStart: map.playerStart }) + '\n');
  console.log(`Exported ${cells.length} original floor cells.`);
} finally { await vite.close(); }
