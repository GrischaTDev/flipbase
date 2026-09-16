import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

function successfulInventory(report) {
  const stats = report?.stats;
  if (
    !stats ||
    !Array.isArray(report.suites) ||
    !Array.isArray(report.errors) ||
    report.errors.length ||
    !Number.isInteger(stats.expected) ||
    stats.expected < 1 ||
    stats.unexpected !== 0 ||
    stats.skipped !== 0 ||
    stats.flaky !== 0
  ) {
    throw new Error('Kein vollständiger erfolgreicher Browserbericht.');
  }
  const inventory = [];
  function visit(suites, titles = []) {
    for (const suite of suites) {
      const ancestors = [...titles, suite.title];
      for (const spec of suite.specs ?? []) {
        for (const entry of spec.tests ?? []) {
          if (
            entry.expectedStatus !== 'passed' ||
            entry.status !== 'expected' ||
            entry.results?.length !== 1 ||
            entry.results[0].status !== 'passed'
          ) {
            throw new Error('Fehler, ausgelassene Tests oder Wiederholungen im Browserbericht.');
          }
          inventory.push(JSON.stringify([spec.file, ...ancestors, spec.title, entry.projectName]));
        }
      }
      visit(suite.suites ?? [], ancestors);
    }
  }
  visit(report.suites);
  if (inventory.length !== stats.expected || new Set(inventory).size !== inventory.length) {
    throw new Error('Testinventar ist unvollständig oder enthält doppelte Einträge.');
  }
  return inventory.sort();
}

export function compareBrowserRuns(baseline, candidate, baselineMs, candidateMs) {
  const inventory = successfulInventory(baseline);
  const other = successfulInventory(candidate);
  if (JSON.stringify(inventory) !== JSON.stringify(other)) {
    throw new Error('Die beiden Varianten haben nicht dieselben Tests ausgeführt.');
  }
  if (![baselineMs, candidateMs].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error('Ungültige gemessene Prozessdauer.');
  }
  return {
    tests: inventory.length,
    inventory,
    baselineMs,
    candidateMs,
    savedMs: baselineMs - candidateMs,
    savedPercent: ((baselineMs - candidateMs) / baselineMs) * 100,
  };
}

export async function withCacheEnvironment(file, environment, cachePath, action) {
  if (!['local', 'all'].includes(environment)) throw new Error('Ungültige Cache-Variante.');
  const original = await readFile(file);
  const config = JSON.parse(original.toString('utf8'));
  config.cli ??= {};
  config.cli.cache = { ...config.cli.cache, enabled: true, environment, path: cachePath };
  try {
    await writeFile(file, JSON.stringify(config, null, 2) + '\n');
    return await action();
  } finally {
    await writeFile(file, original);
  }
}

async function runLogged(root, args, logFile, env, timeout = 240_000) {
  const started = performance.now();
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    timeout,
    killSignal: 'SIGTERM',
  });
  const elapsedMs = performance.now() - started;
  await writeFile(logFile, (result.stdout ?? '') + (result.stderr ?? ''));
  if (result.error || result.status !== 0) {
    throw new Error(`Prüfprozess fehlgeschlagen (${result.status}); Protokoll: ${logFile}`, {
      cause: result.error,
    });
  }
  return { elapsedMs, stdout: result.stdout };
}

async function browserCache(root, directory) {
  // Verändert vorübergehend angular.json: nur in einem isolierten Actions-Checkout ausführen.
  if (process.env.GITHUB_ACTIONS !== 'true') {
    throw new Error('Browservergleich ausschließlich im manuellen GitHub-Actions-Workflow.');
  }
  const originalFile = join(root, 'angular.json');
  const cacheRoot = await mkdtemp(join(tmpdir(), 'flipbase-ci-cache-'));
  const results = {};
  const order =
    process.env.CACHE_BENCHMARK_ORDER === 'candidate-first'
      ? ['candidate', 'baseline']
      : ['baseline', 'candidate'];
  try {
    for (const variant of order) {
      const environment = variant === 'baseline' ? 'local' : 'all';
      await withCacheEnvironment(originalFile, environment, join(cacheRoot, variant), async () => {
        await runLogged(
          root,
          ['node_modules/@angular/cli/bin/ng.js', 'cache', 'info'],
          join(directory, `${variant}-cache.log`),
          { CI: 'true' },
          30_000,
        );
        const reportFile = join(directory, `${variant}.json`);
        const run = await runLogged(
          root,
          [
            'node_modules/@playwright/test/cli.js',
            'test',
            '--config=playwright.pr.config.ts',
            'e2e/product-editor-storefront.spec.ts',
            '--project=chromium',
            '--workers=1',
            '--retries=0',
            '--global-timeout=180000',
            '--reporter=json',
            `--output=${join(directory, `${variant}-artifacts`)}`,
          ],
          join(directory, `${variant}.log`),
          { CI: 'true', PLAYWRIGHT_JSON_OUTPUT_FILE: reportFile },
        );
        results[variant] = {
          elapsedMs: run.elapsedMs,
          report: JSON.parse(await readFile(reportFile, 'utf8')),
        };
      });
    }
  } finally {
    await rm(cacheRoot, { recursive: true, force: true });
  }
  return {
    experiment: 'browser-cache',
    order,
    cache: 'Beide Varianten starten mit getrenntem leerem Angular-Cache.',
    ...compareBrowserRuns(
      results.baseline.report,
      results.candidate.report,
      results.baseline.elapsedMs,
      results.candidate.elapsedMs,
    ),
    note: 'Eine Stichprobe; kein Nachweis für die gesamte CI oder warme Folgeläufe.',
  };
}

async function angularImports(root, directory) {
  const samples = [];
  for (const dependency of ['@angular/core/testing', '@lucide/angular', '@supabase/supabase-js']) {
    for (let sample = 1; sample <= 3; sample++) {
      // Jeder Import bekommt einen frischen Prozess; keine Anwendung wird gestartet.
      const code = `
        const started = performance.now();
        await import('@angular/compiler');
        await import('@angular/core/testing');
        const frameworkReady = performance.now();
        await import(${JSON.stringify(dependency)});
        const finished = performance.now();
        console.log(JSON.stringify({
          frameworkMs: frameworkReady - started,
          dependencyMs: finished - frameworkReady
        }));
      `;
      const run = await runLogged(
        root,
        ['--input-type=module', '--eval', code],
        join(directory, `import-${samples.length + 1}.log`),
        { CI: 'true' },
        30_000,
      );
      samples.push({ dependency, sample, processMs: run.elapsedMs, ...JSON.parse(run.stdout) });
    }
  }
  return {
    experiment: 'angular-imports',
    samples,
    note: 'Native Node-Importdiagnose, keine Vitest-Suite und kein Buildervergleich.',
  };
}

async function main() {
  const [experiment, destination, ...extra] = process.argv.slice(2);
  if (!['browser-cache', 'angular-imports'].includes(experiment) || !destination || extra.length) {
    throw new Error(
      'Aufruf: node scripts/ci-performance.mjs <browser-cache|angular-imports> <Ausgabe>',
    );
  }
  const root = process.cwd();
  const output = resolve(destination);
  await mkdir(output, { recursive: true });
  const directory = await mkdtemp(join(output, 'sample-'));
  const lockfile = await readFile(join(root, 'package-lock.json'));
  const metadata = {
    commit: process.env.GITHUB_SHA ?? null,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    lockfileSha256: createHash('sha256').update(lockfile).digest('hex'),
    startedAt: new Date().toISOString(),
  };
  await writeFile(join(directory, 'environment.json'), JSON.stringify(metadata, null, 2) + '\n');
  const result = await (experiment === 'browser-cache'
    ? browserCache(root, directory)
    : angularImports(root, directory));
  await writeFile(join(directory, 'summary.json'), JSON.stringify(result, null, 2) + '\n');
  const summary = [
    '### CI-Leistungsmessung',
    '',
    '```json',
    JSON.stringify(result, null, 2),
    '```',
    '',
  ].join('\n');
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
