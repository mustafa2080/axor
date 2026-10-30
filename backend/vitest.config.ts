import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
    // Integration tests share one test database, so test files must not run concurrently.
    fileParallelism: false,
    // Truncating the domain tables before each test can take over 10 s on a loaded Windows machine
    // (hook timeouts with no real failure), so the limits are generous. CI is not affected.
    hookTimeout: 60_000,
    testTimeout: 60_000,
  },
});
