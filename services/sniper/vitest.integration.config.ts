import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['test/**/*.integration.spec.ts'],
    // Die Tests teilen sich eine Datenbank und duerfen sich nicht ueberholen.
    fileParallelism: false,
  },
});
