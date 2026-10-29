import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Hosteinrichtung und globale Container-Fixtures gehören ausschließlich auf Wegwerf-Runner. */
export function assertMarketplaceImageRunner(environment = process.env) {
  // GitHub dokumentiert diese Runnermerkmale; CI=true allein setzt auch der lokale Vorabcheck.
  // https://docs.github.com/en/actions/reference/workflows-and-actions/variables
  if (
    environment.GITHUB_ACTIONS !== 'true' ||
    environment.RUNNER_ENVIRONMENT !== 'github-hosted' ||
    environment.RUNNER_OS !== 'Linux' ||
    process.platform !== 'linux' ||
    !environment.RUNNER_TEMP ||
    !isAbsolute(environment.RUNNER_TEMP)
  )
    throw new Error(
      'Vorabcheck unvollständig: Marketplace-Image- und Hostprüfungen benötigen den wegwerfbaren GitHub-gehosteten Linux-Runner des Marketplace-Imageworkflows. Auf Entwicklerhosts und selbst gehosteten Runnern werden keine Images gebaut oder Hostprüfungen gestartet; der erforderliche CI-Nachweis bleibt offen.',
    );
}

// Die gemeinsame Auswahl bleibt auch lokal sichtbar; ausgeführt wird ausschließlich in CI.
export const marketplaceImageChecks = [
  {
    kind: 'worker',
    name: 'Check worker and private broker separation',
    id: 'worker-separation',
  },
  {
    kind: 'worker',
    name: 'Check GoLogin queue flags and existing memory budgets',
    id: 'gologin-budgets',
  },
  {
    kind: 'worker',
    name: 'Check non-root broker sandbox configuration',
    id: 'broker-sandbox',
  },
  {
    kind: 'worker',
    name: 'Check broker boundary with an actual browser and separate worker filesystem',
    id: 'broker-isolation',
  },
  {
    kind: 'session',
    name: 'Check packaged session action imports without network access',
    id: 'session-imports',
  },
  {
    kind: 'session',
    name: 'Check explicit Chrome shutdown with background work and persisted cookies',
    id: 'session-shutdown',
  },
  {
    kind: 'session',
    name: 'Check bounded runtime shutdown and profile recovery after frozen Chrome',
    id: 'session-recovery',
  },
  {
    kind: 'session',
    name: 'Check sandbox, profile persistence, isolation and graceful stop without Vinted',
    id: 'session-sandbox',
  },
];

// Auch der direkte Shellaufruf prüft dieselbe Hostgrenze vor Docker, sudo oder Cleanup.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    assertMarketplaceImageRunner();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
