import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { compareBrowserRuns, withCacheEnvironment } from './ci-performance.mjs';

function report(title = 'Artikel speichern') {
  return {
    errors: [],
    stats: { expected: 1, unexpected: 0, skipped: 0, flaky: 0 },
    suites: [
      {
        title: 'product-editor-storefront.spec.ts',
        specs: [
          {
            file: 'product-editor-storefront.spec.ts',
            title,
            tests: [
              {
                projectName: 'chromium',
                expectedStatus: 'passed',
                status: 'expected',
                results: [{ status: 'passed' }],
              },
            ],
          },
        ],
      },
    ],
  };
}

test('vergleicht erfolgreiche identische Testinventare und meldet auch eine Verlangsamung', () => {
  const faster = compareBrowserRuns(report(), report(), 1000, 600);
  assert.equal(faster.tests, 1);
  assert.equal(faster.savedMs, 400);
  assert.equal(faster.savedPercent, 40);
  const slower = compareBrowserRuns(report(), report(), 1000, 1200);
  assert.equal(slower.savedPercent, -20);
});

test('weist gleiche Testanzahl mit anderen Tests oder anderem Browser zurück', () => {
  assert.throws(() => compareBrowserRuns(report(), report('Anderer Test'), 1000, 600));
  const otherBrowser = report();
  otherBrowser.suites[0].specs[0].tests[0].projectName = 'webkit';
  assert.throws(() => compareBrowserRuns(report(), otherBrowser, 1000, 600));
});

test('weist Fehler, Skip, Flaky, Wiederholung und erwarteten Fehlschlag zurück', () => {
  for (const mutate of [
    (value) => value.errors.push({ message: 'Serverstart fehlgeschlagen' }),
    (value) => (value.stats.unexpected = 1),
    (value) => (value.stats.skipped = 1),
    (value) => (value.stats.flaky = 1),
    (value) => value.suites[0].specs[0].tests[0].results.push({ status: 'passed' }),
    (value) => (value.suites[0].specs[0].tests[0].expectedStatus = 'failed'),
    (value) => (value.suites[0].specs[0].tests[0].results[0].status = 'timedOut'),
  ]) {
    const invalid = report();
    mutate(invalid);
    assert.throws(() => compareBrowserRuns(report(), invalid, 1000, 600));
  }
});

test('weist leere, doppelte oder unvollständige Inventare und ungültige Zeiten zurück', () => {
  const empty = report();
  empty.suites = [];
  assert.throws(() => compareBrowserRuns(empty, empty, 1000, 600));
  const duplicate = report();
  duplicate.suites.push(duplicate.suites[0]);
  duplicate.stats.expected = 2;
  assert.throws(() => compareBrowserRuns(duplicate, duplicate, 1000, 600));
  for (const elapsed of [0, -1, NaN, Infinity]) {
    assert.throws(() => compareBrowserRuns(report(), report(), elapsed, 600));
  }
});

test('berücksichtigt verschachtelte describe-Blöcke', () => {
  const nested = report();
  nested.suites = [{ title: 'Fachablauf', suites: nested.suites }];
  assert.equal(compareBrowserRuns(nested, nested, 1000, 600).tests, 1);
});

for (const fail of [false, true]) {
  const outcome = fail ? 'nach Fehler' : 'nach Erfolg';
  test(`stellt die vollständige Cache-Datei ${outcome} wieder her`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'flipbase-cache-test-'));
    const file = join(directory, 'angular.json');
    const original = '{"cli":{"packageManager":"npm"},"projects":{"keep":{}}}\r\n';
    await writeFile(file, original);
    try {
      const action = withCacheEnvironment(file, 'all', join(directory, 'cache'), async () => {
        const temporary = JSON.parse(await readFile(file, 'utf8'));
        assert.equal(temporary.cli.cache.environment, 'all');
        assert.equal(temporary.cli.cache.enabled, true);
        assert.deepEqual(temporary.projects, { keep: {} });
        if (fail) throw new Error('Testprozess fehlgeschlagen');
        return 42;
      });
      if (fail) await assert.rejects(action, /Testprozess fehlgeschlagen/);
      else assert.equal(await action, 42);
      assert.equal(await readFile(file, 'utf8'), original);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}
