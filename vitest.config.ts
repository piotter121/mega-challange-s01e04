import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Worker worktrees are private orchestration data, not additional test suites.
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
