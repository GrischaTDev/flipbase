import { defineConfig } from 'vitest/config';

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
          name: 'dom',
          globals: false,
          environment: 'jsdom',
          include: ['src/**/*.dom.spec.ts'],
          setupFiles: ['src/test-setup.ts'],
          pool: 'vmThreads',
          isolate: true,
          vmMemoryLimit: '1GB',
        },
      },
      {
        extends: true,
        test: {
          name: 'angular',
          globals: false,
          environment: 'jsdom',
          include: ['src/**/*.angular.spec.ts'],
          setupFiles: ['src/test-setup.ts', 'src/test-setup.angular-fallback.ts'],
          pool: 'vmThreads',
          isolate: true,
          vmMemoryLimit: '1GB',
        },
      },
    ],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/app/**/*.ts'],
      exclude: [
        'src/app/**/*.spec.ts',
        'src/app/**/*.routes.ts',
        'src/app/core/models/**',
        'src/app/core/i18n/**',
      ],
    },
  },
});
