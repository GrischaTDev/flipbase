import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { resolveNpmCliPath } from './run-test-suites.mjs';
import { getCheckCommands } from './ci-checks.mjs';

const packagePaths = [
  'package.json',
  'services/marketplace-worker/package.json',
  'services/push-worker/package.json',
  'services/sniper/package.json',
];
const rootManifest = JSON.parse(await readFile('package.json', 'utf8'));
const npmVersion = rootManifest.packageManager.replace(/^npm@/u, '');

test('the workflow suite includes npm policy and lockfile generation regressions', () => {
  for (const path of ['scripts/npm-toolchain.test.mjs', 'scripts/update-package-lock.test.mjs'])
    assert.ok(rootManifest.scripts['test:workflow'].split(' ').includes(path), path);
  assert.equal(rootManifest.scripts['lockfile:update'], 'node scripts/update-package-lock.mjs');
});

test('the development and CI quality checks verify every lockfile with the selected npm', () => {
  assert.equal(
    rootManifest.scripts['lockfile:check'],
    'node scripts/update-package-lock.mjs --check',
  );
  for (const scope of ['quality', 'quality-light'])
    assert.ok(getCheckCommands(scope).some(({ args }) => args.join(' ') === 'run lockfile:check'));
});

for (const path of packagePaths) {
  test(`${path} enforces the shared npm version before installation and lockfile generation`, async () => {
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    assert.match(rootManifest.packageManager, /^npm@\d+\.\d+\.\d+$/u);
    assert.equal(manifest.packageManager, rootManifest.packageManager);
    assert.deepEqual(manifest.devEngines?.packageManager, {
      name: 'npm',
      version: npmVersion,
      onFail: 'error',
    });
  });
}

for (const command of [
  ['ci', '--ignore-scripts', '--dry-run'],
  ['install', '--package-lock-only', '--ignore-scripts'],
]) {
  test(`npm ${command[0]} rejects a mismatched version without changing either package file`, async () => {
    assert.ok(rootManifest.devEngines?.packageManager, 'The project must enforce npm itself');
    const directory = await mkdtemp(join(tmpdir(), 'flipbase-npm-policy-'));
    try {
      const manifest = {
        name: 'npm-version-regression',
        version: '1.0.0',
        private: true,
        devEngines: {
          packageManager: { ...rootManifest.devEngines.packageManager, version: '0.0.0' },
        },
      };
      const packageText = JSON.stringify(manifest);
      const lockText = JSON.stringify({
        name: manifest.name,
        version: manifest.version,
        lockfileVersion: 3,
        packages: { '': { name: manifest.name, version: manifest.version } },
      });
      await writeFile(join(directory, 'package.json'), packageText);
      await writeFile(join(directory, 'package-lock.json'), lockText);
      const result = spawnSync(process.execPath, [await resolveNpmCliPath(), ...command], {
        cwd: directory,
        encoding: 'utf8',
        timeout: 15000,
        windowsHide: true,
      });
      assert.ifError(result.error);
      assert.notEqual(result.status, 0);
      assert.match(result.stdout + result.stderr, /EBADDEVENGINES/u);
      assert.equal(await readFile(join(directory, 'package.json'), 'utf8'), packageText);
      assert.equal(await readFile(join(directory, 'package-lock.json'), 'utf8'), lockText);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test('every workflow selects the locked npm immediately after selecting Node', async () => {
  let selections = 0;
  for (const file of await readdir('.github/workflows')) {
    if (!/\.ya?ml$/u.test(file)) continue;
    const lines = (await readFile(`.github/workflows/${file}`, 'utf8')).split('\n');
    for (const [index, line] of lines.entries()) {
      if (!line.includes('uses: actions/setup-node@')) continue;
      selections++;
      const indentation =
        line.match(/^\s*/u)[0].length - (line.trimStart().startsWith('-') ? 0 : 2);
      const next = lines
        .slice(index + 1)
        .findIndex((candidate) => new RegExp(`^ {${indentation}}- `, 'u').test(candidate));
      assert.notEqual(next, -1, `${file}: missing npm setup`);
      const following = lines.slice(index + 1 + next, index + 1 + next + 8).join('\n');
      assert.match(following, /run: \|/u, file);
      assert.match(following, /package\.json.*packageManager/u, file);
      assert.match(following, /npm install --global/u, file);
      assert.match(following, /--ignore-scripts/u, file);
      assert.match(following, /npm --version/u, file);
    }
  }
  assert.ok(selections > 0);
});

for (const path of [
  'docker/Dockerfile',
  'services/marketplace-worker/Dockerfile',
  'services/marketplace-worker/Dockerfile.chromium-session',
  'services/push-worker/Dockerfile',
  'services/sniper/Dockerfile',
]) {
  test(`${path} selects the package-declared npm before every clean install`, async () => {
    const dockerfile = await readFile(path, 'utf8');
    const commands = dockerfile.replace(/\\\r?\n\s*/gu, ' ').split('\n');
    const installs = commands.filter((line) => /^RUN /u.test(line) && /npm ci\b/u.test(line));
    assert.ok(installs.length > 0);
    for (const command of installs) {
      assert.match(command, /npm install --global.*package\.json.*packageManager.*&& npm ci/u);
      assert.match(command, /--ignore-scripts/u);
    }
  });
}
