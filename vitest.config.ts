import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['tests/e2e/**', 'node_modules/**'],
    environment: 'node',
    // NOTE: this used to declare a `projects: [{ name: 'unit', ... }]` block.
    // `test.projects` is a Vitest 3 field; on 2.x the equivalent is
    // `workspace`, so Vitest printed the project name but never applied its
    // include — `vitest run --project unit` matched zero files and exited 1.
    // `npm run test:unit` had been silently broken. The block was redundant
    // anyway: e2e is already excluded above, so the default run IS the unit
    // run, and test:unit now scopes by path instead.
  },
});
