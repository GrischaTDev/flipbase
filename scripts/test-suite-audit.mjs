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

const browserMarker =
  /\b(TestBed|ComponentFixture|window|document|DOMParser|HTMLElement|FileReader|ImageData)\b/;
const unclassified = [];
for (const path of node) {
  if (browserMarker.test(await readFile(path, 'utf8'))) unclassified.push(path);
}

if (node.length + dom.length + angular.length !== files.length || unclassified.length) {
  throw new Error(`Unklassifizierte Testdateien:\n${unclassified.join('\n')}`);
}

console.log(
  JSON.stringify({
    files: files.length,
    node: node.length,
    dom: dom.length,
    angular: angular.length,
  }),
);
