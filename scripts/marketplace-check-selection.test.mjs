import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { promisify } from 'node:util';
import { marketplaceImageChecks } from './marketplace-image-checks.mjs';

const exec = promisify(execFile);
import {
  selectMarketplaceChecks,
  selectMarketplaceChecksFromFiles,
} from './marketplace-check-selection.mjs';
import {
  marketplaceCheckCommands,
  marketplaceImageCommands,
  runMarketplaceChecks,
} from './run-marketplace-checks.mjs';

const select = (paths, files = {}) => selectMarketplaceChecksFromFiles(paths, files);
const browserTest =
  'services/marketplace-worker/test/browser/vinted-listing-photos.browser.test.ts';

test('Dokumentation und unabhängige Oberfläche starten keine Marketplace-Prüfung', () => {
  for (const path of ['docs/testing.md', 'src/app/features/sales/sales.component.html']) {
    assert.deepEqual(select([path]), {
      extensionRequired: false,
      workerBrowserTests: [],
      workerImageRequired: false,
      sessionImageRequired: false,
    });
  }
});

test('Session-spezifische Inputs bauen keine Worker-/Brokerimages', () => {
  for (const path of [
    'services/marketplace-worker/Dockerfile.chromium-session',
    'services/marketplace-worker/runtime/chromium-session.ts',
    'tools/cloud-browser-pilot/proxy-forwarder.mjs',
    'tools/cloud-browser-pilot/chrome-window-close.mjs',
  ]) {
    const plan = select([path]);
    assert.equal(plan.workerImageRequired, false, path);
    assert.equal(plan.sessionImageRequired, true, path);
  }
});

test('alle externen COPY-Inputs des Worker-Dockerfiles erreichen beide benötigten Images', async () => {
  const dockerfile = await readFile(
    new URL('../services/marketplace-worker/Dockerfile', import.meta.url),
    'utf8',
  );
  const inputs = [...dockerfile.matchAll(/^COPY (?!-)(.+)\s+\S+$/gmu)].flatMap((match) =>
    match[1].split(/\s+/u),
  );
  assert.ok(inputs.includes('tools/flipbase-extension/vinted-listing-runtime.js'));
  assert.ok(inputs.includes('supabase/functions/_shared/marketplace-profile-contracts.d.ts'));
  for (const path of inputs) {
    const plan = select([path.endsWith('/src') ? `${path}/example.ts` : path]);
    assert.equal(plan.workerImageRequired, true, path);
    assert.equal(plan.sessionImageRequired, true, path);
  }
});

test('native Browserauswahl verfolgt transitive Imports und entfernte Dateien', () => {
  const source = 'services/marketplace-worker/src/vinted-browser-listing-photos.ts';
  const dependency = 'services/marketplace-worker/src/upload-policy.ts';
  const files = {
    [browserTest]: "import { upload } from '../../src/vinted-browser-listing-photos.ts';",
    [source]: "export { upload } from './upload-policy.ts';",
    'services/marketplace-worker/test/browser/vinted-login.browser.test.ts':
      "import './unrelated.ts';",
  };
  assert.deepEqual(select([dependency], files).workerBrowserTests, [browserTest]);
  assert.deepEqual(
    select(['services/marketplace-worker/src/worker-queue.ts'], files).workerBrowserTests,
    [],
  );
  assert.deepEqual(select([browserTest], files).workerBrowserTests, [browserTest]);
});

test('Änderungen am Sandboxstart prüfen alle nativen Browser ohne zusätzliche Imagebauten', () => {
  const loginTest = 'services/marketplace-worker/test/browser/vinted-login.browser.test.ts';
  const files = {
    [browserTest]: '',
    [loginTest]: '',
    'services/marketplace-worker/test/browser/chrome-session-stop.browser.test.ts': '',
  };
  for (const path of [
    'scripts/configure-worker-browser-sandbox.mjs',
    'scripts/configure-worker-browser-sandbox.test.mjs',
  ]) {
    assert.deepEqual(select([path], files), {
      extensionRequired: false,
      workerBrowserTests: [browserTest, loginTest],
      workerImageRequired: false,
      sessionImageRequired: false,
    });
  }
});

test('bestehende Veröffentlichungs-, Formular- und Uploadtests werden wirklich gefunden', async () => {
  for (const [source, expected] of [
    ['vinted-browser-listing-submit.ts', 'vinted-listing-submit.browser.test.ts'],
    ['vinted-browser-listing-category.ts', 'vinted-listing-category.browser.test.ts'],
    ['vinted-browser-listing-fields.ts', 'vinted-listing-fields.browser.test.ts'],
    ['vinted-browser-listing-photos.ts', 'vinted-listing-photos.browser.test.ts'],
    ['vinted-browser-listing-update.ts', 'vinted-listing-update.browser.test.ts'],
  ]) {
    const plan = await selectMarketplaceChecks([`services/marketplace-worker/src/${source}`]);
    assert.ok(
      plan.workerBrowserTests.includes(`services/marketplace-worker/test/browser/${expected}`),
      source,
    );
    assert.ok(!plan.workerBrowserTests.some((path) => path.includes('chrome-session-stop')));
  }
});

test('Erweiterung hat genau zwei Befehle, ohne Browsermatrix oder leeren Ersatzlauf', () => {
  const plan = select(['tools/flipbase-extension/kleinanzeigen-publication-runtime.js']);
  assert.equal(plan.extensionRequired, true);
  assert.deepEqual(marketplaceCheckCommands('extension', plan), [
    ['scripts/kleinanzeigen-extension-browser.mjs'],
    ['scripts/kleinanzeigen-publication-browser.mjs'],
  ]);
  assert.deepEqual(marketplaceCheckCommands('extension', select(['docs/test.md'])), []);
});

test('Imagebefehl baut Session und Import-Smoke bei beiden Images genau einmal', () => {
  const { commands } = marketplaceImageCommands(select(null));
  assert.equal(
    commands.filter(
      ([command, args]) =>
        command === 'docker' &&
        args.includes('services/marketplace-worker/Dockerfile.chromium-session'),
    ).length,
    1,
  );
  assert.equal(
    commands.filter(([command, args]) => command === 'bash' && args[1] === 'session-imports')
      .length,
    1,
  );
  assert.equal(commands.filter(([command]) => command === 'docker').length, 3);
  const onlySession = marketplaceImageCommands(
    select(['tools/cloud-browser-pilot/proxy-forwarder.mjs']),
  );
  assert.equal(onlySession.commands.filter(([command]) => command === 'docker').length, 1);
  assert.ok(
    !onlySession.commands.some(
      ([command, args]) =>
        command === 'bash' &&
        ['worker-separation', 'gologin-budgets', 'broker-sandbox', 'broker-isolation'].includes(
          args[1],
        ),
    ),
  );
  assert.deepEqual(marketplaceImageCommands(select(['docs/test.md'])).commands, []);
});

test('ungültige Pläne, Pfadargumente und Broker ohne Session schlagen fehl', () => {
  assert.throws(() =>
    marketplaceImageCommands({ workerImageRequired: true, sessionImageRequired: false }),
  );
  assert.throws(() => marketplaceImageCommands(select(null), 'bad;tag'));
  assert.throws(() =>
    marketplaceCheckCommands('worker-browser', {
      extensionRequired: false,
      workerBrowserTests: ['--test-only'],
    }),
  );
  assert.throws(() =>
    marketplaceCheckCommands('worker-browser', {
      extensionRequired: false,
      workerBrowserTests: [
        'services/marketplace-worker/test/browser/chrome-session-stop.browser.test.ts',
      ],
    }),
  );
});

test('bestehende Session-Kontextignore wählt genau das tatsächlich betroffene Image', async () => {
  const path = 'services/marketplace-worker/.dockerignore';
  assert.match(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'), /node_modules/u);
  const plan = select([path]);
  assert.deepEqual(plan, {
    extensionRequired: false,
    workerBrowserTests: [],
    workerImageRequired: false,
    sessionImageRequired: true,
  });
  const builds = marketplaceImageCommands(plan).commands.filter(
    ([command]) => command === 'docker',
  );
  assert.equal(builds.length, 1);
  assert.equal(builds[0][1].at(-1), dirname(path));
});

test('zentrale Auswahl und Befehle wählen sämtliche Marketplaceprüfbereiche', () => {
  const files = { [browserTest]: '' };
  for (const path of [
    '.github/workflows/marketplace-worker-image.yml',
    '.github/workflows/marketplace-image-publish.yml',
    'scripts/preflight.mjs',
    'scripts/preflight.test.mjs',
    'scripts/ci-checks.mjs',
    'scripts/ci-checks.test.mjs',
  ]) {
    assert.deepEqual(
      select([path], files),
      {
        extensionRequired: true,
        workerBrowserTests: [browserTest],
        workerImageRequired: true,
        sessionImageRequired: true,
      },
      path,
    );
  }
});

async function withRunnerFixture(run) {
  const repository = await mkdtemp(join(tmpdir(), 'flipbase-marketplace-runner-'));
  try {
    await mkdir(join(repository, 'scripts'));
    await mkdir(join(repository, 'bin'));
    await run(repository);
  } finally {
    await rm(repository, { recursive: true, force: true });
  }
}

test('Runner verwendet die übergebene Umgebung und bewahrt positive Childexitcodes', async () => {
  await withRunnerFixture(async (repository) => {
    const capture = join(repository, 'environment.json');
    const script =
      'import {writeFileSync} from "node:fs"; writeFileSync(process.env.CAPTURE, JSON.stringify({ci:process.env.CI,sha:process.env.GITHUB_SHA,temp:process.env.RUNNER_TEMP,path:process.env.PATH})); process.exit(Number(process.env.FAIL_CODE ?? 0));';
    for (const name of [
      'kleinanzeigen-extension-browser.mjs',
      'kleinanzeigen-publication-browser.mjs',
    ])
      await writeFile(join(repository, 'scripts', name), script);
    const plan = { extensionRequired: true, workerBrowserTests: [] };
    const environment = {
      PATH: join(repository, 'bin'),
      CI: 'true',
      GITHUB_SHA: 'provided-commit',
      RUNNER_TEMP: repository,
      CAPTURE: capture,
      FAIL_CODE: '17',
    };
    await assert.rejects(
      runMarketplaceChecks('extension', plan, { repository, environment }),
      (error) => error.exitCode === 17,
    );
    assert.deepEqual(JSON.parse(await readFile(capture, 'utf8')), {
      ci: 'true',
      sha: 'provided-commit',
      temp: repository,
      path: [dirname(process.execPath), environment.PATH].join(delimiter),
    });
    const cli = fileURLToPath(new URL('./run-marketplace-checks.mjs', import.meta.url));
    const code = await new Promise((resolveExit, rejectExit) => {
      const child = spawn(process.execPath, [cli, 'extension'], {
        cwd: repository,
        env: { ...environment, MARKETPLACE_CHECK_PLAN: JSON.stringify(plan) },
        stdio: 'ignore',
      });
      child.once('error', rejectExit);
      child.once('exit', resolveExit);
    });
    assert.equal(code, 17);
  });
});

test('Imagebau und Fehlerdiagnose erhalten dieselbe Umgebung und verdecken den Fehler nicht', async () => {
  await withRunnerFixture(async (repository) => {
    const capture = join(repository, 'image-commands.jsonl');
    const script = `#!${process.execPath}\nconst fs=require('node:fs'); fs.appendFileSync(process.env.CAPTURE, JSON.stringify({args:process.argv.slice(2),sha:process.env.GITHUB_SHA,temp:process.env.RUNNER_TEMP,ci:process.env.CI,path:process.env.PATH})+'\\n'); if(process.argv.includes('session-imports'))process.exit(23);`;
    for (const name of ['docker', 'bash'])
      await writeFile(join(repository, 'bin', name), script, { mode: 0o755 });
    const environment = {
      PATH: join(repository, 'bin'),
      CI: 'true',
      GITHUB_ACTIONS: 'true',
      RUNNER_ENVIRONMENT: 'github-hosted',
      RUNNER_OS: 'Linux',
      GITHUB_SHA: 'provided-commit',
      RUNNER_TEMP: repository,
      CAPTURE: capture,
    };
    const plan = { workerImageRequired: false, sessionImageRequired: true };
    await assert.rejects(
      runMarketplaceChecks('images', plan, { repository, environment }),
      (error) => error.exitCode === 23,
    );
    const calls = (await readFile(capture, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.equal(calls.length, 3);
    assert.ok(
      calls[0].args.includes('ghcr.io/grischatdev/flipbase-chromium-session:sha-provided-commit'),
    );
    assert.equal(calls[1].args[1], 'session-imports');
    assert.equal(calls[2].args[1], 'session-diagnostics');
    for (const call of calls)
      assert.deepEqual(
        { sha: call.sha, temp: call.temp, ci: call.ci, path: call.path },
        {
          sha: 'provided-commit',
          temp: repository,
          ci: 'true',
          path: [dirname(process.execPath), environment.PATH].join(delimiter),
        },
      );
  });
});

test('ein signalbeendeter Childprozess bleibt ein Fehler mit Exitcode eins', async () => {
  await withRunnerFixture(async (repository) => {
    await writeFile(
      join(repository, 'scripts/kleinanzeigen-extension-browser.mjs'),
      'process.kill(process.pid, "SIGTERM");',
    );
    await assert.rejects(
      runMarketplaceChecks(
        'extension',
        { extensionRequired: true, workerBrowserTests: [] },
        { repository, environment: {} },
      ),
      (error) => error.exitCode === 1,
    );
  });
});

test('Imageausführung lehnt lokale und ungeeignete Runner vor jedem Kindprozess ab', async () => {
  await withRunnerFixture(async (repository) => {
    const capture = join(repository, 'unexpected-process');
    const script = `#!${process.execPath}\nrequire('node:fs').writeFileSync(process.env.CAPTURE, 'started');`;
    for (const name of ['docker', 'bash', 'sudo'])
      await writeFile(join(repository, 'bin', name), script, { mode: 0o755 });
    const cli = fileURLToPath(new URL('./run-marketplace-checks.mjs', import.meta.url));
    const hosted = {
      GITHUB_ACTIONS: 'true',
      RUNNER_ENVIRONMENT: 'github-hosted',
      RUNNER_OS: 'Linux',
      RUNNER_TEMP: repository,
    };
    const rejected = [
      {},
      { CI: 'true' },
      { ...hosted, GITHUB_ACTIONS: '' },
      { ...hosted, RUNNER_ENVIRONMENT: '' },
      { ...hosted, RUNNER_ENVIRONMENT: 'self-hosted' },
      { ...hosted, RUNNER_OS: 'Windows' },
      { ...hosted, RUNNER_TEMP: '' },
      { ...hosted, RUNNER_TEMP: 'relative' },
    ];
    for (const context of rejected) {
      const environment = {
        ...context,
        PATH: join(repository, 'bin'),
        CAPTURE: capture,
        MARKETPLACE_CHECK_PLAN: JSON.stringify({
          workerImageRequired: true,
          sessionImageRequired: true,
        }),
      };
      await assert.rejects(
        exec(process.execPath, [cli, 'images'], { cwd: repository, env: environment }),
        (error) => error.code === 1 && /Vorabcheck unvollständig/u.test(error.stderr),
      );
      await assert.rejects(access(capture), { code: 'ENOENT' });
    }
    // Ein nicht ausgewählter Imagebereich benötigt auch lokal keinen Runner.
    await runMarketplaceChecks(
      'images',
      { workerImageRequired: false, sessionImageRequired: false },
      { repository, environment: {} },
    );
  });
});

test('direkte Shellprüfungen schützen auch sudo, Diagnosen und Cleanup vor lokalen Aufrufen', async () => {
  await withRunnerFixture(async (repository) => {
    const capture = join(repository, 'unexpected-host-command');
    const script = `#!${process.execPath}\nrequire('node:fs').appendFileSync(process.env.CAPTURE, 'started\\n');`;
    for (const name of ['docker', 'sudo'])
      await writeFile(join(repository, 'bin', name), script, { mode: 0o755 });
    const shell = fileURLToPath(new URL('./check-marketplace-images.sh', import.meta.url));
    const environment = {
      PATH: [dirname(process.execPath), join(repository, 'bin'), '/usr/bin', '/bin'].join(
        delimiter,
      ),
      CAPTURE: capture,
      CI: 'true',
      RUNNER_TEMP: repository,
      WORKER_IMAGE: 'fixture-worker',
      BROKER_IMAGE: 'fixture-broker',
    };
    for (const check of [...marketplaceImageChecks.map(({ id }) => id), 'session-diagnostics']) {
      await assert.rejects(
        exec('/bin/bash', [shell, check], { cwd: repository, env: environment }),
        (error) => error.code === 1 && /Vorabcheck unvollständig/u.test(error.stderr),
      );
      await assert.rejects(access(capture), { code: 'ENOENT' });
    }
    // Positiver Prozessgegenfall mit ausschließlich protokollierendem Dockerersatz.
    await exec('/bin/bash', [shell, 'worker-separation'], {
      cwd: repository,
      env: {
        ...environment,
        GITHUB_ACTIONS: 'true',
        RUNNER_ENVIRONMENT: 'github-hosted',
        RUNNER_OS: 'Linux',
      },
    });
    assert.equal((await readFile(capture, 'utf8')).trim().split('\n').length, 3);
  });
});
