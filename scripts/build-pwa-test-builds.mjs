import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { resolveNpmCliPath } from './run-test-suites.mjs';

function run(args, cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: 'inherit', cwd });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`PWA-Testbau fehlgeschlagen: ${code}`)),
    );
  });
}

const root = resolve('.superpowers/pwa-test-builds');
await mkdir(root, { recursive: true });

// Unveränderter produktiver Vorgänger: Ein bloß anderer HTML-Kommentar prüft
// keinen Übergang vom bisherigen globalen Protokoll zum unabhängigen Wechsel.
const legacyRef = 'f6a5a2abdbcefaba232b733fdb97ccdfe90a4f05';
const legacySource = resolve(root, 'legacy-source');
await mkdir(legacySource, { recursive: true });
const archive = process.env.PWA_TEST_LEGACY_ARCHIVE
  ? await readFile(resolve(process.env.PWA_TEST_LEGACY_ARCHIVE))
  : execFileSync('git', ['archive', '--format=tar', legacyRef], { maxBuffer: 100 * 1024 * 1024 });
execFileSync('tar', ['-xf', '-', '-C', legacySource], { input: archive });
// Eigene gesperrte Abhängigkeiten: Eine Verknüpfung in den übergeordneten
// Arbeitsbaum kann die Angular-/Tailwind-Dateisuche unter Windows entgrenzen.
await run(
  [await resolveNpmCliPath(), 'ci', '--ignore-scripts', '--no-audit', '--no-fund'],
  legacySource,
);
await run(['scripts/generate-version.mjs'], legacySource);
await run(
  [
    'node_modules/@angular/cli/bin/ng.js',
    'build',
    '--configuration=production,pwa-testing',
    `--output-path=${resolve(root, 'legacy')}`,
  ],
  legacySource,
);
await run(['scripts/write-pwa-assets.mjs', resolve(root, 'legacy/browser')], legacySource);
const secondIndex = resolve(root, 'index.html');
await writeFile(
  secondIndex,
  `${await readFile('src/index.html', 'utf8')}\n<!-- Zweiter echter Produktionsbau für die Updateprüfung. -->\n`,
);
for (const name of ['a', 'b']) {
  const output = resolve(root, name);
  await run([
    'node_modules/@angular/cli/bin/ng.js',
    'build',
    '--configuration=production,pwa-testing',
    `--output-path=${output}`,
    ...(name === 'b' ? ['--index=.superpowers/pwa-test-builds/index.html'] : []),
  ]);
  await run(['scripts/write-pwa-assets.mjs', resolve(output, 'browser')]);
}
