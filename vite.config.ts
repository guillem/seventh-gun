import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';

// Two build targets share this config.
//
// Default (`vite build`) is Cloudflare: the plugin bundles server/index.ts as a
// Worker and splits output into dist/client + dist/seventh_gun. That layout is
// what netlify.toml's `publish`, wrangler.jsonc's `assets.directory` and
// playwright.config.ts's preview server all expect, so it must not drift.
//
// `--mode portable` drops the plugin for the self-host targets (Docker, npx,
// static tarball). outDir is pinned so dist/client stays the client root for
// every target. The isSsrBuild branch matters: `vite build --ssr` reads this
// same config, so without it the server pass would inherit dist/client with
// emptyOutDir and delete the client bundle the previous pass just wrote.
export default defineConfig(({ mode, isSsrBuild }) => ({
  plugins: mode === 'portable' ? [] : [cloudflare()],
  build:
    mode !== 'portable'
      ? {}
      : isSsrBuild
        ? {
            outDir: 'dist/node',
            emptyOutDir: false,
            target: 'node22',
            // publicDir would copy the client's favicons in next to the server.
            copyPublicDir: false,
            rollupOptions: { output: { entryFileNames: 'server.mjs' } },
          }
        : { outDir: 'dist/client', emptyOutDir: true },
}));
