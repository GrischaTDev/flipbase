import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { classifyChanges, pathsSelectPush } from './detect-supabase-changes.mjs';

test('Pushauswahl umfasst Sender, SQL, Functionpaket und den gesamten Releaseweg', () => {
  for (const path of [
    'services/push-worker/src/push-provider.ts',
    'supabase/functions/push-revoke/handler.ts',
    'supabase/schemas/470_web_push_devices.sql',
    'supabase/schemas/471_web_push_delivery.sql',
    'supabase/schemas/472_web_push_events.sql',
    'deploy/push-main/index.ts',
    'deploy/docker-compose.push.yml',
    'deploy/docker-compose.push-functions.yml',
    'deploy/deploy.sh',
    'deploy/Caddyfile',
    'docker/Dockerfile',
    '.dockerignore',
    'scripts/package-push-functions.mjs',
    '.github/workflows/ci.yml',
  ])
    assert.equal(pathsSelectPush([path]), true, path);
  assert.equal(pathsSelectPush(['src/app/features/landing/landing.html']), false);
  assert.equal(pathsSelectPush([]), false);
});

test('jede einzelne Observer- und paketierte Shared-Datei waehlt den Push-Release aus', () => {
  for (const path of [
    'supabase/functions/ebay-order-observer/index.ts',
    'supabase/functions/ebay-order-observer/handler.ts',
    ...[
      'ebay-api',
      'ebay-config',
      'ebay-token-encryption',
      'ebay-contracts',
      'ebay-xml',
      'ebay-order-source',
      'ebay-order-amounts',
      'ebay-order-import-contracts',
      'ebay-sale-draft-contracts',
      'marketplace-contracts',
    ].map((name) => `supabase/functions/_shared/${name}.ts`),
  ]) {
    assert.equal(pathsSelectPush([path]), true, path);
    assert.equal(classifyChanges([path]).application, true, path);
    assert.equal(classifyChanges([path]).supabase, true, path);
  }
});

test('Migrationsweg waehlt Datenbankpruefungen aus, reine UI-Aenderungen nicht', () => {
  for (const path of [
    'deploy/deploy.sh',
    'deploy/apply-release-migrations.sh',
    'deploy/migration-backup.sh',
    'scripts/package-migrations.mjs',
    'scripts/package-migrations.test.mjs',
    'scripts/check-migration-changes.mjs',
    'scripts/check-migration-changes.test.mjs',
    'deploy/docker-compose.app.yml',
    'docker/Dockerfile',
    '.dockerignore',
    'scripts/deploy-script.test.mjs',
    'scripts/release-migrations.test.mjs',
    'scripts/migration-backup.test.mjs',
  ]) {
    assert.equal(classifyChanges([path]).supabase, true, path);
  }
  assert.equal(classifyChanges(['src/app/features/landing/landing.html']).supabase, false);
});

const detectorPath = fileURLToPath(new URL('./detect-supabase-changes.mjs', import.meta.url));
const zeroSha = '0000000000000000000000000000000000000000';

function git(repository, ...arguments_) {
  return execFileSync('git', arguments_, { cwd: repository, encoding: 'utf8' }).trim();
}

async function createRepository() {
  const repository = await mkdtemp(join(tmpdir(), 'flipbase-changes-'));
  git(repository, 'init', '--quiet');
  git(repository, 'config', 'user.name', 'CI Test');
  git(repository, 'config', 'user.email', 'ci@example.test');
  git(repository, 'config', 'core.autocrlf', 'false');
  return repository;
}

async function commitFile(repository, path, content, message) {
  const absolutePath = join(repository, ...path.split('/'));
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, 'utf8');
  git(repository, 'add', '--', path);
  git(repository, 'commit', '--quiet', '-m', message);
  return git(repository, 'rev-parse', 'HEAD');
}

async function runDetector(repository, environment) {
  const outputPath = join(repository, 'github-output.txt');
  const result = spawnSync(process.execPath, [detectorPath], {
    cwd: repository,
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_OUTPUT: outputPath,
      ...environment,
    },
  });
  const output = await readFile(outputPath, 'utf8').catch(() => '');
  return { ...result, output };
}

async function withRepository(callback) {
  const repository = await createRepository();
  try {
    await callback(repository);
  } finally {
    await rm(repository, { recursive: true, force: true });
  }
}

test('AGENTS und reine Dokumentation wählen ausschließlich Dokumentationsprüfungen', () => {
  for (const paths of [
    ['AGENTS.md'],
    ['AGENTS.md', 'docs/AI-CHANGELOG.md'],
    ['README.md', 'docs/guide.md'],
  ]) {
    assert.deepEqual(classifyChanges(paths), {
      application: false,
      application_tests: false,
      supabase: false,
      sniper: false,
      documentation_only: true,
    });
    assert.equal(pathsSelectPush(paths), false);
  }
  assert.equal(classifyChanges([]).documentation_only, false);
  assert.equal(classifyChanges(null).documentation_only, false);
});

test('Regeländerungen verbergen keine gleichzeitig geänderten technischen Dateien', () => {
  for (const path of [
    'src/app/app.ts',
    'public/sw.js',
    'e2e/pwa-production.spec.ts',
    'supabase/schemas/10_core.sql',
    'deploy/deploy.sh',
    'docker/Dockerfile',
    'package-lock.json',
    '.github/workflows/ci.yml',
    'scripts/detect-supabase-changes.mjs',
    'unknown/config.json',
  ]) {
    const paths = ['AGENTS.md', 'docs/AI-CHANGELOG.md', path];
    const changes = classifyChanges(paths);
    assert.equal(changes.documentation_only, false, path);
    assert.equal(changes.application, true, path);
    assert.equal(changes.application_tests, true, path);
    assert.equal(changes.supabase, classifyChanges([path]).supabase, path);
    assert.equal(changes.sniper, classifyChanges([path]).sniper, path);
    assert.equal(pathsSelectPush(paths), pathsSelectPush([path]), path);
  }
  assert.equal(
    classifyChanges(['AGENTS.md', 'services/marketplace-worker/src/browser.ts']).documentation_only,
    false,
  );
});

test('AGENTS mit Änderungsprotokoll überspringt bei PR und Push die Veröffentlichung', async () => {
  for (const EVENT_NAME of ['pull_request', 'push']) {
    await withRepository(async (repository) => {
      const base = await commitFile(repository, 'AGENTS.md', '# Regeln\n', 'base');
      await commitFile(repository, 'docs/AI-CHANGELOG.md', '# Protokoll\n', 'changelog');
      const head = await commitFile(repository, 'AGENTS.md', '# Lokale Prüfungen\n', 'rules');
      const result = await runDetector(repository, {
        EVENT_NAME,
        PR_BASE_SHA: base,
        PUSH_BEFORE_SHA: base,
        HEAD_SHA: head,
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(
        result.output,
        'application=false\nsupabase=false\nsniper=false\napplication_tests=false\npush=false\ndocumentation_only=true\n',
      );
    });
  }
});

test('Pull Requests vergleichen ausschließlich mit der PR-Basis', async () => {
  await withRepository(async (repository) => {
    const base = await commitFile(repository, 'README.md', 'base\n', 'base');
    const head = await commitFile(
      repository,
      'supabase/config.toml',
      'project_id = "test"\n',
      'db',
    );

    const result = await runDetector(repository, {
      EVENT_NAME: 'pull_request',
      PR_BASE_SHA: base,
      PUSH_BEFORE_SHA: head,
      HEAD_SHA: head,
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      result.output,
      'application=true\nsupabase=true\nsniper=false\napplication_tests=true\npush=false\ndocumentation_only=false\n',
    );
  });
});

test('Pushes vergleichen ausschließlich mit github.event.before', async () => {
  await withRepository(async (repository) => {
    const before = await commitFile(repository, 'README.md', 'base\n', 'base');
    const head = await commitFile(
      repository,
      'supabase/config.toml',
      'project_id = "test"\n',
      'db',
    );

    const result = await runDetector(repository, {
      EVENT_NAME: 'push',
      PR_BASE_SHA: head,
      PUSH_BEFORE_SHA: before,
      HEAD_SHA: head,
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      result.output,
      'application=true\nsupabase=true\nsniper=false\napplication_tests=true\npush=false\ndocumentation_only=false\n',
    );
  });
});

test('Null-SHA verwendet bei vorhandenem Vorgänger den direkten Parent', async () => {
  await withRepository(async (repository) => {
    await commitFile(repository, 'README.md', 'base\n', 'base');
    const head = await commitFile(
      repository,
      'supabase/config.toml',
      'project_id = "test"\n',
      'db',
    );

    const result = await runDetector(repository, {
      EVENT_NAME: 'push',
      PR_BASE_SHA: '',
      PUSH_BEFORE_SHA: zeroSha,
      HEAD_SHA: head,
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      result.output,
      'application=true\nsupabase=true\nsniper=false\napplication_tests=true\npush=false\ndocumentation_only=false\n',
    );
  });
});

test('erster Commit entscheidet ohne Vorgänger für beide Bereiche konservativ', async () => {
  await withRepository(async (repository) => {
    const head = await commitFile(repository, 'README.md', 'first\n', 'first');

    const result = await runDetector(repository, {
      EVENT_NAME: 'push',
      PR_BASE_SHA: '',
      PUSH_BEFORE_SHA: zeroSha,
      HEAD_SHA: head,
    });

    assert.equal(result.status, 0, result.stderr);
    // Ohne Vergleichspunkt laesst sich nichts ausschliessen. Dann lieber alles
    // laufen lassen als eine Pruefung stillschweigend ueberspringen.
    assert.equal(
      result.output,
      'application=true\nsupabase=true\nsniper=true\napplication_tests=true\npush=true\ndocumentation_only=false\n',
    );
  });
});

test('nicht auflösbare Force-Push-Basis bricht fail-closed ab', async () => {
  await withRepository(async (repository) => {
    const head = await commitFile(repository, 'README.md', 'head\n', 'head');

    const result = await runDetector(repository, {
      EVENT_NAME: 'push',
      PR_BASE_SHA: '',
      PUSH_BEFORE_SHA: 'ffffffffffffffffffffffffffffffffffffffff',
      HEAD_SHA: head,
    });

    assert.notEqual(result.status, 0);
    assert.equal(result.output, '');
  });
});

test('Supabase-Diff setzt die Ausgabe auf true', async () => {
  await withRepository(async (repository) => {
    const base = await commitFile(repository, 'README.md', 'base\n', 'base');
    const head = await commitFile(repository, 'supabase/tests/example.sql', 'select 1;\n', 'db');

    const result = await runDetector(repository, {
      EVENT_NAME: 'push',
      PR_BASE_SHA: '',
      PUSH_BEFORE_SHA: base,
      HEAD_SHA: head,
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      result.output,
      'application=true\nsupabase=true\nsniper=false\napplication_tests=true\npush=false\ndocumentation_only=false\n',
    );
  });
});

test('Diff außerhalb von Supabase setzt die Ausgabe auf false', async () => {
  await withRepository(async (repository) => {
    const base = await commitFile(repository, 'README.md', 'base\n', 'base');
    const head = await commitFile(repository, 'README.md', 'changed\n', 'docs');

    const result = await runDetector(repository, {
      EVENT_NAME: 'push',
      PR_BASE_SHA: '',
      PUSH_BEFORE_SHA: base,
      HEAD_SHA: head,
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      result.output,
      'application=false\nsupabase=false\nsniper=false\napplication_tests=false\npush=false\ndocumentation_only=true\n',
    );
  });
});

test('Technischer Pfad bleibt bei einem Rename nach docs anwendungsrelevant', async () => {
  await withRepository(async (repository) => {
    const base = await commitFile(
      repository,
      'src/app/features/example/example.component.html',
      '<main>stable technical template</main>\n',
      'technical template',
    );
    const sourcePath = join(repository, 'src/app/features/example/example.component.html');
    const targetPath = join(repository, 'docs/example-template.md');
    await mkdir(dirname(targetPath), { recursive: true });
    await rename(sourcePath, targetPath);
    git(repository, 'add', '-A');
    git(repository, 'commit', '--quiet', '-m', 'move template to docs');
    const head = git(repository, 'rev-parse', 'HEAD');

    const result = await runDetector(repository, {
      EVENT_NAME: 'push',
      PR_BASE_SHA: '',
      PUSH_BEFORE_SHA: base,
      HEAD_SHA: head,
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      result.output,
      'application=true\nsupabase=false\nsniper=false\napplication_tests=true\npush=false\ndocumentation_only=false\n',
    );
  });
});

test('reine Sniper-Änderung erhält den Release-Weg, überspringt aber Anwendungstests', async () => {
  await withRepository(async (repository) => {
    const base = await commitFile(repository, 'services/sniper/src/config.ts', 'base\n', 'base');
    const head = await commitFile(
      repository,
      'services/sniper/src/config.ts',
      'changed\n',
      'sniper',
    );

    const result = await runDetector(repository, {
      EVENT_NAME: 'push',
      PR_BASE_SHA: '',
      PUSH_BEFORE_SHA: base,
      HEAD_SHA: head,
    });

    assert.equal(result.status, 0, result.stderr);
    // Der Release-Schalter bleibt bestehen. Nur die fachfremden Anwendungstests entfallen.
    assert.equal(
      result.output,
      'application=true\nsupabase=false\nsniper=true\napplication_tests=false\npush=false\ndocumentation_only=false\n',
    );
  });
});

test('bekannte Dokumentation unter docs und Root-Markdown überspringt die Anwendung', async () => {
  await withRepository(async (repository) => {
    const base = await commitFile(repository, 'README.md', 'base\n', 'base');
    await commitFile(repository, 'docs/guide.md', 'guide\n', 'guide');
    const head = await commitFile(repository, 'CONTRIBUTING.md', 'rules\n', 'rules');

    const result = await runDetector(repository, {
      EVENT_NAME: 'push',
      PR_BASE_SHA: '',
      PUSH_BEFORE_SHA: base,
      HEAD_SHA: head,
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      result.output,
      'application=false\nsupabase=false\nsniper=false\napplication_tests=false\npush=false\ndocumentation_only=true\n',
    );
  });
});

test('unbekannte Pfade lösen die Anwendungsprüfung konservativ aus', async () => {
  for (const path of ['notes/release.txt', 'public/guide.md', 'src/AGENTS.md']) {
    await withRepository(async (repository) => {
      const base = await commitFile(repository, 'README.md', 'base\n', 'base');
      const head = await commitFile(repository, path, 'changed\n', 'change');

      const result = await runDetector(repository, {
        EVENT_NAME: 'push',
        PR_BASE_SHA: '',
        PUSH_BEFORE_SHA: base,
        HEAD_SHA: head,
      });

      assert.equal(result.status, 0, result.stderr);
      assert.equal(
        result.output,
        'application=true\nsupabase=false\nsniper=false\napplication_tests=true\npush=false\ndocumentation_only=false\n',
      );
    });
  }
});

test('gemeinsame Abhängigkeiten und CI-Werkzeuge lösen alle betroffenen Prüfungen aus', async () => {
  for (const path of ['package-lock.json', '.github/workflows/ci.yml']) {
    await withRepository(async (repository) => {
      const base = await commitFile(repository, 'README.md', 'base\n', 'base');
      const head = await commitFile(repository, path, 'changed\n', 'change');

      const result = await runDetector(repository, {
        EVENT_NAME: 'push',
        PR_BASE_SHA: '',
        PUSH_BEFORE_SHA: base,
        HEAD_SHA: head,
      });

      assert.equal(result.status, 0, result.stderr);
      assert.equal(
        result.output,
        'application=true\nsupabase=true\nsniper=true\napplication_tests=true\npush=true\ndocumentation_only=false\n',
      );
    });
  }
});

test('nur das getrennte Sniper-Paket darf Anwendungstests ohne Release-Verlust sparen', () => {
  const bot = 'services/sniper/src/runtime/scheduler.ts';
  for (const [paths, expected] of [
    [[bot], false],
    [[bot, 'docs/bot.md', 'README.md'], false],
    [['services/sniper/package-lock.json'], false],
    [['services/sniper/test/runtime/scheduler.spec.ts'], false],
    [[bot, 'src/app/features/deal-monitor/deal-monitor.component.ts'], true],
    [[bot, 'src/app/layout/sidebar/sidebar.component.html'], true],
    [[bot, 'src/styles.css'], true],
    [[bot, 'public/i18n/de.json'], true],
    [[bot, 'e2e/deal-monitor.spec.ts'], true],
    [[bot, 'supabase/migrations/20260916000000_test.sql'], true],
    [[bot, 'supabase/schemas/50_sniper.sql'], true],
    [[bot, 'deploy/deploy.sh'], true],
    [[bot, 'docker/Dockerfile'], true],
    [[bot, 'package-lock.json'], true],
    [[bot, '.github/workflows/ci.yml'], true],
    [[bot, 'AGENTS.md'], false],
    [[bot, 'unknown/config.json'], true],
    [['services/sniper-other/src/config.ts'], true],
  ]) {
    const changes = classifyChanges(paths);
    assert.equal(changes.application_tests, expected, JSON.stringify(paths));
    assert.equal(changes.application, true, 'Release-Auswahl bleibt erhalten');
  }
  assert.deepEqual(classifyChanges(null), {
    application: true,
    application_tests: true,
    supabase: true,
    sniper: true,
    documentation_only: false,
  });
  assert.equal(classifyChanges([]).application_tests, false);
  assert.equal(classifyChanges(['docs/guide.md']).application_tests, false);
});

test('Verschieben einer UI-Datei ins Bot-Paket bleibt anwendungsrelevant', async () => {
  await withRepository(async (repository) => {
    const source = 'src/app/example.ts';
    const target = 'services/sniper/src/example.ts';
    const base = await commitFile(repository, source, 'export const value = 1;\n', 'source');
    await mkdir(dirname(join(repository, target)), { recursive: true });
    await rename(join(repository, source), join(repository, target));
    git(repository, 'add', '-A');
    git(repository, 'commit', '--quiet', '-m', 'move to service');
    const result = await runDetector(repository, {
      EVENT_NAME: 'pull_request',
      PR_BASE_SHA: base,
      HEAD_SHA: git(repository, 'rev-parse', 'HEAD'),
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.output, /application_tests=true\n/);
  });
});

test('reine Worker-Änderungen sparen Anwendungstests und Web-Release, geteilte Dateien nicht', () => {
  const worker = 'services/marketplace-worker/src/marketplace-browser-http-api.ts';
  for (const paths of [
    [worker],
    [worker, 'docs/AI-CHANGELOG.md'],
    [worker, 'AGENTS.md'],
    ['services/marketplace-worker/test/vinted-listing-content-http.test.ts'],
    ['services/marketplace-worker/runtime/chromium-session.ts'],
    ['services/marketplace-worker/package-lock.json'],
    ['services/marketplace-worker/Dockerfile'],
  ]) {
    assert.deepEqual(
      classifyChanges(paths),
      {
        application: false,
        application_tests: false,
        supabase: false,
        sniper: false,
        documentation_only: false,
      },
      JSON.stringify(paths),
    );
  }
  // Diese Worker-Dateien binden Anwendungstests, E2E-Tests oder die Erweiterung ein.
  for (const shared of [
    'services/marketplace-worker/src/vinted-listing-contracts.ts',
    'services/marketplace-worker/src/vinted-negotiation-contracts.ts',
    'services/marketplace-worker/test/fixtures/vinted-listing-current-content.ts',
    'services/marketplace-worker/test/fixtures/vinted-inbox-events/unread-conversation.json',
  ]) {
    const changes = classifyChanges([worker, shared]);
    assert.equal(changes.application_tests, true, shared);
    assert.equal(changes.application, true, shared);
  }
  // Gemischte oder benachbarte Pfade bleiben im vollen Umfang.
  for (const other of [
    'src/app/features/marketplaces/models/marketplace-presentation.ts',
    'tools/flipbase-extension/vinted-listing-runtime.js',
    'supabase/functions/_shared/marketplace-listing-contracts.d.ts',
    'services/marketplace-worker-other/src/config.ts',
    'deploy/docker-compose.marketplace-chromium-pilot.yml',
    '.github/workflows/marketplace-worker-image.yml',
  ]) {
    const changes = classifyChanges([worker, other]);
    assert.equal(changes.application_tests, true, other);
    assert.equal(changes.application, true, other);
  }
});
