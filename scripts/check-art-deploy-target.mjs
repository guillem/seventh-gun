// BRANCH-ONLY guard for .github/workflows/deploy-art.yml: the Cloudflare token
// can deploy production too, and non-interactive wrangler takes a custom domain
// over from another Worker without asking. Read the config wrangler will really
// deploy (the Vite plugin's redirect target) and refuse anything but the art
// Worker on art.seventhgun.com.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const redirect = process.argv[2] ?? '.wrangler/deploy/config.json';
const target = resolve(dirname(redirect), JSON.parse(readFileSync(redirect, 'utf8')).configPath);
const config = JSON.parse(readFileSync(target, 'utf8'));
const routes = JSON.stringify(config.routes ?? []);
const expected = JSON.stringify([{ pattern: 'art.seventhgun.com', custom_domain: true }]);

console.log(`${target}: ${config.name} ${routes} workers_dev=${config.workers_dev}`);
if (config.name !== 'seventh-gun-art' || routes !== expected || config.workers_dev !== true) {
  console.error('::error::refusing to deploy: expected seventh-gun-art on art.seventhgun.com only');
  process.exit(1);
}
