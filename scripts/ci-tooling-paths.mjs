// Diese bekannten Werkzeuge steuern Prüfungen, werden aber nicht als
// Anwendungs-, Dienst- oder Image-Laufzeit ausgeliefert. Neue unbekannte
// Werkzeuge bleiben konservativ; keine ganze Verzeichnisgruppe ausnehmen.
const ciToolingPaths = new Set([
  '.github/workflows/ci.yml',
  'playwright.config.ts',
  'playwright.affected.config.ts',
  'playwright.ui.config.ts',
  'playwright.pr.config.ts',
  'playwright.nightly.config.ts',
  'scripts/deploy-script.test.mjs',
  'scripts/browser-test-selection.mjs',
  'scripts/browser-test-timings.mjs',
  'scripts/ci-tooling-paths.mjs',
  'scripts/install-test-selection-parser.mjs',
  'scripts/playwright-pr-smoke.test.mjs',
  'scripts/run-affected-tests.mjs',
  ...[
    'affected-tests',
    'ci-checks',
    'detect-supabase-changes',
    'marketplace-check-selection',
    'preflight',
    'required-checks',
    'reuse-pr-checks',
  ].flatMap((name) => [`scripts/${name}.mjs`, `scripts/${name}.test.mjs`]),
]);

export function isCiToolingPath(path) {
  return ciToolingPaths.has(path);
}
