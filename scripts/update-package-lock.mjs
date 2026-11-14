import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { resolveNpmCliPath } from './run-test-suites.mjs';

const exec = promisify(execFile);
const packagePaths = new Set([
  '.',
  'services/marketplace-worker',
  'services/push-worker',
  'services/sniper',
]);

async function executeNpm(args, { cwd }) {
  const result = await exec(process.execPath, [await resolveNpmCliPath(), ...args], {
    cwd,
    windowsHide: true,
    timeout: 120000,
  });
  if (result.stderr) process.stderr.write(result.stderr);
  return result;
}

export async function updatePackageLock({
  repository = fileURLToPath(new URL('../', import.meta.url)),
  packagePath = '.',
  checkOnly = false,
  runNpm = executeNpm,
} = {}) {
  if (!packagePaths.has(packagePath)) throw new Error('Unbekanntes Paketverzeichnis.');
  const directory = join(repository, packagePath);
  const root = JSON.parse(await readFile(join(repository, 'package.json'), 'utf8'));
  const manifestText = await readFile(join(directory, 'package.json'), 'utf8');
  const manifest = JSON.parse(manifestText);
  const npmVersion = root.packageManager?.match(/^npm@(\d+\.\d+\.\d+)$/u)?.[1];
  if (!npmVersion || manifest.packageManager !== root.packageManager)
    throw new Error('Die npm-Vorgaben der Paketverzeichnisse stimmen nicht überein.');
  const installed = await runNpm(['--version'], { cwd: directory });
  if (installed.stdout.trim() !== npmVersion)
    throw new Error(`npm ${npmVersion} ist für die Lockfile-Erzeugung erforderlich.`);
  const originalLock = await readFile(join(directory, 'package-lock.json'), 'utf8');

  const temporary = await mkdtemp(join(tmpdir(), 'flipbase-package-lock-'));
  try {
    await writeFile(join(temporary, 'package.json'), manifestText);
    await writeFile(join(temporary, 'package-lock.json'), originalLock);
    // Vorhandene node_modules dürfen die plattformübergreifende Auflösung nicht beeinflussen.
    await runNpm(
      ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'],
      { cwd: temporary },
    );
    if (
      JSON.stringify(JSON.parse(await readFile(join(temporary, 'package.json'), 'utf8'))) !==
      JSON.stringify(manifest)
    )
      throw new Error('Die Paketdatei wurde bei der Lockfile-Erzeugung verändert.');
    const lockText = await readFile(join(temporary, 'package-lock.json'), 'utf8');
    const lock = JSON.parse(lockText);
    if (lock.lockfileVersion !== 3 || !lock.packages?.[''])
      throw new Error('Ungültige Lockfile-Version oder fehlende Paketmetadaten.');
    if (
      (await readFile(join(directory, 'package.json'), 'utf8')) !== manifestText ||
      (await readFile(join(directory, 'package-lock.json'), 'utf8')) !== originalLock
    )
      throw new Error('Paketdatei oder Lockfile wurde während der Erzeugung verändert.');
    if (checkOnly) {
      if (lockText !== originalLock)
        throw new Error(
          `Lockfile für ${packagePath} ist nicht reproduzierbar. Bitte neu erzeugen.`,
        );
    } else {
      await writeFile(join(directory, 'package-lock.json'), lockText);
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');
  if (checkOnly) args.splice(args.indexOf('--check'), 1);
  if (args.length && (args.length !== 2 || args[0] !== '--package')) {
    console.error('Aufruf: npm run lockfile:update -- [--check] [--package services/<name>]');
    process.exitCode = 1;
  } else {
    const selected = checkOnly && !args.length ? [...packagePaths] : [args[1] ?? '.'];
    (async () => {
      for (const packagePath of selected) await updatePackageLock({ packagePath, checkOnly });
    })()
      .then(() =>
        console.log(
          checkOnly
            ? 'Alle ausgewählten Lockfiles sind reproduzierbar.'
            : 'Lockfile mit der festgelegten npm-Version aktualisiert.',
        ),
      )
      .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
      });
  }
}
