import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const rootDirectory = new URL('..', import.meta.url);
const expectedSmokeTests = [
  ['purchase-workspace.spec.ts', 'opens an existing purchase directly without runtime errors'],
  [
    'purchase-editable-draft.spec.ts',
    'keeps a saved draft editable through discard, save and reopening',
  ],
  ['inventory-sale.spec.ts', 'verkauft ein Einzelstück genau einmal aus dem gemeinsamen Inventar'],
  [
    'purchase-dropdown-layer.spec.ts',
    'keeps cost options above the modal footer and preserves keyboard dismissal',
  ],
  [
    'product-integration.spec.ts',
    'Produktbild bleibt nach erneutem Laden sichtbar und unbekannter Scan öffnet den Picker',
  ],
  ['dashboard-interactions.spec.ts', 'erkundet die Diagrammdaten vollstaendig mit der Tastatur'],
  [
    'record-timeline.spec.ts',
    'speichert Demo-Kommentare am richtigen Einkauf und zeigt Klartext nach Neuladen',
  ],
  ['entry-pages.spec.ts', 'keeps the new entry pages free of automated WCAG AA violations'],
];

const readProjectFile = (filePath) => readFile(new URL(filePath, rootDirectory), 'utf8');

test('defines the fail-closed PR browser smoke suite', async () => {
  const [config, packageJson, e2eFiles] = await Promise.all([
    readProjectFile('playwright.pr.config.ts'),
    readProjectFile('package.json'),
    readdir(new URL('e2e/', rootDirectory)),
  ]);
  const packageDefinition = JSON.parse(packageJson);
  const specFiles = e2eFiles.filter((fileName) => fileName.endsWith('.spec.ts'));
  const specContents = await Promise.all(
    specFiles.map(async (fileName) => [fileName, await readProjectFile(`e2e/${fileName}`)]),
  );
  const taggedTests = specContents.flatMap(([fileName, content]) =>
    [...content.matchAll(/test\(\s*'([^']* @pr-smoke)'/g)].map((match) => [fileName, match[1]]),
  );

  assert.match(config, /import baseConfig from '.\/playwright\.config';/);
  assert.match(config, /grep:\s*\/@pr-smoke\//);
  assert.match(config, /retries:\s*0/);
  assert.match(config, /maxFailures:\s*1/);
  assert.match(config, /workers:\s*1/);
  assert.match(config, /trace:\s*'retain-on-failure'/);
  assert.match(
    config,
    /projects:\s*\[\s*\{\s*name:\s*'chromium',\s*use:\s*\{\s*browserName:\s*'chromium'\s*\}\s*\}\s*\],/,
  );
  assert.equal(taggedTests.length, 8);
  assert.deepEqual(
    taggedTests.sort(([leftFile], [rightFile]) => leftFile.localeCompare(rightFile)),
    expectedSmokeTests
      .map(([fileName, testName]) => [fileName, `${testName} @pr-smoke`])
      .sort(([leftFile], [rightFile]) => leftFile.localeCompare(rightFile)),
  );
  assert.equal(
    packageDefinition.scripts['test:e2e:pr'],
    'playwright test --config=playwright.pr.config.ts',
  );
  assert.equal(packageDefinition.scripts['test:e2e'], 'playwright test');
  assert.equal(
    packageDefinition.scripts['test:e2e:nightly'],
    'playwright test --config=playwright.nightly.config.ts',
  );
});
