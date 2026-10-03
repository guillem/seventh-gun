// Guard for deploy.yml: refuse to deploy anything but the production Worker.
// The same CLOUDFLARE_API_TOKEN can deploy the art Worker, and the
// never-merged codex/experimental-modern-art branch carries a wrangler.jsonc
// for `seventh-gun-art` on art.seventhgun.com; a mistaken merge must stop here
// instead of overwriting the art Worker and leaving production stale.
// Production's custom domain lives in the Cloudflare dashboard, so the config
// must list no routes (see DECISIONS.md, "Custom domain").
// Reads the config wrangler will really deploy (the Vite plugin's redirect).
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const redirect = process.argv[2] ?? '.wrangler/deploy/config.json';
const target = resolve(dirname(redirect), JSON.parse(readFileSync(redirect, 'utf8')).configPath);
const config = JSON.parse(readFileSync(target, 'utf8'));
const routes = [...(config.routes ?? []), ...(config.route ? [config.route] : [])];

console.log(`${target}: ${config.name} routes=${JSON.stringify(routes)} workers_dev=${config.workers_dev}`);
if (config.name !== 'seventh-gun' || routes.length > 0 || config.workers_dev === false) {
  console.error('::error::refusing to deploy: expected seventh-gun with no routes and workers.dev on');
  process.exit(1);
}
