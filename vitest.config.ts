import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /**
     * jsdom statt der Node-Umgebung: Die Dienste greifen auf `localStorage`,
     * `document` und `window.matchMedia` zu. Ohne Browser-Umgebung waren diese
     * Zugriffe zwar durch try/catch abgesichert, wurden im Test aber nie
     * wirklich ausgefuehrt - die Absicherung war ungeprueft.
     */
    environment: 'jsdom',

    /** Die Tests importieren describe/it/expect ausdruecklich aus vitest. */
    globals: false,

    include: ['src/**/*.spec.ts'],

    /** Ergaenzt fehlende Browser-Funktionen, siehe src/test-setup.ts */
    setupFiles: ['src/test-setup.ts'],

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
