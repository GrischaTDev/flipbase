import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

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
    assert.equal(result.output, 'supabase=true\nsniper=false\n');
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
    assert.equal(result.output, 'supabase=true\nsniper=false\n');
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
    assert.equal(result.output, 'supabase=true\nsniper=false\n');
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
    assert.equal(result.output, 'supabase=true\nsniper=true\n');
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
    assert.equal(result.output, 'supabase=true\nsniper=false\n');
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
    assert.equal(result.output, 'supabase=false\nsniper=false\n');
  });
});

test('Diff unter services/sniper setzt ausschließlich die Sniper-Ausgabe', async () => {
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
    // Ohne die Trennung liefe der Datenbankauftrag bei jeder Aenderung am
    // Dienst mit - und der Dienstauftrag bei jeder Migration.
    assert.equal(result.output, 'supabase=false\nsniper=true\n');
  });
});
