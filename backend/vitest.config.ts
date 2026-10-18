import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
    // Integration tests share one test database, so test files must not run concurrently.
    fileParallelism: false,
  },
});
