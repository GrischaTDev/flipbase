import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const root = join(process.cwd(), 'src');

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? collect(path) : [path];
    }),
  );
  return nested.flat().filter((path) => path.endsWith('.spec.ts'));
}

const files = await collect(root);
const dom = files.filter((path) => path.endsWith('.dom.spec.ts'));
const angular = files.filter((path) => path.endsWith('.angular.spec.ts'));
const node = files.filter(
  (path) => !path.endsWith('.dom.spec.ts') && !path.endsWith('.angular.spec.ts'),
);

const forbiddenInNode =
  /\b(TestBed|ComponentFixture|window|document|DOMParser|HTMLElement|HTMLCanvasElement|FileReader|File|Blob|Image|ImageData|ResizeObserver|localStorage|navigator)\b/;
const documentedNodeFixtures = new Map([
  [
    'src/app/core/services/bank-reconciliation.service.spec.ts',
    'prüft localStorage nur defensiv und benötigt keine Browser-Speicherimplementierung',
  ],
  [
    'src/app/core/services/demo-data-isolation.spec.ts',
    'installiert eine eigene Speicherattrappe auf globalThis',
  ],
  [
    'src/app/core/services/landing-hint.service.spec.ts',
    'injiziert ein lokales Dokument-Double statt ein Browser-Dokument zu verwenden',
  ],
  [
    'src/app/features/accounting/accounting-toast-actions.spec.ts',
    'reicht File nur als Ereignisfixture an eine Attrappe weiter',
  ],
]);
const violations = [];
for (const path of node) {
  const relativePath = path.slice(process.cwd().length + 1).replaceAll('\\', '/');
  if (
    forbiddenInNode.test(await readFile(path, 'utf8')) &&
    !documentedNodeFixtures.has(relativePath)
  ) {
    violations.push(relativePath);
  }
}

if (node.length + dom.length + angular.length !== files.length || violations.length) {
  throw new Error(`Node-Tests mit Browserzugriff:\n${violations.join('\n')}`);
}

console.log(
  JSON.stringify({
    files: files.length,
    node: node.length,
    dom: dom.length,
    angular: angular.length,
  }),
);
