import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['test/**/*.spec.ts'],
    exclude: ['test/**/*.integration.spec.ts'],
  },
});
