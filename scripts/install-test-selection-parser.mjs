import { cp, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { executeCheckCommand } from './ci-checks.mjs';

export function assertParserTemporaryDirectory(path) {
  const target = resolve(path);
  if (
    dirname(target) !== resolve(tmpdir()) ||
    !basename(target).startsWith('flipbase-test-selection-parser-')
  )
    throw new Error('Temporärer Parserpfad liegt außerhalb der eigenen Löschgrenze.');
  return target;
}

/** Nur das bereits gesperrte Parserpaket übernehmen, keine neue Versionsauflösung. */
export function selectionParserInstallFiles(lock) {
  const descriptor = lock?.packages?.['node_modules/typescript'];
  if (
    lock?.lockfileVersion !== 3 ||
    !descriptor ||
    !/^\d+\.\d+\.\d+$/u.test(descriptor.version ?? '') ||
    descriptor.resolved !==
      `https://registry.npmjs.org/typescript/-/typescript-${descriptor.version}.tgz` ||
    !/^sha512-[A-Za-z0-9+/]{86}==$/u.test(descriptor.integrity ?? '') ||
    Buffer.from(descriptor.integrity.slice(7), 'base64').toString('base64') !==
      descriptor.integrity.slice(7) ||
    descriptor.link ||
    descriptor.hasInstallScript ||
    ['dependencies', 'optionalDependencies', 'peerDependencies'].some(
      (field) => descriptor[field] && Object.keys(descriptor[field]).length,
    )
  )
    throw new Error('Ungültige gesperrte TypeScript-Metadaten für die Testauswahl.');
  const manifest = {
    name: 'flipbase-test-selection-parser',
    version: '1.0.0',
    private: true,
    dependencies: { typescript: descriptor.version },
  };
  return {
    manifest,
    lock: {
      name: manifest.name,
      version: manifest.version,
      lockfileVersion: 3,
      requires: true,
      packages: {
        '': manifest,
        'node_modules/typescript': {
          version: descriptor.version,
          resolved: descriptor.resolved,
          integrity: descriptor.integrity,
        },
      },
    },
  };
}

export async function installSelectionParser({
  repository = process.cwd(),
  runInstall = executeCheckCommand,
} = {}) {
  const files = selectionParserInstallFiles(
    JSON.parse(await readFile(join(repository, 'package-lock.json'), 'utf8')),
  );
  const modules = join(repository, 'node_modules');
  const destination = join(modules, 'typescript');
  const existing = async (path) =>
    lstat(path).catch((error) => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
  if ((await existing(modules))?.isSymbolicLink() || (await existing(destination)))
    throw new Error('Vorhandene oder gemeinsam genutzte Abhängigkeiten werden nicht ersetzt.');
  const temporary = await mkdtemp(join(tmpdir(), 'flipbase-test-selection-parser-'));
  try {
    await writeFile(join(temporary, 'package.json'), JSON.stringify(files.manifest));
    await writeFile(join(temporary, 'package-lock.json'), JSON.stringify(files.lock));
    await runInstall(
      {
        name: 'Gesperrten Testauswahl-Parser installieren',
        command: 'npm',
        args: ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--bin-links=false'],
      },
      { repository: temporary },
    );
    const source = join(temporary, 'node_modules', 'typescript');
    const installed = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
    if (
      installed.name !== 'typescript' ||
      installed.version !== files.manifest.dependencies.typescript ||
      !(await lstat(join(source, 'lib', 'typescript.js'))).isFile()
    )
      throw new Error('Das installierte Parserpaket entspricht nicht der gesperrten Auswahl.');
    await mkdir(modules, { recursive: true });
    await cp(source, destination, { recursive: true, force: false, errorOnExist: true });
    console.log(`Testauswahl: ausschließlich TypeScript ${installed.version} bereitgestellt.`);
  } finally {
    await rm(assertParserTemporaryDirectory(temporary), { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  installSelectionParser().catch((error) => {
    console.error(error.message);
    process.exitCode = error.exitCode ?? 1;
  });
