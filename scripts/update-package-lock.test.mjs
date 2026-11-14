import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { updatePackageLock } from './update-package-lock.mjs';

async function createRepository() {
  const repository = await mkdtemp(join(tmpdir(), 'flipbase-lock-regression-'));
  const manifest = { name: 'lock-regression', packageManager: 'npm@11.5.2' };
  const lock = { lockfileVersion: 3, packages: { '': { name: manifest.name } } };
  for (const path of ['.', 'services/sniper']) {
    await mkdir(join(repository, path), { recursive: true });
    await writeFile(join(repository, path, 'package.json'), JSON.stringify(manifest));
    await writeFile(join(repository, path, 'package-lock.json'), JSON.stringify(lock));
  }
  await mkdir(join(repository, 'node_modules'), { recursive: true });
  await writeFile(join(repository, 'node_modules', 'keep.txt'), 'existing installation');
  return repository;
}

for (const packagePath of ['.', 'services/sniper']) {
  test(`generates ${packagePath} in a clean directory and preserves the installed dependencies`, async () => {
    const repository = await createRepository();
    let temporary;
    const generated = JSON.stringify({ lockfileVersion: 3, packages: { '': {} } });
    try {
      await updatePackageLock({
        repository,
        packagePath,
        runNpm: async (args, { cwd }) => {
          if (args[0] === '--version') return { stdout: '11.5.2\n' };
          temporary = cwd;
          assert.notEqual(cwd, repository);
          assert.deepEqual((await readdir(cwd)).sort(), ['package-lock.json', 'package.json']);
          assert.deepEqual(args, [
            'install',
            '--package-lock-only',
            '--ignore-scripts',
            '--no-audit',
            '--no-fund',
          ]);
          await writeFile(join(cwd, 'package-lock.json'), generated);
          return { stdout: '' };
        },
      });
      assert.equal(
        await readFile(join(repository, packagePath, 'package-lock.json'), 'utf8'),
        generated,
      );
      assert.equal(
        await readFile(join(repository, 'node_modules/keep.txt'), 'utf8'),
        'existing installation',
      );
      assert.ok(temporary);
      await assert.rejects(readdir(temporary), { code: 'ENOENT' });
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });
}

for (const failure of ['version', 'install', 'json', 'lock-version', 'manifest']) {
  test(`preserves both package files when ${failure} validation fails`, async () => {
    const repository = await createRepository();
    const manifestBefore = await readFile(join(repository, 'package.json'), 'utf8');
    const lockBefore = await readFile(join(repository, 'package-lock.json'), 'utf8');
    let temporary;
    const expectedError = {
      version: /npm 11\.5\.2/u,
      install: /Installation failed/u,
      json: { name: 'SyntaxError' },
      'lock-version': /Lockfile-Version/u,
      manifest: /Paketdatei.*verändert/u,
    }[failure];
    try {
      await assert.rejects(
        updatePackageLock({
          repository,
          runNpm: async (args, { cwd }) => {
            if (args[0] === '--version')
              return { stdout: failure === 'version' ? '10.9.9' : '11.5.2' };
            temporary = cwd;
            if (failure === 'install') throw new Error('Installation failed');
            if (failure === 'json') await writeFile(join(cwd, 'package-lock.json'), '{invalid');
            if (failure === 'lock-version')
              await writeFile(
                join(cwd, 'package-lock.json'),
                JSON.stringify({ lockfileVersion: 2 }),
              );
            if (failure === 'manifest') await writeFile(join(cwd, 'package.json'), '{}');
            return { stdout: '' };
          },
        }),
        expectedError,
      );
      assert.equal(await readFile(join(repository, 'package.json'), 'utf8'), manifestBefore);
      assert.equal(await readFile(join(repository, 'package-lock.json'), 'utf8'), lockBefore);
      if (temporary) await assert.rejects(readdir(temporary), { code: 'ENOENT' });
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });
}

test('rejects paths outside the four project packages before running npm', async () => {
  const repository = await createRepository();
  try {
    for (const packagePath of ['../outside', '/tmp/outside', 'services/unknown']) {
      await assert.rejects(
        updatePackageLock({
          repository,
          packagePath,
          runNpm: () => assert.fail('npm must not run for unapproved paths'),
        }),
        /Paketverzeichnis/u,
      );
    }
  } finally {
    await rm(repository, { recursive: true, force: true });
  }
});

test('check mode reports a changed lockfile without overwriting it', async () => {
  const repository = await createRepository();
  const before = await readFile(join(repository, 'package-lock.json'), 'utf8');
  try {
    await assert.rejects(
      updatePackageLock({
        repository,
        checkOnly: true,
        runNpm: async (args, { cwd }) => {
          if (args[0] === '--version') return { stdout: '11.5.2' };
          await writeFile(
            join(cwd, 'package-lock.json'),
            JSON.stringify({ lockfileVersion: 3, packages: { '': {} } }),
          );
          return { stdout: '' };
        },
      }),
      /nicht reproduzierbar/u,
    );
    assert.equal(await readFile(join(repository, 'package-lock.json'), 'utf8'), before);
  } finally {
    await rm(repository, { recursive: true, force: true });
  }
});

for (const file of ['package.json', 'package-lock.json']) {
  test(`preserves concurrent edits to ${file}`, async () => {
    const repository = await createRepository();
    const concurrentText = JSON.stringify({ concurrent: true });
    try {
      await assert.rejects(
        updatePackageLock({
          repository,
          runNpm: async (args) => {
            if (args[0] === '--version') return { stdout: '11.5.2' };
            await writeFile(join(repository, file), concurrentText);
            return { stdout: '' };
          },
        }),
        /während der Erzeugung verändert/u,
      );
      assert.equal(await readFile(join(repository, file), 'utf8'), concurrentText);
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });
}
