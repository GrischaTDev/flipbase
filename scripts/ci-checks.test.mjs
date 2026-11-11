import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import test from 'node:test';
import { executeCheckCommand, getCheckCommands, runCiCheck } from './ci-checks.mjs';
import {
  assertParserTemporaryDirectory,
  installSelectionParser,
  selectionParserInstallFiles,
} from './install-test-selection-parser.mjs';
import {
  browserTestTimings,
  browserTimingSummary,
  writeBrowserTimingSummary,
} from './browser-test-timings.mjs';

const projectLock = JSON.parse(
  await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'),
);

test('manueller Produktionswiederanlauf behält Vollprüfung und gemeinsame Deploymentsperre', async () => {
  const workflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(workflow, /workflow_dispatch:\s+inputs:\s+base_sha:/u);
  assert.match(
    workflow,
    /group: \$\{\{ github\.event_name == 'workflow_dispatch' && 'ci-recovery' \|\| 'ci' \}\}-\$\{\{ github\.ref \}\}/u,
  );
  const changes = workflow.split('  changes:')[1].split('  documentation:')[0];
  assert.ok(
    changes.includes(
      "github.event_name != 'workflow_dispatch' || github.ref == 'refs/heads/master'",
    ),
  );
  assert.ok(changes.includes('Validate manual recovery'));
  assert.ok(changes.includes('BASE_SHA: ${{ inputs.base_sha }}'));
  assert.ok(changes.includes('git merge-base --is-ancestor "$BASE_SHA" "$GITHUB_SHA"'));
  assert.ok(changes.includes('EVENT_NAME: ${{ github.event_name }}'));
  assert.ok(changes.includes('PUSH_BEFORE_SHA: ${{ inputs.base_sha || github.event.before }}'));
  // Das unveränderte manuelle Ereignis wählt konservativ alle Prüfungen; keine Push-Wiederverwendung.
  assert.ok(!changes.includes('EVENT_NAME: push'));
  for (const job of ['image', 'deploy', 'release']) {
    const section = workflow.split(`  ${job}:`)[1].split(/\n  [a-z][a-z-]*:/u)[0];
    assert.ok(
      section.includes("github.event_name == 'workflow_dispatch'"),
      `${job} fehlt beim Wiederanlauf`,
    );
    assert.ok(
      section.includes("github.ref == 'refs/heads/master'"),
      `${job} kann einen Nebenbranch veröffentlichen`,
    );
  }
  const deploy = workflow.split('  deploy:')[1].split('  marketplace-release:')[0];
  assert.match(deploy, /group: deploy-production\s+cancel-in-progress: false/u);
  assert.ok(deploy.includes('Refuse an outdated deployment'));
  assert.ok(deploy.includes('gh api "repos/$GITHUB_REPOSITORY/git/ref/heads/master"'));
  assert.ok(deploy.indexOf('Refuse an outdated deployment') < deploy.indexOf('Set up SSH'));
  const marketplace = workflow.split('  marketplace-release:')[1].split('  release:')[0];
  assert.ok(!marketplace.includes("github.event_name == 'workflow_dispatch'"));
});

test('registriert alle Artikelanalyse-Verträge im Edge-Prüflauf', async () => {
  const tests = (
    await readdir(new URL('../supabase/functions/vinted-ai-search/', import.meta.url))
  ).filter((name) => name.endsWith('.test.ts'));
  const commands = getCheckCommands('marketplace');
  const registered = commands.flatMap(({ command, args }) =>
    command === 'deno' && args[0] === 'test' ? args : [],
  );
  assert.ok(tests.length > 0);
  for (const name of tests)
    assert.ok(
      registered.includes(`supabase/functions/vinted-ai-search/${name}`),
      `${name} fehlt im CI-Prüflauf`,
    );
});

test('Pushrelease liefert Functions, Ratelimit und Digest vor der kompatiblen App', async () => {
  const [deploy, image, proxy, workflow] = await Promise.all([
    readFile(new URL('../deploy/deploy.sh', import.meta.url), 'utf8'),
    readFile(new URL('../docker/Dockerfile', import.meta.url), 'utf8'),
    readFile(new URL('../deploy/Caddyfile', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'),
  ]);
  assert.match(deploy, /PUSH_REFERENCE/u);
  assert.match(deploy, /prepare_push_runtime/u);
  assert.ok(
    deploy.indexOf('apply-release-migrations.sh" "$temporary/migrations"') <
      deploy.indexOf('activate_push_runtime "$release_container"'),
  );
  assert.ok(
    deploy.indexOf('activate_push_runtime "$release_container"') <
      deploy.indexOf('docker compose up -d --pull never web'),
  );
  assert.match(image, /release-push-functions \/opt\/flipbase\/push-functions/u);
  assert.match(proxy, /reverse_proxy flipbase-push-gateway:4177/u);
  assert.match(proxy, /header_up X-Forwarded-For \{remote_host\}/u);
  assert.ok(proxy.indexOf('handle @push_requests') < proxy.indexOf('handle @supabase_api'));
  assert.match(
    workflow,
    /if: \$\{\{ needs\.changes\.outputs\.push == 'true' \}\}\s+run: node scripts\/ci-checks\.mjs push/u,
  );
  assert.ok(
    getCheckCommands('push').some(
      ({ command, args }) =>
        command === 'npm' &&
        JSON.stringify(args) ===
          JSON.stringify(['ci', '--prefix', 'services/push-worker', '--ignore-scripts']),
    ),
  );
  assert.match(workflow, /push_digest:/u);
  assert.match(workflow, /Gate publication on successful checks/u);
});

test('übergibt Pfade und Metadaten wörtlich statt als Shellcode', async (t) => {
  const repository = await mkdtemp(join(tmpdir(), 'ci-command-'));
  t.after(() => rm(repository, { recursive: true, force: true }));
  const literal = 'Pfad mit Leerzeichen; $(keinen-befehl-ausführen)';
  await executeCheckCommand(
    {
      name: 'Argumentgrenze prüfen',
      command: 'node',
      args: [
        '--input-type=module',
        '--eval',
        'import {writeFileSync} from "node:fs"; writeFileSync("arguments.json", JSON.stringify({args:process.argv.slice(1), value:process.env.TEST_VALUE}));',
        literal,
        '$GITHUB_SHA',
      ],
      env: { TEST_VALUE: literal },
    },
    { repository, commit: 'a'.repeat(40) },
  );
  assert.deepEqual(JSON.parse(await readFile(join(repository, 'arguments.json'), 'utf8')), {
    args: [literal, 'a'.repeat(40)],
    value: literal,
  });
});

test('bewahrt den echten Fehlercode und führt nach einem Fehler keine Folgeprüfung aus', async () => {
  await assert.rejects(
    executeCheckCommand({
      name: 'Absichtlich fehlschlagende Testfixture',
      command: 'node',
      args: ['--eval', 'process.exit(17)'],
    }),
    (error) => error.exitCode === 17,
  );
  const calls = [];
  await assert.rejects(
    runCiCheck('quality', {
      spawnProcess(command, args) {
        calls.push({ command, args });
        const child = new EventEmitter();
        queueMicrotask(() => child.emit('exit', 23, null));
        return child;
      },
    }),
    (error) => error.exitCode === 23,
  );
  assert.equal(
    calls.length,
    1,
    'Ein Formatfehler darf keine nachfolgende Erfolgsmeldung erzeugen.',
  );
});

test('Quality entfernt geerbte PG-Verbindungen und aktiviert keine Release-Datenbankfixture', async () => {
  const environments = [];
  const environment = {
    PATH: process.env.PATH,
    PGDATABASE: 'flipbase_release_test',
    PGHOST: 'remote.invalid',
    PGSERVICE: 'external',
    PGPASSFILE: '/external/password',
    KEEP_VALUE: 'yes',
  };
  await runCiCheck('quality', {
    environment,
    spawnProcess(command, args, options) {
      environments.push(options.env);
      const child = new EventEmitter();
      queueMicrotask(() => child.emit('exit', 0, null));
      return child;
    },
  });
  assert.equal(environments.length, 5);
  for (const env of environments) {
    assert.equal(
      Object.keys(env).some((key) => /^PG/iu.test(key)),
      false,
    );
    assert.equal(env.KEEP_VALUE, 'yes');
  }
  assert.equal(environment.PGDATABASE, 'flipbase_release_test');
});

test('leichte Qualität bleibt ohne Workflowinfrastruktur; vollständige Qualitätsgruppe bleibt aufrufbar', () => {
  const lightweight = getCheckCommands('quality-light');
  assert.deepEqual(
    lightweight.map(({ args }) => args),
    [
      ['run', 'format:check'],
      ['run', 'lint'],
      ['run', 'typecheck'],
      ['run', 'test:audit'],
    ],
  );
  assert.deepEqual(
    getCheckCommands('workflow').map(({ args }) => args),
    [['run', 'test:workflow']],
  );
  assert.ok(getCheckCommands('quality').some(({ args }) => args.includes('test:workflow')));
});

test('getrennte Qualitäts- und Workflowgruppe entfernen geerbte Datenbankverbindungen', async () => {
  for (const group of ['quality-light', 'workflow']) {
    const calls = [];
    await runCiCheck(group, {
      environment: { PATH: process.env.PATH, PGHOST: 'external.invalid', KEEP_VALUE: 'yes' },
      spawnProcess(command, args, options) {
        calls.push(options.env);
        const child = new EventEmitter();
        queueMicrotask(() => child.emit('exit', 0, null));
        return child;
      },
    });
    assert.ok(calls.length);
    for (const environment of calls) {
      assert.equal(environment.PGHOST, undefined);
      assert.equal(environment.KEEP_VALUE, 'yes');
    }
  }
});

test('ausgewählte Workflowverträge laufen als einzelne Nodeargumente und erhalten echte Fehlercodes', async () => {
  const targets = ['scripts/preflight.test.mjs', 'scripts/ci-checks.test.mjs'];
  assert.deepEqual(getCheckCommands('workflow', { workflowTests: targets }), [
    { name: 'Test selected workflow contracts', command: 'node', args: ['--test', ...targets] },
  ]);
  const calls = [];
  await assert.rejects(
    runCiCheck('workflow', {
      environment: { AFFECTED_WORKFLOW_TESTS: JSON.stringify(targets), PGHOST: 'external.invalid' },
      spawnProcess(command, args, options) {
        calls.push({ command, args, environment: options.env });
        const child = new EventEmitter();
        queueMicrotask(() => child.emit('exit', 19, null));
        return child;
      },
    }),
    (error) => error.exitCode === 19,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, process.execPath);
  assert.deepEqual(calls[0].args, ['--test', ...targets]);
  assert.equal(calls[0].environment.PGHOST, undefined);
  for (const workflowTests of [
    [],
    ['../outside.test.mjs'],
    ['scripts/../outside.test.mjs'],
    ['--eval'],
    ['scripts/a.test.mjs;echo'],
    ['scripts/a.test.mjs', 'scripts/a.test.mjs'],
  ])
    assert.throws(() => getCheckCommands('workflow', { workflowTests }), /Ungültige Auswahl/u);
  assert.deepEqual(getCheckCommands('workflow', { workflowTests: null })[0].args, [
    'run',
    'test:workflow',
  ]);
});

test('Pfadvarianten werden eindeutig zusammengeführt und bewusste Befehlspfade haben Vorrang', async () => {
  for (const override of [undefined, { Path: 'command-tools' }, { PATH: 'command-tools' }]) {
    let actual;
    await executeCheckCommand(
      { name: 'Pfadvertrag', command: 'node', args: [], env: override },
      {
        environment: { Path: 'inherited-tools', OTHER_VALUE: 'unchanged' },
        spawnProcess(command, args, options) {
          actual = options.env;
          const child = new EventEmitter();
          queueMicrotask(() => child.emit('exit', 0, null));
          return child;
        },
      },
    );
    assert.deepEqual(
      Object.keys(actual).filter((key) => /^path$/iu.test(key)),
      ['PATH'],
    );
    assert.equal(
      actual.PATH,
      `${dirname(process.execPath)}${delimiter}${override ? 'command-tools' : 'inherited-tools'}`,
    );
    assert.equal(actual.OTHER_VALUE, 'unchanged');
  }
});

test('echter Kindprozess findet Git auch bei ausschließlich geerbtem Windows-Path', async () => {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !/^path$/iu.test(key)),
  );
  environment.Path = process.env.PATH ?? process.env.Path;
  await executeCheckCommand(
    {
      name: 'Git aus geerbtem Werkzeugpfad',
      command: 'node',
      args: [
        '--eval',
        'const {spawnSync}=require("node:child_process");const result=spawnSync("git",["--version"],{encoding:"utf8"});if(result.error)throw result.error;if(result.status!==0||!result.stdout.startsWith("git version "))process.exit(1);',
      ],
    },
    { environment },
  );
});

test('Parserinstallation bindet ausschließlich die unveränderten gesperrten TypeScript-Metadaten', () => {
  const { manifest, lock } = selectionParserInstallFiles(projectLock);
  const original = projectLock.packages['node_modules/typescript'];
  assert.deepEqual(manifest.dependencies, { typescript: original.version });
  assert.equal(manifest.scripts, undefined);
  assert.deepEqual(Object.keys(lock.packages), ['', 'node_modules/typescript']);
  assert.deepEqual(lock.packages['node_modules/typescript'], {
    version: original.version,
    resolved: original.resolved,
    integrity: original.integrity,
  });
});

test('Parserbereinigung bleibt innerhalb des eigenen absoluten temporären Ordners', () => {
  const own = join(tmpdir(), 'flipbase-test-selection-parser-example');
  assert.equal(assertParserTemporaryDirectory(own), own);
  for (const outside of [
    tmpdir(),
    join(tmpdir(), 'other-parser-example'),
    join(own, 'child'),
    join(tmpdir(), '..', 'flipbase-test-selection-parser-example'),
  ])
    assert.throws(() => assertParserTemporaryDirectory(outside), /Löschgrenze/u);
});

test('Parser lehnt fehlende Integrität, fremde Tarballs, Abhängigkeiten und Installationshooks ab', () => {
  const descriptor = projectLock.packages['node_modules/typescript'];
  for (const change of [
    { version: 'latest' },
    { resolved: 'https://untrusted.invalid/typescript.tgz' },
    { integrity: undefined },
    { integrity: 'sha512-' + 'x'.repeat(86) + '==' },
    { dependencies: { other: '1.0.0' } },
    { hasInstallScript: true },
    { link: true },
  ])
    assert.throws(
      () =>
        selectionParserInstallFiles({
          lockfileVersion: 3,
          packages: { 'node_modules/typescript': { ...descriptor, ...change } },
        }),
      /Ungültige gesperrte TypeScript-Metadaten/u,
    );
  assert.throws(() => selectionParserInstallFiles({ ...projectLock, lockfileVersion: 2 }));
});

test('Parser erhält vorhandene Abhängigkeiten und bereinigt eine fehlerhafte isolierte Installation', async (t) => {
  const repository = await mkdtemp(join(tmpdir(), 'selection-parser-boundary-'));
  t.after(() => rm(repository, { recursive: true, force: true }));
  await writeFile(join(repository, 'package-lock.json'), JSON.stringify(projectLock));
  await mkdir(join(repository, 'node_modules', 'typescript'), { recursive: true });
  await writeFile(join(repository, 'node_modules', 'typescript', 'marker'), 'existing');
  await assert.rejects(
    installSelectionParser({
      repository,
      runInstall() {
        throw new Error('Darf nicht starten.');
      },
    }),
    /werden nicht ersetzt/u,
  );
  assert.equal(
    await readFile(join(repository, 'node_modules', 'typescript', 'marker'), 'utf8'),
    'existing',
  );
  await rm(join(repository, 'node_modules'), { recursive: true, force: true });
  let temporary;
  await assert.rejects(
    installSelectionParser({
      repository,
      async runInstall(command, options) {
        temporary = options.repository;
        assert.ok(command.args.includes('--ignore-scripts'));
        assert.ok(command.args.includes('--no-audit'));
        assert.ok(command.args.includes('--no-fund'));
        throw Object.assign(new Error('Installationsfehler'), { exitCode: 17 });
      },
    }),
    (error) => error.exitCode === 17,
  );
  await assert.rejects(readFile(join(temporary, 'package.json')), { code: 'ENOENT' });
  await assert.rejects(readFile(join(repository, 'node_modules', 'typescript', 'package.json')), {
    code: 'ENOENT',
  });
});

test('echte isolierte Parserinstallation verwendet nur den npm-Cache und ist per ESM importierbar', async (t) => {
  const repository = await mkdtemp(join(tmpdir(), 'selection-parser-install-'));
  t.after(() => rm(repository, { recursive: true, force: true }));
  await writeFile(join(repository, 'package-lock.json'), JSON.stringify(projectLock));
  await installSelectionParser({
    repository,
    runInstall(command, options) {
      return executeCheckCommand({ ...command, args: [...command.args, '--offline'] }, options);
    },
  });
  assert.deepEqual(await readdir(join(repository, 'node_modules')), ['typescript']);
  await executeCheckCommand(
    {
      name: 'ESM-Auflösung des isolierten Parsers',
      command: 'node',
      args: [
        '--input-type=module',
        '--eval',
        'import ts from "typescript"; if(ts.version !== process.env.EXPECTED_VERSION)process.exit(1);',
      ],
      env: { EXPECTED_VERSION: projectLock.packages['node_modules/typescript'].version },
    },
    { repository },
  );
});

test('Browserzeiten erhalten jeden ausgeführten Fall einschließlich Wiederholungen und begrenzen die Übersicht', () => {
  const report = {
    suites: [
      {
        title: 'Datei',
        suites: [
          {
            title: 'Gerät',
            specs: Array.from({ length: 7 }, (_, index) => ({
              title: `Fall | ${index}`,
              file: 'e2e/example.spec.ts',
              tests: [
                {
                  projectName: 'ui',
                  results:
                    index === 0
                      ? [{ duration: 0, status: 'skipped' }]
                      : [
                          { duration: index * 1000, status: 'failed' },
                          { duration: 500, status: 'passed' },
                        ],
                },
              ],
            })),
          },
        ],
      },
    ],
  };
  const timings = browserTestTimings(report);
  assert.equal(timings.length, 6);
  assert.equal(timings[0].duration, 6500);
  assert.equal(timings[0].attempts, 2);
  const summary = browserTimingSummary(report, 'ui 1/3');
  assert.match(summary, /6 ausgeführte Fälle/u);
  assert.match(summary, /6\.5 s/u);
  assert.match(summary, /Fall \\\| 6/u);
  assert.equal(summary.split('\n').filter((line) => line.startsWith('| Datei')).length, 5);
  assert.throws(() =>
    browserTestTimings({ suites: [{ specs: [{ tests: [{ results: [{ duration: -1 }] }] }] }] }),
  );
});

test('fehlende Browserzeiten sind nach Erfolg ein Fehler und verdecken keinen vorherigen Browserabbruch', async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), 'browser-timings-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const path = join(temporary, 'missing.json');
  await assert.rejects(writeBrowserTimingSummary(path, { BROWSER_TEST_OUTCOME: 'success' }), {
    code: 'ENOENT',
  });
  await writeBrowserTimingSummary(path, { BROWSER_TEST_OUTCOME: 'failure' });
});

test('CI verwendet den Minimalparser, getrennte Imagecaches und Laufzeitberichte auch bei Erfolg', async () => {
  const workflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const changes = workflow.split('  changes:')[1].split('  documentation:')[0];
  assert.ok(changes.includes('run: node scripts/install-test-selection-parser.mjs'));
  assert.ok(!changes.includes('npm ci'));
  assert.ok(
    changes.includes('workflow_script_tests: ${{ steps.preflight.outputs.workflow_script_tests }}'),
  );
  const workflowContracts = workflow
    .split('      - name: Check affected workflow contracts')[1]
    .split('      - name: Set up Deno for marketplace functions')[0];
  assert.ok(
    workflowContracts.includes(
      'AFFECTED_WORKFLOW_TESTS: ${{ needs.changes.outputs.workflow_script_tests }}',
    ),
  );
  assert.ok(workflowContracts.includes('run: node scripts/ci-checks.mjs workflow'));
  const appBuild = workflow
    .split('      - name: Build production image')[1]
    .split('      - name: Smoke test production image')[0];
  const appImports = appBuild
    .split('cache-from:')[1]
    .split('cache-to:')[0]
    .trim()
    .replace(/^\|\s*/u, '')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  assert.deepEqual(appImports, ['type=gha,scope=app', 'type=gha']);
  assert.ok(appBuild.includes('cache-to: type=gha,scope=app,mode=max'));
  for (const scope of ['sniper', 'push']) {
    assert.ok(workflow.includes(`cache-from: type=gha,scope=${scope}`));
    assert.ok(workflow.includes(`cache-to: type=gha,scope=${scope},mode=max`));
  }
  assert.doesNotMatch(workflow, /cache-to: type=gha(?:,mode=max)?\s*$/mu);
  const browser = workflow.split('  browser-smoke:')[1].split('  extension:')[0];
  assert.ok(browser.includes('--reporter=github,json,html'));
  assert.ok(browser.includes('PLAYWRIGHT_JSON_OUTPUT_FILE: test-results/browser-timings-'));
  const artifact = browser.split('      - name: Retain browser test durations')[1];
  assert.match(artifact, /if: \$\{\{ always\(\) \}\}/u);
  assert.match(artifact, /retention-days: 3/u);
});
