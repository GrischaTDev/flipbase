import { defineConfig } from 'vitest/config';

import baseConfig from './vitest.config';

/**
 * Taegliche Abdeckungspruefung der Geldpfade.
 *
 * Die vollstaendige Abdeckung ueber alle drei Projekte braucht rund neun
 * Minuten und war damit der teuerste Posten im Zeitplan. Ihr eigentlicher
 * Wert liegt aber in den 95/90-Grenzen auf den zentralen Geldpfaden - deren Tests
 * liegen samt und sonders im Node-Projekt, das in unter einer Minute durch
 * ist.
 *
 * Diese Konfiguration prueft also taeglich genau das, was wirklich weh tut,
 * wenn es kaputtgeht. Die globalen Untergrenzen ueber alle Dateien bleiben
 * der vollstaendigen Messung vorbehalten, die woechentlich laeuft.
 */
const criticalFiles = [
  'src/app/core/services/profit-engine.service.ts',
  'src/app/core/services/tax-engine.service.ts',
  'src/app/core/models/inventory-sellability.ts',
  'src/app/core/utils/sale-metrics.ts',
  'src/app/core/utils/cost-basis.ts',
  'src/app/core/utils/lot-cost.ts',
];

const strictThreshold = { statements: 95, branches: 90 };

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    coverage: {
      ...baseConfig.test?.coverage,
      // Bewusst ersetzt, nicht ergaenzt: gemessen wird ausschliesslich das,
      // was hier steht.
      include: criticalFiles,
      reportsDirectory: 'coverage-critical',
      thresholds: Object.fromEntries(criticalFiles.map((file) => [file, strictThreshold])),
    },
  },
});
