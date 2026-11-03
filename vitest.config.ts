import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only this checkout's unit suite; nested worktrees and dependencies have their own tests.
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
