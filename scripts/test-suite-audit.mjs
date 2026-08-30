import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import ts from 'typescript';

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
const sources = new Map(
  await Promise.all(files.map(async (path) => [path, await readFile(path, 'utf8')])),
);

function countTestSyntax(path, source) {
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const counts = { direct: 0, each: 0, assertions: 0 };

  function isTestIdentifier(node) {
    return ts.isIdentifier(node) && (node.text === 'it' || node.text === 'test');
  }

  function isEachFactory(node) {
    const expression = ts.isCallExpression(node)
      ? node.expression
      : ts.isTaggedTemplateExpression(node)
        ? node.tag
        : null;
    return (
      expression !== null &&
      ts.isPropertyAccessExpression(expression) &&
      isTestIdentifier(expression.expression) &&
      expression.name.text === 'each'
    );
  }

  function visit(node) {
    if (ts.isCallExpression(node)) {
      if (isTestIdentifier(node.expression)) counts.direct++;
      else if (isEachFactory(node.expression)) counts.each++;

      if (ts.isIdentifier(node.expression) && node.expression.text === 'expect') {
        counts.assertions++;
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return counts;
}

const syntaxCounts = { direct: 0, each: 0, assertions: 0 };
for (const [path, source] of sources) {
  const counts = countTestSyntax(path, source);
  syntaxCounts.direct += counts.direct;
  syntaxCounts.each += counts.each;
  syntaxCounts.assertions += counts.assertions;
}

const forbiddenInNode =
  /\b(TestBed|ComponentFixture|window|document|DOMParser|HTMLElement|HTMLCanvasElement|FileReader|File|Blob|Image|ImageData|ResizeObserver|localStorage|navigator)\b/g;
const documentedNodeFixtures = new Map([
  [
    'src/app/core/services/bank-reconciliation.service.spec.ts',
    [
      {
        marker: 'localStorage',
        line: /globalThis\.localStorage/,
        reason: 'prüft den optionalen globalen Speicher nur defensiv',
      },
    ],
  ],
  [
    'src/app/core/services/demo-data-isolation.spec.ts',
    [
      {
        marker: 'localStorage',
        line: /\.localStorage = attrappe/,
        reason: 'installiert eine eigene Speicherattrappe auf globalThis',
      },
    ],
  ],
  [
    'src/app/core/services/landing-hint.service.spec.ts',
    [
      {
        marker: 'document',
        line: /document\.cookie in jsdom/,
        reason: 'erläutert im Kommentar das durch DOCUMENT ersetzte Browserverhalten',
      },
    ],
  ],
  [
    'src/app/features/accounting/accounting-toast-actions.spec.ts',
    [
      {
        marker: 'File',
        line: /new File\(/,
        reason: 'reicht eine von Node bereitgestellte File-Fixture an eine Attrappe weiter',
      },
    ],
  ],
  [
    'src/app/core/services/purchase.service.spec.ts',
    [
      {
        marker: 'localStorage',
        line: /vi\.stubGlobal\('localStorage', memoryStorage\)/,
        reason: 'installiert pro Test ein lokales Storage-Testdouble',
      },
    ],
  ],
]);
const violations = [];
const matchedAllowances = new Set();
for (const path of node) {
  const relativePath = path.slice(process.cwd().length + 1).replaceAll('\\', '/');
  const source = sources.get(path);
  const allowances = documentedNodeFixtures.get(relativePath) ?? [];
  for (const [lineIndex, line] of source.split(/\r?\n/u).entries()) {
    for (const match of line.matchAll(forbiddenInNode)) {
      const allowanceIndex = allowances.findIndex(
        (allowance) => allowance.marker === match[0] && allowance.line.test(line),
      );
      if (allowanceIndex === -1) {
        violations.push(`${relativePath}:${lineIndex + 1} (${match[0]})`);
      } else {
        matchedAllowances.add(`${relativePath}:${allowanceIndex}`);
      }
    }
  }
}
for (const [path, allowances] of documentedNodeFixtures) {
  for (const [index, allowance] of allowances.entries()) {
    if (!matchedAllowances.has(`${path}:${index}`)) {
      violations.push(`${path} (dokumentierte Ausnahme ohne passende Stelle: ${allowance.marker})`);
    }
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
    testDefinitions: {
      direct: syntaxCounts.direct,
      each: syntaxCounts.each,
      total: syntaxCounts.direct + syntaxCounts.each,
    },
    assertions: syntaxCounts.assertions,
  }),
);
