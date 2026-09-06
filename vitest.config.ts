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
          pool: 'forks',
          isolate: true,
          vmMemoryLimit: '1GB',
        },
      },
    ],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/app/**/*.ts'],
      thresholds: {
        statements: 56,
        branches: 49,
        functions: 55,
        lines: 57,
        'src/app/core/services/profit-engine.service.ts': {
          statements: 95,
          branches: 90,
        },
        'src/app/core/services/tax-engine.service.ts': {
          statements: 95,
          branches: 90,
        },
        'src/app/core/models/inventory-sellability.ts': {
          statements: 95,
          branches: 90,
        },
      },
      exclude: [
        'src/app/**/*.spec.ts',
        'src/app/**/*.routes.ts',
        'src/app/core/models/accounting.models.ts',
        'src/app/core/models/bank-reconciliation.models.ts',
        'src/app/core/models/fulfillment.models.ts',
        'src/app/core/models/invoice.models.ts',
        'src/app/core/models/price-tracker.models.ts',
        'src/app/core/models/return.models.ts',
        'src/app/core/models/sale-target.models.ts',
        'src/app/core/models/store.models.ts',
        'src/app/core/models/webhook.models.ts',
        'src/app/core/i18n/**',
      ],
    },
  },
});
