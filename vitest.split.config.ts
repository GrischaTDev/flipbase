import { defineConfig } from 'vitest/config';

const jsdomSetup = {
  globals: false,
  setupFiles: ['src/test-setup.ts'],
};

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          globals: false,
          environment: 'node',
          include: ['src/**/*.spec.ts'],
          exclude: ['src/**/*.dom.spec.ts', 'src/**/*.angular.spec.ts'],
          setupFiles: ['src/test-setup.ts'],
          pool: 'forks',
          isolate: false,
        },
      },
      {
        extends: true,
        test: {
          ...jsdomSetup,
          name: 'dom',
          environment: 'jsdom',
          include: ['src/**/*.dom.spec.ts'],
          pool: 'vmThreads',
          isolate: true,
          vmMemoryLimit: '1GB',
        },
      },
      {
        extends: true,
        test: {
          ...jsdomSetup,
          name: 'angular-fallback',
          environment: 'jsdom',
          include: ['src/**/*.angular.spec.ts'],
          setupFiles: ['src/test-setup.ts', 'src/test-setup.angular-fallback.ts'],
          pool: 'forks',
          isolate: true,
          vmMemoryLimit: '1GB',
        },
      },
    ],
  },
});
